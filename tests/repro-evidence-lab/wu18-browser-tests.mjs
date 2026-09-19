import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
const adminPassword = Buffer.from('d3UyMS1ib290c3RyYXAtcGFzcy0yMDI2', 'base64').toString('utf8');
const results = [];

function wpEval(code) {
  const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], { encoding: 'utf8', env: process.env });
  if (cp.status !== 0) throw new Error(`${cp.stderr}\n${cp.stdout}`);
  return cp.stdout.trim();
}

const manifest = JSON.parse(wpEval('echo wp_json_encode(get_option("gpp_wu18_fixture_manifest"), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);'));
const entryUrl = item => `${baseUrl}/wp-admin/admin.php?page=gravityflow-inbox&view=entry&id=${item.form_id}&lid=${item.entry_id}`;

function record(id, name, status, details = null) { results.push({ id, name, status, details }); }
async function test(id, name, fn) {
  try { record(id, name, 'PASS', await fn()); }
  catch (error) { record(id, name, 'FAIL', { error: String(error?.stack || error).slice(0, 6000) }); }
}
async function login(page) {
  await page.goto(`${baseUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', 'bootstrap_admin');
  await page.fill('#user_pass', adminPassword);
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#wp-submit')]);
}
async function waitDossier(page) {
  await page.waitForSelector('.gpp-entry-dossier[data-gpp-entry-detail="ready"][data-gpp-review-mode="read-only"]', { timeout: 30000 });
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
await login(page);

await test('WU18-BROWSER-001', 'server-admitted Review shows one semantic dossier and hides only the duplicate native field table', async () => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(entryUrl(manifest.alpha), { waitUntil: 'networkidle' });
  await waitDossier(page);

  const state = await page.evaluate(() => {
    const dossier = document.querySelector('.gpp-entry-dossier[data-gpp-entry-detail="ready"]');
    const table = document.querySelector('.entry-detail-view');
    const status = document.querySelector('.gravityflow-status-box');
    const timeline = document.querySelector('.gravityflow-timeline');
    const nativePrint = document.querySelector('.detail-view-print');
    const task = dossier?.querySelector('[data-gpp-entry-region="current-task"]');
    const dossierBox = dossier?.getBoundingClientRect();
    const statusBox = status?.getBoundingClientRect();
    const overlaps = Boolean(dossierBox && statusBox && !(dossierBox.right <= statusBox.left || statusBox.right <= dossierBox.left || dossierBox.bottom <= statusBox.top || statusBox.bottom <= dossierBox.top));
    return {
      profile: dossier?.dataset.gppProfileId || null,
      marker: dossier?.dataset.gppNativeTableSuppression || null,
      composed_class: dossier?.classList.contains('gpp-entry-dossier--composed') || false,
      native_table_present: Boolean(table),
      native_table_display: table ? getComputedStyle(table).display : null,
      status_present: Boolean(status),
      status_visible: Boolean(status && getComputedStyle(status).display !== 'none' && getComputedStyle(status).visibility !== 'hidden'),
      status_inside_dossier: Boolean(status?.closest('.gpp-entry-dossier')),
      status_inside_native_form: Boolean(status?.closest('form[id^="gform_"]')),
      task_contains_status: Boolean(task?.querySelector('.gravityflow-status-box')),
      timeline_present: Boolean(timeline),
      timeline_inside_dossier: Boolean(timeline?.closest('.gpp-entry-dossier')),
      native_print_present: Boolean(nativePrint),
      native_print_inside_dossier: Boolean(nativePrint?.closest('.gpp-entry-dossier')),
      overlaps,
    };
  });

  if (state.profile !== 'srwf.operations.entry-detail.v1' || state.marker !== 'read-only-review') throw new Error(`Server Review marker missing: ${JSON.stringify(state)}`);
  if (!state.native_table_present || state.native_table_display !== 'none') throw new Error(`Duplicate native field table not visually suppressed: ${JSON.stringify(state)}`);
  if (!state.status_present || !state.status_visible || state.status_inside_dossier || !state.status_inside_native_form || state.task_contains_status) throw new Error(`Native workflow box ownership changed: ${JSON.stringify(state)}`);
  if (!state.timeline_present || state.timeline_inside_dossier) throw new Error(`Timeline was moved or removed: ${JSON.stringify(state)}`);
  if (!state.native_print_present || state.native_print_inside_dossier) throw new Error(`Native Print was moved or removed: ${JSON.stringify(state)}`);
  if (state.composed_class || state.overlaps) throw new Error(`Obsolete composition or layout overlap observed: ${JSON.stringify(state)}`);
  return state;
});

await test('WU18-BROWSER-002', 'Approve Reject Revert Note and nonce remain original native host controls outside GPP dossier', async () => {
  const status = page.locator('.gravityflow-status-box');
  if (await status.count() !== 1) throw new Error('Expected exactly one native workflow status box.');
  if (await status.locator('textarea[name="gravityflow_note"]').count() !== 1) throw new Error('Native Note textarea missing.');
  if (await status.locator('input[name="_wpnonce"]').count() !== 1) throw new Error('Native workflow nonce missing.');
  const actions = await status.locator('.gravityflow-action-buttons button').evaluateAll(buttons => buttons.map(button => ({ value: button.value, name: button.name, text: button.textContent.replace(/\s+/g, ' ').trim() })));
  const values = actions.map(action => action.value).sort();
  if (JSON.stringify(values) !== JSON.stringify(['approved', 'rejected', 'revert'])) throw new Error(`Unexpected native actions: ${JSON.stringify(actions)}`);
  if (!actions.find(action => action.value === 'approved')?.text.includes('تأیید پرونده')) throw new Error('Existing GPP Approve label filter was not preserved.');
  if (!actions.find(action => action.value === 'rejected')?.text.includes('رد پرونده')) throw new Error('Existing GPP Reject label filter was not preserved.');
  const ownership = await status.evaluate(node => ({
    in_dossier: Boolean(node.closest('.gpp-entry-dossier')),
    in_native_form: Boolean(node.closest('form[id^="gform_"]')),
    action_boxes: document.querySelectorAll('.gravityflow-action-buttons').length,
    status_boxes: document.querySelectorAll('.gravityflow-status-box').length,
  }));
  if (ownership.in_dossier || !ownership.in_native_form || ownership.action_boxes !== 1 || ownership.status_boxes !== 1) throw new Error(`Native controls were cloned/moved: ${JSON.stringify(ownership)}`);
  return { actions, ownership };
});

await test('WU18-BROWSER-003', 'image preview remains progressive enhancement', async () => {
  const trigger = page.locator('[data-gpp-image-preview]').first();
  if (await trigger.count() !== 1) throw new Error('Bound image preview trigger missing.');
  await trigger.click();
  const dialog = page.locator('[data-gpp-image-dialog]');
  await dialog.waitFor({ state: 'visible' });
  const open = await dialog.evaluate(node => node.open === true);
  if (!open) throw new Error('Image preview dialog did not open.');
  await dialog.locator('[data-gpp-image-close]').click();
  await page.waitForFunction(() => !document.querySelector('[data-gpp-image-dialog]')?.open);
  return { preview_opened_and_closed: true };
});

await test('WU18-BROWSER-004', 'blocking all GPP Entry Detail JavaScript does not restore the duplicate native field table', async () => {
  const blockedContext = await browser.newContext();
  let scriptBlocked = false;
  await blockedContext.route('**/assets/js/srwf-gravity-flow-entry-detail.js*', route => {
    scriptBlocked = true;
    return route.abort();
  });
  const blockedPage = await blockedContext.newPage();
  await login(blockedPage);
  await blockedPage.goto(entryUrl(manifest.alpha), { waitUntil: 'networkidle' });
  await waitDossier(blockedPage);
  const state = await blockedPage.evaluate(() => {
    const dossier = document.querySelector('.gpp-entry-dossier[data-gpp-entry-detail="ready"]');
    const table = document.querySelector('.entry-detail-view');
    const status = document.querySelector('.gravityflow-status-box');
    return {
      marker: dossier?.dataset.gppNativeTableSuppression || null,
      table_display: table ? getComputedStyle(table).display : null,
      status_visible: Boolean(status && getComputedStyle(status).display !== 'none' && getComputedStyle(status).visibility !== 'hidden'),
      preview_bound: dossier?.dataset.gppPreviewBound || null,
    };
  });
  await blockedContext.close();
  if (!scriptBlocked) throw new Error('Entry Detail progressive-enhancement script was not actually blocked.');
  if (state.marker !== 'read-only-review' || state.table_display !== 'none' || !state.status_visible) throw new Error(`Structural behavior still depended on JS: ${JSON.stringify(state)}`);
  if (state.preview_bound === '1') throw new Error('Blocked progressive-enhancement JS unexpectedly executed.');
  return { script_blocked: scriptBlocked, ...state };
});

await test('WU18-BROWSER-005', 'UNMAPPED data degrades one slot without restoring duplicate native presentation', async () => {
  await page.goto(entryUrl(manifest.negative), { waitUntil: 'networkidle' });
  await waitDossier(page);
  const state = await page.evaluate(() => {
    const slot = document.querySelector('[data-gpp-slot="student.national_id"] dd');
    const table = document.querySelector('.entry-detail-view');
    return {
      slot_text: slot?.textContent?.trim() || null,
      marker: document.querySelector('.gpp-entry-dossier')?.dataset.gppNativeTableSuppression || null,
      table_display: table ? getComputedStyle(table).display : null,
    };
  });
  if (state.slot_text !== 'نگاشت نشده' || state.marker !== 'read-only-review' || state.table_display !== 'none') throw new Error(`Semantic degradation affected structural admission: ${JSON.stringify(state)}`);
  return state;
});

await test('WU18-BROWSER-006', 'dedicated Approval editor fixture falls back to native editor with no suppression marker', async () => {
  await page.goto(entryUrl(manifest.editor), { waitUntil: 'networkidle' });
  const intendedFieldSelector = `#input_${manifest.editor.form_id}_${manifest.editor.editable_field_id}`;
  const state = await page.evaluate(selector => {
    const table = document.querySelector('.entry-detail-view');
    const editor = table?.querySelector('.gform_wrapper');
    const status = document.querySelector('.gravityflow-status-box');
    return {
      dossier_count: document.querySelectorAll('.gpp-entry-dossier[data-gpp-entry-detail="ready"]').length,
      marker_count: document.querySelectorAll('[data-gpp-native-table-suppression]').length,
      native_table_display: table ? getComputedStyle(table).display : null,
      native_editor_visible: Boolean(editor && getComputedStyle(editor).display !== 'none'),
      intended_field_visible: Boolean(document.querySelector(selector)),
      status_visible: Boolean(status && getComputedStyle(status).display !== 'none'),
    };
  }, intendedFieldSelector);
  if (state.dossier_count !== 0 || state.marker_count !== 0 || !state.native_editor_visible || !state.intended_field_visible || state.native_table_display === 'none' || !state.status_visible) throw new Error(`Native editor fallback failed: ${JSON.stringify(state)}`);
  return state;
});

await test('WU18-BROWSER-007', 'native Approval transition reaches native User Input with GPP suppression disabled', async () => {
  await page.goto(entryUrl(manifest.transition), { waitUntil: 'networkidle' });
  await waitDossier(page);
  const approve = page.locator('.gravityflow-status-box .gravityflow-action-buttons button[value="approved"]');
  if (await approve.count() !== 1) throw new Error('Transition fixture native Approve control missing.');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }),
    approve.click(),
  ]);
  const state = await page.evaluate(() => {
    const table = document.querySelector('.entry-detail-view');
    const editor = table?.querySelector('.gform_wrapper');
    return {
      dossier_count: document.querySelectorAll('.gpp-entry-dossier[data-gpp-entry-detail="ready"]').length,
      marker_count: document.querySelectorAll('[data-gpp-native-table-suppression]').length,
      native_table_display: table ? getComputedStyle(table).display : null,
      native_editor_visible: Boolean(editor && getComputedStyle(editor).display !== 'none'),
      status_boxes: document.querySelectorAll('.gravityflow-status-box').length,
    };
  });
  if (state.dossier_count !== 0 || state.marker_count !== 0 || !state.native_editor_visible || state.native_table_display === 'none') throw new Error(`User Input did not remain native: ${JSON.stringify(state)}`);
  return state;
});

await browser.close();

const failures = results.filter(result => result.status === 'FAIL');
const output = { schema_version: '5.0.0', surface: 'gravity_flow.entry_detail', results };
fs.mkdirSync(artifactDir, { recursive: true });
fs.writeFileSync(path.join(artifactDir, 'wu18-browser-results.json'), `${JSON.stringify(output, null, 2)}\n`);

if (failures.length) {
  console.error(JSON.stringify(output, null, 2));
  process.exit(1);
}

console.log('WU18_BROWSER_READ_ONLY_REVIEW_PASS');
