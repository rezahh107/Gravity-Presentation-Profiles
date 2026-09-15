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

function control(action) {
  const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval-file', controlFile], {
    encoding: 'utf8',
    env: { ...process.env, GPP_DIAGNOSTICS_CONTROL: action },
  });
  if (cp.status !== 0) throw new Error(`Diagnostics control ${action} failed:\n${cp.stdout}\n${cp.stderr}`);
  const text = cp.stdout.trim();
  try { return JSON.parse(text); } catch { throw new Error(`Diagnostics control ${action} returned non-JSON: ${text}`); }
}

function record(id, name, status, details = null) { results.push({ id, name, status, details }); }
async function test(id, name, fn) {
  try { record(id, name, 'PASS', await fn()); }
  catch (error) { record(id, name, 'FAIL', { error: String(error?.stack || error).slice(0, 8000) }); }
}

async function login(page) {
  await page.goto(`${baseUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', 'bootstrap_admin');
  await page.fill('#user_pass', 'wu21-bootstrap-pass-2026');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.click('#wp-submit'),
  ]);
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
  if (action?.id) return page.locator(`#${CSS.escape(action.id)}`);
  if (action?.name) return page.locator(`select[name=${JSON.stringify(action.name)}]`);
  throw new Error('Binding action select cannot be identified.');
}

async function saveSettings(page) {
  const submit = page.locator('input[type="submit"][value*="Save"], input[type="submit"], button[type="submit"]').first();
  if (await submit.count() !== 1) throw new Error('Gravity Forms settings submit control not found.');
  await submit.click();
  await page.waitForLoadState('networkidle');
}

function findBindingFact(bundle, formId, slot) {
  const contexts = bundle?.observed?.binding_health?.contexts || [];
  for (const context of contexts) {
    if (Number(context.form_id) !== Number(formId)) continue;
    const fact = (context.facts || []).find(item => item.semantic_slot_key === slot);
    if (fact) return fact;
  }
  return null;
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();
const settingsUrl = `${baseUrl}/wp-admin/admin.php?page=gf_settings&subview=gravity-presentation-profiles`;
let stale = null;
let staleBundle = null;

try {
  await login(page);
  stale = control('stale-on');

  await test('GPP-DIAG-ADMIN-001', 'real Add-On settings renders stale Mapping & Binding Health and Diagnostics surfaces', async () => {
    await page.goto(settingsUrl, { waitUntil: 'networkidle' });
    const body = await page.locator('body').innerText();
    if (!body.includes('Mapping & Binding Health')) throw new Error('Mapping & Binding Health section is not reachable on the real Add-On settings page.');
    if (!body.includes('Diagnostics & Support')) throw new Error('Diagnostics & Support section is not reachable on the real Add-On settings page.');
    const row = page.locator('tr', { hasText: 'student.national_id' }).first();
    if (await row.count() !== 1) throw new Error('Synthetic national-id binding row is not rendered.');
    const rowText = await row.innerText();
    if (!rowText.includes('Stale / source missing')) throw new Error(`Synthetic stale binding is not visible: ${rowText}`);
    if (await page.locator('[data-gpp-diagnostics="local"]').count() !== 1) throw new Error('Diagnostics local-only marker is missing.');
    if (await page.locator('[data-gpp-support-bundle-download]').count() !== 1) throw new Error('Support bundle download action is missing.');
    return { form_id: stale.form_id, stale_status: stale.binding_health, diagnostics_visible: true };
  });

  await test('GPP-DIAG-ADMIN-002', 'stale support bundle is downloadable and sanitized', async () => {
    const bundlePath = path.join(artifactDir, 'gpp-support-bundle-stale.json');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('[data-gpp-support-bundle-download]').click(),
    ]);
    await download.saveAs(bundlePath);
    const raw = fs.readFileSync(bundlePath, 'utf8');
    staleBundle = JSON.parse(raw);
    if (staleBundle.schema_version !== '1.0.0' || staleBundle.bundle_type !== 'gpp.support_bundle') throw new Error('Downloaded support artifact schema/type is invalid.');
    const fact = findBindingFact(staleBundle, stale.form_id, 'student.national_id');
    if (!fact || fact.status !== 'stale_source_missing' || Number(fact?.source?.field_id) !== 11) throw new Error(`Existing binding-health stale fact missing from bundle: ${JSON.stringify(fact)}`);
    const forbidden = [
      'wu21-bootstrap-pass-2026',
      'Synthetic Replacement National ID',
      'WU21 Beta Student',
      'SYN-B-',
      'alpha.png',
      'beta.png',
      'gflow_access_token',
    ];
    for (const value of forbidden) {
      if (raw.includes(value)) throw new Error(`Sanitized bundle leaked forbidden synthetic value: ${value}`);
    }
    const boundary = staleBundle.privacy_boundary || {};
    for (const key of ['submitted_entry_values', 'uploaded_file_names_and_contents', 'cookies_tokens_credentials_headers', 'absolute_server_paths', 'exception_messages_and_stack_arguments']) {
      if (boundary[key] !== 'OMITTED') throw new Error(`Privacy boundary ${key} is not explicit.`);
    }
    if (!staleBundle.observed?.runtime?.wordpress_version || !staleBundle.observed?.runtime?.php_version || !staleBundle.observed?.runtime?.gravity_forms_version || !staleBundle.observed?.runtime?.gravity_flow_version) {
      throw new Error('Support bundle is missing pinned runtime identity facts.');
    }
    return { file: path.basename(bundlePath), stale_fact: fact, privacy_boundary: boundary };
  });

  await test('GPP-DIAG-ADMIN-003', 'explicit stale-binding repair executes through the real settings lifecycle and re-evaluates healthy', async () => {
    await page.goto(settingsUrl, { waitUntil: 'networkidle' });
    const action = await findAction(page, ['Repair:', 'student national id', 'Synthetic Replacement National ID', 'Field 12']);
    if (!action) throw new Error('Real settings UI did not offer the explicit synthetic replacement field.');
    await selectFor(page, action).selectOption(action.value);
    await saveSettings(page);
    const row = page.locator('tr', { hasText: 'student.national_id' }).first();
    const rowText = await row.innerText();
    if (!rowText.includes('Healthy') || rowText.includes('Stale / source missing')) throw new Error(`Binding health did not re-evaluate healthy after repair: ${rowText}`);
    if (!rowText.includes('Field ID 12')) throw new Error(`Repair did not retain exact selected field 12: ${rowText}`);
    return { selected_action: action.label, health: 'Healthy', exact_field_id: 12 };
  });

  await test('GPP-DIAG-ADMIN-004', 'real settings lifecycle keeps rollback available and restores the previous immutable binding version', async () => {
    const rollback = await findAction(page, ['Rollback:', 'binding version 1.0.0']);
    if (!rollback) throw new Error('Rollback to the previously authoritative immutable version is not available after repair.');
    await selectFor(page, rollback).selectOption(rollback.value);
    await saveSettings(page);
    const body = await page.locator('body').innerText();
    if (!body.includes('health.bindings') && !body.includes('@1.0.0') && !body.includes('1.0.0')) {
      // Binding-set identity is fixture-specific, but the exact old version must
      // remain visible somewhere in the active health section.
      throw new Error('Previous binding version is not visible after rollback.');
    }
    const row = page.locator('tr', { hasText: 'student.national_id' }).first();
    const rowText = await row.innerText();
    if (!rowText.includes('Stale / source missing')) throw new Error(`Rollback did not reactivate the old field-11 mapping while field 11 is still absent: ${rowText}`);
    return { rollback_option: rollback.label, stale_again_before_host_restore: true };
  });
} finally {
  try {
    if (stale) control('stale-off');
  } finally {
    if (stale) {
      await test('GPP-DIAG-ADMIN-005', 'restoring the host field makes the rolled-back binding healthy again', async () => {
        await page.goto(settingsUrl, { waitUntil: 'networkidle' });
        const row = page.locator('tr', { hasText: 'student.national_id' }).first();
        const rowText = await row.innerText();
        if (!rowText.includes('Healthy') || rowText.includes('Stale / source missing')) throw new Error(`Restored field 11 did not return the rolled-back binding to healthy: ${rowText}`);
        if (!rowText.includes('Field ID 11')) throw new Error(`Rolled-back source identity is not exact field 11 after restore: ${rowText}`);
        return { restored_field_id: 11, health: 'Healthy' };
      });
    }
    await browser.close();
  }
}

fs.writeFileSync(path.join(artifactDir, 'diagnostics-admin-browser-results.json'), JSON.stringify({ suite: 'GPP Diagnostics admin runtime', results }, null, 2) + '\n');
const failures = results.filter(result => result.status !== 'PASS');
if (failures.length) {
  throw new Error(`GPP Diagnostics admin browser failures: ${JSON.stringify(failures, null, 2)}`);
}
console.log('GPP_DIAGNOSTICS_ADMIN_BROWSER_PASS');
