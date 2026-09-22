import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpCli = process.env.WU21_WP_CLI;
const wpPath = process.env.WU21_WP_PATH;
const repoRoot = process.env.GITHUB_WORKSPACE;
if (!artifactDir || !wpCli || !wpPath || !repoRoot) {
  throw new Error('P06 asset reachability browser qualification requires the admitted WU21 runtime environment.');
}

function wpEval(code) {
  const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], { encoding: 'utf8', env: process.env });
  if (cp.status !== 0) throw new Error(cp.stderr || cp.stdout);
  return cp.stdout.trim();
}

function runRuntimeQualification() {
  const script = path.join(repoRoot, 'tests/repro-evidence-lab/p06-inbox-asset-reachability-runtime.php');
  const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval-file', script], { encoding: 'utf8', env: process.env });
  if (cp.status !== 0) throw new Error(`P06 exact-runtime qualification failed:\n${cp.stdout}\n${cp.stderr}`);
  process.stdout.write(cp.stdout);
}

function setInboxProfileActive(active) {
  if (!active) {
    wpEval(`
$option = \\GravityPresentationProfiles\\Core\\Lifecycle\\VisualPackageLifecycle::OPTION_NAME;
if (false !== get_option('gpp_p06_visual_backup', false)) throw new RuntimeException('P06 visual backup already exists.');
update_option('gpp_p06_visual_backup', get_option($option), false);
$lifecycle = new \\GravityPresentationProfiles\\Core\\Lifecycle\\VisualPackageLifecycle(
    new \\GravityPresentationProfiles\\Core\\Lifecycle\\WordPressOptionStateStore($option)
);
$lifecycle->deactivate(array('surface' => \\GravityPresentationProfiles\\SRWF\\GravityFlow\\InboxPresentationAdapter::SURFACE));
echo 'DEACTIVATED';
`);
    return;
  }

  wpEval(`
$option = \\GravityPresentationProfiles\\Core\\Lifecycle\\VisualPackageLifecycle::OPTION_NAME;
$backup = get_option('gpp_p06_visual_backup', null);
if (null === $backup) throw new RuntimeException('P06 visual backup is unavailable.');
update_option($option, $backup, false);
delete_option('gpp_p06_visual_backup');
echo 'RESTORED';
`);
}

async function inboxAssetState(page) {
  return page.evaluate(() => {
    const links = [...document.querySelectorAll('link[rel="stylesheet"]')].map(link => ({
      id: link.id || '',
      href: link.href || '',
      in_head: link.parentElement === document.head || document.head.contains(link),
      parent_tag: link.parentElement?.tagName || null,
    }));
    const presentation = links.filter(link => /\/assets\/css\/srwf-gravity-flow-inbox\.css(?:\?|$)/.test(link.href));
    const native = links.filter(link => /\/assets\/css\/srwf-gravity-flow-inbox-native\.css(?:\?|$)/.test(link.href));
    return {
      presentation,
      native,
      native_target_count: document.querySelectorAll('[data-js="gflow-inbox"]').length,
      native_wrapper_count: document.querySelectorAll('.gflow-inbox.gflow-grid.gflow-common').length,
      gpp_surface_count: document.querySelectorAll('[data-gpp-inbox-surface="gravity_flow.inbox"]').length,
      card_count: document.querySelectorAll('.gpp-inbox-card').length,
    };
  });
}

function assertStylesPresent(state, label, { requireHead = false } = {}) {
  assert.equal(state.presentation.length, 1, `${label}: presentation stylesheet count mismatch.`);
  assert.equal(state.native.length, 1, `${label}: native projection stylesheet count mismatch.`);
  if (requireHead) {
    assert.equal(state.presentation[0].in_head, true, `${label}: presentation stylesheet was delivered late outside document head.`);
    assert.equal(state.native[0].in_head, true, `${label}: native projection stylesheet was delivered late outside document head.`);
  }
}

function assertStylesAbsent(state, label) {
  assert.equal(state.presentation.length, 0, `${label}: presentation stylesheet leaked.`);
  assert.equal(state.native.length, 0, `${label}: native projection stylesheet leaked.`);
}

async function waitForNativeInbox(page) {
  await page.waitForSelector('[data-js="gflow-inbox"]', { timeout: 30000 });
  await page.waitForSelector('[data-js="gflow-inbox"] .ag-root-wrapper', { timeout: 30000 });
}

runRuntimeQualification();

const manifest = JSON.parse(wpEval('echo wp_json_encode(get_option("gpp_wu21_fixture_manifest"), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);'));
const p06 = JSON.parse(wpEval('echo wp_json_encode(get_option("gpp_p06_fixture_manifest"), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);'));
if (!manifest?.frontend_inbox_url || !manifest?.entry_records?.[0] || !p06?.authentic_block_page?.url || !p06?.lookalike_page?.url || !p06?.unrelated_page?.url) {
  throw new Error('P06 browser fixture manifest is incomplete.');
}

const authCookies = JSON.parse(wpEval(`
$u = get_user_by('login', 'bootstrap_admin');
if (!$u) throw new RuntimeException('bootstrap_admin unavailable');
$expiration = time() + 900;
echo wp_json_encode(array(
  array('name' => AUTH_COOKIE, 'value' => wp_generate_auth_cookie($u->ID, $expiration, 'auth')),
  array('name' => LOGGED_IN_COOKIE, 'value' => wp_generate_auth_cookie($u->ID, $expiration, 'logged_in'))
), JSON_UNESCAPED_SLASHES);
`));

const repositoryHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const item = manifest.entry_records[0];
const adminInboxUrl = `${baseUrl}/wp-admin/admin.php?page=gravityflow-inbox`;
const entryDetailUrl = `${baseUrl}/wp-admin/admin.php?page=gravityflow-inbox&view=entry&id=${item.form_id}&lid=${item.entry_id}`;
const printUrl = `${baseUrl}/wp-admin/admin-ajax.php?action=gravityflow_print_entries&lid=${item.entry_id}&gpp_presentation=dossier`;
const unrelatedAdminUrl = `${baseUrl}/wp-admin/options-general.php`;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
await context.addCookies(authCookies.map(cookie => ({ ...cookie, url: baseUrl })));
const page = await context.newPage();
const results = {
  status: 'PASS',
  repository_head: repositoryHead,
  exact_runtime_block_name: p06.inbox_block.block_name,
  positive_controls: {},
  negative_controls: {},
  inactive_profile: {},
};
let profileDeactivated = false;

try {
  await page.goto(adminInboxUrl, { waitUntil: 'networkidle' });
  await waitForNativeInbox(page);
  results.positive_controls.admin_inbox = await inboxAssetState(page);
  assertStylesPresent(results.positive_controls.admin_inbox, 'authentic admin Inbox', { requireHead: true });
  assert.ok(results.positive_controls.admin_inbox.card_count > 0, 'Authentic admin Inbox lost Card Mode content.');

  await page.goto(manifest.frontend_inbox_url, { waitUntil: 'networkidle' });
  await waitForNativeInbox(page);
  results.positive_controls.frontend_shortcode = await inboxAssetState(page);
  assertStylesPresent(results.positive_controls.frontend_shortcode, 'authentic frontend shortcode Inbox', { requireHead: true });
  assert.equal(results.positive_controls.frontend_shortcode.gpp_surface_count, 1, 'Authentic frontend shortcode Inbox lost the admitted GPP surface wrapper.');

  await page.goto(p06.authentic_block_page.url, { waitUntil: 'networkidle' });
  await waitForNativeInbox(page);
  results.positive_controls.frontend_block = await inboxAssetState(page);
  assertStylesPresent(results.positive_controls.frontend_block, 'authentic frontend block Inbox', { requireHead: true });
  assert.ok(results.positive_controls.frontend_block.card_count > 0, 'Authentic frontend block Inbox lost Card Mode content.');

  await page.goto(p06.unrelated_page.url, { waitUntil: 'networkidle' });
  results.negative_controls.unrelated_frontend = await inboxAssetState(page);
  assertStylesAbsent(results.negative_controls.unrelated_frontend, 'unrelated frontend');

  await page.goto(p06.lookalike_page.url, { waitUntil: 'networkidle' });
  results.negative_controls.lookalike_block = await inboxAssetState(page);
  assert.equal(results.negative_controls.lookalike_block.native_target_count, 1, 'Lookalike browser control did not render its native-looking marker.');
  assertStylesAbsent(results.negative_controls.lookalike_block, 'lookalike/non-authentic block');

  await page.goto(unrelatedAdminUrl, { waitUntil: 'networkidle' });
  results.negative_controls.unrelated_admin = await inboxAssetState(page);
  assertStylesAbsent(results.negative_controls.unrelated_admin, 'unrelated wp-admin');

  await page.goto(entryDetailUrl, { waitUntil: 'networkidle' });
  results.negative_controls.entry_detail = await inboxAssetState(page);
  assertStylesAbsent(results.negative_controls.entry_detail, 'Gravity Flow Entry Detail');

  await page.goto(printUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  results.negative_controls.print = await inboxAssetState(page);
  assertStylesAbsent(results.negative_controls.print, 'Gravity Flow Print');

  setInboxProfileActive(false);
  profileDeactivated = true;

  await page.goto(manifest.frontend_inbox_url, { waitUntil: 'networkidle' });
  await waitForNativeInbox(page);
  results.inactive_profile.frontend_shortcode = await inboxAssetState(page);
  assertStylesAbsent(results.inactive_profile.frontend_shortcode, 'inactive-profile frontend Inbox');
  assert.equal(results.inactive_profile.frontend_shortcode.gpp_surface_count, 0, 'Inactive frontend Inbox still emitted GPP surface composition.');
  assert.equal(results.inactive_profile.frontend_shortcode.native_wrapper_count, 1, 'Inactive frontend Inbox did not preserve the native Gravity Flow wrapper.');

  await page.goto(adminInboxUrl, { waitUntil: 'networkidle' });
  await waitForNativeInbox(page);
  results.inactive_profile.admin_inbox = await inboxAssetState(page);
  assertStylesAbsent(results.inactive_profile.admin_inbox, 'inactive-profile admin Inbox');
  assert.equal(results.inactive_profile.admin_inbox.native_wrapper_count, 1, 'Inactive admin Inbox did not preserve the native Gravity Flow wrapper.');
} catch (error) {
  results.status = 'FAIL';
  results.error = error?.stack || String(error);
  throw error;
} finally {
  if (profileDeactivated) {
    setInboxProfileActive(true);
    profileDeactivated = false;
  }
  fs.writeFileSync(path.join(artifactDir, 'p06-browser-results.json'), JSON.stringify(results, null, 2) + '\n');
  await browser.close();
}

process.stdout.write(`P06_ASSET_REACHABILITY_BROWSER_PASS=${JSON.stringify(results)}\n`);
