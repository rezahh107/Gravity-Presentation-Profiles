import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
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
async function login(page, user, pass) {
  await page.goto(`${baseUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', user); await page.fill('#user_pass', pass);
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#wp-submit')]);
}
async function waitDossier(page) { await page.waitForSelector('.gpp-entry-dossier--composed', { timeout: 30000 }); }
async function materialSnapshot(page) {
  return page.locator('.gpp-entry-dossier--composed').evaluate(dossier => ({
    sections: [...dossier.querySelectorAll('[data-gpp-section]')].map(el => el.dataset.gppSection),
    slots: [...dossier.querySelectorAll('[data-gpp-slot]')].map(el => el.dataset.gppSlot),
    text: dossier.innerText.replace(/\s+/g, ' ').trim(),
    title: dossier.querySelector('[data-gpp-section="current-task"] h2')?.textContent?.trim() || '',
    document: dossier.querySelector('[data-gpp-section="documents"]')?.innerText?.replace(/\s+/g, ' ').trim() || '',
  }));
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
await login(page, 'bootstrap_admin', 'wu21-bootstrap-pass-2026');

await test('WU18-BROWSER-001', 'continuous dossier identity precedes exact current-task card on native Entry Detail', async () => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(entryUrl(manifest.alpha), { waitUntil: 'networkidle' }); await waitDossier(page);
  const state = await page.evaluate(() => {
    const dossier = document.querySelector('.gpp-entry-dossier--composed');
    const identity = dossier?.querySelector('[data-gpp-section="identity"]'); const task = dossier?.querySelector('[data-gpp-section="current-task"]');
    const table = document.querySelector('.entry-detail-view');
    return { profile: dossier?.dataset.gppProfileId, title: task?.querySelector('h2')?.textContent?.trim(), order: identity && task ? Boolean(identity.compareDocumentPosition(task) & Node.DOCUMENT_POSITION_FOLLOWING) : false, native_wrappers: document.querySelectorAll('.gravityflow_workflow_detail').length, native_forms: document.querySelectorAll('form[id^="gform_"]').length, replacement_apps: document.querySelectorAll('[data-gpp-replacement-entry-detail], .gpp-custom-entry-app').length, native_grid_visible: Boolean(table && getComputedStyle(table).display !== 'none') };
  });
  if (state.profile !== 'shared.entry_detail.v1' || state.title !== 'کاری که الان باید انجام دهید' || !state.order) throw new Error(`Dossier identity/order failed: ${JSON.stringify(state)}`);
  if (state.native_wrappers !== 1 || state.native_forms !== 1 || state.replacement_apps !== 0 || state.native_grid_visible) throw new Error(`Native ownership failed: ${JSON.stringify(state)}`);
  return state;
});

await test('WU18-BROWSER-002', 'host editability and native Approval actions remain authoritative', async () => {
  const formId = manifest.alpha.form_id; const review = manifest.alpha.fields['review.reason']; const mobile = manifest.alpha.fields['student.mobile'];
  const reviewControl = page.locator(`#input_${formId}_${review}`);
  if (await reviewControl.count() !== 1 || !(await reviewControl.isVisible())) throw new Error('Host-authentic review control not exposed.');
  if (await page.locator(`#input_${formId}_${mobile}`).count() !== 0) throw new Error('Semantic editability claim manufactured mobile control.');
  const actions = await page.locator('[data-gpp-section="current-task"] .gravityflow-action-buttons button').evaluateAll(buttons => buttons.map(b => ({ value: b.value, text: b.textContent.replace(/\s+/g, ' ').trim() })));
  if (JSON.stringify(actions.map(v => v.value).sort()) !== JSON.stringify(['approved', 'rejected'])) throw new Error(`Unexpected Approval actions: ${JSON.stringify(actions)}`);
  if (!actions.find(v => v.value === 'approved')?.text.includes('تأیید پرونده') || !actions.find(v => v.value === 'rejected')?.text.includes('رد پرونده')) throw new Error('Persian native action labels missing.');
  if (await page.getByText(/Save Draft|Send Next|Return for Correction/, { exact: false }).count() !== 0) throw new Error('Invented action is visible.');
  if (await page.locator('[data-gpp-section="current-task"] .detail-view-print').count() !== 0 || await page.locator('form .detail-view-print').count() !== 1) throw new Error('Print utility crossed task-action boundary.');
  return { host_editable_review_field: review, semantic_claim_without_host_control: mobile, native_actions: actions };
});

await test('WU18-BROWSER-003', 'image preview supports Escape/backdrop/focus/scroll restoration', async () => {
  const trigger = page.locator('[data-gpp-section="documents"] [data-gpp-image-preview]').first();
  if (await trigger.count() !== 1) throw new Error('Bound image thumbnail missing.');
  await trigger.scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, 120));
  const before = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
  await trigger.click(); const dialog = page.locator('[data-gpp-image-dialog]');
  if (!(await dialog.evaluate(el => el.open))) throw new Error('Dialog did not open.');
  await page.keyboard.press('Escape');
  if (await dialog.evaluate(el => el.open)) throw new Error('Escape did not close dialog.');
  const afterEscape = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY, focused: document.activeElement?.hasAttribute('data-gpp-image-preview') || false }));
  if (!afterEscape.focused || Math.abs(afterEscape.y - before.y) > 2 || Math.abs(afterEscape.x - before.x) > 2) throw new Error(`Escape restoration failed: ${JSON.stringify({ before, afterEscape })}`);
  await trigger.click(); await dialog.click({ position: { x: 4, y: 4 } });
  if (await dialog.evaluate(el => el.open)) throw new Error('Backdrop did not close dialog.');
  const afterBackdrop = await page.evaluate(() => ({ y: window.scrollY, focused: document.activeElement?.hasAttribute('data-gpp-image-preview') || false }));
  if (!afterBackdrop.focused || Math.abs(afterBackdrop.y - before.y) > 2) throw new Error(`Backdrop restoration failed: ${JSON.stringify(afterBackdrop)}`);
  return { before, after_escape: afterEscape, after_backdrop: afterBackdrop };
});

await test('WU18-BROWSER-004', 'PDF is host-file open affordance and history is secondary/collapsed', async () => {
  await page.goto(entryUrl(manifest.beta), { waitUntil: 'networkidle' }); await waitDossier(page);
  const file = page.locator('[data-gpp-section="documents"] .gpp-entry-dossier__file-link');
  if (await file.count() !== 1) throw new Error('PDF open affordance missing.');
  const href = await file.getAttribute('href'); const target = await file.getAttribute('target');
  if (!href?.includes('report-card.pdf') || target !== '_blank' || await page.locator('[data-gpp-section="documents"] [data-gpp-image-preview]').count() !== 0) throw new Error(`PDF representation failed: ${href}`);
  const details = page.locator('[data-gpp-history-details]');
  if (await details.count() !== 1 || await details.evaluate(el => el.open)) throw new Error('History not collapsed.');
  if ((await page.locator('.gpp-entry-dossier__history-help').innerText()).trim() !== manifest.locked_history_helper || await details.locator('.gravityflow-timeline').count() !== 1) throw new Error('History helper/native timeline failed.');
  return { pdf_href: href, history_collapsed: true, native_timeline: true };
});

await test('WU18-BROWSER-005', 'desktop/mobile preserve material dossier parity and order', async () => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto(entryUrl(manifest.alpha), { waitUntil: 'networkidle' }); await waitDossier(page);
  const desktop = await materialSnapshot(page);
  await page.setViewportSize({ width: 390, height: 844 }); await page.reload({ waitUntil: 'networkidle' }); await waitDossier(page);
  const mobile = await materialSnapshot(page);
  if (JSON.stringify(desktop.sections) !== JSON.stringify(mobile.sections) || JSON.stringify(desktop.slots) !== JSON.stringify(mobile.slots) || desktop.title !== mobile.title || desktop.document !== mobile.document || desktop.text !== mobile.text) throw new Error(`Material parity failed: ${JSON.stringify({ desktop, mobile })}`);
  return { sections: desktop.sections, semantic_slots: desktop.slots, same_material_text: true };
});

await test('WU18-BROWSER-006', 'NOT_PROVEN required mapping fails to native Entry Detail', async () => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto(entryUrl(manifest.negative), { waitUntil: 'networkidle' }); await page.waitForSelector('.entry-detail-view', { timeout: 30000 });
  const state = await page.evaluate(() => { const table = document.querySelector('.entry-detail-view'); return { dossier: document.querySelectorAll('.gpp-entry-dossier').length, native_table_visible: Boolean(table && getComputedStyle(table).display !== 'none'), native_form: document.querySelectorAll('form[id^="gform_"]').length }; });
  if (state.dossier !== 0 || !state.native_table_visible || state.native_form !== 1) throw new Error(`Native fallback failed: ${JSON.stringify(state)}`);
  return state;
});

await test('WU18-BROWSER-007', 'native authorization denial cannot be bypassed by GPP', async () => {
  const deniedContext = await browser.newContext(); const deniedPage = await deniedContext.newPage();
  await login(deniedPage, 'wu21_viewer', 'wu21-synthetic-viewer-2026'); await deniedPage.goto(entryUrl(manifest.alpha), { waitUntil: 'networkidle' });
  const state = await deniedPage.evaluate(() => ({ dossier: document.querySelectorAll('.gpp-entry-dossier').length, native_table: document.querySelectorAll('.entry-detail-view').length, body_text: document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 1200) }));
  await deniedContext.close();
  if (state.dossier !== 0 || state.native_table !== 0 || !state.body_text.includes('permission')) throw new Error(`Authorization boundary failed: ${JSON.stringify(state)}`);
  return { dossier: 0, native_table: 0, native_permission_denial: true };
});

fs.writeFileSync(path.join(artifactDir, 'wu18-browser-results.json'), JSON.stringify({ suite: 'WU18 browser/runtime', results }, null, 2) + '\n');
for (const result of results) console.log(`${result.status} ${result.id} ${result.name}`);
await browser.close();
if (results.some(result => result.status !== 'PASS')) process.exit(1);
