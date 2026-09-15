import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
const ownerPdf = process.env.GPP_OWNER_PDF;
const expectedPdf = { size: 321990, sha256: '34d9b4e137667ca103d5c6e7752f7148f0c92e36f0f1d182d7d87a890c55fec5' };
const results = [];
if (!artifactDir || !wpPath || !wpCli || !ownerPdf) throw new Error('Print visual qualification environment is incomplete.');
function identity(file) { const data=fs.readFileSync(file); return { size:data.length, sha256:createHash('sha256').update(data).digest('hex') }; }
const pdfIdentity=identity(ownerPdf);
if (pdfIdentity.size !== expectedPdf.size || pdfIdentity.sha256 !== expectedPdf.sha256) throw new Error(`Owner PDF authority mismatch: ${JSON.stringify(pdfIdentity)}`);
function wpEval(code) { const cp=spawnSync('php',[wpCli,`--path=${wpPath}`,'eval',code],{encoding:'utf8',env:process.env}); if(cp.status!==0) throw new Error(`${cp.stderr}\n${cp.stdout}`); return cp.stdout.trim(); }
const manifest=JSON.parse(wpEval('echo wp_json_encode(get_option("gpp_wu19_fixture_manifest"), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);'));
const alpha=manifest.alpha;
const runtimePassword=`gppp-${randomBytes(18).toString('hex')}-A1!`;
wpEval(`wp_set_password(${JSON.stringify(runtimePassword)}, ${Number(manifest.bootstrap_id)}); echo 'credential-ready';`);
const dossierUrl=`${baseUrl}/wp-admin/admin-ajax.php?action=gravityflow_print_entries&lid=${alpha.entry_id}&gpp_presentation=dossier`;
function record(id,name,status,details=null){results.push({id,name,status,details});}
async function test(id,name,fn){try{record(id,name,'PASS',await fn());}catch(error){record(id,name,'FAIL',{error:String(error?.stack||error).slice(0,10000)});}}
async function login(page){await page.goto(`${baseUrl}/wp-login.php`,{waitUntil:'domcontentloaded'});await page.fill('#user_login','bootstrap_admin');await page.fill('#user_pass',runtimePassword);await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),page.click('#wp-submit')]);}
function parsePgm(file) {
  const b = fs.readFileSync(file); let i = 0; const tokens = [];
  const skip = () => { while (i < b.length) { if (b[i] === 35) { while (i < b.length && b[i] !== 10) i++; } else if (b[i] <= 32) i++; else break; } };
  for (let t = 0; t < 4; t++) { skip(); const start = i; while (i < b.length && b[i] > 32 && b[i] !== 35) i++; tokens.push(b.subarray(start, i).toString('ascii')); }
  if (tokens[0] !== 'P5' || Number(tokens[3]) !== 255) throw new Error(`Unsupported PGM ${file}: ${tokens.join(' ')}`);
  skip(); const width = Number(tokens[1]); const height = Number(tokens[2]); const pixels = b.subarray(i, i + width * height);
  if (pixels.length !== width * height) throw new Error(`Truncated PGM: ${file}`);
  return { width, height, pixels };
}
function renderPdf(pdf, prefix) {
  const cp = spawnSync('pdftoppm', ['-gray', '-r', '72', pdf, prefix], { encoding: 'utf8' });
  if (cp.status !== 0) throw new Error(`pdftoppm failed: ${cp.stderr}`);
  const files = [1, 2].map(n => `${prefix}-${n}.pgm`);
  if (!files.every(fs.existsSync) || fs.existsSync(`${prefix}-3.pgm`)) throw new Error(`Expected exactly two rendered PDF pages for ${pdf}`);
  return files.map(parsePgm);
}
function pdfPageGeometry(pdf) {
  const cp = spawnSync('pdfinfo', [pdf], { encoding: 'utf8' });
  if (cp.status !== 0) throw new Error(`pdfinfo failed for ${pdf}: ${cp.stderr}`);
  const pages = cp.stdout.match(/^Pages:\s+(\d+)/m);
  const size = cp.stdout.match(/^Page size:\s+([\d.]+) x ([\d.]+) pts \(([^)]+)\)/m);
  if (!pages || !size) throw new Error(`Unable to parse PDF geometry for ${pdf}`);
  return { pages: Number(pages[1]), width_pt: Number(size[1]), height_pt: Number(size[2]), label: size[3] };
}
const structuralPolicy = Object.freeze({
  dark_threshold: 205,
  horizontal_min_fraction: 0.18,
  vertical_min_fraction: 0.45,
  horizontal_min_px: 18,
  vertical_min_px: 12,
  extraction_cluster_px: 3,
  match_tolerance_px: 5,
  page_tolerance_pt: 0.5,
});
function runs(length, isDark) {
  const out = []; let start = -1;
  for (let i = 0; i < length; i++) {
    const dark = isDark(i);
    if (dark && start < 0) start = i;
    if (start >= 0 && (!dark || i === length - 1)) {
      const end = dark && i === length - 1 ? i : i - 1;
      out.push([start, end]); start = -1;
    }
  }
  return out;
}
function structuralSignature(image, region) {
  const x0 = Math.max(0, Math.floor(region[0] * image.width)); const y0 = Math.max(0, Math.floor(region[1] * image.height));
  const x1 = Math.min(image.width, Math.ceil((region[0] + region[2]) * image.width)); const y1 = Math.min(image.height, Math.ceil((region[1] + region[3]) * image.height));
  const width = x1 - x0, height = y1 - y0;
  const minH = Math.max(structuralPolicy.horizontal_min_px, Math.round(width * structuralPolicy.horizontal_min_fraction));
  const minV = Math.max(structuralPolicy.vertical_min_px, Math.round(height * structuralPolicy.vertical_min_fraction));
  const horizontal = []; const vertical = [];
  const addHorizontal = (start, end) => {
    const item = { start: start / width, end: end / width };
    if (!horizontal.some(v => Math.abs(v.start - item.start) * width <= structuralPolicy.extraction_cluster_px && Math.abs(v.end - item.end) * width <= structuralPolicy.extraction_cluster_px)) horizontal.push(item);
  };
  const addVertical = x => {
    const item = x / width;
    if (!vertical.some(v => Math.abs(v - item) * width <= structuralPolicy.extraction_cluster_px)) vertical.push(item);
  };
  for (let y = 0; y < height; y++) {
    for (const [start, end] of runs(width, x => image.pixels[(y0 + y) * image.width + x0 + x] < structuralPolicy.dark_threshold)) {
      if (end - start + 1 >= minH) addHorizontal(start, end);
    }
  }
  for (let x = 0; x < width; x++) {
    for (const [start, end] of runs(height, y => image.pixels[(y0 + y) * image.width + x0 + x] < structuralPolicy.dark_threshold)) {
      if (end - start + 1 >= minV) addVertical(x);
    }
  }
  horizontal.sort((a,b) => a.start - b.start || a.end - b.end); vertical.sort((a,b) => a - b);
  return { width, height, horizontal, vertical, extraction: { min_horizontal_px: minH, min_vertical_px: minV } };
}
const printRegions = [
  { page: 0, name: 'front_header', box: [0.04, 0.02, 0.92, 0.15] },
  { page: 0, name: 'front_identifiers', box: [0.04, 0.15, 0.92, 0.10] },
  { page: 0, name: 'front_candidate', box: [0.04, 0.23, 0.92, 0.64] },
  { page: 0, name: 'front_footer', box: [0.04, 0.93, 0.92, 0.05] },
  { page: 1, name: 'back_header_identity', box: [0.04, 0.02, 0.92, 0.18] },
  { page: 1, name: 'back_finance_table', box: [0.04, 0.19, 0.92, 0.27] },
  { page: 1, name: 'back_finance_summary', box: [0.04, 0.46, 0.92, 0.14] },
  { page: 1, name: 'back_approvals', box: [0.04, 0.59, 0.92, 0.17] },
  { page: 1, name: 'back_management', box: [0.04, 0.75, 0.92, 0.12] },
  { page: 1, name: 'back_notes', box: [0.04, 0.85, 0.92, 0.09] },
];
function structuralComparison(reference, actual) {
  const tolerance = structuralPolicy.match_tolerance_px / reference.width;
  const missingHorizontal = reference.horizontal.filter(r => !actual.horizontal.some(a => Math.abs(a.start-r.start) <= tolerance && Math.abs(a.end-r.end) <= tolerance));
  const missingVertical = reference.vertical.filter(r => !actual.vertical.some(a => Math.abs(a-r) <= tolerance));
  return { missing_horizontal: missingHorizontal, missing_vertical: missingVertical };
}
function validatePrintPdf(actualPdf, referencePdf, tag) {
  const dir = path.join(artifactDir, `pgm-${tag}`); fs.mkdirSync(dir, { recursive: true });
  const referenceInfo = pdfPageGeometry(referencePdf); const actualInfo = pdfPageGeometry(actualPdf);
  const ref = renderPdf(referencePdf, path.join(dir, 'reference')); const actual = renderPdf(actualPdf, path.join(dir, 'actual'));
  const failures = []; const metrics = [];
  if (referenceInfo.pages !== 2 || referenceInfo.label !== 'A4') failures.push(`locked Owner PDF is not exactly two A4 pages: ${JSON.stringify(referenceInfo)}`);
  if (actualInfo.pages !== 2 || actualInfo.label !== 'A4') failures.push(`actual PDF is not exactly two A4 pages: ${JSON.stringify(actualInfo)}`);
  if (Math.abs(referenceInfo.width_pt - actualInfo.width_pt) > structuralPolicy.page_tolerance_pt || Math.abs(referenceInfo.height_pt - actualInfo.height_pt) > structuralPolicy.page_tolerance_pt) failures.push(`A4 page dimensions differ from locked Owner PDF: actual=${actualInfo.width_pt}x${actualInfo.height_pt} reference=${referenceInfo.width_pt}x${referenceInfo.height_pt}`);
  for (let p = 0; p < 2; p++) if (Math.abs(ref[p].width - actual[p].width) > 2 || Math.abs(ref[p].height - actual[p].height) > 2) failures.push(`page ${p + 1} raster dimensions differ`);
  for (const spec of printRegions) {
    const reference = structuralSignature(ref[spec.page], spec.box); const observed = structuralSignature(actual[spec.page], spec.box);
    const compared = structuralComparison(reference, observed);
    metrics.push({ page: spec.page + 1, region: spec.name, reference_structural_lines: { horizontal: reference.horizontal, vertical: reference.vertical }, actual_structural_lines: { horizontal: observed.horizontal, vertical: observed.vertical }, missing_owner_horizontal: compared.missing_horizontal, missing_owner_vertical: compared.missing_vertical, extraction: reference.extraction });
    if (!reference.horizontal.length && !reference.vertical.length) failures.push(`${spec.name} has no extractable Owner structural geometry`);
    if (compared.missing_horizontal.length) failures.push(`${spec.name} missing ${compared.missing_horizontal.length} Owner horizontal structural rule(s)`);
    if (compared.missing_vertical.length) failures.push(`${spec.name} missing ${compared.missing_vertical.length} Owner vertical structural rule(s)`);
  }
  return { pass: failures.length === 0, failures, metrics, page_geometry: { reference: referenceInfo, actual: actualInfo }, policy: structuralPolicy, signal: 'long-rules-borders-and-box-edges-only' };
}

const browser = await chromium.launch({ headless: true });
const productionContext = await browser.newContext();
const productionPage = await productionContext.newPage();
await login(productionPage);

const canonicalPdf = path.join(artifactDir, 'wu19-canonical.pdf');
await test('VISUAL-PRINT-EF', 'Owner PDF E/F structural page-region contract', async () => {
  if (!fs.existsSync(canonicalPdf)) throw new Error('WU19 canonical PDF missing.');
  const validation = validatePrintPdf(canonicalPdf, ownerPdf, 'canonical');
  fs.writeFileSync(path.join(artifactDir, 'print-visual-metrics.json'), JSON.stringify(validation, null, 2) + '\n');
  const render = spawnSync('pdftoppm', ['-png', '-r', '96', ownerPdf, path.join(artifactDir, 'print-reference')], { encoding: 'utf8' });
  if (render.status !== 0) throw new Error(`Reference diagnostic rendering failed: ${render.stderr}`);
  const actualRender = spawnSync('pdftoppm', ['-png', '-r', '96', canonicalPdf, path.join(artifactDir, 'print-actual')], { encoding: 'utf8' });
  if (actualRender.status !== 0) throw new Error(`Actual diagnostic rendering failed: ${actualRender.stderr}`);
  if (!validation.pass) throw new Error(`Print E/F structural contract failed: ${JSON.stringify(validation.failures)}`);
  return { front_E: 'PASS', back_F: 'PASS', page_region_contracts: printRegions.length, signal: validation.signal, page_geometry: validation.page_geometry };
});

async function openReadyPrint() {
  await productionPage.setViewportSize({ width: 1280, height: 1000 });
  await productionPage.goto(dossierUrl, { waitUntil: 'networkidle' });
  await productionPage.waitForSelector('.gpp-print-dossier[data-gpp-print-state="ready"]');
  await productionPage.emulateMedia({ media: 'print' });
}

await test('VISUAL-PRINT-CONTENT-VARIATION', 'Structural comparator ignores content-only variation while preserving layout', async () => {
  await openReadyPrint();
  const cleanPdf = path.join(artifactDir, 'print-content-variation-control.pdf');
  await productionPage.pdf({ path: cleanPdf, printBackground: true, preferCSSPageSize: true, scale: 1 });
  const clean = validatePrintPdf(cleanPdf, ownerPdf, 'content-variation-control');
  if (!clean.pass) throw new Error(`Content-variation clean control does not pass structural gate: ${JSON.stringify(clean.failures)}`);
  const variation = await productionPage.evaluate(() => {
    const values = [...document.querySelectorAll('.gpp-print-dossier .paper-finance .print-value')].slice(0, 3);
    const replacements = ['۱', '۱۲۳۴۵۶۷۸۹۰', '۹۹۹۹۹۹۹۹۹۹۹۹'];
    const changed = values.map((node, index) => { const before = node.textContent || ''; let after = replacements[index] || '۷'; if (after === before) after += '۸'; node.textContent = after; return { before_length: before.length, after_length: after.length }; });
    const boxes = [...document.querySelectorAll('.gpp-print-dossier .paper-choice i')].slice(0, 2);
    const boxChanges = boxes.map(node => { const before = node.textContent || ''; node.textContent = before.trim() ? '' : '✓'; return { before, after: node.textContent }; });
    return { changed_values: changed, changed_checkboxes: boxChanges };
  });
  if (variation.changed_values.length < 2 || variation.changed_checkboxes.length < 1) throw new Error(`Content-variation control could not mutate enough fixed-layout values: ${JSON.stringify(variation)}`);
  const variedPdf = path.join(artifactDir, 'print-content-variation.pdf');
  await productionPage.pdf({ path: variedPdf, printBackground: true, preferCSSPageSize: true, scale: 1 });
  const validation = validatePrintPdf(variedPdf, ownerPdf, 'content-variation');
  if (!validation.pass) throw new Error(`PRINT_CONTENT_INVARIANCE_ROOT_CAUSE_UNRESOLVED: clean control passed but content-only mutation changed structural geometry verdict: ${JSON.stringify(validation.failures)}`);
  return { ...variation, clean_control: 'PASS', geometry_verdict: 'PASS', dynamic_text_excluded_from_signal: true, signal: validation.signal };
});

const contentVariationResult = results.find(r => r.id === 'VISUAL-PRINT-CONTENT-VARIATION');
if (contentVariationResult?.status === 'FAIL' && contentVariationResult.details?.error?.includes('PRINT_CONTENT_INVARIANCE_ROOT_CAUSE_UNRESOLVED')) {
  const partialOutput = {
    schema_version:'1.0.0', suite:'Owner Print Visual Contract Qualification', data_class:'SYNTHETIC_NON_PII',
    owner_reference_sha256:pdfIdentity.sha256,
    surfaces:{print_front_E:results.find(r=>r.id==='VISUAL-PRINT-EF')?.status||'FAIL',print_back_F:results.find(r=>r.id==='VISUAL-PRINT-EF')?.status||'FAIL'},
    content_variation:'FAIL', deliberate_regression:'NOT_PROVEN', deliberate_management_regression:'NOT_PROVEN',
    structural_signal:'long-rules-borders-and-box-edges-only', results,
  };
  fs.writeFileSync(path.join(artifactDir,'print-visual-contract-results.json'),JSON.stringify(partialOutput,null,2)+'\n');
  for(const result of results) console.log(`${result.status} ${result.id} ${result.name}`);
  await productionContext.close(); await browser.close();
  process.exit(1);
}

await test('VISUAL-PRINT-REGRESSION', 'Structural gate rejects the existing 48px finance-table displacement', async () => {
  await openReadyPrint();
  const controlPdf = path.join(artifactDir, 'print-finance-control.pdf');
  await productionPage.pdf({ path: controlPdf, printBackground: true, preferCSSPageSize: true, scale: 1 });
  const control = validatePrintPdf(controlPdf, ownerPdf, 'finance-control');
  if (!control.pass) throw new Error(`Finance clean control does not pass structural gate: ${JSON.stringify(control.failures)}`);
  await productionPage.addStyleTag({ content: '.gpp-print-dossier .paper-finance{transform:translateX(48px)!important;}' });
  const mutatedPdf = path.join(artifactDir, 'print-deliberate-regression.pdf');
  await productionPage.pdf({ path: mutatedPdf, printBackground: true, preferCSSPageSize: true, scale: 1 });
  const mutated = validatePrintPdf(mutatedPdf, ownerPdf, 'deliberate-finance');
  if (mutated.pass || !mutated.failures.some(f => f.startsWith('back_finance_table '))) throw new Error(`Structural gate did not specifically reject the 48px finance-table displacement: ${JSON.stringify(mutated.failures)}`);
  return { clean_control: 'PASS', injected_only_in_test: true, rejected: true, target_region: 'back_finance_table', failure_classes: mutated.failures };
});

await test('VISUAL-PRINT-REGRESSION-MANAGEMENT', 'Structural gate rejects a non-finance management-box displacement', async () => {
  await openReadyPrint();
  const controlPdf = path.join(artifactDir, 'print-management-control.pdf');
  await productionPage.pdf({ path: controlPdf, printBackground: true, preferCSSPageSize: true, scale: 1 });
  const control = validatePrintPdf(controlPdf, ownerPdf, 'management-control');
  if (!control.pass) throw new Error(`Management clean control does not pass structural gate: ${JSON.stringify(control.failures)}`);
  await productionPage.addStyleTag({ content: '.gpp-print-dossier .paper-management{transform:translateX(36px)!important;}' });
  const mutatedPdf = path.join(artifactDir, 'print-management-regression.pdf');
  await productionPage.pdf({ path: mutatedPdf, printBackground: true, preferCSSPageSize: true, scale: 1 });
  const mutated = validatePrintPdf(mutatedPdf, ownerPdf, 'deliberate-management');
  if (mutated.pass || !mutated.failures.some(f => f.startsWith('back_management '))) throw new Error(`Structural gate did not specifically reject management displacement: ${JSON.stringify(mutated.failures)}`);
  return { clean_control: 'PASS', injected_only_in_test: true, rejected: true, target_region: 'back_management', failure_classes: mutated.failures };
});

await productionContext.close(); await browser.close();
const output={
  schema_version:'1.0.0', suite:'Owner Print Visual Contract Qualification', data_class:'SYNTHETIC_NON_PII',
  owner_reference_sha256:pdfIdentity.sha256,
  surfaces:{print_front_E:results.find(r=>r.id==='VISUAL-PRINT-EF')?.status||'FAIL',print_back_F:results.find(r=>r.id==='VISUAL-PRINT-EF')?.status||'FAIL'},
  content_variation:results.find(r=>r.id==='VISUAL-PRINT-CONTENT-VARIATION')?.status||'FAIL',
  deliberate_regression:results.find(r=>r.id==='VISUAL-PRINT-REGRESSION')?.status==='PASS'?'REJECTED_AS_EXPECTED':'NOT_PROVEN',
  deliberate_management_regression:results.find(r=>r.id==='VISUAL-PRINT-REGRESSION-MANAGEMENT')?.status==='PASS'?'REJECTED_AS_EXPECTED':'NOT_PROVEN',
  structural_signal:'long-rules-borders-and-box-edges-only',
  results,
};
fs.writeFileSync(path.join(artifactDir,'print-visual-contract-results.json'),JSON.stringify(output,null,2)+'\n');
for(const result of results) console.log(`${result.status} ${result.id} ${result.name}`);
if(results.some(result=>result.status!=='PASS')) process.exit(1);
