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
  const cp = spawnSync('pdftoppm', ['-gray', '-r', '72', '-pgm', pdf, prefix], { encoding: 'utf8' });
  if (cp.status !== 0) throw new Error(`pdftoppm failed: ${cp.stderr}`);
  const files = [1, 2].map(n => `${prefix}-${n}.pgm`);
  if (!files.every(fs.existsSync) || fs.existsSync(`${prefix}-3.pgm`)) throw new Error(`Expected exactly two rendered PDF pages for ${pdf}`);
  return files.map(parsePgm);
}
function regionSignature(image, region) {
  const x0 = Math.max(0, Math.floor(region[0] * image.width)); const y0 = Math.max(0, Math.floor(region[1] * image.height));
  const x1 = Math.min(image.width, Math.ceil((region[0] + region[2]) * image.width)); const y1 = Math.min(image.height, Math.ceil((region[1] + region[3]) * image.height));
  const w = x1 - x0, h = y1 - y0; const rowBins = new Array(12).fill(0), colBins = new Array(12).fill(0); let ink = 0;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const value = image.pixels[(y0 + y) * image.width + x0 + x];
    if (value < 235) { ink++; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); rowBins[Math.min(11, Math.floor(y / h * 12))]++; colBins[Math.min(11, Math.floor(x / w * 12))]++; }
  }
  const normalize = bins => ink ? bins.map(v => v / ink) : bins.map(() => 0);
  return { density: ink / (w * h), bbox: ink ? [minX / w, minY / h, maxX / w, maxY / h] : null, rows: normalize(rowBins), cols: normalize(colBins) };
}
function maxAbs(a, b) { return Math.max(...a.map((v, i) => Math.abs(v - b[i]))); }
function mae(a, b) { return a.reduce((sum, v, i) => sum + Math.abs(v - b[i]), 0) / a.length; }
const printRegions = [
  { page: 0, name: 'front_header', box: [0.04, 0.02, 0.92, 0.15], density: .045, profile: .045, bbox: .075 },
  { page: 0, name: 'front_identifiers', box: [0.04, 0.15, 0.92, 0.10], density: .045, profile: .050, bbox: .075 },
  { page: 0, name: 'front_candidate', box: [0.04, 0.23, 0.92, 0.64], density: .050, profile: .040, bbox: .060 },
  { page: 0, name: 'front_footer', box: [0.04, 0.93, 0.92, 0.05], density: .040, profile: .060, bbox: .090 },
  { page: 1, name: 'back_header_identity', box: [0.04, 0.02, 0.92, 0.18], density: .045, profile: .045, bbox: .070 },
  { page: 1, name: 'back_finance_table', box: [0.04, 0.19, 0.92, 0.27], density: .035, profile: .035, bbox: .045 },
  { page: 1, name: 'back_finance_summary', box: [0.04, 0.46, 0.92, 0.14], density: .045, profile: .050, bbox: .075 },
  { page: 1, name: 'back_approvals', box: [0.04, 0.59, 0.92, 0.17], density: .040, profile: .045, bbox: .060 },
  { page: 1, name: 'back_management', box: [0.04, 0.75, 0.92, 0.12], density: .040, profile: .045, bbox: .060 },
  { page: 1, name: 'back_notes', box: [0.04, 0.85, 0.92, 0.09], density: .040, profile: .050, bbox: .070 },
];
function validatePrintPdf(actualPdf, referencePdf, tag) {
  const dir = path.join(artifactDir, `pgm-${tag}`); fs.mkdirSync(dir, { recursive: true });
  const ref = renderPdf(referencePdf, path.join(dir, 'reference')); const actual = renderPdf(actualPdf, path.join(dir, 'actual'));
  const failures = []; const metrics = [];
  for (let p = 0; p < 2; p++) if (Math.abs(ref[p].width - actual[p].width) > 2 || Math.abs(ref[p].height - actual[p].height) > 2) failures.push(`page ${p + 1} dimensions differ`);
  for (const spec of printRegions) {
    const r = regionSignature(ref[spec.page], spec.box), a = regionSignature(actual[spec.page], spec.box);
    const densityDelta = Math.abs(r.density - a.density); const rowMae = mae(r.rows, a.rows); const colMae = mae(r.cols, a.cols); const bboxDelta = r.bbox && a.bbox ? maxAbs(r.bbox, a.bbox) : 1;
    metrics.push({ page: spec.page + 1, region: spec.name, reference_density: r.density, actual_density: a.density, density_delta: densityDelta, row_profile_mae: rowMae, col_profile_mae: colMae, bbox_delta: bboxDelta });
    if (densityDelta > spec.density || rowMae > spec.profile || colMae > spec.profile || bboxDelta > spec.bbox) failures.push(`${spec.name} material geometry drift`);
  }
  return { pass: failures.length === 0, failures, metrics };
}

const browser = await chromium.launch({ headless: true });
const productionContext = await browser.newContext();
const productionPage = await productionContext.newPage();
await login(productionPage);

const canonicalPdf = path.join(artifactDir, 'wu19-canonical.pdf');
await test('VISUAL-PRINT-EF', 'Owner PDF E/F material page-region contract', async () => {
  if (!fs.existsSync(canonicalPdf)) throw new Error('WU19 canonical PDF missing.');
  const validation = validatePrintPdf(canonicalPdf, ownerPdf, 'canonical');
  fs.writeFileSync(path.join(artifactDir, 'print-visual-metrics.json'), JSON.stringify(validation, null, 2) + '\n');
  const render = spawnSync('pdftoppm', ['-png', '-r', '96', ownerPdf, path.join(artifactDir, 'print-reference')], { encoding: 'utf8' });
  if (render.status !== 0) throw new Error(`Reference diagnostic rendering failed: ${render.stderr}`);
  const actualRender = spawnSync('pdftoppm', ['-png', '-r', '96', canonicalPdf, path.join(artifactDir, 'print-actual')], { encoding: 'utf8' });
  if (actualRender.status !== 0) throw new Error(`Actual diagnostic rendering failed: ${actualRender.stderr}`);
  if (!validation.pass) throw new Error(`Print E/F visual contract failed: ${JSON.stringify(validation.failures)}`);
  return { front_E: 'PASS', back_F: 'PASS', page_region_contracts: printRegions.length };
});

await test('VISUAL-PRINT-REGRESSION', 'Print visual gate rejects a representative material finance-table displacement', async () => {
  await productionPage.setViewportSize({ width: 1280, height: 1000 }); await productionPage.goto(dossierUrl, { waitUntil: 'networkidle' }); await productionPage.waitForSelector('.gpp-print-dossier[data-gpp-print-state="ready"]'); await productionPage.emulateMedia({ media: 'print' });
  const controlPdf = path.join(artifactDir, 'qualification-print-control.pdf');
  await productionPage.pdf({ path: controlPdf, printBackground: true, preferCSSPageSize: true, scale: 1 });
  const control = validatePrintPdf(controlPdf, ownerPdf, 'deliberate-control');
  if (!control.pass) throw new Error(`Precondition control PDF does not pass the visual gate: ${JSON.stringify(control.failures)}`);
  await productionPage.addStyleTag({ content: '.gpp-print-dossier .paper-finance{transform:translateX(48px)!important;}' });
  const mutatedPdf = path.join(artifactDir, 'print-deliberate-regression.pdf');
  await productionPage.pdf({ path: mutatedPdf, printBackground: true, preferCSSPageSize: true, scale: 1 });
  const mutated = validatePrintPdf(mutatedPdf, ownerPdf, 'deliberate-mutated');
  if (mutated.pass) throw new Error('Print visual gate accepted the deliberate 48px finance-table displacement.');
  return { injected_only_in_test: true, rejected: true, failure_classes: mutated.failures };
});

await productionContext.close(); await browser.close();
const output={
  schema_version:'1.0.0', suite:'Owner Print Visual Contract Qualification', data_class:'SYNTHETIC_NON_PII',
  owner_reference_sha256:pdfIdentity.sha256,
  surfaces:{print_front_E:results.find(r=>r.id==='VISUAL-PRINT-EF')?.status||'FAIL',print_back_F:results.find(r=>r.id==='VISUAL-PRINT-EF')?.status||'FAIL'},
  deliberate_regression:results.find(r=>r.id==='VISUAL-PRINT-REGRESSION')?.status==='PASS'?'REJECTED_AS_EXPECTED':'NOT_PROVEN',
  results,
};
fs.writeFileSync(path.join(artifactDir,'print-visual-contract-results.json'),JSON.stringify(output,null,2)+'\n');
for(const result of results) console.log(`${result.status} ${result.id} ${result.name}`);
if(results.some(result=>result.status!=='PASS')) process.exit(1);
