import { chromium } from 'playwright';
import { spawnSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
const repoRoot = process.env.GITHUB_WORKSPACE;
if (!artifactDir || !wpPath || !wpCli || !repoRoot) {
  throw new Error('WU11 AG Grid contract requires the admitted WU21 runtime environment.');
}

function wpEval(code) {
  const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], { encoding: 'utf8', env: process.env });
  if (cp.status !== 0) throw new Error(`${cp.stderr}\n${cp.stdout}`);
  return cp.stdout.trim();
}

function readJson(file, label) {
  if (!fs.existsSync(file)) throw new Error(`${label} artifact is missing: ${file}`);
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!value || typeof value !== 'object') throw new Error(`${label} artifact is not a JSON object.`);
  return value;
}

const wu17 = readJson(path.join(artifactDir, 'wu17-browser-results.json'), 'WU17 browser');
const byId = new Map((wu17.results || []).map(result => [result.id, result]));
for (const id of ['PR4-BROWSER-001', 'PR4-BROWSER-003', 'PR4-BROWSER-004', 'PR4-BROWSER-005', 'PR4-BROWSER-006', 'PR4-BROWSER-007']) {
  const result = byId.get(id);
  if (!result || result.status !== 'PASS') throw new Error(`WU11 required existing WU17 gate is not PASS: ${id}`);
}

const failClosed = byId.get('PR4-BROWSER-007')?.details?.state;
if (!failClosed
    || !(failClosed.unready_markers >= 1)
    || failClosed.visible_cards !== 0
    || failClosed.visible_card_cells !== 0
    || !(failClosed.visible_native_cells >= 1)) {
  throw new Error(`WU11 authentic unready-row native fallback evidence is incomplete: ${JSON.stringify(failClosed)}`);
}

const host = JSON.parse(wpEval(`
$vendor=glob(WP_PLUGIN_DIR.'/gravityflow/assets/js/dist/vendor-theme.*.js');
$inbox=glob(WP_PLUGIN_DIR.'/gravityflow/assets/js/dist/common-inbox.*.js');
if(!is_array($vendor)||empty($vendor)||!is_array($inbox)||empty($inbox)) throw new RuntimeException('Gravity Flow Inbox bundles unavailable.');
$v=file_get_contents($vendor[0]);$i=file_get_contents($inbox[0]);
$caps=array();
foreach(array('paginationGetCurrentPage','paginationGetTotalPages','paginationGoToPage','paginationGoToFirstPage','paginationGoToPreviousPage','paginationGoToNextPage','paginationGoToLastPage','ag-paging-row-summary-panel','lbCurrent','btFirst','btPrevious','btNext','btLast') as $name){$caps[$name]=false!==strpos($v,$name);}
foreach(array('setQuickFilter','setFilterModel','getFilterModel','applyTransaction') as $name){$caps[$name]=false!==strpos($i,$name);}
echo wp_json_encode(array(
  'gravity_forms_version'=>class_exists('GFForms')?GFForms::$version:null,
  'gravity_flow_version'=>function_exists('gravity_flow')?gravity_flow()->get_version():null,
  'ag_grid_25_2_0_banner'=>false!==strpos($v,'AG Grid v25.2.0'),
  'page_numbers_present'=>false!==strpos($v,'pageNumbers'),
  'non_default_row_model_present'=>false!==strpos($i,'rowModelType'),
  'capabilities'=>$caps,
  'vendor_bundle'=>basename($vendor[0]),
  'inbox_bundle'=>basename($inbox[0])
),JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
`));

if (host.gravity_forms_version !== '3.1.1.1' || host.gravity_flow_version !== '3.1.0') {
  throw new Error(`WU11 host version drift: ${JSON.stringify(host)}`);
}
if (host.ag_grid_25_2_0_banner !== true) throw new Error('WU11 exact AG Grid 25.2.0 banner is missing.');
if (host.page_numbers_present !== false) throw new Error('WU11 unexpected newer AG Grid numbered-page capability appeared.');
if (host.non_default_row_model_present !== false) throw new Error('WU11 Gravity Flow Inbox switched away from the qualified default client-side row model.');
for (const [capability, present] of Object.entries(host.capabilities || {})) {
  if (present !== true) throw new Error(`WU11 required pinned Grid capability missing: ${capability}`);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
let dom;
try {
  await page.goto(`${baseUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', 'bootstrap_admin');
  await page.fill('#user_pass', 'wu21-bootstrap-pass-2026');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.click('#wp-submit'),
  ]);

  await page.goto(`${baseUrl}/wp-admin/admin.php?page=gravityflow-inbox`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-js="gflow-inbox"] .ag-root-wrapper', { timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container > .ag-row').length === 20, null, { timeout: 30000 });

  dom = await page.evaluate(() => {
    const rowSelector = '[data-js="gflow-inbox"] .ag-center-cols-container > .ag-row';
    const rows = [...document.querySelectorAll(rowSelector)];
    const visible = element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
    };
    const directCardCells = rows.map(row => row.querySelector(':scope > .ag-cell[col-id="gpp_case_card"]')).filter(Boolean);
    const cards = directCardCells.map(cell => cell.querySelector('.gpp-inbox-card')).filter(Boolean);
    const ready = directCardCells.map(cell => cell.querySelector('.gpp-inbox-card__readiness--ready')).filter(Boolean);
    const nativeCells = rows.flatMap(row => [...row.querySelectorAll(':scope > .ag-cell:not([col-id="gpp_case_card"])')]);
    const links = directCardCells.map(cell => cell.querySelector('.gflow-inbox__entry-cell-link')).filter(Boolean);
    return {
      critical_selector: '.ag-center-cols-container > .ag-row > .ag-cell[col-id="gpp_case_card"]',
      rows: rows.length,
      direct_card_cells: directCardCells.length,
      cards: cards.length,
      ready_markers: ready.length,
      native_cells_retained_in_dom: nativeCells.length,
      visible_native_cells: nativeCells.filter(visible).length,
      visible_cards: cards.filter(visible).length,
      native_entry_links: links.length,
      selector_has_supported: CSS.supports('selector(:has(*))'),
    };
  });

  if (!dom.selector_has_supported
      || dom.rows < 1
      || dom.direct_card_cells !== dom.rows
      || dom.cards !== dom.rows
      || dom.ready_markers !== dom.rows
      || !(dom.native_cells_retained_in_dom >= dom.rows)
      || dom.visible_native_cells !== 0
      || dom.visible_cards !== dom.rows
      || dom.native_entry_links !== dom.rows) {
    throw new Error(`WU11 critical AG Grid DOM/Card Mode contract failed: ${JSON.stringify(dom)}`);
  }
} finally {
  await context.close();
  await browser.close();
}

const repositoryHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
const contract = {
  schema_version: '1.0.0',
  work_unit: 'GPP-RP-WU-11-FLOW-DEPENDENCY-REGRESSION',
  dependency: 'Gravity Flow Inbox / bundled AG Grid',
  claim_ceiling: 'QUALIFIED_FOR_PINNED_RUNTIME',
  repository_head: repositoryHead,
  runtime: {
    wordpress: wpEval('echo get_bloginfo("version");'),
    php: wpEval('echo PHP_VERSION;'),
    gravity_forms: host.gravity_forms_version,
    gravity_forms_package_sha256: process.env.WU21_GF_SHA256 || null,
    gravity_flow: host.gravity_flow_version,
    gravity_flow_package_sha256: process.env.WU21_FLOW_SHA256 || null,
    ag_grid: '25.2.0',
    node: process.version,
    playwright: JSON.parse(fs.readFileSync(path.join(repoRoot, 'node_modules/playwright/package.json'), 'utf8')).version,
  },
  host_capabilities: host,
  critical_dom_dependency: dom,
  reused_behavioral_gates: {
    card_mode_all_ready: byId.get('PR4-BROWSER-001'),
    native_search_rerender: byId.get('PR4-BROWSER-003'),
    native_sorting_pagination: byId.get('PR4-BROWSER-004'),
    native_entry_detail_navigation: byId.get('PR4-BROWSER-005'),
    native_live_refresh: byId.get('PR4-BROWSER-006'),
    any_unready_row_native_fallback: byId.get('PR4-BROWSER-007'),
  },
  fail_closed: {
    authentic_unready_row_native_fallback: true,
    visible_gpp_cards_on_mixed_readiness: 0,
    native_cells_remain_usable: true,
  },
  forbidden_newer_assumptions: {
    numbered_page_panel_required: false,
    non_default_row_model_required: false,
    gpp_grid_state_machine: false,
  },
  concurrent_revalidation_policy: 'Rerun shared Inbox browser behavior after any merged Inbox reachability/delivery change before final release qualification.',
  classification: 'PINNED_CONTRACT_QUALIFIED',
  production_change_required: false,
};

fs.writeFileSync(path.join(artifactDir, 'wu17-wu11-ag-grid-host-contract.json'), `${JSON.stringify(contract, null, 2)}\n`);
process.stdout.write(`WU11_AG_GRID_HOST_CONTRACT_PASS=${JSON.stringify({ classification: contract.classification, critical_dom_dependency: dom.critical_selector })}\n`);
