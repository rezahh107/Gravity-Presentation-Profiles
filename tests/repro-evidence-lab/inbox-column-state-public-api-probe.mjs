import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import {
  artifactDir,
  wpCli,
  wpPath,
  login,
  waitForGrid,
} from './inbox-visual-design-v2-browser-lib.mjs';

const fixture = JSON.parse(fs.readFileSync(path.join(artifactDir, 'fixture-manifest.json'), 'utf8'));
const alpha = (fixture.forms || []).find(item => item.key === 'alpha') || fixture.forms?.[0];
if (!alpha?.form_id) throw new Error('Inbox column-state public API probe requires the alpha form.');

function wpEval(code) {
  const result = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], { encoding: 'utf8', env: process.env });
  if (result.status !== 0) throw new Error(`WP-CLI failed: ${result.stderr}\n${result.stdout}`);
  return result.stdout.trim();
}

let browser = null;
let pageId = 0;
const evidencePath = path.join(artifactDir, 'inbox-column-state-public-api-probe.json');

try {
  const setup = JSON.parse(wpEval(`
$page_id = wp_insert_post(array(
  'post_title' => 'WU21 Inbox Column State Public API Probe',
  'post_status' => 'publish',
  'post_type' => 'page',
  'post_content' => '[gravityflow page="inbox" form="${Number(alpha.form_id)}"]',
), true);
if (is_wp_error($page_id)) throw new RuntimeException($page_id->get_error_message());
echo wp_json_encode(array('page_id' => (int)$page_id, 'url' => get_permalink($page_id)));
  `));
  pageId = Number(setup.page_id);
  const url = new URL(setup.url);
  url.searchParams.set('wu21_header_rtl_probe', '1');

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await login(page);
  await page.goto(url.toString(), { waitUntil: 'networkidle' });
  await waitForGrid(page);

  const evidence = await page.evaluate(() => {
    const root = document.querySelector('[data-js="gflow-inbox"][data-grid-id]');
    const gridId = root?.getAttribute('data-grid-id') || null;
    const options = gridId ? window.gflow_config?.grids?.[gridId]?.grid_options : null;
    const methodNames = value => value
      ? Object.getOwnPropertyNames(Object.getPrototypeOf(value) || {}).filter(name => typeof value[name] === 'function').sort()
      : [];

    return {
      contract: 'SRWF_INBOX_COLUMN_STATE_PUBLIC_API_PROBE_V1',
      execution_status: 'CAPTURED',
      grid_id: gridId,
      contract_payload: Array.isArray(window.gppSrwfInboxColumnOrderContracts)
        ? window.gppSrwfInboxColumnOrderContracts
        : null,
      scripts: [...document.scripts]
        .map(script => script.src)
        .filter(src => src.includes('gravity-flow-inbox-column-order-contract.js')),
      public_grid_options: options ? {
        own_keys: Object.keys(options).sort(),
        column_defs: Array.isArray(options.columnDefs) ? options.columnDefs.map(column => String(column.field)) : null,
        api_present: Boolean(options.api),
        column_api_present: Boolean(options.columnApi),
        api_get_column_state: typeof options.api?.getColumnState,
        api_apply_column_state: typeof options.api?.applyColumnState,
        column_api_get_column_state: typeof options.columnApi?.getColumnState,
        column_api_apply_column_state: typeof options.columnApi?.applyColumnState,
        api_methods: methodNames(options.api),
        column_api_methods: methodNames(options.columnApi),
      } : null,
      visible_header_ids: [...document.querySelectorAll('[data-js="gflow-inbox"] .ag-header-cell')]
        .filter(cell => cell.getBoundingClientRect().width > 0)
        .sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x)
        .map(cell => cell.getAttribute('col-id')),
    };
  });

  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
  console.log(`INBOX_COLUMN_STATE_PUBLIC_API_PROBE ${JSON.stringify({
    grid_id: evidence.grid_id,
    scripts: evidence.scripts.length,
    api_present: evidence.public_grid_options?.api_present,
    column_api_present: evidence.public_grid_options?.column_api_present,
    api_get_column_state: evidence.public_grid_options?.api_get_column_state,
    column_api_get_column_state: evidence.public_grid_options?.column_api_get_column_state,
  })}`);
} finally {
  if (browser) await browser.close().catch(() => {});
  if (pageId) wpEval(`wp_delete_post(${pageId}, true);`);
}
