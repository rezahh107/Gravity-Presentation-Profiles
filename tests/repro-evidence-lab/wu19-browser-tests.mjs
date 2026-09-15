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
const manifest = JSON.parse(wpEval('echo wp_json_encode(get_option("gpp_wu19_fixture_manifest"), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);'));
const entryUrl = item => `${baseUrl}/wp-admin/admin.php?page=gravityflow-inbox&view=entry&id=${item.form_id}&lid=${item.entry_id}`;
const dossierUrl = item => `${baseUrl}/wp-admin/admin-ajax.php?action=gravityflow_print_entries&lid=${item.entry_id}&gpp_presentation=dossier`;
const nativeUrl = item => `${baseUrl}/wp-admin/admin-ajax.php?action=gravityflow_print_entries&lid=${item.entry_id}`;
function record(id, name, status, details = null) { results.push({ id, name, status, details }); }
async function test(id, name, fn) { try { record(id, name, 'PASS', await fn()); } catch (error) { record(id, name, 'FAIL', { error: String(error?.stack || error).slice(0, 8000) }); } }
async function login(page, user, pass) {
  await page.goto(`${baseUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', user); await page.fill('#user_pass', pass);
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#wp-submit')]);
}
function pdfPages(file) {
  const cp = spawnSync('pdfinfo', [file], { encoding: 'utf8' });
  if (cp.status !== 0) throw new Error(`pdfinfo failed: ${cp.stderr}`);
  const pages = Number(cp.stdout.match(/^Pages:\s+(\d+)/m)?.[1]);
  const size = cp.stdout.match(/^Page size:\s+([\d.]+) x ([\d.]+) pts/m);
  return { pages, width: Number(size?.[1]), height: Number(size?.[2]), raw: cp.stdout };
}
async function layoutSafety(page) {
  return page.locator('.gpp-print-dossier[data-gpp-print-state="ready"]').evaluate(root => {
    const sheets = [...root.querySelectorAll('.gpp-print-sheet')];
    const material = [...root.querySelectorAll('.print-value')].filter(el => el.textContent.trim() !== '');
    const overflows = material.filter(el => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1).map(el => ({ text: el.textContent.trim().slice(0, 80), sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight }));
    const clippedSheets = sheets.filter(el => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2).map(el => el.dataset.gppPrintPage);
    return { pages: sheets.map(el => el.dataset.gppPrintPage), overflows, clippedSheets, receiptRows: root.querySelectorAll('.gpp-print-receipt-row').length, chequeRows: root.querySelectorAll('.gpp-print-cheque-row').length, centerLogo: root.querySelectorAll('[data-gpp-logo="center"]').length, manualRegions: root.querySelectorAll('[data-gpp-manual]').length };
  });
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
await login(page, 'bootstrap_admin', 'wu21-bootstrap-pass-2026');

await test('WU19-BROWSER-001', 'authorized Entry Detail exposes separate dossier Print utility', async () => {
  await page.goto(entryUrl(manifest.alpha), { waitUntil: 'networkidle' });
  const utility = page.locator('[data-gpp-print-utility="dossier"] [data-gpp-dossier-print-url]');
  if (await utility.count() !== 1) throw new Error('Dedicated dossier Print utility missing.');
  const url = await utility.getAttribute('data-gpp-dossier-print-url');
  if (!url?.includes('action=gravityflow_print_entries') || !url.includes('gpp_presentation=dossier') || !url.includes(`lid=${manifest.alpha.entry_id}`)) throw new Error(`Utility did not target native Print lifecycle: ${url}`);
  if (await page.locator('[data-gpp-section="current-task"] [data-gpp-print-utility]').count() !== 0) throw new Error('Dossier Print utility leaked into workflow task/action cluster.');
  return { native_action: true, single_entry: true, outside_task_cluster: true };
});

await test('WU19-BROWSER-002', 'canonical dossier is Front then Back and native Print grid is visually suppressed', async () => {
  await page.goto(dossierUrl(manifest.alpha), { waitUntil: 'networkidle' });
  await page.waitForSelector('.gpp-print-dossier[data-gpp-print-state="ready"]', { timeout: 30000 });
  await page.emulateMedia({ media: 'print' });
  const state = await layoutSafety(page);
  if (JSON.stringify(state.pages) !== JSON.stringify(['front', 'back'])) throw new Error(`Unexpected canonical page wrappers: ${JSON.stringify(state)}`);
  if (state.receiptRows !== 5 || state.chequeRows !== 6 || state.centerLogo !== 0 || state.manualRegions < 6) throw new Error(`Historical anatomy failed: ${JSON.stringify(state)}`);
  const nativeVisible = await page.locator('#view-container > form').evaluateAll(nodes => nodes.some(el => getComputedStyle(el).display !== 'none'));
  if (nativeVisible) throw new Error('Native Gravity Flow print grid remains visible in dossier mode.');
  return state;
});

await test('WU19-BROWSER-003', 'Chromium physical pagination is exactly two A4 portrait pages at scale 1', async () => {
  const pdf = path.join(artifactDir, 'wu19-canonical.pdf');
  await page.pdf({ path: pdf, printBackground: true, preferCSSPageSize: true, scale: 1 });
  const info = pdfPages(pdf);
  if (info.pages !== 2) throw new Error(`Expected exactly two physical pages: ${JSON.stringify(info)}`);
  const a4 = Math.abs(info.width - 595.28) < 2 && Math.abs(info.height - 841.89) < 2;
  if (!a4 || info.width >= info.height) throw new Error(`Expected A4 portrait dimensions: ${JSON.stringify(info)}`);
  return { pages: info.pages, width_pt: info.width, height_pt: info.height, scale: 1, prefer_css_page_size: true };
});

const longContentFieldMap = Object.freeze({
  'student.full_name': Number(manifest.alpha.fields['student.full_name']),
  'school.name': Number(manifest.alpha.fields['school.name']),
  'education.grade_group': Number(manifest.alpha.fields['education.grade_group']),
  'student.national_id': Number(manifest.alpha.fields['student.national_id']),
  'student.mobile': Number(manifest.alpha.fields['student.mobile']),
  'finance.tuition_amount': Number(manifest.alpha.fields['finance.tuition_amount']),
  'finance.net_payable_amount': Number(manifest.alpha.fields['finance.net_payable_amount']),
});
function encodeJson(value) { return Buffer.from(JSON.stringify(value), 'utf8').toString('base64'); }
function entryFieldSnapshot(entryId, fieldMap = longContentFieldMap) {
  const fields = encodeJson(fieldMap);
  const raw = wpEval(`$fields=json_decode(base64_decode('${fields}'),true); $entry=GFAPI::get_entry(${Number(entryId)}); if (is_wp_error($entry)) { fwrite(STDERR,$entry->get_error_message()); exit(2); } $out=array(); foreach($fields as $slot=>$fid){ $key=(string)$fid; $out[$slot]=array_key_exists($key,$entry)?$entry[$key]:null; } echo wp_json_encode($out, JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);`);
  return JSON.parse(raw);
}
function writeEntryFields(entryId, fieldMap, values) {
  const fields = encodeJson(fieldMap);
  const payload = encodeJson(values);
  const result = wpEval(`$fields=json_decode(base64_decode('${fields}'),true); $values=json_decode(base64_decode('${payload}'),true); foreach($fields as $slot=>$fid){ if (!array_key_exists($slot,$values)) { fwrite(STDERR,'missing restore value for '.$slot); exit(3); } $updated=GFAPI::update_entry_field(${Number(entryId)},$fid,$values[$slot]); if (is_wp_error($updated)) { fwrite(STDERR,$updated->get_error_message()); exit(4); } } echo 'updated';`);
  if (result !== 'updated') throw new Error(`Entry field update failed: ${result}`);
}
function snapshotMismatches(expected, actual) {
  return Object.keys(expected).filter(slot => JSON.stringify(expected[slot]) !== JSON.stringify(actual[slot]));
}
function assertSnapshot(expected, actual, label) {
  const mismatches = snapshotMismatches(expected, actual);
  if (mismatches.length) throw new Error(`${label}: field restoration mismatch for ${mismatches.join(', ')}`);
  return { verified: true, fields: Object.keys(expected) };
}

await test('WU19-BROWSER-004', 'realistic long Persian and numeric content stays inside defined print regions', async () => {
  const before = entryFieldSnapshot(manifest.alpha.entry_id);
  const longValues = {
    'student.full_name': 'محمدرضا عبدالحسین‌پور نیک‌اندیش رضوی شیرازی',
    'school.name': 'دبیرستان دوره دوم نمونه دولتی فرهنگ و معارف اسلامی شهید دستغیب ناحیه یک شیراز',
    'education.grade_group': 'دوازدهم علوم تجربی ـ گروه ویژه آزمون‌های جامع سال تحصیلی ۱۴۰۵–۱۴۰۶',
    'student.national_id': '۰۰۱۲۳۴۵۶۷۸',
    'student.mobile': '۰۹۱۷۱۲۳۴۵۶۷',
    'finance.tuition_amount': '۹۹۹۹۹۹۹۹۹۹',
    'finance.net_payable_amount': '۸۸۸۸۸۸۸۸۸۸',
  };
  let scenarioError = null;
  let restorationError = null;
  let details = null;
  let restoration = null;
  try {
    try {
      writeEntryFields(manifest.alpha.entry_id, longContentFieldMap, longValues);
      await page.goto(dossierUrl(manifest.alpha), { waitUntil: 'networkidle' }); await page.waitForSelector('.gpp-print-dossier[data-gpp-print-state="ready"]'); await page.emulateMedia({ media: 'print' });
      const state = await layoutSafety(page);
      if (state.overflows.length || state.clippedSheets.length) throw new Error(`Material clipping/overflow detected: ${JSON.stringify(state)}`);
      const pdf = path.join(artifactDir, 'wu19-long-content.pdf');
      await page.pdf({ path: pdf, printBackground: true, preferCSSPageSize: true, scale: 1 });
      const info = pdfPages(pdf);
      if (info.pages !== 2) throw new Error(`Long-content case created ${info.pages} physical pages.`);
      details = { pages: 2, material_overflows: 0, sheet_overflows: 0 };
    } catch (error) {
      scenarioError = error;
    }
  } finally {
    try {
      writeEntryFields(manifest.alpha.entry_id, longContentFieldMap, before);
      const after = entryFieldSnapshot(manifest.alpha.entry_id);
      restoration = assertSnapshot(before, after, 'WU19-BROWSER-004 verified restoration');
    } catch (error) {
      restorationError = error;
    }
  }
  if (restorationError) throw new Error(`WU19-BROWSER-004 restoration failed: ${restorationError.message}${scenarioError ? `; scenario also failed: ${scenarioError.message}` : ''}`);
  if (scenarioError) throw scenarioError;
  return { ...details, state_isolation: 'RESTORED_AND_VERIFIED', restored_fields: restoration.fields };
});

await test('WU19-BROWSER-004-ISOLATION-GUARD', 'restoration assertion rejects an intentionally omitted field restore', async () => {
  const before = entryFieldSnapshot(manifest.alpha.entry_id);
  const omitted = 'finance.net_payable_amount';
  const omittedMap = { [omitted]: longContentFieldMap[omitted] };
  let assertionRejected = false;
  let detectedMismatches = [];
  try {
    writeEntryFields(manifest.alpha.entry_id, omittedMap, { [omitted]: 'WU19-ISOLATION-SENTINEL' });
    const incompleteMap = Object.fromEntries(Object.entries(longContentFieldMap).filter(([slot]) => slot !== omitted));
    const incompleteValues = Object.fromEntries(Object.entries(before).filter(([slot]) => slot !== omitted));
    writeEntryFields(manifest.alpha.entry_id, incompleteMap, incompleteValues);
    const observed = entryFieldSnapshot(manifest.alpha.entry_id);
    detectedMismatches = snapshotMismatches(before, observed);
    try {
      assertSnapshot(before, observed, 'Intentional incomplete restoration');
    } catch {
      assertionRejected = true;
    }
    if (!assertionRejected || !detectedMismatches.includes(omitted)) throw new Error(`Isolation guard did not reject omitted restoration: ${JSON.stringify(detectedMismatches)}`);
  } finally {
    writeEntryFields(manifest.alpha.entry_id, longContentFieldMap, before);
    assertSnapshot(before, entryFieldSnapshot(manifest.alpha.entry_id), 'Isolation guard cleanup restoration');
  }
  return { omitted_field: omitted, incomplete_restoration_rejected: true, detected_mismatches: detectedMismatches, cleanup_restoration_verified: true };
});

await test('WU19-BROWSER-005', 'permission loss after Entry Detail open is re-evaluated by fresh native Print request', async () => {
  await page.goto(entryUrl(manifest.beta), { waitUntil: 'networkidle' });
  if (await page.locator('[data-gpp-entry-detail="ready"]').count() !== 1) throw new Error('Precondition: authorized Entry Detail did not open.');
  const mutation = wpEval(`$entry=GFAPI::get_entry(${manifest.beta.entry_id}); $api=new Gravity_Flow_API(${manifest.beta.form_id}); $step=$api->get_current_step($entry); $meta=$step->get_feed_meta(); $viewer=get_user_by('login','wu21_viewer'); $meta['assignees']=array('user_id|'.(int)$viewer->ID); gravity_flow()->update_feed_meta($step->get_id(),$meta); echo 'changed';`);
  if (mutation !== 'changed') throw new Error(`Assignment mutation failed: ${mutation}`);
  try {
    await page.goto(dossierUrl(manifest.beta), { waitUntil: 'networkidle' });
    const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    if (!body.includes("You don't have permission to view this entry.")) throw new Error(`Native permission denial missing: ${body.slice(0, 1200)}`);
    if (await page.locator('.gpp-print-dossier').count() !== 0 || await page.locator('.gpp-print-decision-trace').count() !== 0) throw new Error('Post-permission GPP composer executed despite permission loss.');
    return { entry_detail_was_open: true, fresh_print_denied: true, gpp_composer_executed: false };
  } finally {
    wpEval(`$entry=GFAPI::get_entry(${manifest.beta.entry_id}); $api=new Gravity_Flow_API(${manifest.beta.form_id}); $step=$api->get_current_step($entry); $meta=$step->get_feed_meta(); $admin=get_user_by('login','bootstrap_admin'); $meta['assignees']=array('user_id|'.(int)$admin->ID); gravity_flow()->update_feed_meta($step->get_id(),$meta); echo 'restored';`);
  }
});

await test('WU19-BROWSER-006', 'ordinary native Print remains unchanged without dossier intent', async () => {
  await page.goto(nativeUrl(manifest.alpha), { waitUntil: 'networkidle' });
  if (await page.locator('.gpp-print-dossier').count() !== 0) throw new Error('GPP dossier appeared without intent.');
  if (await page.locator('#view-container > form').count() !== 1) throw new Error('Native single-entry Print form missing.');
  const visible = await page.locator('#view-container > form').evaluate(el => getComputedStyle(el).display !== 'none');
  if (!visible) throw new Error('Native Print was visually suppressed without dossier intent.');
  return { native_form: 1, gpp_dossier: 0, visible: true };
});

await test('WU19-BROWSER-007', 'unsupported bulk dossier fails closed and never becomes multiple dossiers', async () => {
  await page.goto(`${baseUrl}/wp-admin/admin-ajax.php?action=gravityflow_print_entries&lid=${manifest.alpha.entry_id},${manifest.beta.entry_id}&gpp_presentation=dossier`, { waitUntil: 'networkidle' });
  if (await page.locator('[data-gpp-print-failure="unsupported_request_cardinality"]').count() !== 1) throw new Error('Explicit bulk failure state missing.');
  if (await page.locator('[data-gpp-print-state="ready"]').count() !== 0) throw new Error('Bulk request produced a canonical dossier.');
  return { explicit_failure: 'unsupported_request_cardinality', canonical_dossiers: 0 };
});

fs.writeFileSync(path.join(artifactDir, 'wu19-browser-results.json'), JSON.stringify({ suite: 'WU19 browser/runtime', results }, null, 2) + '\n');
for (const result of results) console.log(`${result.status} ${result.id} ${result.name}`);
await browser.close();
if (results.some(result => result.status !== 'PASS')) process.exit(1);
