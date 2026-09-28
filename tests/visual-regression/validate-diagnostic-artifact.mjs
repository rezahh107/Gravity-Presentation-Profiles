import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2];
if (!root || !fs.existsSync(root)) throw new Error('NATIVE_FIRST_DIAGNOSTIC_FAILURE: diagnostic artifact root is missing.');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const manifest = read('manifest.json');

if (manifest.schema_version !== '2.0.0') throw new Error(`NATIVE_FIRST_DIAGNOSTIC_FAILURE: unsupported schema ${manifest.schema_version}.`);
if (manifest.evidence_kind !== 'NATIVE_FIRST_STRUCTURAL_DIAGNOSTIC' || manifest.architecture !== 'NATIVE_FIRST') {
  throw new Error('NATIVE_FIRST_DIAGNOSTIC_FAILURE: diagnostic architecture identity mismatch.');
}
if (manifest.superseded_architecture !== 'CARD_MODE') throw new Error('NATIVE_FIRST_DIAGNOSTIC_FAILURE: superseded Card Mode identity is not explicit.');
if (manifest.visual_golden_admission !== 'NOT_ATTEMPTED_OUT_OF_SCOPE') {
  throw new Error('NATIVE_FIRST_DIAGNOSTIC_FAILURE: this reset must not claim a visual Golden admission.');
}
if (manifest.repository_sha !== process.env.GPP_WU21_REPOSITORY_SHA) throw new Error('NATIVE_FIRST_DIAGNOSTIC_FAILURE: exact-head identity mismatch.');
if (manifest.status !== 'PASS' || manifest.failure !== null) throw new Error(`NATIVE_FIRST_DIAGNOSTIC_FAILURE: manifest status=${manifest.status}.`);
if (!Array.isArray(manifest.scenarios) || manifest.scenarios.length !== 2) throw new Error('NATIVE_FIRST_DIAGNOSTIC_FAILURE: desktop/mobile structural matrix is incomplete.');

for (const legacy of ['empty-state-seam.json', 'matrix-j-browser-zoom.json']) {
  const disposition = read(legacy);
  if (disposition.status !== 'NOT_APPLICABLE_NATIVE_FIRST_RESET' || disposition.architecture !== 'NATIVE_FIRST') {
    throw new Error(`NATIVE_FIRST_DIAGNOSTIC_FAILURE: ${legacy} must be explicitly retired, not silently treated as PASS.`);
  }
}

for (const scenario of manifest.scenarios) {
  if (scenario.status !== 'PASS' || scenario.architecture !== 'NATIVE_FIRST' || !Array.isArray(scenario.violations) || scenario.violations.length !== 0) {
    throw new Error(`NATIVE_FIRST_DIAGNOSTIC_FAILURE: scenario ${scenario.id} is not cleanly proven.`);
  }
  const detail = read(`${scenario.id}.json`);
  if (JSON.stringify(detail) !== JSON.stringify(scenario)) throw new Error(`NATIVE_FIRST_DIAGNOSTIC_FAILURE: scenario detail mismatch for ${scenario.id}.`);
  const screenshot = path.join(root, scenario.screenshot || '');
  if (!scenario.screenshot || !fs.existsSync(screenshot) || fs.statSync(screenshot).size === 0) {
    throw new Error(`NATIVE_FIRST_DIAGNOSTIC_FAILURE: screenshot evidence missing for ${scenario.id}.`);
  }
  const s = scenario.state || {};
  const exact = {
    native_target_count: 1,
    native_wrapper_count: 1,
    native_grid_count: 1,
    search_count: 1,
    pager_count: 1,
    manual_refresh_count: 1,
    card_node_count: 0,
    card_column_count: 0,
    replacement_widget_count: 0,
  };
  for (const [key, expected] of Object.entries(exact)) {
    if (s[key] !== expected) throw new Error(`NATIVE_FIRST_DIAGNOSTIC_FAILURE: ${scenario.id} ${key}=${s[key]} expected ${expected}.`);
  }
  if (!Number.isInteger(s.visible_row_count) || s.visible_row_count < 1) throw new Error(`NATIVE_FIRST_DIAGNOSTIC_FAILURE: ${scenario.id} has no visible native rows.`);
  if (typeof s.document_horizontal_overflow_px !== 'number' || s.document_horizontal_overflow_px > 4) throw new Error(`NATIVE_FIRST_DIAGNOSTIC_FAILURE: ${scenario.id} document overflow.`);
  if (s.surface_horizontal_overflow_px !== null && (typeof s.surface_horizontal_overflow_px !== 'number' || s.surface_horizontal_overflow_px > 4)) {
    throw new Error(`NATIVE_FIRST_DIAGNOSTIC_FAILURE: ${scenario.id} surface overflow.`);
  }
}

console.log(`NATIVE_FIRST_DIAGNOSTIC_ARTIFACT_PASS scenarios=${manifest.scenarios.length} golden=${manifest.visual_golden_admission}`);
