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
const formId = Number((fixture.forms || []).find(item => item.key === 'alpha')?.form_id || 0);
if (!formId) throw new Error('Inbox runtime-surface probe form is unavailable.');

function wpEval(code) {
  const result = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], { encoding: 'utf8', env: process.env });
  if (result.status !== 0) throw new Error(`WP-CLI failed: ${result.stderr}\n${result.stdout}`);
  return result.stdout.trim();
}

let browser = null;
let pageId = 0;
try {
  const setup = JSON.parse(wpEval(`
$page_id = wp_insert_post(array(
    'post_title' => 'WU21 Inbox Grid Runtime Surface Probe',
    'post_status' => 'publish',
    'post_type' => 'page',
    'post_content' => '[gravityflow page="inbox" form="${formId}"]',
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
  await page.waitForFunction(() => document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').length > 0, null, { timeout: 15000 });

  const evidence = await page.evaluate(() => {
    const gridElement = document.querySelector('[data-js="gflow-inbox"][data-grid-id]');
    const gridId = gridElement?.getAttribute('data-grid-id') || null;
    const options = gridId ? window.gflow_config?.grids?.[gridId]?.grid_options : null;

    return {
      grid_id: gridId,
      gflow_config_present: Boolean(window.gflow_config),
      grid_config_present: Boolean(gridId && window.gflow_config?.grids?.[gridId]),
      grid_options_present: Boolean(options),
      grid_options_keys: options ? Object.keys(options).sort() : null,
      has_api: Boolean(options?.api),
      api_keys: options?.api ? Object.keys(options.api).sort() : null,
      has_column_api: Boolean(options?.columnApi),
      column_api_keys: options?.columnApi ? Object.keys(options.columnApi).sort() : null,
      callback_types: options ? {
        onGridReady: typeof options.onGridReady,
        onModelUpdated: typeof options.onModelUpdated,
        onColumnResized: typeof options.onColumnResized,
        onColumnVisible: typeof options.onColumnVisible,
        onDragStopped: typeof options.onDragStopped,
      } : null,
      global_ag_grid_type: typeof window.agGrid,
      global_ag_grid_keys: window.agGrid && typeof window.agGrid === 'object' ? Object.keys(window.agGrid).sort() : null,
      root_class: gridElement?.querySelector('.ag-root-wrapper')?.className || null,
    };
  });

  fs.writeFileSync(
    path.join(artifactDir, 'inbox-column-state-runtime-surface-probe.json'),
    JSON.stringify({ contract: 'SRWF_INBOX_COLUMN_STATE_RUNTIME_SURFACE_PROBE_V1', execution_status: 'CAPTURED', ...evidence }, null, 2) + '\n',
  );
  console.log(`INBOX_COLUMN_STATE_RUNTIME_SURFACE_PROBE ${JSON.stringify(evidence)}`);
} finally {
  if (browser) await browser.close().catch(() => {});
  if (pageId) wpEval(`wp_delete_post(${pageId}, true);`);
}

// Source inventory and bounded runtime candidates execute before the canonical
// stale-state regression. Neither changes production code nor relaxes it.
await import('./inbox-column-state-source-seam-inventory.mjs');
await import('./inbox-column-state-seam-qualification.mjs');
