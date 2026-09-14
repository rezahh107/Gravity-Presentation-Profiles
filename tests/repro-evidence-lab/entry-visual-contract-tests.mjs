import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
const ownerHtml = process.env.GPP_OWNER_HTML;
const expectedHtml = { size: 115728, sha256: '666704ac25b019ae59406974a223d10cace3f90e96f9d55312730ae93af09c81' };
const results = [];

if (!artifactDir || !wpPath || !wpCli || !ownerHtml) throw new Error('Entry visual qualification environment is incomplete.');

function identity(file) {
  const data = fs.readFileSync(file);
  return { size: data.length, sha256: createHash('sha256').update(data).digest('hex') };
}
function assertIdentity(file, expected, label) {
  const actual = identity(file);
  if (actual.size !== expected.size || actual.sha256 !== expected.sha256) throw new Error(`${label} authority mismatch: ${JSON.stringify(actual)}`);
  return actual;
}
const htmlIdentity = assertIdentity(ownerHtml, expectedHtml, 'Owner HTML');

function wpEval(code) {
  const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], { encoding: 'utf8', env: process.env });
  if (cp.status !== 0) throw new Error(`${cp.stderr}\n${cp.stdout}`);
  return cp.stdout.trim();
}
const manifest = JSON.parse(wpEval('echo wp_json_encode(get_option("gpp_wu19_fixture_manifest"), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);'));
const alpha = manifest.alpha;
const runtimePassword = `gppv-${randomBytes(18).toString('hex')}-A1!`;
wpEval(`wp_set_password(${JSON.stringify(runtimePassword)}, ${Number(manifest.bootstrap_id)}); echo 'credential-ready';`);
const entryUrl = `${baseUrl}/wp-admin/admin.php?page=gravityflow-inbox&view=entry&id=${alpha.form_id}&lid=${alpha.entry_id}`;

function record(id, name, status, details = null) { results.push({ id, name, status, details }); }
async function test(id, name, fn) {
  try { record(id, name, 'PASS', await fn()); }
  catch (error) { record(id, name, 'FAIL', { error: String(error?.stack || error).slice(0, 10000) }); }
}
async function login(page) {
  await page.goto(`${baseUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', 'bootstrap_admin');
  await page.fill('#user_pass', runtimePassword);
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#wp-submit')]);
}
function rgbHex(rgb) {
  const nums = rgb.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  return nums?.length === 3 ? `#${nums.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase() : rgb.toUpperCase();
}
function rect(el) {
  const x = el.getBoundingClientRect();
  return { x: x.x, y: x.y, width: x.width, height: x.height, right: x.right, bottom: x.bottom };
}
async function referenceEntryMetrics(page, surface) {
  await page.evaluate(s => window.showSurface(s), surface);
  return page.evaluate(() => {
    const r = el => { const x = el.getBoundingClientRect(); return { x: x.x, y: x.y, width: x.width, height: x.height, right: x.right, bottom: x.bottom }; };
    const root = document.querySelector('.dossier');
    const identity = document.querySelector('.dossier-header');
    const task = document.querySelector('.task');
    const documents = document.querySelector('.documents')?.closest('.dossier-section');
    const history = document.querySelector('#history');
    const stage = document.querySelector('#stage');
    const vars = getComputedStyle(document.documentElement);
    return {
      stage: r(stage), root: r(root), identity: r(identity), task: r(task), documents: documents ? r(documents) : null, history: history ? r(history) : null,
      tokens: { page: vars.getPropertyValue('--bg').trim(), surface: vars.getPropertyValue('--surface').trim(), primary: vars.getPropertyValue('--primary').trim(), text: vars.getPropertyValue('--text').trim(), secondary: vars.getPropertyValue('--secondary').trim(), muted: vars.getPropertyValue('--muted').trim(), divider: vars.getPropertyValue('--line').trim(), error: vars.getPropertyValue('--error').trim(), success: vars.getPropertyValue('--success').trim() },
      h1: { size: parseFloat(getComputedStyle(root.querySelector('h1')).fontSize), weight: getComputedStyle(root.querySelector('h1')).fontWeight },
      h2: { size: parseFloat(getComputedStyle(task.querySelector('h2')).fontSize), weight: getComputedStyle(task.querySelector('h2')).fontWeight },
    };
  });
}
async function productionEntryMetrics(page) {
  return page.evaluate(() => {
    const r = el => { const x = el.getBoundingClientRect(); return { x: x.x, y: x.y, width: x.width, height: x.height, right: x.right, bottom: x.bottom }; };
    const root = document.querySelector('.gpp-entry-dossier--composed');
    if (!root) return { missing: true };
    const identity = root.querySelector('[data-gpp-section="identity"]');
    const task = root.querySelector('[data-gpp-section="current-task"]');
    const documents = root.querySelector('[data-gpp-section="documents"]');
    const history = root.querySelector('[data-gpp-section="history"]');
    const actions = task?.querySelector('.gravityflow-action-buttons');
    const sections = [...root.querySelectorAll(':scope > [data-gpp-section]')];
    const weights = [];
    for (const el of root.querySelectorAll('.gpp-entry-dossier__fact dt, .gpp-entry-dossier__fact dd, .gpp-entry-dossier__section h1, .gpp-entry-dossier__section h2, .gpp-entry-dossier__task-step, .gpp-entry-dossier__document-label, .gpp-entry-dossier__history-help, .gpp-entry-dossier__history details > summary')) {
      weights.push({ selector: el.tagName.toLowerCase(), weight: getComputedStyle(el).fontWeight });
    }
    const csRoot = getComputedStyle(root); const csSection = getComputedStyle(identity); const csTask = getComputedStyle(task);
    const h1 = identity.querySelector('h1'); const h2 = task.querySelector('h2');
    return {
      missing: false, root: r(root), identity: r(identity), task: r(task), documents: documents ? r(documents) : null, history: history ? r(history) : null, actions: actions ? r(actions) : null,
      sectionOrder: sections.map(el => el.dataset.gppSection), sectionRects: sections.map(el => ({ section: el.dataset.gppSection, ...r(el) })),
      styles: { text: csRoot.color, fontSynthesis: csRoot.fontSynthesis, identityBorderTop: csSection.borderTopColor, identityBackground: csSection.backgroundColor, identityBorder: csSection.borderRightColor, taskBackground: csTask.backgroundColor },
      h1: { size: parseFloat(getComputedStyle(h1).fontSize), weight: getComputedStyle(h1).fontWeight }, h2: { size: parseFloat(getComputedStyle(h2).fontSize), weight: getComputedStyle(h2).fontWeight },
      weights,
      rootOverflow: root.scrollWidth > root.clientWidth + 1,
      viewportOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    };
  });
}

const regionNames = ['identity', 'task', 'documents', 'history'];
function geometryJitter(repeated) {
  const base = repeated[0];
  let geometryPx = 0;
  let typographyPx = 0;
  const geometryKeys = ['x', 'y', 'width', 'height', 'right', 'bottom'];
  for (const sample of repeated.slice(1)) {
    for (const name of ['stage', 'root', ...regionNames]) {
      if (!base[name] || !sample[name]) continue;
      for (const key of geometryKeys) geometryPx = Math.max(geometryPx, Math.abs(sample[name][key] - base[name][key]));
    }
    typographyPx = Math.max(typographyPx, Math.abs(sample.h1.size - base.h1.size), Math.abs(sample.h2.size - base.h2.size));
  }
  return {
    measured_geometry_px: geometryPx,
    measured_typography_px: typographyPx,
    geometry_tolerance_px: Math.max(1, Math.ceil(geometryPx + 1)),
    typography_tolerance_px: Math.max(0.25, typographyPx + 0.25),
  };
}
function horizontalGeometry(region, root) {
  return {
    inset_start_px: region.x - root.x,
    inset_end_px: root.right - region.right,
    width_px: region.width,
  };
}
function comparePx(failures, label, actual, expected, tolerance) {
  if (Math.abs(actual - expected) > tolerance) failures.push(`${label}: actual=${actual.toFixed(2)} reference=${expected.toFixed(2)} tolerance=${tolerance}`);
}
function validateLegacyGenericGeometry(actual, reference, viewport, tolerancePx) {
  const failures = [];
  if (actual.missing) return { pass: false, failures: ['production dossier missing'] };
  const required = ['identity', 'current-task', 'facts', 'documents', 'history'];
  const positions = Object.fromEntries(actual.sectionOrder.map((name, index) => [name, index]));
  for (const name of required) if (!(name in positions)) failures.push(`missing section ${name}`);
  for (let i = 1; i < required.length; i++) if ((positions[required[i - 1]] ?? 999) >= (positions[required[i]] ?? -1)) failures.push(`section order ${required[i - 1]} -> ${required[i]}`);
  if (actual.identity.bottom > actual.task.y + tolerancePx) failures.push('identity/task overlap');
  if (actual.actions && (actual.actions.x < actual.task.x - tolerancePx || actual.actions.right > actual.task.right + tolerancePx || actual.actions.y < actual.task.y - tolerancePx || actual.actions.bottom > actual.task.bottom + tolerancePx)) failures.push('actions escaped current-task region');
  for (let i = 1; i < actual.sectionRects.length; i++) if (actual.sectionRects[i - 1].bottom > actual.sectionRects[i].y + tolerancePx) failures.push(`section overlap ${actual.sectionRects[i - 1].section}/${actual.sectionRects[i].section}`);
  if (actual.root.width > reference.stage.width + tolerancePx) failures.push(`dossier wider than locked stage: ${actual.root.width} > ${reference.stage.width}`);
  if (actual.root.width > viewport.width + tolerancePx) failures.push('dossier wider than viewport');
  if (actual.rootOverflow || actual.viewportOverflow) failures.push('horizontal overflow');
  return { pass: failures.length === 0, failures };
}
function validateEntryContract(actual, reference, viewport, tolerances) {
  const failures = [];
  if (actual.missing) return { pass: false, failures: ['production dossier missing'] };
  const tolerancePx = tolerances.geometry_tolerance_px;
  const required = ['identity', 'current-task', 'facts', 'documents', 'history'];
  const positions = Object.fromEntries(actual.sectionOrder.map((name, index) => [name, index]));
  for (const name of required) if (!(name in positions)) failures.push(`missing section ${name}`);
  for (let i = 1; i < required.length; i++) if ((positions[required[i - 1]] ?? 999) >= (positions[required[i]] ?? -1)) failures.push(`section order ${required[i - 1]} -> ${required[i]}`);
  if (actual.identity.bottom > actual.task.y + tolerancePx) failures.push('identity/task overlap');
  if (actual.actions && (actual.actions.x < actual.task.x - tolerancePx || actual.actions.right > actual.task.right + tolerancePx || actual.actions.y < actual.task.y - tolerancePx || actual.actions.bottom > actual.task.bottom + tolerancePx)) failures.push('actions escaped current-task region');
  for (let i = 1; i < actual.sectionRects.length; i++) if (actual.sectionRects[i - 1].bottom > actual.sectionRects[i].y + tolerancePx) failures.push(`section overlap ${actual.sectionRects[i - 1].section}/${actual.sectionRects[i].section}`);

  if (reference.root.width > reference.stage.width + tolerancePx) failures.push('locked reference root exceeds locked stage');
  comparePx(failures, 'root width vs Owner C/D', actual.root.width, reference.root.width, tolerancePx);
  for (const name of regionNames) {
    if (!reference[name] || !actual[name]) {
      failures.push(`missing comparable geometry for ${name}`);
      continue;
    }
    const expected = horizontalGeometry(reference[name], reference.root);
    const observed = horizontalGeometry(actual[name], actual.root);
    comparePx(failures, `${name} inline-start`, observed.inset_start_px, expected.inset_start_px, tolerancePx);
    comparePx(failures, `${name} inline-end`, observed.inset_end_px, expected.inset_end_px, tolerancePx);
    comparePx(failures, `${name} width`, observed.width_px, expected.width_px, tolerancePx);
  }
  comparePx(failures, 'identity top inset', actual.identity.y - actual.root.y, reference.identity.y - reference.root.y, tolerancePx);
  comparePx(failures, 'identity/current-task gap', actual.task.y - actual.identity.bottom, reference.task.y - reference.identity.bottom, tolerancePx);

  if (actual.root.width > viewport.width + tolerancePx) failures.push('dossier wider than viewport');
  if (actual.rootOverflow || actual.viewportOverflow) failures.push('horizontal overflow');
  if (rgbHex(actual.styles.text) !== reference.tokens.text.toUpperCase()) failures.push(`primary text token ${rgbHex(actual.styles.text)}`);
  if (rgbHex(actual.styles.identityBorderTop) !== reference.tokens.primary.toUpperCase()) failures.push(`primary accent token ${rgbHex(actual.styles.identityBorderTop)}`);
  if (rgbHex(actual.styles.identityBackground) !== reference.tokens.surface.toUpperCase()) failures.push(`surface token ${rgbHex(actual.styles.identityBackground)}`);
  if (rgbHex(actual.styles.identityBorder) !== reference.tokens.divider.toUpperCase()) failures.push(`divider token ${rgbHex(actual.styles.identityBorder)}`);
  comparePx(failures, 'H1 size', actual.h1.size, reference.h1.size, tolerances.typography_tolerance_px);
  comparePx(failures, 'current-task H2 size', actual.h2.size, reference.h2.size, tolerances.typography_tolerance_px);
  if (actual.h1.weight !== reference.h1.weight) failures.push(`H1 weight actual=${actual.h1.weight} reference=${reference.h1.weight}`);
  if (actual.h2.weight !== reference.h2.weight) failures.push(`H2 weight actual=${actual.h2.weight} reference=${reference.h2.weight}`);
  if (!(actual.h1.size > actual.h2.size)) failures.push(`typography hierarchy h1=${actual.h1.size} h2=${actual.h2.size}`);
  const forbidden = actual.weights.filter(row => Number(row.weight) === 600);
  if (forbidden.length) failures.push(`forbidden synthetic 600 weight (${forbidden.length})`);
  if (actual.styles.fontSynthesis !== 'none') failures.push(`font-synthesis must be none, got ${actual.styles.fontSynthesis}`);
  return { pass: failures.length === 0, failures };
}

const browser = await chromium.launch({ headless: true });
const referenceContext = await browser.newContext();
const referencePage = await referenceContext.newPage();
await referencePage.goto(pathToFileURL(ownerHtml).href, { waitUntil: 'load' });
const productionContext = await browser.newContext();
const productionPage = await productionContext.newPage();
await login(productionPage);

const entryRuns = {};
for (const [key, surface, viewport] of [ ['C', 'detail-desktop', { width: 1440, height: 1000 }], ['D', 'detail-mobile', { width: 390, height: 844 }] ]) {
  await test(`VISUAL-ENTRY-${key}`, `Owner reference ${key} geometry/style contract`, async () => {
    await referencePage.setViewportSize(viewport);
    const repeated = [];
    for (let i = 0; i < 3; i++) repeated.push(await referenceEntryMetrics(referencePage, surface));
    const tolerances = geometryJitter(repeated);
    const reference = repeated[0];
    await productionPage.setViewportSize(viewport);
    await productionPage.goto(entryUrl, { waitUntil: 'networkidle' });
    await productionPage.waitForSelector('.gpp-entry-dossier--composed', { timeout: 30000 });
    const actual = await productionEntryMetrics(productionPage);
    const validation = validateEntryContract(actual, reference, viewport, tolerances);
    await referencePage.locator('.dossier').screenshot({ path: path.join(artifactDir, `entry-reference-${key}.png`) });
    await productionPage.locator('.gpp-entry-dossier--composed').screenshot({ path: path.join(artifactDir, `entry-actual-${key}.png`) });
    fs.writeFileSync(path.join(artifactDir, `entry-visual-metrics-${key}.json`), JSON.stringify({ surface: key, viewport, tolerance_derivation: tolerances, reference, actual, validation }, null, 2) + '\n');
    if (!validation.pass) throw new Error(`Entry ${key} visual contract failed: ${JSON.stringify(validation.failures)}`);
    entryRuns[key] = { reference, viewport, tolerances };
    return { tolerance_derivation: tolerances, owner_root_width_px: reference.root.width, owner_stage_width_px: reference.stage.width, major_regions_compared: regionNames, no_overlap: true, no_horizontal_overflow: true, palette_contract: true, typography_reference_conformance: true, forbidden_weight_600: false };
  });
}

await test('VISUAL-ENTRY-REGRESSION', 'Entry visual gate rejects the existing 120px task-position regression control', async () => {
  const run = entryRuns.C; if (!run) throw new Error('Desktop baseline did not pass; deliberate regression proof cannot run.');
  await productionPage.setViewportSize(run.viewport); await productionPage.goto(entryUrl, { waitUntil: 'networkidle' }); await productionPage.waitForSelector('.gpp-entry-dossier--composed');
  await productionPage.addStyleTag({ content: '.gpp-entry-dossier__task{transform:translateY(120px)!important;}' });
  const mutated = await productionEntryMetrics(productionPage); const validation = validateEntryContract(mutated, run.reference, run.viewport, run.tolerances);
  await productionPage.locator('.gpp-entry-dossier--composed').screenshot({ path: path.join(artifactDir, 'entry-deliberate-regression.png') });
  if (validation.pass) throw new Error('Entry visual gate accepted the deliberate 120px task displacement.');
  return { injected_only_in_test: true, rejected: true, failure_classes: validation.failures };
});

await test('VISUAL-ENTRY-OLD-GATE-BYPASS', 'Reference comparator rejects material narrowing that legacy generic geometry would accept', async () => {
  const run = entryRuns.C; if (!run) throw new Error('Desktop baseline did not pass; old-gate-bypass proof cannot run.');
  await productionPage.setViewportSize(run.viewport); await productionPage.goto(entryUrl, { waitUntil: 'networkidle' }); await productionPage.waitForSelector('.gpp-entry-dossier--composed');
  await productionPage.addStyleTag({ content: '.gpp-entry-dossier--composed{width:72%!important;max-width:none!important;margin-inline:auto!important;}' });
  const mutated = await productionEntryMetrics(productionPage);
  const legacy = validateLegacyGenericGeometry(mutated, run.reference, run.viewport, run.tolerances.geometry_tolerance_px);
  const repaired = validateEntryContract(mutated, run.reference, run.viewport, run.tolerances);
  await productionPage.locator('.gpp-entry-dossier--composed').screenshot({ path: path.join(artifactDir, 'entry-old-gate-bypass-regression.png') });
  if (!legacy.pass) throw new Error(`Regression precondition invalid: legacy generic geometry would already reject mutation: ${JSON.stringify(legacy.failures)}`);
  if (repaired.pass) throw new Error('Repaired Owner-reference comparator accepted the narrowed dossier that legacy geometry would accept.');
  return { injected_only_in_test: true, legacy_generic_geometry: 'WOULD_ACCEPT', repaired_reference_comparator: 'REJECTED_AS_EXPECTED', failure_classes: repaired.failures };
});

await referenceContext.close(); await productionContext.close(); await browser.close();

const output = {
  schema_version: '1.0.0', suite: 'Owner Entry Visual Contract Qualification', data_class: 'SYNTHETIC_NON_PII',
  owner_reference_sha256: htmlIdentity.sha256,
  surfaces: {
    entry_desktop_C: results.find(r => r.id === 'VISUAL-ENTRY-C')?.status || 'FAIL',
    entry_mobile_D: results.find(r => r.id === 'VISUAL-ENTRY-D')?.status || 'FAIL',
  },
  deliberate_regression: results.find(r => r.id === 'VISUAL-ENTRY-REGRESSION')?.status === 'PASS' ? 'REJECTED_AS_EXPECTED' : 'NOT_PROVEN',
  old_gate_bypass_regression: results.find(r => r.id === 'VISUAL-ENTRY-OLD-GATE-BYPASS')?.status === 'PASS' ? 'REJECTED_AS_EXPECTED' : 'NOT_PROVEN',
  results,
};
fs.writeFileSync(path.join(artifactDir, 'entry-visual-contract-results.json'), JSON.stringify(output, null, 2) + '\n');
for (const result of results) console.log(`${result.status} ${result.id} ${result.name}`);
if (results.some(result => result.status !== 'PASS')) process.exit(1);
