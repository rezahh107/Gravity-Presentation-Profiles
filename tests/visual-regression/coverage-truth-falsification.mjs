import assert from 'node:assert/strict';
import fs from 'node:fs';
const contract=JSON.parse(fs.readFileSync(new URL('./inbox-visual-contract.json',import.meta.url)));
const zoom=contract.future_scenarios?.true_browser_zoom_200;
assert.equal(zoom?.status,'EXECUTED_PROVEN');
assert.equal(zoom?.matrix,'J');
assert.equal(zoom?.qualification_id,'GPP-INBOX-MATRIX-J-BROWSER-ZOOM-V1');
assert.equal(zoom?.evidence_artifact,'visual-regression-diagnostics/matrix-j-browser-zoom.json');
assert.equal(zoom?.mechanism,'CHROMIUM_EXTENSION_TABS_SET_ZOOM');
for(const scenario of contract.scenarios) {
  assert.equal(scenario.matrix.includes('J'),false,`${scenario.id} falsely reports separate Matrix J browser-zoom qualification as ordinary design-scenario coverage.`);
  assert.equal(scenario.matrix.includes('M'),false,`${scenario.id} falsely reports Manual Refresh M as executed visual coverage.`);
}
const manual=contract.future_scenarios?.manual_refresh;
assert.equal(manual?.matrix,'M');
assert.equal(manual?.status,'MEASURED_BY_WU21_FUNCTIONAL_BROWSER_SUITE');
assert.equal(manual?.visual_design_convergence,'NOT_EXECUTED');
assert.equal(manual?.evidence_id,'WU21-BROWSER-007');
assert.equal(manual?.production_asset,'assets/js/gravity-flow-inbox-manual-refresh.js');
assert.equal(manual?.browser_test,'tests/repro-evidence-lab/manual-inbox-refresh-browser-test.mjs');
console.log('COVERAGE_TRUTH_FALSIFICATION_PASS true_zoom_executed=true matrix_J_separate_qualification=true manual_refresh_functional_only=true matrix_M_not_executed_visual=true');
