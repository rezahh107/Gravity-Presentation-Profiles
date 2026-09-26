import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assertDesignMapping, compareDesignFacts } from './design-authority-runtime.mjs';
import { assertIntegratedHostIdentity } from './host-runtime-contract.mjs';

const contract=JSON.parse(fs.readFileSync(new URL('./inbox-visual-contract.json',import.meta.url)));
for(const scenario of contract.scenarios) assert.doesNotThrow(()=>assertDesignMapping(scenario,contract.design_comparison_policy));
assert.throws(()=>assertDesignMapping({...contract.scenarios[0],design_authority_surface:'detail-desktop'}),/unknown Inbox design-authority surface/);
assert.throws(()=>assertDesignMapping({...contract.scenarios[0],design_authority_surface:'inbox-mobile'}),/wrong reviewed A\/B surface/);
assert.throws(()=>assertDesignMapping({...contract.scenarios[0],design_authority_action:'invented-state'}),/unavailable design-authority action/);
const hostContract=contract.host_runtime;
const vazir={repository:hostContract.vazir_font.repository,commit:hostContract.vazir_font.commit,plugin_version:hostContract.vazir_font.plugin_version,plugin_file:hostContract.vazir_font.plugin_file,family:hostContract.vazir_font.family,system_vazir_absent:true,plugin_active:true,frontend_enabled:true,selected_weights:Object.keys(hostContract.vazir_font.weights),weights:Object.fromEntries(Object.entries(hostContract.vazir_font.weights).map(([weight,spec])=>[weight,{source_path:spec.source_path,design_alias:spec.design_alias,expected_blob_sha:spec.blob_sha,actual_blob_sha:spec.blob_sha,staged_blob_sha:spec.blob_sha}]))};
const authenticHost={
  classification:'INTEGRATED_SRWF_VISUAL_HOST',
  composition_authority:'VERSIONED_ELEMENTOR_HOST_FIXTURE',
  host_fixture:{...hostContract.fixture,expected_sha256:hostContract.fixture.sha256,actual_sha256:hostContract.fixture.sha256,elementor_export_type:'page',elementor_document_type:'wp-page',page_bindings:{frontend_shortcode:101,frontend_block:102},container_element_id:'7a4c91e2',mount_element_id:'5db3e8f1'},
  page_template:hostContract.page_template,
  elementor_recognized:true,
  srwf_host_companion_active:false,
  srwf_host_companion_registered:false,
  vazir_font:vazir,
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
const registeredCompanion=structuredClone(authenticHost);registeredCompanion.srwf_host_companion_registered=true;
assert.throws(()=>assertIntegratedHostIdentity(registeredCompanion,hostContract),/SRWF-Host-Companion/);
const delta=compareDesignFacts(
  {relationships:{visible_card_count:2,first_card_width:400,cards_per_visual_row:2,horizontal_overflow:0}},
  {relationships:{visible_card_count:2,first_card_width:360,cards_per_visual_row:2,horizontal_overflow:8}},
  contract.design_comparison_policy,
  ['first_card_width','cards_per_visual_row','horizontal_overflow'],
);
assert.equal(delta.deltas.first_card_width.delta,-40);
assert.equal(delta.deltas.horizontal_overflow.delta,8);
assert.equal(delta.evaluation.status,'WARNING');
console.log('INTEGRATED_HOST_DESIGN_FALSIFICATION_PASS mapping_fail_closed=true swapped_surfaces_rejected=true geometry_mutation_detected=true host_identity_mismatch_rejected=true cardinality_explicit=true');
