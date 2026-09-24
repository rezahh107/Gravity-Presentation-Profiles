import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { assertIntegratedHostIdentity } from './host-runtime-contract.mjs';

const contract=JSON.parse(fs.readFileSync(new URL('./inbox-visual-contract.json',import.meta.url)));
const fixturePath=contract.host_runtime.fixture.path;
const bytes=fs.readFileSync(fixturePath);
assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),contract.host_runtime.fixture.sha256);
const fixture=JSON.parse(bytes);
for(const field of ['fixture_id','classification','schema_version']) assert.equal(fixture[field],contract.host_runtime.fixture[field]);
assert.equal(fixture.elementor_export?.page_settings?.template,contract.host_runtime.page_template);
assert.equal(fixture.elementor_export?.type,'page');
assert.equal(fixture.elementor_export?.document_type,'wp-page');
assert.equal(fixture.mount?.widget_type,'shortcode');
assert.equal(JSON.stringify(fixture.elementor_export?.content||[]).split(fixture.mount.token).length-1,1,'Fixture must expose exactly one mount token.');
const setup=fs.readFileSync('tests/repro-evidence-lab/setup-elementor-visual-host.php','utf8');
assert.equal(setup.includes("'widgetType' => 'shortcode'"),false,'Setup PHP must not recreate Elementor composition manually.');
assert.equal(setup.includes("'elType'   => 'container'"),false,'Setup PHP must not recreate Elementor composition manually.');
assert.match(setup,/array_keys\( get_plugins\(\) \)/,'Setup must reject Host Companion registration through the WordPress plugin registry.');

const h=contract.host_runtime;
const packages={
 hello_elementor:{version:h.hello_elementor.version,commit:h.hello_elementor.commit,expected_package_sha256:h.hello_elementor.sha256,actual_package_sha256:h.hello_elementor.sha256},
 elementor:{version:h.elementor.version,expected_package_sha256:h.elementor.sha256,actual_package_sha256:h.elementor.sha256},
 elementor_pro:{version:h.elementor_pro.version,classification:h.elementor_pro.classification,expected_package_sha256:h.elementor_pro.sha256,actual_package_sha256:h.elementor_pro.sha256},
};
const vazir={repository:h.vazir_font.repository,commit:h.vazir_font.commit,plugin_version:h.vazir_font.plugin_version,plugin_file:h.vazir_font.plugin_file,family:h.vazir_font.family,system_vazir_absent:true,plugin_active:true,frontend_enabled:true,selected_weights:Object.keys(h.vazir_font.weights),weights:Object.fromEntries(Object.entries(h.vazir_font.weights).map(([weight,spec])=>[weight,{source_path:spec.source_path,design_alias:spec.design_alias,expected_blob_sha:spec.blob_sha,actual_blob_sha:spec.blob_sha,staged_blob_sha:spec.blob_sha}]))};
const synthetic={classification:'INTEGRATED_SRWF_VISUAL_HOST',page_template:h.page_template,elementor_recognized:true,srwf_host_companion_active:false,srwf_host_companion_registered:false,vazir_font:vazir,...packages};
assert.throws(()=>assertIntegratedHostIdentity(synthetic,h),/bypassed the versioned Elementor fixture authority|fixture identity is unavailable/);
const fixtureContainer=fixture.elementor_export.content[0];
const fixtureMount=fixtureContainer.elements[0];
const admitted={...synthetic,composition_authority:'VERSIONED_ELEMENTOR_HOST_FIXTURE',host_fixture:{...h.fixture,expected_sha256:h.fixture.sha256,actual_sha256:h.fixture.sha256,elementor_export_type:'page',elementor_document_type:'wp-page',page_bindings:{frontend_shortcode:1,frontend_block:2},container_element_id:fixtureContainer.id,mount_element_id:fixtureMount.id}};
assert.doesNotThrow(()=>assertIntegratedHostIdentity(admitted,h));
const wrongFixtureHash={...admitted,host_fixture:{...admitted.host_fixture,actual_sha256:'0'.repeat(64)}};
assert.throws(()=>assertIntegratedHostIdentity(wrongFixtureHash,h),/fixture SHA-256 mismatch/);
const companion={...admitted,srwf_host_companion_active:true};
assert.throws(()=>assertIntegratedHostIdentity(companion,h),/SRWF-Host-Companion/);
const registeredCompanion={...admitted,srwf_host_companion_registered:true};
assert.throws(()=>assertIntegratedHostIdentity(registeredCompanion,h),/SRWF-Host-Companion/);
const missingMountIdentity={...admitted,host_fixture:{...admitted.host_fixture,mount_element_id:null}};
assert.throws(()=>assertIntegratedHostIdentity(missingMountIdentity,h),/designated container\/mount identities/);
console.log('HOST_FIXTURE_FALSIFICATION_PASS synthetic_bypass_rejected=true admitted_fixture=true fixture_hash_mismatch_rejected=true designated_mount_identity_required=true companion_active_rejected=true companion_registered_rejected=true');
