import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const base = process.env.WU21_BASE_URL;
const wp = process.env.WU21_WP_PATH;
const cli = process.env.WU21_WP_CLI;
const dir = process.env.WU21_ARTIFACT_DIR;
if (![base, wp, cli, dir].every(Boolean)) throw new Error('Authentic WU21 WordPress required.');

const report = { scenario: 'GF_EDITOR_CAPABILITY_BOUNDARY', status: 'FAIL', phases: {}, errors: [] };
const source = 'portable.generic_e2e.presentation|1.0.0|portable.generic_e2e.v1';
const packageId = 'portable.generic_e2e.presentation';
const settings = base + '/wp-admin/admin.php?page=gf_settings&subview=gravity-presentation-profiles';
const editor = base + '/wp-admin/admin.php?page=gpp_verified_form_editor&source=' + encodeURIComponent(source);
const muDir = path.join(wp, 'wp-content/mu-plugins');
const muFile = path.join(muDir, 'gpp-legacy-editor-route-probe.php');
fs.mkdirSync(muDir, { recursive: true });
// Old Head's exact options-general.php/manage_options registration tuple;
// test-only separate slug avoids interfering with the repaired page.
fs.writeFileSync(muFile, [
  '<?php',
  "add_action('admin_menu', static function () {",
  "    add_submenu_page('options-general.php', 'Legacy editor probe', 'Legacy editor probe',",
  "        'manage_options', 'gpp_legacy_editor_probe', static function () { echo 'LEGACY_ACCESSIBLE'; });",
  '}, 20);',
  ''
].join('\n'));

function wpJson(code) {
  const result = execFileSync('php', [cli, '--path=' + wp, 'eval', code], { encoding: 'utf8', env: process.env });
  const marker = 'GPP_AUTH_JSON:';
  const index = result.lastIndexOf(marker);
  if (index < 0) throw new Error('Missing WP result marker: ' + result);
  return JSON.parse(result.slice(index + marker.length));
}
function snapshot() {
  return wpJson('echo "GPP_AUTH_JSON:" . wp_json_encode(get_option("gpp_visual_package_lifecycle_v1"));');
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
function equal(a, b) { return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b)); }
function requireTrue(ok, message) { if (!ok) throw new Error(message); }
async function signIn(page, username, password) {
  await page.goto(base + '/wp-login.php', { waitUntil: 'domcontentloaded' });
  await page.locator('#user_login').fill(username);
  await page.locator('#user_pass').fill(password);
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.locator('#wp-submit').click()]);
}
async function visit(page, url) {
  const res = await page.goto(url, { waitUntil: 'domcontentloaded' });
  return { status: res?.status(), url: page.url() };
}

const browser = await chromium.launch({ headless: true });
const allowed = await browser.newContext({ acceptDownloads: true });
const rejected = await browser.newContext({ acceptDownloads: true });
const positive = await allowed.newPage();
const negative = await rejected.newPage();
try {
  const users = wpJson([
    "$spec=array(array('login'=>'gpp-gf-settings-only','password'=>'GPP-Synthetic-Allowed-2026!','cap'=>'gravityforms_edit_settings'),",
    "  array('login'=>'gpp-other-settings','password'=>'GPP-Synthetic-Denied-2026!','cap'=>'manage_options'));",
    '$result=array();',
    'foreach($spec as $item) {',
    "  $u=get_user_by('login',$item['login']);",
    '  if (!$u) {',
    "    $id=wp_insert_user(array('user_login'=>$item['login'],'user_pass'=>$item['password'],",
    "      'user_email'=>$item['login'].'@example.invalid','role'=>'subscriber'));",
    '    if (is_wp_error($id)) throw new RuntimeException($id->get_error_message());',
    "    $u=get_user_by('id',$id);",
    "  } else { wp_set_password($item['password'],$u->ID); $u->set_role('subscriber'); }",
    "  $u->add_cap($item['cap']); wp_set_current_user($u->ID);",
    "  $result[$item['login']]=array('gf'=>GFCommon::current_user_can_any('gravityforms_edit_settings'),",
    "    'gf_wp'=>current_user_can('gravityforms_edit_settings'), 'options'=>current_user_can('manage_options'));",
    '}',
    "echo 'GPP_AUTH_JSON:'.wp_json_encode($result);"
  ].join(' '));
  requireTrue(users['gpp-gf-settings-only'].gf && users['gpp-gf-settings-only'].gf_wp && !users['gpp-gf-settings-only'].options,
    'Positive account lacks required GF-only permissions: ' + JSON.stringify(users));
  requireTrue(!users['gpp-other-settings'].gf && !users['gpp-other-settings'].gf_wp && users['gpp-other-settings'].options,
    'Negative account does not have unrelated-only capability: ' + JSON.stringify(users));
  report.phases.capability_preconditions = users;
  const before = snapshot();
  requireTrue(Boolean(before?.installed?.[packageId]?.['1.0.0']), 'Generic E2E package missing.');

  await signIn(positive, 'gpp-gf-settings-only', 'GPP-Synthetic-Allowed-2026!');
  const original = await visit(positive, base + '/wp-admin/admin.php?page=gpp_legacy_editor_probe');
  requireTrue(original.status === 403, 'Original manage_options registration must reject GF-only user: ' + JSON.stringify(original));
  report.phases.original_registration_reproduction = { result: 'PASS', tuple: 'options-general.php/manage_options', httpStatus: original.status };

  const inventory = await visit(positive, settings);
  requireTrue(inventory.status === 200, 'GF-only user cannot visit GPP profile inventory: ' + JSON.stringify(inventory));
  const link = positive.locator('tr').filter({ hasText: packageId }).locator('a[href*="gpp_verified_form_editor"]').first();
  requireTrue(await link.count() === 1, 'Profile inventory editor link is missing for GF-only user.');
  await link.click();
  requireTrue(await positive.locator('input[name="change[control_border]"]').count() === 1,
    'GF-only user cannot open editor via inventory.');
  report.phases.authorized_inventory_navigation = 'PASS';

  const direct = await visit(positive, editor);
  requireTrue(direct.status === 200 && await positive.locator('input[name="change[control_border]"]').count() === 1,
    'Direct editor URL denied GF-only user: ' + JSON.stringify(direct));
  report.phases.authorized_direct_route = 'PASS';

  await positive.locator('input[name="change[control_border]"]').check();
  await positive.locator('input[name="color[control_border]"]').fill('#225588');
  await positive.locator('#gpp_successor_version').fill('1.0.2');
  const nonce = await positive.locator('input[name="_wpnonce"]').inputValue();
  const sourceHash = before.installed[packageId]['1.0.0'].content_hash;
  const [download] = await Promise.all([
    positive.waitForEvent('download', { timeout: 30000 }),
    positive.getByRole('button', { name: 'Download inactive successor JSON' }).click()
  ]);
  const downloadedPath = path.join(dir, 'gpp-capability-successor.json');
  await download.saveAs(downloadedPath);
  const output = JSON.parse(fs.readFileSync(downloadedPath, 'utf8'));
  requireTrue(output.package_id === packageId && output.package_version === '1.0.2' &&
    output.design_tokens.colors.gpp_editor_control_border === '#225588', 'GF-only successor JSON invalid.');
  requireTrue(equal(before, snapshot()), 'Successful download changed lifecycle state.');
  report.phases.authorized_download_immutable = 'PASS';

  const request = { action: 'gpp_download_verified_form_successor', _wpnonce: nonce, source,
    new_version: '1.0.2', 'change[control_border]': '1', 'color[control_border]': '#225588', source_hash: sourceHash };
  const post = data => allowed.request.post(base + '/wp-admin/admin-post.php', { form: data });
  requireTrue((await post({ ...request, source_hash: 'stale' })).status() === 400, 'Stale source hash accepted.');
  requireTrue((await post({ ...request, 'color[control_border]': '#invalid' })).status() === 400, 'Invalid color accepted.');
  requireTrue([400, 409].includes((await post({ ...request, new_version: '1.0.1' })).status()), 'Installed version conflict accepted.');
  requireTrue(equal(before, snapshot()), 'Rejected edits changed lifecycle state.');
  report.phases.invalid_stale_conflict = 'PASS';

  await signIn(negative, 'gpp-other-settings', 'GPP-Synthetic-Denied-2026!');
  const deniedPage = await visit(negative, editor);
  requireTrue(deniedPage.status === 403, 'manage_options-only user reached editor: ' + JSON.stringify(deniedPage));
  const deniedPost = await rejected.request.post(base + '/wp-admin/admin-post.php', { form: request });
  requireTrue(deniedPost.status() === 403, 'manage_options-only user invoked download.');
  requireTrue(equal(before, snapshot()), 'Unauthorized request mutated lifecycle state.');
  report.phases.negative_direct_download = 'PASS';
  report.status = 'PASS';
} catch (error) {
  report.errors.push(String(error?.stack || error));
} finally {
  fs.rmSync(muFile, { force: true });
  await browser.close();
  fs.writeFileSync(path.join(dir, 'gpp-verified-editor-capability-results.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log('GPP_EDITOR_CAPABILITY_BOUNDARY_' + report.status);
if (report.status !== 'PASS') { console.error(report.errors.join('\n')); process.exit(1); }
