import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { artifactDir } from './inbox-visual-design-v2-browser-lib.mjs';

const flowRoot = process.env.WU21_GRAVITYFLOW_SOURCE;
if (!flowRoot || !fs.existsSync(flowRoot)) throw new Error('Exact Gravity Flow source root is unavailable for seam inventory.');

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const relative = file => path.relative(flowRoot, file).replaceAll(path.sep, '/');

function walk(dir, extension, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, extension, out);
    else if (entry.isFile() && entry.name.endsWith(extension)) out.push(full);
  }
  return out;
}

function snippets(content, needle, radius = 420) {
  const results = [];
  let offset = 0;
  while ((offset = content.indexOf(needle, offset)) !== -1) {
    const start = Math.max(0, offset - radius);
    results.push(content.slice(start, Math.min(content.length, offset + needle.length + radius)));
    offset += needle.length;
    if (results.length >= 8) break;
  }
  return results;
}

const relevantNames = new Set([
  'gravityflow_columns_inbox_table',
  'gravityflow_inbox_args',
  'gravityflow_inbox_fields',
  'gravityflow_js_config_shared',
  'gravityflow_enqueue_admin_scripts',
  'gravityflow_enqueue_frontend_scripts',
]);

const phpHookInventory = [];
for (const file of walk(flowRoot, '.php')) {
  const content = fs.readFileSync(file, 'utf8');
  const hookRegex = /\b(apply_filters|apply_filters_ref_array|do_action|do_action_ref_array)\s*\(\s*['"]([^'"]+)['"]/g;
  const hooks = [];
  let match;
  while ((match = hookRegex.exec(content)) !== null) {
    const name = match[2];
    if (relevantNames.has(name) || /gravityflow.*(inbox|grid|js_config|enqueue)/i.test(name)) {
      hooks.push({ type: match[1], name, offset: match.index });
    }
  }
  if (!hooks.length) continue;
  phpHookInventory.push({
    path: relative(file),
    sha256: sha256(fs.readFileSync(file)),
    hooks,
    relevant_snippets: Object.fromEntries([...relevantNames]
      .filter(name => content.includes(name))
      .map(name => [name, snippets(content, name)])),
  });
}

const dist = path.join(flowRoot, 'assets', 'js', 'dist');
const inboxBundles = fs.existsSync(dist)
  ? fs.readdirSync(dist).filter(name => name.startsWith('common-inbox.') && name.endsWith('.js')).sort()
  : [];
const jsInventory = inboxBundles.map(name => {
  const file = path.join(dist, name);
  const content = fs.readFileSync(file, 'utf8');
  const symbols = {};
  for (const marker of [
    'onGridReady', 'onModelUpdated', 'onColumnResized', 'onColumnVisible', 'onDragStopped',
    'getColumnState', 'applyColumnState', 'CustomEvent', 'dispatchEvent', 'wp.hooks',
    'doAction', 'applyFilters', 'addEventListener("gridReady', "addEventListener('gridReady",
  ]) symbols[marker] = content.includes(marker);
  return {
    path: relative(file),
    sha256: sha256(fs.readFileSync(file)),
    size_bytes: fs.statSync(file).size,
    symbols,
    lifecycle_snippets: {
      onGridReady: snippets(content, 'onGridReady', 620),
      getColumnState: snippets(content, 'getColumnState', 620),
      applyColumnState: snippets(content, 'applyColumnState', 620),
    },
  };
});

const evidence = {
  contract: 'SRWF_INBOX_COLUMN_STATE_SOURCE_SEAM_INVENTORY_V1',
  execution_status: 'CAPTURED',
  gravity_flow: {
    version: '3.1.0',
    package_sha256: process.env.WU21_FLOW_SHA256 || null,
    source_root: flowRoot,
  },
  php_hook_inventory: phpHookInventory,
  common_inbox_bundle_inventory: jsInventory,
  interpretation: {
    source_inventory_only: true,
    documentation_status_decided_separately: true,
    runtime_availability_decided_separately: true,
  },
};

fs.writeFileSync(path.join(artifactDir, 'inbox-column-state-source-seam-inventory.json'), JSON.stringify(evidence, null, 2) + '\n');
console.log(`INBOX_COLUMN_STATE_SOURCE_SEAM_INVENTORY_CAPTURED ${JSON.stringify({ php_files: phpHookInventory.length, inbox_bundles: jsInventory.length })}`);
