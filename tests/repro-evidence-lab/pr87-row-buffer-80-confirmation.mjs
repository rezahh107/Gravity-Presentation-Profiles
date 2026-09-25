import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROW_BUFFER = 80;
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const repoRoot = process.env.GITHUB_WORKSPACE;
if (!artifactDir || !repoRoot) throw new Error('PR87 row-buffer confirmation requires the pinned WU21 environment.');

const baselinePath = path.join(artifactDir, 'pr87-native-height-restoration-counterfactual-v2.json');
assert.equal(fs.existsSync(baselinePath), true, 'State-equivalent no-rowBuffer lifecycle evidence is required.');
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
assert.equal(baseline.result, 'NATIVE_HEIGHT_RESTORATION_INSUFFICIENT');
assert.equal(baseline.summary?.all_executed, true);
assert.equal(baseline.summary?.lifecycle_ok, true);
assert.equal(baseline.summary?.native_authority_ok, true);

const sourcePath = path.join(repoRoot, 'tests/repro-evidence-lab/pr87-row-buffer-counterfactual.mjs');
const generatedPath = path.join(repoRoot, 'tests/repro-evidence-lab/.pr87-row-buffer-80-confirmation-runtime.mjs');
let source = fs.readFileSync(sourcePath, 'utf8');
source = source.replace('const ROW_BUFFER = 20;', `const ROW_BUFFER = ${ROW_BUFFER};`);
source = source.replace(`includes('"rowBuffer":20')`, `includes('"rowBuffer":${ROW_BUFFER}')`);
source = source.replace(
  "    assert.equal(nativeFallbackComparable(nativeFallbackControl,fallback),true,'rowBuffer changed native fallback visible geometry.');\n",
  ''
);
source = source.replace(
  '    const fallbackOk=fallback.container_native_authority&&fallback.clipper_native_authority&&fallback.visible_card_count===0&&nativeFallbackComparable(nativeFallbackControl,fallback);',
  '    const fallbackOk=fallback.container_native_authority&&fallback.clipper_native_authority&&fallback.visible_card_count===0;'
);
assert.ok(source.includes(`const ROW_BUFFER = ${ROW_BUFFER};`), 'Failed to bind rowBuffer=80.');
assert.ok(!source.includes('rowBuffer changed native fallback visible geometry.'), 'Invalid fresh-vs-post-lifecycle fallback assertion was not removed.');
fs.writeFileSync(generatedPath, source);
try {
  await import(`${pathToFileURL(generatedPath).href}?candidate=${ROW_BUFFER}`);
} finally {
  fs.rmSync(generatedPath, { force: true });
}

const candidatePath = path.join(artifactDir, 'pr87-row-buffer-counterfactual.json');
assert.equal(fs.existsSync(candidatePath), true, 'rowBuffer=80 full lifecycle evidence is missing.');
const candidate = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));

function fallbackOf(caseResult) {
  return caseResult?.states?.find(state => state.state === 'readiness-fallback')?.measurement || null;
}
function sameNumber(a, b, tolerance = 1) {
  return typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < tolerance;
}
function compareFallback(reference, actual) {
  if (!reference || !actual) return { pass: false, reason: 'missing-fallback' };
  const numeric = [
    ['container', 'height'], ['clipper', 'height'], ['body', 'height'],
    ['container', 'width'], ['clipper', 'width'], ['body', 'width'],
  ];
  const differences = numeric.filter(([box, key]) => !sameNumber(reference?.[box]?.[key], actual?.[box]?.[key])).map(([box, key]) => ({
    field: `${box}.${key}`,
    reference: reference?.[box]?.[key] ?? null,
    actual: actual?.[box]?.[key] ?? null,
  }));
  const structuralPass = reference.row_count === actual.row_count && reference.visible_card_count === actual.visible_card_count && reference.grid_count === actual.grid_count && reference.pager_count === actual.pager_count;
  return { pass: structuralPass && differences.length === 0, structural_pass: structuralPass, differences };
}

const comparisons = [];
for (const actualCase of candidate.matrix || []) {
  const referenceCase = (baseline.counterfactual_matrix || []).find(item => item.route === actualCase.route && item.device === actualCase.device);
  const comparison = compareFallback(fallbackOf(referenceCase), fallbackOf(actualCase));
  comparisons.push({ route: actualCase.route, device: actualCase.device, ...comparison });
}
const fallbackEquivalent = comparisons.length === 4 && comparisons.every(item => item.pass);
const lifecycleProven = candidate.result === 'REPAIR_METHOD_CANDIDATE_RUNTIME_PROVEN' && candidate.summary?.all_executed === true && candidate.summary?.lifecycle_ok === true && candidate.summary?.geometry_ok === true && candidate.summary?.native_fallback_ok === true;
const report = {
  schema_version: '1.0.0',
  row_buffer: ROW_BUFFER,
  selection_provenance: {
    qualification_head: '076a0dd300d72e819952beed7118eb487fc8548b',
    workflow_run: 36137427432,
    sweep_result: 'ROW_BUFFER_CANDIDATE_SELECTED',
    selected_candidate: 80,
  },
  state_equivalent_control: {
    artifact: 'pr87-native-height-restoration-counterfactual-v2.json',
    result: baseline.result,
    lifecycle_ok: baseline.summary?.lifecycle_ok === true,
    native_authority_ok: baseline.summary?.native_authority_ok === true,
  },
  candidate_result: candidate.result,
  candidate_summary: candidate.summary,
  fallback_comparisons: comparisons,
  lifecycle_proven: lifecycleProven,
  fallback_equivalent: fallbackEquivalent,
  result: lifecycleProven && fallbackEquivalent ? 'REPAIR_METHOD_ESTABLISHED' : 'REPAIR_METHOD_NOT_ESTABLISHED',
};
fs.writeFileSync(path.join(artifactDir, 'pr87-row-buffer-80-confirmation.json'), `${JSON.stringify(report, null, 2)}\n`);
assert.equal(report.result, 'REPAIR_METHOD_ESTABLISHED', `rowBuffer=80 confirmation failed: ${JSON.stringify(report)}`);
console.log(`PR87_ROW_BUFFER_80_CONFIRMATION=${report.result}`);
console.log(JSON.stringify({ candidate_summary: report.candidate_summary, fallback_comparisons: report.fallback_comparisons }, null, 2));
