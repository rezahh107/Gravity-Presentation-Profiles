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
const ownerHtml = process.env.GPP_ENTRY_OWNER_HTML;
const expectedHtml = { size: 119765, sha256: '1934967b81d82ee77c60ffd547dde6fa7c8a310dbde94556686bd3d515d62a69' };
const canonical = ['header', 'current-task', 'education', 'candidate-details', 'contact', 'school', 'documents', 'registration-finance', 'history'];
const results = [];

if (!artifactDir || !wpPath || !wpCli || !ownerHtml) throw new Error('Entry vNext visual qualification environment is incomplete.');
function identity(file) { const data = fs.readFileSync(file); return { size: data.length, sha256: createHash('sha256').update(data).digest('hex') }; }
const htmlIdentity = identity(ownerHtml);
if (htmlIdentity.size !== expectedHtml.size || htmlIdentity.sha256 !== expectedHtml.sha256) throw new Error(`Entry vNext authority mismatch: ${JSON.stringify(htmlIdentity)}`);
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
async function test(id, name, fn) { try { record(id, name, 'PASS', await fn()); } catch (error) { record(id, name, 'FAIL', { error: String(error?.stack || error).slice(0, 10000) }); } }
async function login(page) {
  await page.goto(`${baseUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', 'bootstrap_admin'); await page.fill('#user_pass', runtimePassword);
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#wp-submit')]);
}
function gridColumns(style) { const value = style.gridTemplateColumns.trim(); return value ? value.split(/\s+/).length : 0; }
async function referenceSnapshot(page, surface) {
  await page.evaluate(s => window.showSurface(s), surface);
  return page.evaluate(() => {
    const root = document.querySelector('.dossier');
    if (!root) return { missing: true };
    const classify = child => {
      if (child.classList.contains('dossier-header')) return 'header';
      if (child.classList.contains('task')) return 'current-task';
      if (child.classList.contains('history')) return 'history';
      if (!child.classList.contains('dossier-section')) return null;
      if (child.querySelector('.data-grid--education')) return 'education';
      if (child.querySelector('.data-grid--personal')) return 'candidate-details';
      if (child.querySelector('.data-grid--contact')) return 'contact';
      if (child.querySelector('.data-grid--school')) return 'school';
      if (child.querySelector('.documents')) return 'documents';
      if (child.querySelector('.data-grid--financial')) return 'registration-finance';
      return null;
    };
    const order = [...root.children].map(classify).filter(Boolean);
    const grids = {};
    for (const [region, selector] of Object.entries({ education: '.data-grid--education', 'candidate-details': '.data-grid--personal', contact: '.data-grid--contact', school: '.data-grid--school', 'registration-finance': '.data-grid--financial' })) {
      const el = root.querySelector(selector); if (el) grids[region] = getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length;
    }
    const task = root.querySelector('.task');
    const cs = getComputedStyle(root); const taskCs = getComputedStyle(task);
    return { missing: false, order, grids, rootBackground: cs.backgroundColor, rootBorderRadius: parseFloat(cs.borderRadius), taskBackground: taskCs.backgroundColor, taskBorderRadius: parseFloat(taskCs.borderRadius) };
  });
}
async function productionSnapshot(page) {
  return page.evaluate(() => {
    const root = document.querySelector('.gpp-entry-dossier--composed');
    if (!root) return { missing: true };
    const regions = [...root.querySelectorAll(':scope > [data-gpp-entry-region]')];
    const placements = {};
    root.querySelectorAll('[data-gpp-slot]').forEach(node => {
      const region = node.closest('[data-gpp-entry-region]')?.dataset.gppEntryRegion || null;
      (placements[node.dataset.gppSlot] ||= []).push(region);
    });
    const grids = {};
    for (const region of regions) {
      const grid = region.querySelector('.gpp-entry-dossier__facts');
      if (grid) grids[region.dataset.gppEntryRegion] = getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).length;
    }
    const task = root.querySelector('[data-gpp-entry-region="current-task"]');
    const header = root.querySelector('[data-gpp-entry-region="header"]');
    const statusBoxes = [...document.querySelectorAll('.gravityflow-status-box')];
    const cs = getComputedStyle(root); const taskCs = getComputedStyle(task);
    return {
      missing: false,
      order: regions.map(r => r.dataset.gppEntryRegion),
      placements,
      grids,
      genericFacts: root.querySelectorAll('[data-gpp-entry-region="facts"], [data-gpp-section="facts"]').length,
      rootOverflow: root.scrollWidth > root.clientWidth + 1,
      viewportOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      rootBackground: cs.backgroundColor,
      rootBorderRadius: parseFloat(cs.borderRadius),
      taskBackground: taskCs.backgroundColor,
      taskBorderRadius: parseFloat(taskCs.borderRadius),
      headerBorderTopWidth: parseFloat(getComputedStyle(header).borderTopWidth),
      statusBoxOutsideDossierVisible: statusBoxes.filter(n => !n.closest('.gpp-entry-dossier') && getComputedStyle(n).display !== 'none' && getComputedStyle(n).visibility !== 'hidden').length,
    };
  });
}
function sameOrder(value) { return JSON.stringify(value) === JSON.stringify(canonical); }
function requirePlacement(snapshot, slot, region) { return Array.isArray(snapshot.placements[slot]) && snapshot.placements[slot].includes(region); }

const browser = await chromium.launch({ headless: true });
const referenceContext = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const referencePage = await referenceContext.newPage();
await referencePage.goto(pathToFileURL(ownerHtml).href, { waitUntil: 'load' });
await referencePage.waitForFunction(() => typeof window.showSurface === 'function');
const referenceDesktop = await referenceSnapshot(referencePage, 'C');
await referencePage.setViewportSize({ width: 390, height: 844 });
const referenceMobile = await referenceSnapshot(referencePage, 'D');

const context = await browser.newContext();
const page = await context.newPage();
await login(page);
await page.setViewportSize({ width: 1440, height: 1100 });
await page.goto(entryUrl, { waitUntil: 'networkidle' });
await page.waitForSelector('.gpp-entry-dossier--composed', { timeout: 30000 });
const productionDesktop = await productionSnapshot(page);

await test('ENTRY-VNEXT-001', 'exact Owner vNext C/D authority exposes canonical semantic hierarchy', async () => {
  if (referenceDesktop.missing || referenceMobile.missing || !sameOrder(referenceDesktop.order) || !sameOrder(referenceMobile.order)) throw new Error(JSON.stringify({ referenceDesktop, referenceMobile }));
  if (referenceDesktop.grids['candidate-details'] !== 3 || referenceDesktop.grids['registration-finance'] !== 3 || referenceDesktop.grids.education !== 2 || referenceDesktop.grids.contact !== 2 || referenceDesktop.grids.school !== 1) throw new Error(`Unexpected Owner desktop grid contract: ${JSON.stringify(referenceDesktop.grids)}`);
  if (referenceMobile.grids['candidate-details'] !== 1 || referenceMobile.grids['registration-finance'] !== 1 || referenceMobile.grids.education !== 1 || referenceMobile.grids.contact !== 1 || referenceMobile.grids.school !== 1) throw new Error(`Unexpected Owner mobile grid contract: ${JSON.stringify(referenceMobile.grids)}`);
  return { authority: htmlIdentity, desktop: referenceDesktop, mobile: referenceMobile };
});

await test('ENTRY-VNEXT-002', 'production uses vNext regions and forbids legacy generic facts', async () => {
  if (productionDesktop.missing || !sameOrder(productionDesktop.order) || productionDesktop.genericFacts !== 0) throw new Error(JSON.stringify(productionDesktop));
  if (productionDesktop.headerBorderTopWidth !== 0) throw new Error('Legacy blue-top identity card border remains on compact header.');
  if (productionDesktop.rootBackground !== referenceDesktop.rootBackground || productionDesktop.taskBackground !== referenceDesktop.taskBackground) throw new Error(`Major surface tokens diverge: ${JSON.stringify({ productionDesktop, referenceDesktop })}`);
  return productionDesktop;
});

await test('ENTRY-VNEXT-003', 'semantic slots are assigned to their vNext domains', async () => {
  const requirements = {
    'student.first_name': 'candidate-details',
    'student.last_name': 'candidate-details',
    'student.father_name': 'candidate-details',
    'student.birth_date_jalali': 'candidate-details',
    'student.gender': 'candidate-details',
    'student.mobile': 'contact',
    'student.home_phone': 'contact',
    'student.father_mobile': 'contact',
    'student.mother_mobile': 'contact',
    'education.level': 'education',
    'education.grade_group': 'education',
    'school.name': 'school',
    'entry.created_at': 'registration-finance',
    'review.status': 'registration-finance',
    'finance.status': 'registration-finance',
    'finance.tuition_amount': 'registration-finance',
    'finance.discount_amount': 'registration-finance',
    'finance.net_payable_amount': 'registration-finance',
  };
  const failures = Object.entries(requirements).filter(([slot, region]) => !requirePlacement(productionDesktop, slot, region));
  if (failures.length) throw new Error(`Semantic placement failures: ${JSON.stringify(failures)}`);
  for (const slot of ['student.first_name', 'student.last_name', 'student.father_name', 'student.birth_date_jalali', 'student.gender']) {
    if ((productionDesktop.placements[slot] || []).includes('header')) throw new Error(`Full personal detail leaked into compact header: ${slot}`);
  }
  return { requirements };
});

await test('ENTRY-VNEXT-004', 'desktop/mobile retain semantic parity, responsive grid contract and no overflow', async () => {
  await page.screenshot({ path: path.join(artifactDir, 'entry-vnext-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.gpp-entry-dossier--composed', { timeout: 30000 });
  const mobile = await productionSnapshot(page);
  await page.screenshot({ path: path.join(artifactDir, 'entry-vnext-mobile.png'), fullPage: true });
  if (!sameOrder(mobile.order) || JSON.stringify(Object.keys(productionDesktop.placements).sort()) !== JSON.stringify(Object.keys(mobile.placements).sort())) throw new Error(`Material semantic parity failed: ${JSON.stringify({ desktop: productionDesktop, mobile })}`);
  if (productionDesktop.rootOverflow || productionDesktop.viewportOverflow || mobile.rootOverflow || mobile.viewportOverflow) throw new Error(`Horizontal overflow: ${JSON.stringify({ desktop: productionDesktop, mobile })}`);
  if (productionDesktop.grids['candidate-details'] !== 3 || productionDesktop.grids['registration-finance'] !== 3 || productionDesktop.grids.education !== 2 || productionDesktop.grids.contact !== 2) throw new Error(`Production desktop grids diverge: ${JSON.stringify(productionDesktop.grids)}`);
  if (mobile.grids['candidate-details'] !== 1 || mobile.grids['registration-finance'] !== 1 || mobile.grids.education !== 1 || mobile.grids.contact !== 1 || mobile.grids.school !== 1) throw new Error(`Production mobile grids diverge: ${JSON.stringify(mobile.grids)}`);
  return { desktop: productionDesktop.grids, mobile: mobile.grids };
});

await test('ENTRY-VNEXT-005', 'Approval status wrapper is composed inside current-task without an orphan shell', async () => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.gpp-entry-dossier--composed', { timeout: 30000 });
  const state = await page.evaluate(() => {
    const form = document.querySelector('form[id^="gform_"]');
    const task = document.querySelector('[data-gpp-entry-region="current-task"]');
    const status = document.querySelector('.gravityflow-status-box');
    const actions = document.querySelector('.gravityflow-action-buttons');
    return {
      forms: document.querySelectorAll('form[id^="gform_"]').length,
      statusBoxes: document.querySelectorAll('.gravityflow-status-box').length,
      actionContainers: document.querySelectorAll('.gravityflow-action-buttons').length,
      approved: document.querySelectorAll('.gravityflow-action-buttons [value="approved"]').length,
      rejected: document.querySelectorAll('.gravityflow-action-buttons [value="rejected"]').length,
      statusInsideTask: Boolean(status && task?.contains(status)),
      actionsInsideStatus: Boolean(actions && status?.contains(actions)),
      statusInForm: Boolean(status && status.closest('form') === form),
      actionsInForm: Boolean(actions && actions.closest('form') === form),
      orphanVisible: [...document.querySelectorAll('.gravityflow-status-box')].filter(n => !n.closest('.gpp-entry-dossier') && getComputedStyle(n).display !== 'none').length,
    };
  });
  if (state.forms !== 1 || state.statusBoxes !== 1 || state.actionContainers !== 1 || state.approved !== 1 || state.rejected !== 1 || !state.statusInsideTask || !state.actionsInsideStatus || !state.statusInForm || !state.actionsInForm || state.orphanVisible !== 0) throw new Error(JSON.stringify(state));
  return state;
});

const deliberate = { ...productionDesktop, order: ['header', 'current-task', 'documents', 'history'], genericFacts: 1 };
const deliberateRejected = !sameOrder(deliberate.order) || deliberate.genericFacts !== 0;
const oldGateBypassRejected = expectedHtml.sha256 !== '666704ac25b019ae59406974a223d10cace3f90e96f9d55312730ae93af09c81';
record('ENTRY-VNEXT-REGRESSION', 'legacy generic hierarchy is deliberately rejected', deliberateRejected ? 'PASS' : 'FAIL');

const output = {
  suite: 'Entry Detail vNext structural visual contract',
  authority: { file: path.basename(ownerHtml), ...htmlIdentity },
  surfaces: {
    entry_desktop_C: results.filter(r => r.id.startsWith('ENTRY-VNEXT-') && r.id !== 'ENTRY-VNEXT-REGRESSION').every(r => r.status === 'PASS') ? 'PASS' : 'FAIL',
    entry_mobile_D: results.find(r => r.id === 'ENTRY-VNEXT-004')?.status || 'FAIL',
  },
  deliberate_regression: deliberateRejected ? 'REJECTED_AS_EXPECTED' : 'NOT_REJECTED',
  old_gate_bypass_regression: oldGateBypassRejected ? 'REJECTED_AS_EXPECTED' : 'NOT_REJECTED',
  results,
};
fs.writeFileSync(path.join(artifactDir, 'entry-visual-contract-results.json'), JSON.stringify(output, null, 2) + '\n');
for (const result of results) console.log(`${result.status} ${result.id} ${result.name}`);
await referenceContext.close(); await context.close(); await browser.close();
if (results.some(r => r.status !== 'PASS')) process.exit(1);
