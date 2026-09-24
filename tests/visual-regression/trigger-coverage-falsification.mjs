import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync('.github/workflows/wu21-repro-evidence-lab.yml', 'utf8');
const pullRequestBlock = workflow.match(/pull_request:\n([\s\S]*?)\n  workflow_dispatch:/)?.[1] || '';
const patterns = [...pullRequestBlock.matchAll(/^\s+- '([^']+)'$/gm)].map(match => match[1]);
const matches = (file, pattern) => pattern.endsWith('/**') ? file.startsWith(pattern.slice(0, -3)) : file === pattern;
const covered = file => patterns.some(pattern => matches(file, pattern));

for (const file of [
  'tests/visual-regression/inbox-visual-diagnostics.mjs',
  'tests/visual-regression/inbox-visual-contract.json',
  'tests/visual-regression/references/manifest.json',
  'tests/fixtures/owner-visual/PersianGravity-Visual-Reference-Final.html',
  'tests/fixtures/owner-visual/PersianGravity-Visual-Reference-Final-vNext.html',
  'tests/repro-evidence-lab/browser-tests.mjs',
  'assets/css/srwf-gravity-flow-inbox.css',
  'gravity-presentation-profiles.php',
]) assert.equal(covered(file), true, `WU21 trigger does not cover owned path: ${file}`);

assert.equal(covered('docs/unrelated-note.md'), false, 'Unrelated documentation unexpectedly triggers WU21.');
const browserEntry = fs.readFileSync('tests/repro-evidence-lab/browser-tests.mjs', 'utf8');
const visualWorkflowAt = workflow.indexOf('node tests/visual-regression/inbox-visual-diagnostics.mjs');
const deferredP06At = workflow.indexOf('node tests/repro-evidence-lab/p06-inbox-asset-reachability-browser-test.mjs');
const bootstrapAt = browserEntry.indexOf("import('./p06-fixture-bootstrap.mjs')");
const p06QualificationAt = browserEntry.indexOf("import('./p06-inbox-asset-reachability-browser-test.mjs')");
assert.ok(bootstrapAt >= 0 && p06QualificationAt > bootstrapAt, 'Authoritative P06 bootstrap must precede its qualification consumer.');
assert.ok(workflow.includes('GPP_DEFER_P06_QUALIFICATION=1 node tests/repro-evidence-lab/browser-tests.mjs'), 'WU21 must defer the deliberate P06 mutation until after visual capture.');
assert.ok(visualWorkflowAt >= 0 && visualWorkflowAt < deferredP06At, 'Visual diagnostics must precede P06 deliberate inactive-profile mutation.');
console.log(`WU21_TRIGGER_COVERAGE_PASS patterns=${JSON.stringify(patterns)}`);
