import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync('.github/workflows/wu21-repro-evidence-lab.yml', 'utf8');
const pullRequestBlock = workflow.match(/pull_request:\n([\s\S]*?)\n  workflow_dispatch:/)?.[1] || '';
const parsePatterns = text => [...text.matchAll(/^\s+- '([^']+)'$/gm)].map(match => match[1]);
const patterns = parsePatterns(pullRequestBlock);
const matches = (file, pattern) => pattern.endsWith('/**') ? file.startsWith(pattern.slice(0, -3)) : file === pattern;
const coveredBy = (file, ownedPatterns) => ownedPatterns.some(pattern => matches(file, pattern));
const covered = file => coveredBy(file, patterns);

for (const file of [
  'tests/visual-regression/inbox-visual-diagnostics.mjs',
  'tests/visual-regression/inbox-visual-contract.json',
  'tests/visual-regression/fixtures/elementor-host-v1.json',
  'tests/visual-regression/references/manifest.json',
  'tests/fixtures/owner-visual/PersianGravity-Visual-Reference-Final.html',
  'tests/fixtures/owner-visual/PersianGravity-Visual-Reference-Final-vNext.html',
  'tests/repro-evidence-lab/browser-tests.mjs',
  'assets/css/srwf-gravity-flow-inbox.css',
  'assets/js/gravity-flow-inbox-manual-refresh.js',
  'tests/fixtures/wu21-packages/manifest.json',
  'gravity-presentation-profiles.php',
]) assert.equal(covered(file), true, `WU21 trigger does not cover owned path: ${file}`);

assert.equal(covered('docs/unrelated-note.md'), false, 'Unrelated documentation unexpectedly triggers WU21.');
const manualRefreshAsset = 'assets/js/gravity-flow-inbox-manual-refresh.js';
const withoutManualRefresh = patterns.filter(pattern => pattern !== manualRefreshAsset);
assert.equal(coveredBy(manualRefreshAsset, withoutManualRefresh), false, 'Removing the explicit Manual Refresh production path must break WU21 trigger coverage.');
const browserEntry = fs.readFileSync('tests/repro-evidence-lab/browser-tests.mjs', 'utf8');
assert.match(browserEntry,/manual-inbox-refresh-browser-test\.mjs/, 'WU21 browser entry must execute the real Manual Refresh browser qualification.');
const visualWorkflowAt = workflow.indexOf('node tests/visual-regression/inbox-visual-diagnostics.mjs');
const deferredP06At = workflow.indexOf('node tests/repro-evidence-lab/p06-inbox-asset-reachability-browser-test.mjs');
const bootstrapAt = browserEntry.indexOf("import('./p06-fixture-bootstrap.mjs')");
const p06QualificationAt = browserEntry.indexOf("import('./p06-inbox-asset-reachability-browser-test.mjs')");
assert.ok(bootstrapAt >= 0 && p06QualificationAt > bootstrapAt, 'Authoritative P06 bootstrap must precede its qualification consumer.');
assert.ok(workflow.includes('GPP_DEFER_P06_QUALIFICATION=1 node tests/repro-evidence-lab/browser-tests.mjs'), 'WU21 must defer the deliberate P06 mutation out of the primary native browser pass.');
const integratedHostAt = workflow.indexOf('- name: Establish pinned Hello Elementor integrated visual host');
assert.ok(deferredP06At >= 0 && integratedHostAt > deferredP06At && visualWorkflowAt > integratedHostAt, 'Deferred P06 qualification must complete before the Elementor visual lane mutates the host runtime.');
console.log(`WU21_TRIGGER_COVERAGE_PASS patterns=${JSON.stringify(patterns)}`);
