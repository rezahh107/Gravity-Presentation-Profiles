import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2];
if (!root || !fs.existsSync(root)) throw new Error('VISUAL_TEST_INFRASTRUCTURE_FAILURE: diagnostic artifact root is missing.');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const manifest = read('manifest.json');
if (manifest.status === 'VISUAL_TEST_INFRASTRUCTURE_FAILURE') {
  const failure = manifest.infrastructure_failure;
  if (!failure?.scenario || !failure?.failed_stage || !failure?.error?.stack) {
    throw new Error('VISUAL_TEST_INFRASTRUCTURE_FAILURE: incomplete failure provenance in visual manifest.');
  }
  const failureFile = path.join(root, failure.scenario, 'infrastructure-failure.json');
  const stateFile = path.join(root, failure.scenario, 'capture-state.json');
  if (!fs.existsSync(failureFile) || !fs.existsSync(stateFile)) {
    throw new Error(`VISUAL_TEST_INFRASTRUCTURE_FAILURE: missing staged failure evidence for ${failure.scenario}.`);
  }
  throw new Error(`VISUAL_TEST_INFRASTRUCTURE_FAILURE: ${failure.scenario} failed at ${failure.failed_stage}: ${failure.error.stack}`);
}
if (!['PREVIEW_DIAGNOSTIC', 'APPROVED_VISUAL_CONTRACT'].includes(manifest.mode) || !Array.isArray(manifest.scenarios) || !manifest.scenarios.length) {
  throw new Error('VISUAL_TEST_INFRASTRUCTURE_FAILURE: invalid visual manifest.');
}
read('changed-files.json');
for (const scenario of manifest.scenarios) {
  for (const file of ['reference.png','actual.png','diff.png','metrics.json','geometry.json','computed-styles.json','dom-summary.json','environment.json']) {
    const target = path.join(root, scenario.id, file);
    if (!fs.existsSync(target) || fs.statSync(target).size === 0) throw new Error(`VISUAL_TEST_INFRASTRUCTURE_FAILURE: missing ${scenario.id}/${file}`);
  }
  const metrics=read(path.join(scenario.id,'metrics.json')); const geometry=read(path.join(scenario.id,'geometry.json'));
  if (typeof metrics.differing_pixel_ratio!=='number' || !Object.hasOwn(geometry.relationships||{},'last_card_to_pager_gap') || typeof geometry.relationships?.visual_vs_native_height_delta!=='number') {
    throw new Error(`VISUAL_TEST_INFRASTRUCTURE_FAILURE: incomplete metrics for ${scenario.id}`);
  }
}
console.log(`VISUAL_DIAGNOSTIC_ARTIFACT_PASS scenarios=${manifest.scenarios.length} status=${manifest.status}`);
