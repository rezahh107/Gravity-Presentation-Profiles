import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
const repoRoot = process.env.GITHUB_WORKSPACE || process.cwd();
const controlFile = path.join(repoRoot, 'tests/repro-evidence-lab/qualification-control.php');
const results = [];

if (!artifactDir || !wpPath || !wpCli) throw new Error('Qualification runtime environment is incomplete.');

function wpEval(code) {
  const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], { encoding: 'utf8', env: process.env });
  if (cp.status !== 0) throw new Error(`${cp.stderr}\n${cp.stdout}`);
  return cp.stdout.trim();
}
function control(action) {
  const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval-file', controlFile], {
    encoding: 'utf8', env: { ...process.env, GPP_QUAL_CONTROL: action },
  });
  if (cp.status !== 0) throw new Error(`control ${action} failed:\n${cp.stderr}\n${cp.stdout}`);
  const raw = cp.stdout.trim();
  try { return JSON.parse(raw); } catch { throw new Error(`control ${action} returned non-JSON: ${raw}`); }
}
const manifest = JSON.parse(wpEval('echo wp_json_encode(get_option("gpp_wu19_fixture_manifest"), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);'));
const alpha = manifest.alpha;
const runtimePassword = `gppq-${randomBytes(18).toString('hex')}-A1!`;
wpEval(`wp_set_password(${JSON.stringify(runtimePassword)}, ${Number(manifest.bootstrap_id)}); echo 'credential-ready';`);
const entryUrl = item => `${baseUrl}/wp-admin/admin.php?page=gravityflow-inbox&view=entry&id=${item.form_id}&lid=${item.entry_id}`;
const dossierUrl = item => `${baseUrl}/wp-admin/admin-ajax.php?action=gravityflow_print_entries&lid=${item.entry_id}&gpp_presentation=dossier`;

function record(id, name, status, details = null) { results.push({ id, name, status, details }); }
async function test(id, name, fn) {
  try { record(id, name, 'PASS', await fn()); }
  catch (error) { record(id, name, 'FAIL', { error: String(error?.stack || error).slice(0, 8000) }); }
}
async function login(page) {
  await page.goto(`${baseUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', 'bootstrap_admin');
  await page.fill('#user_pass', runtimePassword);
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#wp-submit')]);
}
async function openEntry(page) {
  await page.goto(entryUrl(alpha), { waitUntil: 'networkidle' });
  await page.waitForSelector('form[id^="gform_"]', { timeout: 30000 });
}
async function entryState(page) {
  return page.evaluate(() => {
    const dossier = document.querySelector('.gpp-entry-dossier--composed');
    const slot = dossier?.querySelector('[data-gpp-slot="student.national_id"] dd');
    const native = document.querySelector('.entry-detail-view');
    return {
      ready: Boolean(dossier),
      profile: dossier?.dataset.gppProfileId || null,
      full_name: dossier?.querySelector('[data-gpp-section="identity"] h1')?.textContent?.trim() || null,
      national_id: slot?.textContent?.trim() || null,
      native_visible: Boolean(native && getComputedStyle(native).display !== 'none'),
      native_editor_text: dossier?.querySelector('[data-gpp-native-editor]')?.innerText?.replace(/\s+/g, ' ').trim() || '',
      body: document.body.innerText.replace(/\s+/g, ' ').trim(),
    };
  });
}
async function openPrint(page) {
  await page.goto(dossierUrl(alpha), { waitUntil: 'networkidle' });
  await page.waitForSelector('.gpp-print-dossier', { timeout: 30000 });
}
async function printState(page) {
  return page.evaluate(() => {
    const root = document.querySelector('.gpp-print-dossier');
    const traceNode = document.querySelector('.gpp-print-decision-trace');
    let trace = [];
    try { trace = traceNode ? JSON.parse(traceNode.textContent) : []; } catch {}
    const fields = document.querySelectorAll('#gpp-print-front .front-identifiers .front-id-field');
    const national = fields.length > 1 ? fields[1].querySelector('.print-value')?.textContent?.trim() || '' : '';
    const fullName = document.querySelector('#gpp-print-front .front-name-row .front-line:first-child .print-value')?.textContent?.trim() || '';
    return {
      state: root?.dataset.gppPrintState || null,
      failure: root?.dataset.gppPrintFailure || null,
      profile: root?.dataset.gppProfileId || null,
      pages: [...document.querySelectorAll('.gpp-print-sheet')].map(el => el.dataset.gppPrintPage),
      full_name: fullName,
      national_id: national,
      trace,
      body: document.body.innerText.replace(/\s+/g, ' ').trim(),
    };
  });
}
function traceHas(state, stage, outcome) {
  return state.trace.some(event => event.stage === stage && event.outcome === outcome);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
await login(page);
let happySemantics = null;

await test('CORE-SPINE-001', 'happy path carries one authoritative entry through Entry Detail into dossier Print', async () => {
  await openEntry(page);
  const entry = await entryState(page);
  if (!entry.ready || entry.profile !== 'shared.entry_detail.v1') throw new Error(`Entry Detail not admitted: ${JSON.stringify(entry)}`);
  const utility = page.locator('[data-gpp-print-utility="dossier"] [data-gpp-dossier-print-url]');
  if (await utility.count() !== 1) throw new Error('Dedicated dossier Print utility missing from the admitted Entry Detail.');
  const url = await utility.getAttribute('data-gpp-dossier-print-url');
  const parsed = new URL(url, baseUrl);
  if (Number(parsed.searchParams.get('lid')) !== Number(alpha.entry_id) || parsed.searchParams.get('action') !== 'gravityflow_print_entries' || parsed.searchParams.get('gpp_presentation') !== 'dossier') {
    throw new Error(`Print utility broke same-entry/native lifecycle continuity: ${url}`);
  }
  await page.goto(parsed.toString(), { waitUntil: 'networkidle' });
  await page.waitForSelector('.gpp-print-dossier', { timeout: 30000 });
  const print = await printState(page);
  if (print.state !== 'ready' || print.profile !== 'shared.print.v1' || JSON.stringify(print.pages) !== JSON.stringify(['front', 'back'])) throw new Error(`Print did not reach canonical Front/Back ready state: ${JSON.stringify(print)}`);
  if (entry.full_name !== print.full_name || entry.national_id !== print.national_id) throw new Error('Cross-surface semantic values diverged on the same entry.');
  if (!traceHas(print, 'PRINT_COMPOSITION_READY', 'ready_two_pages')) throw new Error('Print decision trace did not reach ready_two_pages.');
  happySemantics = { full_name: entry.full_name, national_id: entry.national_id };
  return { form_id: Number(alpha.form_id), entry_id: Number(alpha.entry_id), entry_profile: entry.profile, print_profile: print.profile, same_entry_continuity: true, cross_surface_semantic_consistency: true, print_pages: print.pages };
});

await test('CORE-SPINE-002', 'schema drift never guesses a similar replacement and explicit remap repairs both consumers', async () => {
  const drift = control('schema-drift-on');
  try {
    await openEntry(page); const entryDrift = await entryState(page);
    await openPrint(page); const printDrift = await printState(page);
    const replacementVisibleInNativeEditor = entryDrift.native_editor_text.includes(drift.replacement_value);
    if (!replacementVisibleInNativeEditor) throw new Error('Schema-drift falsification control is invalid: replacement value is not visible in the native editor.');
    if (entryDrift.national_id === drift.replacement_value) throw new Error('Entry Detail semantic national-id rebound to the similar-looking replacement field.');
    if (printDrift.national_id === drift.replacement_value) throw new Error('Print semantic national-id rebound to the similar-looking replacement field.');
    if (printDrift.national_id !== '' || !traceHas(printDrift, 'PRINT_BINDINGS_EVALUATED', 'source_unavailable')) throw new Error(`Print did not fail closed at the stale source: ${JSON.stringify(printDrift)}`);

    const repair = control('schema-drift-repair');
    await openEntry(page); const entryRepair = await entryState(page);
    await openPrint(page); const printRepair = await printState(page);
    if (entryRepair.national_id !== repair.replacement_value || printRepair.national_id !== repair.replacement_value) throw new Error('Explicit authoritative remap did not propagate to both surfaces.');
    return { source_field_removed: true, similar_field_created: true, replacement_visible_in_native_editor: replacementVisibleInNativeEditor, semantic_oracle_scope: 'authoritative_slot_and_print_trace_only', fuzzy_rebind: false, stale_source_failed_closed: true, explicit_repair_observed_by_entry_detail: true, explicit_repair_observed_by_print: true };
  } finally {
    control('schema-drift-off');
  }
});

await test('CORE-SPINE-003', 'overlapping general and exact-entry bindings resolve deterministically without semantic contradiction', async () => {
  const overlap = control('ambiguity-on');
  try {
    await openEntry(page); const entry = await entryState(page);
    await openPrint(page); const print = await printState(page);
    if (entry.national_id !== overlap.override_value || print.national_id !== overlap.override_value) throw new Error(`Exact-entry authority did not deterministically win: ${JSON.stringify({ entry: entry.national_id, print: print.national_id })}`);
    return { general_and_exact_entry_bindings_active: true, deterministic_exact_entry_resolution: true, cross_surface_semantic_contradiction: false };
  } finally {
    control('ambiguity-off');
  }
});

await test('CORE-SPINE-004', 'fresh Print permission mutation evidence is reused from the focused WU19 gate in this shared runtime', async () => {
  const file = path.join(artifactDir, 'wu19-browser-results.json');
  const focused = JSON.parse(fs.readFileSync(file, 'utf8'));
  const permission = focused.results.find(result => result.id === 'WU19-BROWSER-005');
  if (!permission || permission.status !== 'PASS' || permission.details?.fresh_print_denied !== true || permission.details?.gpp_composer_executed !== false) {
    throw new Error(`Focused WU19 permission mutation is not proven in the shared runtime: ${JSON.stringify(permission)}`);
  }
  return { reused_focused_test: 'WU19-BROWSER-005', entry_detail_was_accessible: true, fresh_native_print_denied_after_assignment_change: true, stale_gpp_access_reuse: false };
});

await test('CORE-SPINE-005', 'evidence degradation to NOT_PROVEN fails closed without stale semantic reuse', async () => {
  control('degradation-on');
  try {
    await openEntry(page); const entry = await entryState(page);
    if (entry.ready || !entry.native_visible) throw new Error(`Entry Detail did not fall back to native host presentation: ${JSON.stringify(entry)}`);
    await openPrint(page); const print = await printState(page);
    if (print.national_id !== '' || !traceHas(print, 'PRINT_BINDINGS_EVALUATED', 'binding_not_proven')) throw new Error(`Print did not blank NOT_PROVEN semantic data: ${JSON.stringify(print)}`);
    if (happySemantics?.national_id && print.national_id === happySemantics.national_id) throw new Error('Print reused stale admitted national-id data after evidence degradation.');
    return { entry_detail_native_fallback: true, print_degraded_value_blank: true, print_trace_binding_not_proven: true, stale_semantic_reuse: false };
  } finally {
    control('degradation-off');
  }
});

await test('CORE-SPINE-006', 'lifecycle deactivation and replacement are observed by later fresh requests', async () => {
  control('lifecycle-deactivate');
  try {
    await openEntry(page); const entryInactive = await entryState(page);
    if (entryInactive.ready || !entryInactive.native_visible) throw new Error(`Deactivated Entry binding remained cached/admitted: ${JSON.stringify(entryInactive)}`);
    await openPrint(page); const printInactive = await printState(page);
    if (printInactive.state !== 'failure' || printInactive.failure !== 'binding_context_missing') throw new Error(`Deactivated Print binding did not fail closed: ${JSON.stringify(printInactive)}`);

    control('lifecycle-replace');
    await openEntry(page); const entryActive = await entryState(page);
    await openPrint(page); const printActive = await printState(page);
    if (!entryActive.ready || entryActive.profile !== 'shared.entry_detail.v1') throw new Error('Replacement Entry binding was not observed by a fresh request.');
    if (printActive.state !== 'ready' || printActive.profile !== 'shared.print.v1' || !traceHas(printActive, 'PRINT_COMPOSITION_READY', 'ready_two_pages')) throw new Error('Replacement Print binding was not observed by a fresh request.');
    if (happySemantics && (entryActive.full_name !== happySemantics.full_name || printActive.full_name !== happySemantics.full_name || entryActive.national_id !== printActive.national_id)) throw new Error('Replacement lifecycle state changed authoritative semantic meaning unexpectedly.');
    return { deactivation_observed: true, inactive_entry_native_fallback: true, inactive_print_failure: 'binding_context_missing', replacement_activation_observed: true, stale_lifecycle_cache: false };
  } finally {
    control('lifecycle-off');
  }
});

await context.close();
await browser.close();

const output = {
  schema_version: '1.0.0',
  suite: 'Stateful Core Spine Qualification',
  data_class: 'SYNTHETIC_NON_PII',
  scenarios: Object.fromEntries(results.map(result => [result.id, result.status])),
  same_entry_continuity: results.find(r => r.id === 'CORE-SPINE-001')?.status === 'PASS' ? 'PASS' : 'FAIL',
  cross_surface_semantic_consistency: results.find(r => r.id === 'CORE-SPINE-001')?.status === 'PASS' ? 'PASS' : 'FAIL',
  results,
};
fs.writeFileSync(path.join(artifactDir, 'core-spine-results.json'), JSON.stringify(output, null, 2) + '\n');
for (const result of results) console.log(`${result.status} ${result.id} ${result.name}`);
if (results.some(result => result.status !== 'PASS')) process.exit(1);
