import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { finalizeSaveProgressQualification } from './srwf-journey-save-progress-finalization.mjs';

const env = process.env;
const artifactDir = env.WU21_ARTIFACT_DIR;
if (!artifactDir || !env.WU21_WP_CLI || !env.WU21_WP_PATH) throw new Error('Pinned environment missing');
const artifactPath = artifactDir + '/srwf-pr149-save-progress-browser.json';
const source = JSON.parse(fs.readFileSync(artifactDir + '/srwf-pr149-save-progress-source.json', 'utf8'));
const expectedSourceHash = '0b69b2c11b9fb9b3c120388ef9a20f4117b533f9eeeaa70886e2a1ddb7271146';
if (source.gravity_flow_version !== '3.1.0' || source.files['includes/steps/class-step-user-input.php']?.sha256 !== expectedSourceHash) {
  throw new Error('Exact Gravity Flow 3.1.0 host source provenance mismatch');
}
const sourceLines = source.files['includes/steps/class-step-user-input.php'].matches
  .flatMap(match => match.context.map(line => line.source));
if (!sourceLines.some(line => line.includes("'name'          => 'default_status'"))
    || !sourceLines.some(line => line.includes("'value' => 'submit_buttons'"))
    || !sourceLines.some(line => line.includes('id="gravityflow_save_progress_button"'))
    || !sourceLines.some(line => line.includes('id="gravityflow_submit_button"'))) {
  throw new Error('Pinned source does not support requested native Submit buttons configuration');
}

function wpEval(code) {
  const proc = spawnSync('php', [env.WU21_WP_CLI, '--path=' + env.WU21_WP_PATH, 'eval', code], { encoding: 'utf8', env });
  if (proc.status !== 0) throw new Error('WP-CLI: ' + proc.stderr + ' ' + proc.stdout);
  return proc.stdout.trim();
}
const manifest = JSON.parse(wpEval('echo wp_json_encode(get_option("gpp_srwf_journey_host_manifest"));'));
const formId = Number(manifest.form_id);
const correctionId = Number(manifest.steps.correction_id);
const reviewId = Number(manifest.steps.review_id);
const operatorId = Number(manifest.users.operator.id);
const report = {
  target_pr: 149,
  reviewed_production_head: 'c2689d1b8d4f64b6e6bc34f17f8e7e41f065c339',
  source_sha256: expectedSourceHash,
  wordpress: wpEval('echo get_bloginfo("version");'),
  gravity_flow: source.gravity_flow_version,
  gravity_forms: wpEval('echo GFForms::$version;'),
  theme: wpEval('echo get_stylesheet();'),
  playwright: '1.55.0',
  setting: 'default_status=submit_buttons',
  assertions: [],
  measurements: [],
  status: 'NOT_PROVEN',
};
const assert = (ok, name, info = {}) => {
  report.assertions.push({ name, result: ok ? 'PASS' : 'FAIL', ...info });
  if (!ok) throw new Error('Assertion failed: ' + name + ' ' + JSON.stringify(info));
};
function state(entryId) {
  return JSON.parse(wpEval(
    'wp_set_current_user(' + operatorId + ');' +
    '$entry=GFAPI::get_entry(' + entryId + ');' +
    '$api=new Gravity_Flow_API(' + formId + ');' +
    '$step=$api->get_current_step($entry);' +
    'echo wp_json_encode(array("field_1"=>(string)rgar($entry,"1"),"current_step_id"=>$step?(int)$step->get_id():null,' +
      '"current_step_type"=>$step?(string)$step->get_type():null,"api_status"=>(string)$api->get_status($entry),' +
      '"final_status"=>(string)gform_get_meta((int)$entry["id"],"workflow_final_status")));'
  ));
}
function route(entryId) {
  const url = new URL(manifest.routes.shortcode.url);
  url.searchParams.set('view', 'entry'); url.searchParams.set('id', String(formId));
  url.searchParams.set('lid', String(entryId)); return url.toString();
}
function makeEntry(label) {
  const output = wpEval(
    'wp_set_current_user(' + operatorId + ');' +
    '$id=GFAPI::add_entry(array("form_id"=>' + formId + ',"created_by"=>' + operatorId + ',"1"=>"PR149-' + label + '"));' +
    'if(is_wp_error($id)||!$id)throw new RuntimeException("Unable to create entry");' +
    '$api=new Gravity_Flow_API(' + formId + ');$api->process_workflow((int)$id);' +
    '$entry=GFAPI::get_entry((int)$id);$sent=$api->send_to_step($entry,' + reviewId + ');' +
    'if(false===$sent||is_wp_error($sent))throw new RuntimeException("Cannot seed review"); echo (int)$id;'
  );
  if (!Number.isInteger(Number(output)) || Number(output) <= 0) throw new Error('Bad entry ID');
  return Number(output);
}
function setSetting(value) {
  const code =
    '$id=' + correctionId + ';$fid=' + formId + ';' +
    '$feed=GFAPI::get_feed($id);' +
    'if(is_wp_error($feed)||!is_array($feed)||!is_array($feed["meta"]))throw new RuntimeException("Native feed absent");' +
    'update_option("gpp_pr149_native_save_original_feed_meta",$feed["meta"],false);' +
    '$backup=get_option("gpp_pr149_native_save_original_feed_meta",null);' +
    'if(!is_array($backup)||serialize($backup)!==serialize($feed["meta"]))throw new RuntimeException("Original native feed recovery checkpoint unverified");' +
    '$meta=$feed["meta"];$meta["default_status"]=' + JSON.stringify(value) + ';' +
    '$ok=GFAPI::update_feed($id,$meta,$fid);' +
    'if(is_wp_error($ok)||!$ok)throw new RuntimeException("Native feed update failed");' +
    '$after=GFAPI::get_feed($id);echo wp_json_encode(array("setting"=>rgar($after["meta"],"default_status"),' +
    '"assignees"=>rgar($after["meta"],"assignees"),"editable_fields"=>rgar($after["meta"],"editable_fields")));';
  return JSON.parse(wpEval(code));
}
async function auth(context) {
  const cookies = JSON.parse(wpEval(
    '$t=time()+3600;echo wp_json_encode(array(' +
    'array("name"=>AUTH_COOKIE,"value"=>wp_generate_auth_cookie(' + operatorId + ',$t,"auth"),"expires"=>$t),' +
    'array("name"=>LOGGED_IN_COOKIE,"value"=>wp_generate_auth_cookie(' + operatorId + ',$t,"logged_in"),"expires"=>$t)));'
  ));
  await context.addCookies(cookies.map(x => ({
    name: x.name, value: x.value, domain: '127.0.0.1', path: '/', expires: Number(x.expires),
    httpOnly: true, secure: false, sameSite: 'Lax'
  })));
}
async function nativeControls(page) {
  return page.evaluate(() => {
    const form = document.querySelector('.gravityflow_workflow_detail form');
    const details = id => {
      const el = document.getElementById(id);
      if (!el) return null;
      return { id: el.id, type: el.type, name: el.name, value: el.value, className: el.className,
        onclick: el.getAttribute('onclick'), tabIndex: el.tabIndex, formId: el.form?.id,
        formMethod: el.form?.method, formAction: el.form?.getAttribute('action'),
        isConnected: el.isConnected, nativeDisabled: el.disabled };
    };
    return { save: details('gravityflow_save_progress_button'), complete: details('gravityflow_submit_button'),
      update: details('gravityflow_update_button'), correctionMarker: !!form?.querySelector('[data-gpp-entry-journey="correction"]'),
      statusInput: document.getElementById('gravityflow_status_hidden')?.value || null,
      formMethod: form?.method || null };
  });
}
async function css(page, id) {
  return page.locator('#' + id).evaluate(el => {
    const s = getComputedStyle(el), box = el.getBoundingClientRect();
    return { display: s.display, background: s.backgroundColor, color: s.color, borderColor: s.borderTopColor,
      opacity: s.opacity, cursor: s.cursor, outline: s.outlineStyle, outlineWidth: s.outlineWidth,
      outlineColor: s.outlineColor, height: box.height, width: box.width, left: box.left, right: box.right,
      bottom: box.bottom, disabled: el.disabled, ariaDisabled: el.getAttribute('aria-disabled'),
      ariaBusy: el.getAttribute('aria-busy'), focused: document.activeElement === el };
  });
}
async function keyboardFocus(page, id) {
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  for (let i = 0; i < 100; i++) {
    await page.keyboard.press('Tab');
    if (await page.locator('#' + id).evaluate(el => document.activeElement === el)) return i + 1;
  }
  throw new Error('Native button not reachable by Tab: ' + id);
}
let browser, context, page, originalMeta;
let mutationMayHaveOccurred = false;
let assertionsPassed = false;
try {
  originalMeta = JSON.parse(wpEval('$f=GFAPI::get_feed(' + correctionId + ');echo wp_json_encode($f["meta"]);'));
  assert(originalMeta.default_status === 'hidden', 'default_fixture_setting_is_disabled', { value: originalMeta.default_status });
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  context.setDefaultTimeout(14000);
  context.setDefaultNavigationTimeout(20000);
  await auth(context); page = await context.newPage();

  const reviewEntry = makeEntry('REVIEW-NEGATIVE');
  await page.goto(route(reviewEntry), { waitUntil: 'networkidle' });
  const baseline = await nativeControls(page);
  assert(!baseline.save && !baseline.complete && !baseline.correctionMarker, 'review_baseline_has_no_save_controls', { baseline });

  // Never overwrite a retained recovery source from an earlier failed run.
  // The mutation flag is set BEFORE the cross-process operation: WP-CLI may
  // mutate the feed before failing or returning malformed output.
  if (wpEval('echo get_option("gpp_pr149_native_save_original_feed_meta",null)===null?"ABSENT":"PRESENT";') !== 'ABSENT') {
    throw new Error('Unresolved native feed recovery metadata already exists; refusing another mutation.');
  }
  mutationMayHaveOccurred = true;
  const setting = setSetting('submit_buttons');
  assert(setting.setting === 'submit_buttons', 'persisted_host_setting_readback', { setting });
  assert(JSON.stringify(setting.assignees) === JSON.stringify(originalMeta.assignees), 'host_assignees_unchanged');
  const entry = makeEntry('SAVE-AND-COMPLETE');
  await page.goto(route(entry), { waitUntil: 'networkidle' });
  let dialogSeen = false;
  page.once('dialog', async d => { dialogSeen = true; await d.accept(); });
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }), page.locator('.gravityflow-status-box button[value="revert"]').first().click()]);
  const before = state(entry);
  const controls = await nativeControls(page);
  report.host_controls = controls;
  assert(dialogSeen && before.current_step_id === correctionId && before.current_step_type === 'user_input',
    'native_review_revert_admits_same_operator_correction', { before, dialogSeen });
  assert(controls.correctionMarker && controls.save?.name === 'in_progress' && controls.save?.type === 'submit'
    && controls.complete?.name === 'save' && controls.complete?.type === 'submit' && !controls.update
    && controls.statusInput === 'complete', 'native_host_emits_real_two_button_variant', { controls });
  assert(controls.save.onclick?.includes("val('in_progress')") && controls.complete.onclick?.includes("val('complete')")
    && controls.save.onclick?.includes("jQuery('#action').val('update')")
    && controls.complete.onclick?.includes("jQuery('#action').val('update')"),
    'native_transport_targets_remain_distinct', { save: controls.save.onclick, complete: controls.complete.onclick });

  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.mouse.move(0, 0);
    const idle = await css(page, 'gravityflow_save_progress_button');
    const primary = await css(page, 'gravityflow_submit_button');
    await page.locator('#gravityflow_save_progress_button').hover();
    await page.waitForTimeout(220);
    const hover = await css(page, 'gravityflow_save_progress_button');
    await page.mouse.move(0, 0);
    await page.locator('#gravityflow_save_progress_button').evaluate(el => { el.disabled = true; });
    const disabled = await css(page, 'gravityflow_save_progress_button');
    await page.locator('#gravityflow_save_progress_button').evaluate(el => { el.disabled = false; el.setAttribute('aria-disabled', 'true'); });
    const ariaDisabled = await css(page, 'gravityflow_save_progress_button');
    await page.locator('#gravityflow_save_progress_button').evaluate(el => { el.removeAttribute('aria-disabled'); el.setAttribute('aria-busy', 'true'); });
    const ariaBusy = await css(page, 'gravityflow_save_progress_button');
    await page.locator('#gravityflow_save_progress_button').evaluate(el => { el.removeAttribute('aria-busy'); });
    const tabs = await keyboardFocus(page, 'gravityflow_save_progress_button');
    const focus = await css(page, 'gravityflow_save_progress_button');
    const fullOverflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    const evidence = { width, idle, primary, hover, disabled, ariaDisabled, ariaBusy, focus, keyboardTabs: tabs, overflow: fullOverflow };
    report.measurements.push(evidence);
    assert(idle.background === 'rgb(248, 250, 254)' && idle.color === 'rgb(29, 78, 216)'
      && hover.background === 'rgb(240, 246, 255)' && hover.color === 'rgb(30, 64, 175)'
      && disabled.opacity === '0.65' && ariaDisabled.opacity === '0.65' && ariaBusy.opacity === '0.65'
      && focus.focused && focus.outline === 'solid' && parseFloat(focus.outlineWidth) >= 3
      && primary.background === 'rgb(29, 78, 216)' && primary.color === 'rgb(255, 255, 255)'
      && idle.height >= 44 && primary.height >= 44 && idle.left >= -1 && idle.right <= width + 1
      && primary.left >= -1 && primary.right <= width + 1 && fullOverflow <= (width <= 390 ? 1 : 32),
      'native_save_secondary_paint_and_responsiveness_' + width, evidence);
    await page.screenshot({ path: artifactDir + '/srwf-pr149-native-save-' + width + '.png', fullPage: true });
  }

  const controlsAfterPaint = await nativeControls(page);
  assert(JSON.stringify(controlsAfterPaint) === JSON.stringify(controls),
    'CSS_state_checks_did_not_change_native_control_transport', { controls, controlsAfterPaint });

  await page.locator('input[name="input_1"]').first().fill('PR149-SAVED-NATIVE');
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }), page.locator('#gravityflow_save_progress_button').click()]);
  const saved = state(entry);
  report.after_save = saved;
  assert(saved.field_1 === 'PR149-SAVED-NATIVE' && saved.current_step_id === correctionId
    && saved.current_step_type === 'user_input',
    'native_save_persists_value_without_completing_workflow', { saved });

  await page.goto(route(entry), { waitUntil: 'networkidle' });
  const afterSaveControls = await nativeControls(page);
  assert(afterSaveControls.save?.id === controls.save.id && afterSaveControls.complete?.id === controls.complete.id
    && afterSaveControls.save.onclick === controls.save.onclick && afterSaveControls.complete.onclick === controls.complete.onclick,
    'both_native_controls_persist_after_save', { afterSaveControls });

  const input = page.locator('input[name="input_1"]').first();
  await input.fill('PR149-COMPLETED-NATIVE');
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }), page.locator('#gravityflow_submit_button').click()]);
  const completed = state(entry);
  report.after_complete = completed;
  assert(completed.field_1 === 'PR149-COMPLETED-NATIVE' && completed.current_step_id === reviewId
    && completed.current_step_type === 'approval',
    'native_complete_transitions_to_review', { completed });

  await page.goto(route(reviewEntry), { waitUntil: 'networkidle' });
  const reviewAfter = await nativeControls(page);
  assert(!reviewAfter.save && !reviewAfter.complete && !reviewAfter.correctionMarker,
    'save_visual_rules_do_not_admit_review', { reviewAfter });

  await page.goto(manifest.routes.shortcode.url, { waitUntil: 'networkidle' });
  const inbox = await page.evaluate(() => ({
    correctionMarkers: document.querySelectorAll('[data-gpp-entry-journey="correction"]').length,
    saveButtons: document.querySelectorAll('#gravityflow_save_progress_button').length,
    scopedSaveRulesMatching: document.querySelectorAll('.gravityflow_workflow_detail form:has(.gpp-entry-journey--correction[data-gpp-entry-journey="correction"]) #gravityflow_save_progress_button').length,
  }));
  assert(inbox.correctionMarkers === 0 && inbox.scopedSaveRulesMatching === 0,
    'save_styles_do_not_leak_into_inbox', { inbox });

  const statusUrl = manifest.routes.status_shortcode?.url;
  if (typeof statusUrl !== 'string' || !statusUrl) throw new Error('Native Status negative route missing');
  await page.goto(statusUrl, { waitUntil: 'networkidle' });
  const statusMarkerCount = await page.locator('[data-gpp-entry-journey="correction"]').count();
  assert(statusMarkerCount === 0, 'save_styles_do_not_leak_into_status_shortcode', { statusMarkerCount });

  const unauthorizedEntry = makeEntry('UNAUTHORIZED-SAVE');
  await page.goto(route(unauthorizedEntry), { waitUntil: 'networkidle' });
  page.once('dialog', async d => { await d.accept(); });
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }), page.locator('.gravityflow-status-box button[value="revert"]').first().click()]);
  const authCorrection = await nativeControls(page);
  assert(authCorrection.save?.id === 'gravityflow_save_progress_button', 'authorized_correction_save_exists_for_negative_control');

  const anonymous = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const guest = await anonymous.newPage();
  await guest.goto(route(unauthorizedEntry), { waitUntil: 'networkidle' });
  const guestControls = await guest.locator('#gravityflow_save_progress_button:visible,#gravityflow_submit_button:visible').count();
  assert(guestControls === 0, 'unauthenticated_operator_cannot_use_native_save', { guestControls });
  await anonymous.close();

  report.observed_native_labels = { save: controls.save.value, complete: controls.complete.value };
  assertionsPassed = true;
} catch (error) {
  report.error = String(error?.stack || error).slice(0, 20000);
} finally {
  const finalized = await finalizeSaveProgressQualification({
    assertionsPassed,
    mutationMayHaveOccurred,
    originalMeta,
    restore: () => {
      const response = wpEval(
        '$meta=get_option("gpp_pr149_native_save_original_feed_meta",null);' +
        'if(!is_array($meta))throw new RuntimeException("Original feed recovery source unavailable");' +
        '$result=GFAPI::update_feed(' + correctionId + ',$meta,' + formId + ');' +
        'if(is_wp_error($result))throw new RuntimeException("Native restore WP_Error: ".$result->get_error_message());' +
        'echo $result?"true":"false";'
      );
      return response === 'true';
    },
    readback: () => JSON.parse(wpEval(
      '$feed=GFAPI::get_feed(' + correctionId + ');' +
      'if(is_wp_error($feed)||!is_array($feed)||!is_array($feed["meta"]))throw new RuntimeException("Native feed readback unavailable");' +
      'echo wp_json_encode($feed["meta"],JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);'
    )),
    clearRecovery: () => {
      const response = wpEval(
        'echo delete_option("gpp_pr149_native_save_original_feed_meta")?"true":"false";'
      );
      return response === 'true';
    },
  });
  report.status = finalized.status;
  report.restoration = finalized.restoration;
  report.provisional_assertions_passed = assertionsPassed;

  for (const [label, resource] of [['context', context], ['browser', browser]]) {
    if (!resource) continue;
    try {
      await resource.close();
    } catch (error) {
      report.cleanup_diagnostics ??= [];
      report.cleanup_diagnostics.push({ resource: label, error: String(error) });
      report.status = 'NOT_PROVEN';
    }
  }
  fs.writeFileSync(artifactPath, JSON.stringify(report, null, 2));
  console.log('PR149_NATIVE_SAVE_PROGRESS_QUALIFICATION ' + report.status + ' ' + JSON.stringify({
    error: report.error, assertions: report.assertions.length,
    restoration: report.restoration, labels: report.observed_native_labels,
  }));
}
if (report.status !== 'VERIFIED') process.exit(1);
