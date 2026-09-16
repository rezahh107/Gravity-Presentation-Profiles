import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
const repoRoot = process.env.GITHUB_WORKSPACE || process.cwd();
const controlFile = path.join(repoRoot, 'tests/repro-evidence-lab/diagnostics-admin-control.php');
const results = [];

if (!artifactDir || !wpPath || !wpCli) throw new Error('WU21 Diagnostics admin runtime environment is incomplete.');

function wpEval(code) {
  const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], { encoding: 'utf8', env: process.env });
  if (cp.status !== 0) throw new Error(`WP-CLI eval failed:\n${cp.stdout}\n${cp.stderr}`);
  return cp.stdout.trim();
}

function control(action) {
  const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval-file', controlFile], {
    encoding: 'utf8',
    env: { ...process.env, GPP_DIAGNOSTICS_CONTROL: action },
  });
  if (cp.status !== 0) throw new Error(`Diagnostics control ${action} failed:\n${cp.stdout}\n${cp.stderr}`);
  const text = cp.stdout.trim();
  try { return JSON.parse(text); } catch { throw new Error(`Diagnostics control ${action} returned non-JSON: ${text}`); }
}

function adminCookies() {
  const payload = wpEval(`
$user = get_user_by('login', 'bootstrap_admin');
if (! $user instanceof WP_User) { fwrite(STDERR, 'Synthetic administrator unavailable.\\n'); exit(1); }
$expiration = time() + HOUR_IN_SECONDS;
echo wp_json_encode(array(
  array('name' => AUTH_COOKIE, 'value' => wp_generate_auth_cookie($user->ID, $expiration, 'auth')),
  array('name' => LOGGED_IN_COOKIE, 'value' => wp_generate_auth_cookie($user->ID, $expiration, 'logged_in'))
), JSON_UNESCAPED_SLASHES);
`);
  const cookies = JSON.parse(payload);
  return cookies.map(cookie => ({ ...cookie, url: baseUrl, httpOnly: true, secure: false, sameSite: 'Lax' }));
}

function record(id, name, status, details = null) { results.push({ id, name, status, details }); }
async function test(id, name, fn) {
  try { record(id, name, 'PASS', await fn()); }
  catch (error) { record(id, name, 'FAIL', { error: String(error?.stack || error).slice(0, 8000) }); }
}

async function findAction(page, fragments) {
  return page.locator('select').evaluateAll((selects, wanted) => {
    for (const select of selects) {
      for (const option of select.options) {
        const text = String(option.textContent || '').replace(/\s+/g, ' ').trim();
        if (wanted.every(fragment => text.includes(fragment))) {
          return { id: select.id || null, name: select.name || null, value: option.value, label: text };
        }
      }
    }
    return null;
  }, fragments);
}

function selectFor(page, action) {
  if (action?.name) return page.locator(`select[name=${JSON.stringify(action.name)}]`);
  if (action?.id) return page.locator(`#${CSS.escape(action.id)}`);
  throw new Error('Binding action select cannot be identified.');
}

async function submitAction(page, action) {
  const select = selectFor(page, action);
  await select.selectOption(action.value);
  const form = select.locator('xpath=ancestor::form[1]');
  if (await form.count() !== 1) throw new Error('Binding management select is not inside one settings form.');
  const submit = form.locator('input[type="submit"]:not([name="gpp_binding_row_action"]), button[type="submit"]:not([name="gpp_binding_row_action"])').first();
  if (await submit.count() !== 1) throw new Error('Gravity Forms settings submit control not found in the binding-management form.');
  await submit.click();
  await page.waitForLoadState('networkidle');
}

async function bindingRow(page, formTitle, slot = 'student.national_id') {
  const heading = page.locator('h4', { hasText: formTitle }).first();
  await heading.waitFor({ state: 'visible', timeout: 15000 });
  const table = heading.locator('xpath=following-sibling::table[1]');
  if (await table.count() !== 1) throw new Error(`Binding health table not found for form ${formTitle}.`);
  const row = table.locator(`tr[data-gpp-semantic-slot=${JSON.stringify(slot)}]`).first();
  if (await row.count() !== 1) throw new Error(`Binding health row ${slot} not found for form ${formTitle}.`);
  return row;
}

async function findRowMappingAction(page, formTitle, slot, fragments) {
  const row = await bindingRow(page, formTitle, slot);
  const select = row.locator('select[name^="gpp_binding_row["]').first();
  if (await select.count() !== 1) throw new Error(`Row mapping selector is missing for ${slot}.`);
  const option = await select.evaluate((element, wanted) => {
    for (const item of element.options) {
      const text = String(item.textContent || '').replace(/\s+/g, ' ').trim();
      if (wanted.every(fragment => text.includes(fragment))) return { value: item.value, label: text };
    }
    return null;
  }, fragments);
  if (!option) return null;
  const apply = row.locator('button[name="gpp_binding_row_action"]').first();
  if (await apply.count() !== 1) throw new Error(`Row mapping Apply control is missing for ${slot}.`);
  const token = await apply.getAttribute('value');
  if (!token) throw new Error(`Row mapping Apply control has no row token for ${slot}.`);
  return { ...option, token };
}

async function submitRowMappingAction(page, formTitle, slot, action) {
  const row = await bindingRow(page, formTitle, slot);
  const select = row.locator('select[name^="gpp_binding_row["]').first();
  const apply = row.locator('button[name="gpp_binding_row_action"]').first();
  if (await select.count() !== 1 || await apply.count() !== 1) throw new Error(`Exact row mapping controls are unavailable for ${slot}.`);
  if ((await apply.getAttribute('value')) !== action.token) throw new Error(`Row mapping token changed before ${slot} submission.`);
  await select.selectOption(action.value);
  const form = select.locator('xpath=ancestor::form[1]');
  if (await form.count() !== 1) throw new Error('Row mapping selector is not inside one Gravity Forms settings form.');
  await apply.click();
  await page.waitForLoadState('networkidle');
}

function healthProjection(value) { return value?.observed?.binding_health || value; }
function findBindingFact(value, formId, slot) {
  const contexts = healthProjection(value)?.contexts || [];
  for (const context of contexts) {
    if (Number(context.form_id) !== Number(formId)) continue;
    const fact = (context.facts || []).find(item => item.semantic_slot_key === slot);
    if (fact) return fact;
  }
  return null;
}
function assertBindingFact(fact, status, fieldId, label) {
  if (!fact || fact.status !== status || Number(fact?.source?.field_id) !== Number(fieldId)) {
    throw new Error(`${label}: ${JSON.stringify(fact)}`);
  }
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ acceptDownloads: true });
await context.addCookies(adminCookies());
const page = await context.newPage();
const settingsUrl = `${baseUrl}/wp-admin/admin.php?page=gf_settings&subview=gravity-presentation-profiles`;
let stale = null;
let staleBundle = null;

try {
  stale = control('stale-on');

  await test('GPP-DIAG-ADMIN-001', 'real Add-On settings renders the exact stale Mapping & Binding Health context and Diagnostics surface', async () => {
    await page.goto(settingsUrl, { waitUntil: 'networkidle' });
    if (page.url().includes('wp-login.php')) throw new Error('Synthetic admin cookie did not authenticate the real settings request.');
    const body = await page.locator('body').innerText();
    if (!body.includes('Mapping & Binding Health')) throw new Error('Mapping & Binding Health section is not reachable on the real Add-On settings page.');
    if (!body.includes('Diagnostics & Support')) throw new Error('Diagnostics & Support section is not reachable on the real Add-On settings page.');
    const row = await bindingRow(page, stale.form_title);
    const rowText = await row.innerText();
    if (!rowText.includes('Stale / source missing') || !rowText.includes('Field ID 11')) throw new Error(`Exact synthetic stale binding is not visible: ${rowText}`);
    if (await page.locator('[data-gpp-diagnostics="local"]').count() !== 1) throw new Error('Diagnostics local-only marker is missing.');
    const supportLink = page.locator('[data-gpp-support-bundle-download]');
    if (await supportLink.count() !== 1 || !(await supportLink.isVisible())) throw new Error('Support bundle download action is not visible.');
    return { form_id: stale.form_id, form_title: stale.form_title, stale_status: stale.binding_health, diagnostics_visible: true };
  });

  await test('GPP-DIAG-ADMIN-002', 'support bundle endpoint is browser-authenticated, downloadable and sanitized', async () => {
    const bundlePath = path.join(artifactDir, 'gpp-support-bundle-stale.json');
    const supportLink = page.locator('[data-gpp-support-bundle-download]');
    const href = await supportLink.getAttribute('href');
    if (!href || !href.includes('admin-post.php') || !href.includes('action=gpp_download_support_bundle')) throw new Error(`Unexpected support bundle URL: ${href}`);
    const response = await context.request.get(href);
    const headers = response.headers();
    const raw = await response.text();
    if (response.status() !== 200) throw new Error(`Support bundle endpoint returned HTTP ${response.status()}: ${raw.slice(0, 800)}`);
    if (!String(headers['content-type'] || '').toLowerCase().includes('application/json')) throw new Error(`Support bundle response Content-Type is not JSON: ${headers['content-type'] || 'missing'}`);
    if (!String(headers['content-disposition'] || '').toLowerCase().includes('attachment') || !String(headers['content-disposition'] || '').includes('gpp-support-bundle.json')) throw new Error(`Support bundle response is not an attachment: ${headers['content-disposition'] || 'missing'}`);

    fs.writeFileSync(bundlePath, raw);
    staleBundle = JSON.parse(raw);
    if (staleBundle.schema_version !== '1.0.0' || staleBundle.bundle_type !== 'gpp.support_bundle') throw new Error('Downloaded support artifact schema/type is invalid.');
    const fact = findBindingFact(staleBundle, stale.form_id, 'student.national_id');
    assertBindingFact(fact, 'stale_source_missing', 11, 'Existing binding-health stale fact missing from bundle');
    const cookieValues = (await context.cookies()).map(cookie => cookie.value).filter(Boolean);
    const forbidden = ['Synthetic Replacement National ID', 'WU21 Beta Student', 'SYN-B-', 'alpha.png', 'beta.png', 'gflow_access_token', ...cookieValues];
    for (const value of forbidden) if (raw.includes(value)) throw new Error(`Sanitized bundle leaked forbidden synthetic value.`);
    const boundary = staleBundle.privacy_boundary || {};
    for (const key of ['submitted_entry_values', 'uploaded_file_names_and_contents', 'cookies_tokens_credentials_headers', 'absolute_server_paths', 'exception_messages_and_stack_arguments']) {
      if (boundary[key] !== 'OMITTED') throw new Error(`Privacy boundary ${key} is not explicit.`);
    }
    if (!staleBundle.observed?.runtime?.wordpress_version || !staleBundle.observed?.runtime?.php_version || !staleBundle.observed?.runtime?.gravity_forms_version || !staleBundle.observed?.runtime?.gravity_flow_version) throw new Error('Support bundle is missing pinned runtime identity facts.');
    return { file: path.basename(bundlePath), endpoint_status: response.status(), stale_fact: fact, privacy_boundary: boundary };
  });

  await test('GPP-DIAG-ADMIN-003', 'explicit stale-binding repair executes through the exact real row settings form and re-evaluates healthy', async () => {
    await page.goto(settingsUrl, { waitUntil: 'networkidle' });
    const action = await findRowMappingAction(page, stale.form_title, 'student.national_id', ['Field 12', 'Synthetic Replacement National ID']);
    if (!action) throw new Error('Real row mapping UI did not offer the explicit synthetic replacement field for the stale form.');
    await submitRowMappingAction(page, stale.form_title, 'student.national_id', action);

    const fact = findBindingFact(control('health'), stale.form_id, 'student.national_id');
    assertBindingFact(fact, 'healthy', 12, 'Authoritative binding health did not re-evaluate the repaired source');
    const row = await bindingRow(page, stale.form_title);
    const rowText = await row.innerText();
    if (!rowText.includes('Healthy') || rowText.includes('Stale / source missing') || !rowText.includes('Field ID 12')) throw new Error(`Binding health UI did not show the exact repaired field: ${rowText}`);
    const selected = await row.locator('select[name^="gpp_binding_row["]').first().locator('option:checked').innerText();
    if (!selected.includes('Field 12') || !selected.includes('Synthetic Replacement National ID')) throw new Error(`Repaired row selector did not retain the exact current host field: ${selected}`);
    return { selected_action: action.label, health: fact.status, exact_field_id: fact.source.field_id };
  });

  await test('GPP-DIAG-ADMIN-004', 'fresh real settings render exposes rollback and restores the previous immutable binding version', async () => {
    await page.goto(settingsUrl, { waitUntil: 'networkidle' });
    const rollback = await findAction(page, ['Rollback:', stale.form_title, 'binding version 1.0.0']);
    if (!rollback) throw new Error('Rollback to the previously authoritative immutable version is not available on a fresh settings render after repair.');
    await submitAction(page, rollback);

    const fact = findBindingFact(control('health'), stale.form_id, 'student.national_id');
    assertBindingFact(fact, 'stale_source_missing', 11, 'Rollback did not reactivate the exact pre-repair source while field 11 remained absent');
    const row = await bindingRow(page, stale.form_title);
    const rowText = await row.innerText();
    if (!rowText.includes('Stale / source missing') || !rowText.includes('Field ID 11')) throw new Error(`Rollback UI did not show exact field 11 stale state: ${rowText}`);
    return { rollback_option: rollback.label, restored_source_field_id: fact.source.field_id, stale_again_before_host_restore: true };
  });
} finally {
  try {
    if (stale) control('stale-off');
  } finally {
    if (stale) {
      await test('GPP-DIAG-ADMIN-005', 'restoring the host field makes the rolled-back binding healthy again', async () => {
        const fact = findBindingFact(control('health'), stale.form_id, 'student.national_id');
        assertBindingFact(fact, 'healthy', 11, 'Restored host field did not make the rolled-back binding healthy');
        await page.goto(settingsUrl, { waitUntil: 'networkidle' });
        const row = await bindingRow(page, stale.form_title);
        const rowText = await row.innerText();
        if (!rowText.includes('Healthy') || rowText.includes('Stale / source missing') || !rowText.includes('Field ID 11')) throw new Error(`Restored field 11 is not healthy in the real settings UI: ${rowText}`);
        return { restored_field_id: fact.source.field_id, health: fact.status };
      });
    }
    await browser.close();
  }
}

fs.writeFileSync(path.join(artifactDir, 'diagnostics-admin-browser-results.json'), JSON.stringify({ suite: 'GPP Diagnostics admin runtime', results }, null, 2) + '\n');
const failures = results.filter(result => result.status !== 'PASS');
if (failures.length) throw new Error(`GPP Diagnostics admin browser failures: ${JSON.stringify(failures, null, 2)}`);
console.log('GPP_DIAGNOSTICS_ADMIN_BROWSER_PASS');