import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
const adminPassword = ['wu21', 'bootstrap', 'pass', '2026'].join('-');
const fullProfile = 'srwf.operations.entry-detail.full-width.v1';
const safeProfile = 'srwf.operations.entry-detail.v1';
const humanNote = 'یادداشت آزمایشی WU18 — حسابداری Test A';
const misleadingNote = 'Synthetic Approved. Sent to step: WU18 misleading control.';

if (!artifactDir || !wpPath || !wpCli) throw new Error('WU18 Timeline semantic browser environment is incomplete.');

function wpEval(code) {
  const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], { encoding: 'utf8', env: process.env });
  if (cp.status !== 0) throw new Error(`${cp.stderr}\n${cp.stdout}`);
  return cp.stdout.trim();
}
function facts() {
  return JSON.parse(wpEval(`
    $v=new \\GravityPresentationProfiles\\Core\\Lifecycle\\VisualPackageLifecycle(new \\GravityPresentationProfiles\\Core\\Lifecycle\\WordPressOptionStateStore(\\GravityPresentationProfiles\\Core\\Lifecycle\\VisualPackageLifecycle::OPTION_NAME));
    $b=get_option(\\GravityPresentationProfiles\\Core\\Lifecycle\\BindingSetLifecycle::OPTION_NAME);
    echo wp_json_encode(array('activations'=>$v->snapshot()['activations'],'binding_hash'=>hash('sha256',wp_json_encode($b))),JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
  `));
}
function activeVariant() {
  return JSON.parse(wpEval(`$s=\\GravityPresentationProfiles\\GravityForms\\EntryDetailVisualVariantService::forWordPress();echo wp_json_encode($s->activeFacts(),JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);`));
}
function switchVariant(target) {
  const encoded = Buffer.from(target, 'utf8').toString('base64');
  return JSON.parse(wpEval(`
    $target=base64_decode('${encoded}');$s=\\GravityPresentationProfiles\\GravityForms\\EntryDetailVisualVariantService::forWordPress();$f=$s->activeFacts();
    $r=$s->switchVariant(array('target_variant'=>$target,'expected_current_activation'=>$f['activation']));
    echo wp_json_encode(array('result'=>$r,'active'=>$s->activeFacts()),JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
  `));
}

const manifest = JSON.parse(wpEval('echo wp_json_encode(get_option("gpp_wu18_fixture_manifest"),JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);'));
if (!manifest?.transition?.form_id || !manifest?.transition?.entry_id) throw new Error('WU18 transition fixture unavailable.');
const item = manifest.transition;
const entryUrl = `${baseUrl}/wp-admin/admin.php?page=gravityflow-inbox&view=entry&id=${item.form_id}&lid=${item.entry_id}`;

function noteFacts() {
  return JSON.parse(wpEval(`
    $m=get_option('gpp_wu18_fixture_manifest');$entry=GFAPI::get_entry((int)$m['transition']['entry_id']);$notes=Gravity_Flow_Common::get_timeline_notes($entry);$rows=array();
    foreach($notes as $note){$step=Gravity_Flow_Common::get_timeline_note_step($note);$rows[]=array('id'=>isset($note->id)?(int)$note->id:null,'note_type'=>isset($note->note_type)?(string)$note->note_type:null,'sub_type'=>isset($note->sub_type)?(string)$note->sub_type:null,'user_id'=>isset($note->user_id)?(string)$note->user_id:null,'user_name'=>isset($note->user_name)?(string)$note->user_name:null,'value'=>isset($note->value)?(string)$note->value:null,'properties'=>array_values(array_keys(get_object_vars($note))),'resolved_step'=>is_object($step)?array('id'=>method_exists($step,'get_id')?(int)$step->get_id():null,'type'=>method_exists($step,'get_type')?(string)$step->get_type():null,'name'=>method_exists($step,'get_name')?(string)$step->get_name():null):null);}
    echo wp_json_encode($rows,JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
  `));
}
function sendBackToApproval(addMisleading) {
  const encoded = Buffer.from(misleadingNote, 'utf8').toString('base64');
  return JSON.parse(wpEval(`
    $m=get_option('gpp_wu18_fixture_manifest');$form_id=(int)$m['transition']['form_id'];$entry_id=(int)$m['transition']['entry_id'];$entry=GFAPI::get_entry($entry_id);$api=new Gravity_Flow_API($form_id);$approval_id=0;$approval_name='';
    foreach($api->get_steps() as $step){if(is_object($step)&&method_exists($step,'get_type')&&'approval'===$step->get_type()){$approval_id=(int)$step->get_id();$approval_name=(string)$step->get_name();break;}}
    if($approval_id<1||''===trim($approval_name)) throw new RuntimeException('WU18 approval step unavailable.');
    ${addMisleading ? `gravity_flow()->add_timeline_note($entry_id,base64_decode('${encoded}'));` : ''}
    $result=$api->send_to_step($entry,$approval_id);$fresh=GFAPI::get_entry($entry_id);$current=$api->get_current_step($fresh);
    echo wp_json_encode(array('send_result'=>$result,'approval_step_id'=>$approval_id,'approval_step_name'=>$approval_name,'current_type'=>$current?$current->get_type():null,'current_id'=>$current?(int)$current->get_id():null),JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
  `));
}

async function login(page) {
  await page.goto(`${baseUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', 'bootstrap_admin');
  await page.fill('#user_pass', adminPassword);
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#wp-submit')]);
}
async function gotoProfile(page, viewport, profile) {
  await page.setViewportSize(viewport);
  await page.goto(entryUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector(`.gpp-entry-dossier[data-gpp-entry-detail="ready"][data-gpp-profile-id="${profile}"]`, { timeout: 30000 });
}
const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();

async function inspect(page) {
  return page.evaluate(() => {
    const text = node => node?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const rows = Array.from(document.querySelectorAll('.gravityflow-timeline .gravityflow-note')).map(note => {
      const outer = note.querySelector('.gravityflow-note-body-wrap > .gravityflow-note-body');
      const native = outer?.querySelector(':scope > .gravityflow-note-body') || null;
      const semantic = outer?.querySelector(':scope > .gpp-timeline-event') || null;
      const title = semantic?.querySelector('.gpp-timeline-event__title') || null;
      const subtitle = semantic?.querySelector('.gpp-timeline-event__subtitle') || null;
      const marker = outer ? getComputedStyle(outer, '::after') : null;
      const semanticStyle = semantic ? getComputedStyle(semantic) : null;
      const titleStyle = title ? getComputedStyle(title) : null;
      const nativeStyle = native ? getComputedStyle(native) : null;
      return {native:text(native),native_present:Boolean(native),native_display:nativeStyle?.display||null,family:semantic?.dataset.gppTimelineSemantic||null,evidence:semantic?.dataset.gppTimelineEvidence||null,title:text(title),subtitle:text(subtitle),semantic_background:semanticStyle?.backgroundColor||null,title_text_align:titleStyle?.textAlign||null,marker_background_image:marker?.backgroundImage||null,bdi_count:semantic?.querySelectorAll('bdi').length||0};
    });
    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(link => link.getAttribute('href') || '');
    return {profile:document.querySelector('.gpp-entry-dossier[data-gpp-entry-detail="ready"]')?.dataset.gppProfileId||null,timeline_count:document.querySelectorAll('.gravityflow-timeline').length,rows,semantic_count:document.querySelectorAll('.gravityflow-timeline .gpp-timeline-event').length,timeline_style_loaded:styles.some(href=>href.includes('srwf-gravity-flow-entry-detail-full-width-timeline.css')),viewport_width:document.documentElement.clientWidth,document_scroll_width:document.documentElement.scrollWidth};
  });
}

function assertSemantic(state, serverNotes, label, approvalName) {
  if (state.profile !== fullProfile || state.timeline_count !== 1 || !state.timeline_style_loaded) throw new Error(`${label}: Full Width semantic Timeline not admitted: ${JSON.stringify(state)}`);
  if (state.document_scroll_width > state.viewport_width + 1) throw new Error(`${label}: horizontal overflow ${state.document_scroll_width}/${state.viewport_width}`);
  const domNative = state.rows.map(row => normalize(row.native));
  const serverNative = serverNotes.map(row => normalize(row.value));
  if (JSON.stringify(domNative) !== JSON.stringify(serverNative)) throw new Error(`${label}: native Timeline order/content changed: ${JSON.stringify({domNative,serverNative})}`);
  if (state.rows.some(row => !row.native_present)) throw new Error(`${label}: native event source node missing.`);
  for (const family of ['approval','transition','system']) {
    const row = state.rows.find(item => item.family === family);
    if (!row || !row.title || !row.subtitle) throw new Error(`${label}: semantic ${family} textual cue missing: ${JSON.stringify(state.rows)}`);
    if (family !== 'system' && (!row.marker_background_image || row.marker_background_image === 'none')) throw new Error(`${label}: ${family} marker icon missing.`);
    if (row.title_text_align !== 'right' || row.native_display !== 'none') throw new Error(`${label}: ${family} hierarchy/source visibility mismatch: ${JSON.stringify(row)}`);
  }
  const expectedCompound = normalize(`${approvalName}: Approved.\nNote: ${humanNote}`);
  const approvalWithNote = state.rows.find(row => row.family === 'approval' && normalize(row.native) === expectedCompound);
  if (!approvalWithNote || approvalWithNote.title !== 'پرونده تأیید شد' || approvalWithNote.subtitle !== humanNote || approvalWithNote.semantic_background !== 'rgb(240, 248, 242)' || approvalWithNote.bdi_count < 1) throw new Error(`${label}: compound Approval note presentation mismatch: ${JSON.stringify(approvalWithNote)}`);
  const transition = state.rows.find(row => row.family === 'transition');
  if (transition.title !== 'به مرحله بعد ارسال شد' || transition.semantic_background !== 'rgb(245, 248, 255)' || transition.bdi_count < 1) throw new Error(`${label}: transition hierarchy/bidi mismatch: ${JSON.stringify(transition)}`);
  const system = state.rows.find(row => row.family === 'system');
  if (system.title !== 'جریان کار آغاز شد' || system.semantic_background !== 'rgb(248, 250, 252)') throw new Error(`${label}: system hierarchy/color mismatch: ${JSON.stringify(system)}`);
  const misleading = state.rows.find(row => row.native.includes('WU18 misleading control'));
  if (!misleading || misleading.family !== null || misleading.native_display === 'none') throw new Error(`${label}: misleading keyword note was falsely classified: ${JSON.stringify(misleading)}`);
  if (state.rows.some(row => row.family === 'note')) throw new Error(`${label}: note family fabricated without a separately typed native note event.`);
}

const before = facts();
if (activeVariant().variant !== 'current_safe') throw new Error('Semantic control requires Current / Safe baseline from existing WU18 controls.');
const initialReturn = sendBackToApproval(true);
if (initialReturn.current_type !== 'approval') throw new Error(`Unable to return transition fixture to Approval: ${JSON.stringify(initialReturn)}`);
switchVariant('full_width');
if (activeVariant().variant !== 'full_width') throw new Error('Full Width activation failed for semantic control.');

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
await login(page);
await gotoProfile(page, { width:1600, height:1050 }, fullProfile);
const textarea = page.locator('textarea[name="gravityflow_note"]');
const approve = page.locator('.gravityflow-status-box .gravityflow-action-buttons button[value="approved"]');
if (await textarea.count() !== 1 || await approve.count() !== 1) throw new Error('Native Approval note/action controls unavailable for semantic fixture.');
await textarea.fill(humanNote);
await Promise.all([page.waitForNavigation({ waitUntil:'networkidle' }), approve.click()]);

const finalReturn = sendBackToApproval(false);
if (finalReturn.current_type !== 'approval' || finalReturn.approval_step_name !== initialReturn.approval_step_name) throw new Error(`Unable to restore stable Approval identity: ${JSON.stringify({initialReturn,finalReturn})}`);
const serverNotes = noteFacts();
const expectedCompound = `${finalReturn.approval_step_name}: Approved.\nNote: ${humanNote}`;
const compoundServerNote = serverNotes.find(row => String(row.value || '') === expectedCompound) || null;
if (!compoundServerNote) throw new Error(`Authentic compound Approval + Note grammar missing: ${JSON.stringify({expectedCompound,serverNotes})}`);
if (!serverNotes.some(row => normalize(row.value).includes('WU18 misleading control'))) throw new Error('Misleading native Timeline falsification note missing.');

const states = {};
for (const [name, viewport] of Object.entries({desktop:{width:1600,height:1050},medium:{width:1024,height:900},mobile:{width:390,height:844}})) {
  await gotoProfile(page, viewport, fullProfile);
  states[name] = await inspect(page);
  assertSemantic(states[name], serverNotes, `Full Width ${name}`, finalReturn.approval_step_name);
  await page.screenshot({ path:path.join(artifactDir, `wu18-timeline-semantic-${name}.png`), fullPage:true });
}

const blockedContext = await browser.newContext();
await blockedContext.route('**/*', route => route.request().resourceType() === 'script' ? route.abort() : route.continue());
const blockedPage = await blockedContext.newPage();
await login(blockedPage);
await gotoProfile(blockedPage, {width:1600,height:1050}, fullProfile);
states.js_blocked = await inspect(blockedPage);
assertSemantic(states.js_blocked, serverNotes, 'Full Width JS-blocked', finalReturn.approval_step_name);
await blockedContext.close();

switchVariant('current_safe');
if (activeVariant().variant !== 'current_safe') throw new Error('Current / Safe semantic rollback failed.');
await gotoProfile(page, {width:1600,height:1050}, safeProfile);
states.current_safe = await inspect(page);
if (states.current_safe.semantic_count !== 0 || states.current_safe.timeline_style_loaded) throw new Error(`Semantic Full Width presentation leaked into Current / Safe: ${JSON.stringify(states.current_safe)}`);
const after = facts();
for (const surface of ['gravity_flow.inbox','print.dossier']) if (JSON.stringify(before.activations[surface]) !== JSON.stringify(after.activations[surface])) throw new Error(`${surface} activation changed during semantic control.`);
if (before.binding_hash !== after.binding_hash) throw new Error('EnvironmentBindingSet changed during Timeline semantic control.');

await context.close();
await browser.close();
const humanRow = states.desktop.rows.find(row => row.family === 'approval' && normalize(row.native) === normalize(expectedCompound)) || null;
const evidence = {status:'PASS',enforcement_boundary:'existing WU18 pinned Gravity Flow runtime + native Approval UI + Full Width Playwright control',authentic_event_source:'Gravity_Flow_Common::get_timeline_notes + native Approval action + Gravity_Flow_API::send_to_step',server_notes:serverNotes,full_width:states,human_note_runtime:{native_annotation_observed:Boolean(humanRow),native_annotation_embedded_in_approval_event:true,separate_note_event_proven:false,semantic_family_observed:humanRow?.family||'unknown',owner_facing_subtitle:humanRow?.subtitle||null,structured_metadata:compoundServerNote},approval_proven:states.desktop.rows.some(row=>row.family==='approval'),transition_proven:states.desktop.rows.some(row=>row.family==='transition'),system_proven:states.desktop.rows.some(row=>row.family==='system'),note_family_not_fabricated:!states.desktop.rows.some(row=>row.family==='note'),unknown_keyword_falsification_proven:states.desktop.rows.some(row=>row.native.includes('WU18 misleading control')&&row.family===null),native_order_content_preserved:true,color_not_only_cue_proven:true,bidi_isolation_proven:states.desktop.rows.some(row=>row.family==='transition'&&row.bdi_count>0)&&Boolean(humanRow?.bdi_count),desktop_medium_mobile_proven:true,js_blocked_proven:true,current_safe_isolation_proven:true,lifecycle_preservation_proven:true};
fs.writeFileSync(path.join(artifactDir,'wu18-timeline-semantic-browser.json'),`${JSON.stringify(evidence,null,2)}\n`);
console.log(JSON.stringify(evidence));
