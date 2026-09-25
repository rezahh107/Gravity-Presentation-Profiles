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
];

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const occurrences = [];
const inboxFilterContexts = [];
let scannedFiles = 0;

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
    scannedFiles += 1;
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const matchedTerms = terms.filter(term => line.includes(term));
      if (matchedTerms.length) {
        occurrences.push({
          file: path.relative(sourceRoot, full).replaceAll(path.sep, '/'),
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
          file: path.relative(sourceRoot, full).replaceAll(path.sep, '/'),
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
const byTerm = Object.fromEntries(terms.map(term => [term, occurrences.filter(item => item.terms.includes(term)).length]));
const candidateFiles = [...new Set(occurrences.map(item => item.file))].sort();
const report = {
  schema_version: '1.0.0',
  source_identity: {
    runtime_version: '3.1.0',
    package_sha256: 'ac0573b75831380417a21a455176e25eb746d718bbbd0bb70d6da6f48cba5404',
    source_root: sourceRoot,
  },
  scanned_files: scannedFiles,
  terms,
  counts_by_term: byTerm,
  candidate_files: candidateFiles,
  occurrences,
  inbox_filter_contexts: inboxFilterContexts,
};
report.evidence_sha256 = sha256(JSON.stringify(report));
const output = path.join(artifactDir, 'pr87-host-grid-seam-inventory.json');
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(`PR87_HOST_GRID_SEAM_INVENTORY files=${scannedFiles} occurrences=${occurrences.length} filters=${inboxFilterContexts.length}`);
console.log(JSON.stringify({ counts_by_term: byTerm, candidate_files: candidateFiles, inbox_filter_contexts: inboxFilterContexts }, null, 2));
