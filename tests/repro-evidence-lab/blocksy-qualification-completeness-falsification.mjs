import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { executionIdentity, EXPECTED_CASE_IDS } from './blocksy-qualification-completeness.mjs';

// Falsification uses the real positive qualification output as the baseline.
// No native Gravity Flow interactions are replaced or mocked.
const out = process.env.WU21_ARTIFACT_DIR;
assert.ok(out && process.env.GITHUB_WORKSPACE, 'Authentic CI runtime required');
const moduleFile = path.join(process.env.GITHUB_WORKSPACE,
  'tests/repro-evidence-lab/blocksy-qualification-completeness.mjs');
const qualificationFile = path.join(process.env.GITHUB_WORKSPACE,
  'tests/repro-evidence-lab/blocksy-free-inbox-qualification.mjs');
const evidenceFile = path.join(out, 'blocksy-extended-qualification.json');
const runnerFile = path.join(out, 'blocksy-extended-runner.json');
const original = JSON.parse(fs.readFileSync(evidenceFile, 'utf8'));
const runner = JSON.parse(fs.readFileSync(runnerFile, 'utf8'));
const temp = fs.mkdtempSync(path.join(out, 'blocksy-completeness-falsification-'));
const records = [];
const clone = value => JSON.parse(JSON.stringify(value));
function check(label, evidence, execution, expectedExit, outcome = 'success') {
  const file = path.join(temp, label + '.json');
  const exit = path.join(temp, label + '-runner.json');
  if (evidence !== null) fs.writeFileSync(file, typeof evidence === 'string' ? evidence : JSON.stringify(evidence));
  if (execution !== null) fs.writeFileSync(exit, JSON.stringify(execution));
  const result = spawnSync(process.execPath, [moduleFile, '--gate', file, exit], {
    encoding: 'utf8', env: { ...process.env, GPP_BLOCKSY_STEP_OUTCOME: outcome }, timeout: 30000,
  });
  const accepted = result.status === 0;
  assert.equal(accepted, expectedExit === 0,
    label + ' gate verdict mismatch: ' + JSON.stringify({ status: result.status, output: result.stdout, error: result.stderr }));
  records.push({ label, expected_exit: expectedExit === 0 ? 0 : 'nonzero',
    observed_exit: result.status, gate_pass: accepted,
    reason_excerpt: String(result.stdout || result.stderr).slice(0, 1200) });
  console.log('BLOCKSY_COMPLETENESS_CONTROL_PASS ' + label + ' gate_exit=' + result.status);
}
assert.equal(original.cases.length, EXPECTED_CASE_IDS.length);
assert.equal(original.status, 'PASS');
assert.equal(runner.exit_code, 0);
check('A-authentic-positive', original, runner, 0);

const abort = spawnSync(process.execPath, [qualificationFile], {
  encoding: 'utf8', cwd: process.env.GITHUB_WORKSPACE,
  env: { ...process.env, GPP_BLOCKSY_INJECT_SOURCE_PROBE_FAILURE: '1' },
  timeout: 120000,
});
assert.notEqual(abort.status, 0, 'B: source-probe early abort returned zero exit');
assert.match(abort.stdout + abort.stderr, /BLOCKSY_SOURCE_PROBE_CONTROLLED_FAILURE/);
const aborted = JSON.parse(fs.readFileSync(path.join(out, 'blocksy-extended-qualification-source-negative.json'), 'utf8'));
assert.equal(aborted.cases.length, 0, 'B: test mutated later than the source probe');
assert.notEqual(aborted.status, 'PASS', 'B: zero-case abort reported PASS');
check('B-source-abort', aborted,
  { execution_identity: executionIdentity(), exit_code: abort.status, log_exit_code: 0 }, 1, 'failure');

const missingCase = clone(original);
missingCase.cases.pop();
check('C-missing-expected-case-with-forged-PASS', missingCase, runner, 1);

const duplicateCase = clone(original);
duplicateCase.cases.pop();
duplicateCase.cases.push(clone(duplicateCase.cases[0]));
assert.equal(duplicateCase.cases.length, EXPECTED_CASE_IDS.length);
check('D-duplicate-masks-omission-with-forged-PASS', duplicateCase, runner, 1);

check('E-PASS-JSON-but-nonzero-node-exit', original, {
  ...runner, exit_code: 13,
}, 1);

check('F-missing-evidence-file', null, runner, 1);
check('F-corrupted-JSON', '{"status":"PASS",', runner, 1);
check('F-missing-runner-exit-record', original, null, 1);
check('F-stale-run-identity', { ...clone(original),
  execution_identity: { ...original.execution_identity, run_id: 'stale-run' } }, runner, 1);
check('F-non-success-Actions-step', original, runner, 1, 'failure');

fs.writeFileSync(path.join(out, 'blocksy-completeness-falsification-results.json'),
  JSON.stringify({ status: 'PASS', controls: records, base_cases: original.cases.length }, null, 2) + '\n');
console.log('BLOCKSY_COMPLETENESS_FALSIFICATION_PASS controls=' + records.length);
