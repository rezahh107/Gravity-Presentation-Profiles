import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;

function wpEval(code) {
  const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], { encoding: 'utf8', env: process.env });
  if (cp.status !== 0) throw new Error(`${cp.stderr}\n${cp.stdout}`);
  return cp.stdout.trim();
}

async function login(page) {
  await page.goto(`${baseUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', 'bootstrap_admin');
  await page.fill('#user_pass', 'wu21-bootstrap-pass-2026');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.click('#wp-submit'),
  ]);
}

function mappingFacts(formId) {
  const php = '$facts=\\GravityPresentationProfiles\\GravityForms\\EntryDetailMappingService::forWordPress()->workflowFacts();'
    + '$out=null;foreach($facts["contexts"] as $c){if((int)$c["form_id"]===' + Number(formId) + '){$rows=array();foreach($c["rows"] as $r){$rows[$r["semantic_slot_key"]]=array("source_ref"=>$r["source_ref"],"source_validity"=>$r["source_validity"]);}$out=array("binding_set_id"=>$c["binding_set_id"],"binding_set_version"=>$c["binding_set_version"],"rows"=>$rows);break;}}'
    + 'echo wp_json_encode($out,JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);';
  return JSON.parse(wpEval(php));
}

function addCompoundField(formId) {
  const php = '$form=GFAPI::get_form(' + Number(formId) + ');if(!is_array($form)){throw new RuntimeException("form missing");}'
    + '$max=0;foreach($form["fields"] as $f){$max=max($max,(int)$f->id);}$id=$max+1;'
    + '$form["fields"][]=GF_Fields::create(array("id"=>$id,"label"=>"WU18 Mapping Compound","type"=>"name","inputs"=>array(array("id"=>$id.".3","label"=>"Given"),array("id"=>$id.".6","label"=>"Family"))));'
    + '$r=GFAPI::update_form($form);if(is_wp_error($r)){throw new RuntimeException($r->get_error_message());}echo $id.".3";';
  return wpEval(php);
}

function refreshManifestBindingHash() {
  const php = '$state=get_option(\\GravityPresentationProfiles\\Core\\Lifecycle\\BindingSetLifecycle::OPTION_NAME);'
    + '$hash=hash("sha256",wp_json_encode($state));$m=get_option("gpp_wu18_fixture_manifest");'
    + 'if(!is_array($m)){throw new RuntimeException("manifest missing");}$m["binding_state_sha256"]=$hash;update_option("gpp_wu18_fixture_manifest",$m,false);echo $hash;';
  return wpEval(php);
}

const manifest = JSON.parse(wpEval('echo wp_json_encode(get_option("gpp_wu18_fixture_manifest"),JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);'));
const formId = Number(manifest.alpha.form_id);
const compoundInput = addCompoundField(formId);
const settingsUrl = `${baseUrl}/wp-admin/admin.php?page=gf_settings&subview=gravity-presentation-profiles`;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
await login(page);
await page.goto(settingsUrl, { waitUntil: 'networkidle' });

const contextSection = page.locator('[data-gpp-entry-detail-mapping-context]').filter({ hasText: `Form ${formId}` }).first();
if (await contextSection.count() !== 1) throw new Error('Real Entry Detail mapping panel/context is not reachable on GF Plugin Settings.');
const nestedForms = await contextSection.locator('form').count();
if (nestedForms !== 0) throw new Error('Entry Detail mapping panel created an invalid nested form.');

const stalePage = await context.newPage();
await stalePage.goto(settingsUrl, { waitUntil: 'networkidle' });
const staleSection = stalePage.locator('[data-gpp-entry-detail-mapping-context]').filter({ hasText: `Form ${formId}` }).first();
if (await staleSection.count() !== 1) throw new Error('Unable to capture stale mapping page for CAS control.');

const before = mappingFacts(formId);
const homeSelect = contextSection.locator('[data-gpp-entry-detail-semantic="student.home_phone"] select');
const motherSelect = contextSection.locator('[data-gpp-entry-detail-semantic="student.mother_mobile"] select');
if (await homeSelect.count() !== 1 || await motherSelect.count() !== 1) throw new Error('Expected direct-field mapping rows are unavailable.');

const fatherField = String(manifest.alpha.fields['student.father_mobile']);
await homeSelect.selectOption(compoundInput);
await motherSelect.selectOption(fatherField);

const saveButton = contextSection.locator('[data-gpp-entry-detail-mapping-submit]');
if (await saveButton.count() !== 1) throw new Error('Entry Detail batch mapping save control is unavailable.');
await Promise.all([
  page.waitForNavigation({ waitUntil: 'networkidle' }),
  saveButton.click(),
]);
if (!page.url().includes('gpp_entry_detail_mapping_result=updated')) throw new Error(`Changed batch save did not report authoritative update: ${page.url()}`);

const after = mappingFacts(formId);
if (after.binding_set_id !== before.binding_set_id || after.binding_set_version === before.binding_set_version) {
  throw new Error(`Batch mapping did not activate exactly the same binding identity at a next version: ${JSON.stringify({ before, after })}`);
}
if (String(after.rows['student.home_phone']?.source_ref?.field_id) !== compoundInput) throw new Error('Compound input identity did not survive real batch POST.');
if (String(after.rows['student.mother_mobile']?.source_ref?.field_id) !== fatherField) throw new Error('Second changed mapping did not survive the same real batch POST.');

await page.goto(settingsUrl, { waitUntil: 'networkidle' });
const noChangeSection = page.locator('[data-gpp-entry-detail-mapping-context]').filter({ hasText: `Form ${formId}` }).first();
const noChangeButton = noChangeSection.locator('[data-gpp-entry-detail-mapping-submit]');
await Promise.all([
  page.waitForNavigation({ waitUntil: 'networkidle' }),
  noChangeButton.click(),
]);
if (!page.url().includes('gpp_entry_detail_mapping_result=unchanged')) throw new Error(`No-change save created unexpected churn: ${page.url()}`);
const noChange = mappingFacts(formId);
if (noChange.binding_set_version !== after.binding_set_version) throw new Error('No-change real batch POST created a new binding version.');

const staleHome = staleSection.locator('[data-gpp-entry-detail-semantic="student.home_phone"] select');
await staleHome.selectOption(String(manifest.alpha.fields['student.mobile']));
const staleButton = staleSection.locator('[data-gpp-entry-detail-mapping-submit]');
const responsePromise = stalePage.waitForNavigation({ waitUntil: 'domcontentloaded' });
await staleButton.click();
const staleResponse = await responsePromise;
const staleStatus = staleResponse?.status() || 0;
const staleText = (await stalePage.locator('body').innerText()).replace(/\s+/g, ' ').trim();
if (staleStatus !== 409 || !/changed after this page loaded|Reload before saving mappings|Refresh/i.test(staleText)) {
  throw new Error(`Stale real mapping POST did not fail safely: ${JSON.stringify({ staleStatus, staleText: staleText.slice(0, 500) })}`);
}
const afterStale = mappingFacts(formId);
if (afterStale.binding_set_version !== after.binding_set_version || String(afterStale.rows['student.home_phone']?.source_ref?.field_id) !== compoundInput) {
  throw new Error('Stale mapping POST changed authoritative binding state.');
}

const bindingStateHashAfter = refreshManifestBindingHash();
await browser.close();

process.stdout.write(JSON.stringify({
  plugin_settings_panel_reached: true,
  nested_forms: 0,
  changed_batch: {
    before_version: before.binding_set_version,
    after_version: after.binding_set_version,
    same_binding_set_id: after.binding_set_id === before.binding_set_id,
    compound_input: compoundInput,
    second_mapping_field: fatherField,
  },
  no_change_version: noChange.binding_set_version,
  stale_post_http_status: staleStatus,
  stale_post_preserved_version: afterStale.binding_set_version,
  binding_state_sha256_after: bindingStateHashAfter,
}) + '\n');
