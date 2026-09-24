import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assertDesignMapping, compareDesignFacts } from './design-authority-runtime.mjs';
import { assertIntegratedHostIdentity } from './host-runtime-contract.mjs';

const contract=JSON.parse(fs.readFileSync(new URL('./inbox-visual-contract.json',import.meta.url)));
for(const scenario of contract.scenarios) assert.doesNotThrow(()=>assertDesignMapping(scenario));
assert.throws(()=>assertDesignMapping({...contract.scenarios[0],design_authority_surface:'detail-desktop'}),/unknown Inbox design-authority surface/);
assert.throws(()=>assertDesignMapping({...contract.scenarios[0],design_authority_surface:'inbox-mobile'}),/wrong reviewed A\/B surface/);
assert.throws(()=>assertDesignMapping({...contract.scenarios[0],design_authority_action:'invented-state'}),/unavailable design-authority action/);
const hostContract=contract.host_runtime;
const authenticHost={
  classification:'INTEGRATED_SRWF_VISUAL_HOST',
  page_template:hostContract.page_template,
  elementor_recognized:true,
  srwf_host_companion_active:false,
  hello_elementor:{version:hostContract.hello_elementor.version,commit:hostContract.hello_elementor.commit,expected_package_sha256:hostContract.hello_elementor.sha256,actual_package_sha256:hostContract.hello_elementor.sha256},
  elementor:{version:hostContract.elementor.version,expected_package_sha256:hostContract.elementor.sha256,actual_package_sha256:hostContract.elementor.sha256},
  elementor_pro:{version:hostContract.elementor_pro.version,classification:hostContract.elementor_pro.classification,expected_package_sha256:hostContract.elementor_pro.sha256,actual_package_sha256:hostContract.elementor_pro.sha256},
};
assert.doesNotThrow(()=>assertIntegratedHostIdentity(authenticHost,hostContract));
const wrongHash=structuredClone(authenticHost);wrongHash.elementor.actual_package_sha256='0'.repeat(64);
assert.throws(()=>assertIntegratedHostIdentity(wrongHash,hostContract),/Elementor SHA-256/);
const wrongPro=structuredClone(authenticHost);wrongPro.elementor_pro.version='0.0.0';
assert.throws(()=>assertIntegratedHostIdentity(wrongPro,hostContract),/Elementor Pro version/);
const wrongTemplate=structuredClone(authenticHost);wrongTemplate.page_template='elementor_canvas';
assert.throws(()=>assertIntegratedHostIdentity(wrongTemplate,hostContract),/page template/);
const companion=structuredClone(authenticHost);companion.srwf_host_companion_active=true;
assert.throws(()=>assertIntegratedHostIdentity(companion,hostContract),/SRWF-Host-Companion/);
const delta=compareDesignFacts({relationships:{first_card_width:400,cards_per_visual_row:2,horizontal_overflow:0}},{relationships:{first_card_width:360,cards_per_visual_row:2,horizontal_overflow:8}});
assert.equal(delta.deltas.first_card_width.delta,-40);
assert.equal(delta.deltas.horizontal_overflow.delta,8);
console.log('INTEGRATED_HOST_DESIGN_FALSIFICATION_PASS mapping_fail_closed=true swapped_surfaces_rejected=true geometry_mutation_detected=true host_identity_mismatch_rejected=true');
