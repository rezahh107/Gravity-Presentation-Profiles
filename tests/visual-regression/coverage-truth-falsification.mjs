import assert from 'node:assert/strict';
import fs from 'node:fs';
const contract=JSON.parse(fs.readFileSync(new URL('./inbox-visual-contract.json',import.meta.url)));
const zoom=contract.future_scenarios?.true_browser_zoom_200;
assert.match(zoom?.status||'',/NOT_EXECUTED/);
assert.equal(zoom?.matrix,'J');
for(const scenario of contract.scenarios) assert.equal(scenario.matrix.includes('J'),false,`${scenario.id} falsely reports J as executed coverage.`);
console.log('COVERAGE_TRUTH_FALSIFICATION_PASS true_zoom_deferred=true matrix_J_not_executed=true');
