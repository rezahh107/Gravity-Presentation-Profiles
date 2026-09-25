import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const sourceRoot = process.env.WU21_GRAVITYFLOW_SOURCE;
const artifactDir = process.env.WU21_ARTIFACT_DIR;
if (!sourceRoot || !artifactDir) throw new Error('PR87 host-grid seam inventory requires pinned WU21 source and artifact paths.');
assert.equal(fs.existsSync(sourceRoot), true, `Pinned Gravity Flow source is unavailable: ${sourceRoot}`);

const allowedExtensions = new Set(['.js', '.php', '.json', '.css', '.jsx', '.ts', '.tsx']);
const terms = [
  'gridOptions',
  'rowHeight',
  'getRowHeight',
  'setRowHeight',
  'resetRowHeights',
  'domLayout',
  'suppressRowVirtualisation',
  'suppressRowVirtualization',
  'paginationPageSize',
  'onGridReady',
  'gridApi',
  'gridOptions.api',
  'agGrid.Grid',
  'new Grid(',
  'applyFilters',
  'gform.applyFilters',
  'wp.hooks',
  'addFilter',
  'CustomEvent',
  'dispatchEvent',
];

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const occurrences = [];
const termWindows = [];
const inboxFilterContexts = [];
const sourceSlices = [];
let scannedFiles = 0;

function relative(full) {
  return path.relative(sourceRoot, full).replaceAll(path.sep, '/');
}

function boundedWindow(text, index, radius = 900) {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + radius);
  return { start, end, text: text.slice(start, end) };
}

function captureLines(file, text, startLine, endLine, label) {
  const lines = text.split(/\r?\n/);
  sourceSlices.push({
    file,
    label,
    start_line: startLine,
    end_line: Math.min(endLine, lines.length),
    lines: lines.slice(startLine - 1, endLine).map((value, offset) => ({ line: startLine + offset, text: value })),
  });
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!entry.isFile() || !allowedExtensions.has(path.extname(entry.name).toLowerCase())) continue;
    const stat = fs.statSync(full);
    if (stat.size > 8 * 1024 * 1024) continue;
    const bytes = fs.readFileSync(full);
    if (bytes.includes(0)) continue;
    const text = bytes.toString('utf8');
    const file = relative(full);
    scannedFiles += 1;

    if (file === 'includes/inbox/class-inbox-service-provider.php') {
      captureLines(file, text, 220, 270, 'grid configuration construction');
      captureLines(file, text, 280, 310, 'post-configuration Inbox argument filtering');
    }

    for (const term of terms) {
      let cursor = 0;
      while (cursor < text.length) {
        const index = text.indexOf(term, cursor);
        if (index === -1) break;
        const window = boundedWindow(text, index);
        termWindows.push({ file, term, index, ...window });
        cursor = index + Math.max(1, term.length);
      }
    }

    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const matchedTerms = terms.filter(term => line.includes(term));
      if (matchedTerms.length) {
        occurrences.push({
          file,
          line: i + 1,
          terms: matchedTerms,
          text: line.trim().slice(0, 700),
          context: lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 3)).map((value, offset) => ({
            line: Math.max(0, i - 2) + offset + 1,
            text: value.trim().slice(0, 700),
          })),
        });
      }
      if (/apply_filters\s*\(/.test(line) && /(inbox|grid)/i.test(lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 3)).join('\n'))) {
        inboxFilterContexts.push({
          file,
          line: i + 1,
          context: lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 3)).map((value, offset) => ({
            line: Math.max(0, i - 2) + offset + 1,
            text: value.trim().slice(0, 700),
          })),
        });
      }
    }
  }
}

walk(sourceRoot);
const byTerm = Object.fromEntries(terms.map(term => [term, termWindows.filter(item => item.term === term).length]));
const candidateFiles = [...new Set(termWindows.map(item => item.file))].sort();
const appGridWindows = termWindows.filter(item => item.term === 'gridOptions' && item.file.includes('common-inbox.'));
const hookWindows = termWindows.filter(item => ['applyFilters', 'gform.applyFilters', 'wp.hooks', 'addFilter', 'CustomEvent', 'dispatchEvent'].includes(item.term) && (item.file.includes('common-inbox.') || item.file.includes('class-inbox-service-provider.php')));
const virtualizationWindows = termWindows.filter(item => ['suppressRowVirtualisation', 'suppressRowVirtualization', 'domLayout'].includes(item.term));
const report = {
  schema_version: '2.0.0',
  source_identity: {
    runtime_version: '3.1.0',
    package_sha256: 'ac0573b75831380417a21a455176e25eb746d718bbbd0bb70d6da6f48cba5404',
    source_root: sourceRoot,
  },
  scanned_files: scannedFiles,
  terms,
  counts_by_term: byTerm,
  candidate_files: candidateFiles,
  application_grid_option_windows: appGridWindows,
  application_hook_windows: hookWindows,
  virtualization_windows: virtualizationWindows,
  source_slices: sourceSlices,
  occurrences,
  inbox_filter_contexts: inboxFilterContexts,
};
report.evidence_sha256 = sha256(JSON.stringify(report));
const output = path.join(artifactDir, 'pr87-host-grid-seam-inventory.json');
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(`PR87_HOST_GRID_SEAM_INVENTORY files=${scannedFiles} app_grid_windows=${appGridWindows.length} app_hook_windows=${hookWindows.length} filters=${inboxFilterContexts.length}`);
console.log(JSON.stringify({ counts_by_term: byTerm, candidate_files: candidateFiles, app_grid_windows: appGridWindows.length, app_hook_windows: hookWindows.length }, null, 2));
