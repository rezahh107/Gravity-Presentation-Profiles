import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The single authoritative inventory for the original 26 authentic Blocksy
// qualification cases. Both the browser finalizer and the Actions gate use it.
const routes = ['shortcode', 'block'];
const viewports = [1440, 414, 390, 360, 320];
export const EXPECTED_CASE_IDS = Object.freeze([
  ...routes.map(route => 'title-before-' + route),
  'title-native-page-setting-source',
  ...routes.map(route => 'title-after-' + route),
  ...routes.flatMap(route => viewports.map(width => 'geometry-' + route + '-' + width)),
  'unrelated-negative-control',
  ...routes.flatMap(route => [
    'search-' + route, 'sort-pager-' + route, 'manual-refresh-' + route,
  ]),
  'live-refresh-shortcode',
  'authorized-entry-navigation',
  'permission-isolation',
  'keyboard-action-accessibility',
]);
if (EXPECTED_CASE_IDS.length !== 26 || new Set(EXPECTED_CASE_IDS).size !== 26) {
  throw new Error('BLOCKSY_INVENTORY_INVALID: expected 26 distinct cases');
}

export function executionIdentity(env = process.env) {
  return {
    head_sha: env.GPP_BLOCKSY_HEAD_SHA ?? null,
    run_id: env.GITHUB_RUN_ID ?? null,
    run_attempt: env.GITHUB_RUN_ATTEMPT ?? null,
  };
}

const nonempty = value => typeof value === 'string' && value.length > 0;
function identityMatches(value, expected) {
  return value && typeof value === 'object' && Object.keys(expected).every(key =>
    nonempty(expected[key]) && value[key] === expected[key]);
}

export function inspectCaseCompletion(evidence) {
  const problems = [];
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    return { complete: false, problems: ['Evidence is missing or malformed'] };
  }
  if (evidence.run_finished !== true) problems.push('Browser execution did not reach the final scenario boundary');
  if (!Array.isArray(evidence.cases)) problems.push('Scenario records are missing');
  const cases = Array.isArray(evidence.cases) ? evidence.cases : [];
  const counts = new Map();
  for (const record of cases) {
    if (!record || typeof record.id !== 'string') {
      problems.push('Malformed scenario record');
      continue;
    }
    counts.set(record.id, (counts.get(record.id) ?? 0) + 1);
    if (record.status !== 'PASS') problems.push('Non-PASS scenario: ' + record.id + '=' + record.status);
  }
  for (const id of EXPECTED_CASE_IDS) {
    if ((counts.get(id) ?? 0) !== 1) {
      problems.push('Expected exactly one execution: ' + id + ', observed=' + (counts.get(id) ?? 0));
    }
  }
  for (const id of counts.keys()) {
    if (!EXPECTED_CASE_IDS.includes(id)) problems.push('Unexpected scenario: ' + id);
  }
  if (cases.length !== EXPECTED_CASE_IDS.length) {
    problems.push('Scenario count mismatch: ' + cases.length + '/' + EXPECTED_CASE_IDS.length);
  }
  if (!Array.isArray(evidence.errors) || evidence.errors.length !== 0) problems.push('Unexpected execution/assertion errors');
  if (!Array.isArray(evidence.page_errors) || evidence.page_errors.length !== 0) problems.push('Uncaught browser exceptions');
  const summary = evidence.summary;
  if (summary && (summary.PASS !== EXPECTED_CASE_IDS.length || summary.FAIL !== 0 || summary.NOT_PROVEN !== 0)) {
    problems.push('Contradictory summary');
  }
  return { complete: problems.length === 0, problems };
}

export function inspectQualificationGate(evidence, runner, options = {}) {
  const failures = [];
  const cases = inspectCaseCompletion(evidence);
  failures.push(...cases.problems);
  const expected = options.identity ?? executionIdentity();
  if (!identityMatches(evidence?.execution_identity, expected)) failures.push('Missing/stale/mismatched evidence execution identity');
  if (!identityMatches(runner?.execution_identity, expected)) failures.push('Missing/stale/mismatched runner execution identity');
  if (evidence?.status !== 'PASS') failures.push('Evidence status is not PASS');
  if (!evidence?.summary || evidence.summary.PASS !== EXPECTED_CASE_IDS.length ||
      evidence.summary.FAIL !== 0 || evidence.summary.NOT_PROVEN !== 0) {
    failures.push('Final PASS/FAIL/NOT_PROVEN summary is missing or contradictory');
  }
  if (!runner || !Number.isInteger(runner.exit_code) || runner.exit_code !== 0) {
    failures.push('Actual Node runner exit was missing or nonzero');
  }
  if (options.stepOutcome !== 'success') failures.push('GitHub Actions Node execution step was not successful');
  return { pass: failures.length === 0, failures, expected_count: EXPECTED_CASE_IDS.length,
    observed_count: Array.isArray(evidence?.cases) ? evidence.cases.length : null };
}

// Exactly the same gate is used in production CI and in falsification controls.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, evidenceFile, exitFile] = process.argv.slice(2);
  if (command !== '--gate' || !evidenceFile || !exitFile) {
    console.error('Usage: node blocksy-qualification-completeness.mjs --gate EVIDENCE_JSON RUNNER_JSON');
    process.exitCode = 1;
  } else {
    try {
      const evidence = JSON.parse(fs.readFileSync(evidenceFile, 'utf8'));
      const runner = JSON.parse(fs.readFileSync(exitFile, 'utf8'));
      const verdict = inspectQualificationGate(evidence, runner, {
        stepOutcome: process.env.GPP_BLOCKSY_STEP_OUTCOME,
      });
      console.log('BLOCKSY_EXTENDED_QUALIFICATION_GATE ' + JSON.stringify(verdict));
      if (!verdict.pass) process.exitCode = 1;
    } catch (error) {
      console.error('BLOCKSY_EXTENDED_QUALIFICATION_GATE FAIL_CLOSED ' + String(error?.message || error));
      process.exitCode = 1;
    }
  }
}
