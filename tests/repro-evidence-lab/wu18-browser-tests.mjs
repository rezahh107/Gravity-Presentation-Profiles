import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
const adminPassword = Buffer.from('d3UyMS1ib290c3RyYXAtcGFzcy0yMDI2', 'base64').toString('utf8');
const viewerPassword = Buffer.from('d3UyMS1zeW50aGV0aWMtdmlld2VyLTIwMjY=', 'base64').toString('utf8');
const results = [];

function wpEval(code) {
  const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], { encoding: 'utf8', env: process.env });
  if (cp.status !== 0) throw new Error(`${cp.stderr}\n${cp.stdout}`);
  return cp.stdout.trim();
}
const manifest = JSON.parse(wpEval('echo wp_json_encode(get_option("gpp_wu18_fixture_manifest"), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);'));
const entryUrl = item => `${baseUrl}/wp-admin/admin.php?page=gravityflow-inbox&view=entry&id=${item.form_id}&lid=${item.entry_id}`;
function record(id, name, status, details = null) { results.push({ id, name, status, details }); }
async function test(id, name, fn) {
  try { record(id, name, 'PASS', await fn()); }
  catch (error) { record(id, name, 'FAIL', { error: String(error?.stack || error).slice(0, 6000) }); }
}
async function login(page, user, pass) {
  await page.goto(`${baseUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', user); await page.fill('#user_pass', pass);
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#wp-submit')]);
}
async function waitDossier(page) { await page.waitForSelector('.gpp-entry-dossier--composed', { timeout: 30000 }); }

function setCurrentAssignee(item, login) {
  const php = '$u=get_user_by("login",' + JSON.stringify(login) + ');'
    + '$e=GFAPI::get_entry(' + Number(item.entry_id) + ');'
    + '$api=new Gravity_Flow_API(' + Number(item.form_id) + ');'
    + '$s=$api->get_current_step($e);'
    + 'if(!$u||!$s){throw new RuntimeException("assignee control unavailable");}'
    + '$m=$s->get_feed_meta();$m["assignees"]=array("user_id|".$u->ID);$m["assignee_policy"]="all";'
    + 'gravity_flow()->update_feed_meta($s->get_id(),$m);echo "ok";';
  if (wpEval(php) !== 'ok') throw new Error('Unable to mutate native current assignee.');
}
function setInstructionsEnabled(item, enabled) {
  const php = '$e=GFAPI::get_entry(' + Number(item.entry_id) + ');'
    + '$api=new Gravity_Flow_API(' + Number(item.form_id) + ');'
    + '$s=$api->get_current_step($e);if(!$s){throw new RuntimeException("step unavailable");}'
    + '$m=$s->get_feed_meta();$m["instructionsEnable"]=' + JSON.stringify(enabled ? '1' : '0') + ';'
    + 'gravity_flow()->update_feed_meta($s->get_id(),$m);echo "ok";';
  if (wpEval(php) !== 'ok') throw new Error('Unable to mutate native instructions setting.');
}
async function materialSnapshot(page) {
  return page.locator('.gpp-entry-dossier--composed').evaluate(dossier => ({
    sections: [...dossier.querySelectorAll(':scope > [data-gpp-entry-region]')].map(el => el.dataset.gppEntryRegion),
    slots: [...dossier.querySelectorAll('[data-gpp-slot]')].map(el => el.dataset.gppSlot),
    text: dossier.innerText.replace(/\s+/g, ' ').trim(),
    title: dossier.querySelector('[data-gpp-entry-region="current-task"] h2')?.textContent?.trim() || '',
    document: dossier.querySelector('[data-gpp-entry-region="documents"]')?.innerText?.replace(/\s+/g, ' ').trim() || '',
  }));
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
await login(page, 'bootstrap_admin', adminPassword);

await test('WU18-BROWSER-001', 'compact dossier header precedes exact current-task region on native Entry Detail', async () => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(entryUrl(manifest.alpha), { waitUntil: 'networkidle' }); await waitDossier(page);
  const state = await page.evaluate(() => {
    const dossier = document.querySelector('.gpp-entry-dossier--composed');
    const header = dossier?.querySelector('[data-gpp-entry-region="header"]');
    const task = dossier?.querySelector('[data-gpp-entry-region="current-task"]');
    const table = document.querySelector('.entry-detail-view');
    return {
      profile: dossier?.dataset.gppProfileId,
      title: task?.querySelector('h2')?.textContent?.trim(),
      order: header && task ? Boolean(header.compareDocumentPosition(task) & Node.DOCUMENT_POSITION_FOLLOWING) : false,
      native_wrappers: document.querySelectorAll('.gravityflow_workflow_detail').length,
      native_forms: document.querySelectorAll('form[id^="gform_"]').length,
      replacement_apps: document.querySelectorAll('[data-gpp-replacement-entry-detail], .gpp-custom-entry-app').length,
      native_grid_visible: Boolean(table && getComputedStyle(table).display !== 'none'),
    };
  });
  if (state.profile !== 'srwf.operations.entry-detail.v1' || state.title !== 'بررسی پرونده' || !state.order) throw new Error(`Dossier header/order failed: ${JSON.stringify(state)}`);
  if (state.native_wrappers !== 1 || state.native_forms !== 1 || state.replacement_apps !== 0 || state.native_grid_visible) throw new Error(`Native ownership failed: ${JSON.stringify(state)}`);
  return state;
});

await test('WU18-BROWSER-002', 'host editability and original native Approval status/actions remain authoritative', async () => {
  const formId = manifest.alpha.form_id; const review = manifest.alpha.fields['review.reason']; const mobile = manifest.alpha.fields['student.mobile'];
  const reviewControl = page.locator(`#input_${formId}_${review}`);
  if (await reviewControl.count() !== 1 || !(await reviewControl.isVisible())) throw new Error('Host-authentic review control not exposed.');
  if (await page.locator(`#input_${formId}_${mobile}`).count() !== 0) throw new Error('Semantic editability claim manufactured mobile control.');
  const task = page.locator('[data-gpp-entry-region="current-task"]');
  const statusBox = task.locator('.gravityflow-status-box');
  const actionContainer = statusBox.locator('.gravityflow-action-buttons');
  if (await statusBox.count() !== 1 || await actionContainer.count() !== 1) throw new Error('Original Approval status/action wrapper was not composed exactly once.');
  const ownership = await statusBox.evaluate(node => ({
    global_status_boxes: document.querySelectorAll('.gravityflow-status-box').length,
    global_containers: document.querySelectorAll('.gravityflow-action-buttons').length,
    status_in_native_form: Boolean(node.closest('form[id^="gform_"]')),
    actions_in_same_form: Boolean(node.querySelector('.gravityflow-action-buttons')?.closest('form[id^="gform_"]') === node.closest('form[id^="gform_"]')),
    orphan_status_boxes: [...document.querySelectorAll('.gravityflow-status-box')].filter(box => !box.closest('.gpp-entry-dossier') && getComputedStyle(box).display !== 'none' && getComputedStyle(box).visibility !== 'hidden').length,
    native_submit_names: [...node.querySelectorAll('.gravityflow-action-buttons button,.gravityflow-action-buttons input')].map(el => el.getAttribute('name')).filter(Boolean),
  }));
  if (ownership.global_status_boxes !== 1 || ownership.global_containers !== 1 || !ownership.status_in_native_form || !ownership.actions_in_same_form || ownership.orphan_status_boxes !== 0) throw new Error(`Native status/action node was cloned, orphaned or detached from its host form: ${JSON.stringify(ownership)}`);
  const actions = await actionContainer.locator('button').evaluateAll(buttons => buttons.map(b => ({ value: b.value, text: b.textContent.replace(/\s+/g, ' ').trim() })));
  if (JSON.stringify(actions.map(v => v.value).sort()) !== JSON.stringify(['approved', 'rejected'])) throw new Error(`Unexpected Approval actions: ${JSON.stringify(actions)}`);
  if (!actions.find(v => v.value === 'approved')?.text.includes('تأیید پرونده') || !actions.find(v => v.value === 'rejected')?.text.includes('رد پرونده')) throw new Error('Persian native action labels missing.');
  if (await page.getByText(/Save Draft|Send Next|Return for Correction/, { exact: false }).count() !== 0) throw new Error('Invented action is visible.');
  if (await task.locator('.detail-view-print').count() !== 0 || await page.locator('form .detail-view-print').count() !== 1) throw new Error('Native Print crossed task-action boundary.');
  const gppPrintUtility = page.locator('[data-gpp-print-utility="dossier"]');
  if (await gppPrintUtility.count() !== 1 || await task.locator('[data-gpp-print-utility="dossier"]').count() !== 0) throw new Error('Required GPP Print utility is unavailable or crossed the native action cluster.');
  return { host_editable_review_field: review, semantic_claim_without_host_control: mobile, native_actions: actions, native_status_action_ownership: ownership, gpp_print_utility: true };
});

await test('WU18-BROWSER-003', 'image preview supports Escape/backdrop/focus/scroll restoration', async () => {
  const trigger = page.locator('[data-gpp-entry-region="documents"] [data-gpp-image-preview]').first();
  if (await trigger.count() !== 1) throw new Error('Bound image thumbnail missing.');
  await trigger.scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, 120));
  const before = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
  await trigger.click(); const dialog = page.locator('[data-gpp-image-dialog]');
  if (!(await dialog.evaluate(el => el.open))) throw new Error('Dialog did not open.');
  await page.keyboard.press('Escape');
  if (await dialog.evaluate(el => el.open)) throw new Error('Escape did not close dialog.');
  const afterEscape = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY, focused: document.activeElement?.hasAttribute('data-gpp-image-preview') || false }));
  if (!afterEscape.focused || Math.abs(afterEscape.y - before.y) > 2 || Math.abs(afterEscape.x - before.x) > 2) throw new Error(`Escape restoration failed: ${JSON.stringify({ before, afterEscape })}`);
  await trigger.click(); await dialog.click({ position: { x: 4, y: 4 } });
  if (await dialog.evaluate(el => el.open)) throw new Error('Backdrop did not close dialog.');
  const afterBackdrop = await page.evaluate(() => ({ y: window.scrollY, focused: document.activeElement?.hasAttribute('data-gpp-image-preview') || false }));
  if (!afterBackdrop.focused || Math.abs(afterBackdrop.y - before.y) > 2) throw new Error(`Backdrop restoration failed: ${JSON.stringify(afterBackdrop)}`);
  return { before, after_escape: afterEscape, after_backdrop: afterBackdrop };
});

await test('WU18-BROWSER-004', 'PDF is host-file open affordance and history is secondary/collapsed', async () => {
  await page.goto(entryUrl(manifest.beta), { waitUntil: 'networkidle' }); await waitDossier(page);
  const file = page.locator('[data-gpp-entry-region="documents"] .gpp-entry-dossier__file-link');
  if (await file.count() !== 1) throw new Error('PDF open affordance missing.');
  const href = await file.getAttribute('href'); const target = await file.getAttribute('target');
  if (!href?.includes('report-card.pdf') || target !== '_blank' || await page.locator('[data-gpp-entry-region="documents"] [data-gpp-image-preview]').count() !== 0) throw new Error(`PDF representation failed: ${href}`);
  const details = page.locator('[data-gpp-history-details]');
  if (await details.count() !== 1 || await details.evaluate(el => el.open)) throw new Error('History not collapsed.');
  const helper = (await page.locator('.gpp-entry-dossier__history-help').textContent()).trim();
  const timelineInDetails = await details.locator('.gravityflow-timeline').count();
  const timelineGlobal = await page.locator('form .gravityflow-timeline').count();
  if (helper !== manifest.locked_history_helper || timelineInDetails !== 1 || timelineGlobal !== 1) throw new Error(`History helper/native timeline failed: ${JSON.stringify({ helper, expected: manifest.locked_history_helper, timeline_in_details: timelineInDetails, timeline_global: timelineGlobal })}`);
  return { pdf_href: href, history_collapsed: true, native_timeline: true };
});

await test('WU18-BROWSER-005', 'desktop/mobile preserve material dossier parity and canonical vNext order', async () => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto(entryUrl(manifest.alpha), { waitUntil: 'networkidle' }); await waitDossier(page);
  const desktop = await materialSnapshot(page);
  await page.setViewportSize({ width: 390, height: 844 }); await page.reload({ waitUntil: 'networkidle' }); await waitDossier(page);
  const mobile = await materialSnapshot(page);
  const canonical = ['header', 'current-task', 'education', 'candidate-details', 'contact', 'school', 'documents', 'registration-finance', 'history'];
  if (JSON.stringify(desktop.sections) !== JSON.stringify(canonical) || JSON.stringify(mobile.sections) !== JSON.stringify(canonical)) throw new Error(`Canonical vNext order failed: ${JSON.stringify({ desktop: desktop.sections, mobile: mobile.sections })}`);
  if (JSON.stringify(desktop.slots) !== JSON.stringify(mobile.slots) || desktop.title !== mobile.title || desktop.document !== mobile.document || desktop.text !== mobile.text) throw new Error(`Material parity failed: ${JSON.stringify({ desktop, mobile })}`);
  return { sections: desktop.sections, semantic_slots: desktop.slots, same_material_text: true };
});

await test('WU18-BROWSER-006', 'NOT_PROVEN required mapping degrades one semantic without killing Entry Detail', async () => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(entryUrl(manifest.negative), { waitUntil: 'networkidle' });
  await waitDossier(page);
  const state = await page.evaluate(() => {
    const table = document.querySelector('.entry-detail-view');
    const nationalId = document.querySelector('[data-gpp-entry-region="candidate-details"] [data-gpp-slot="student.national_id"]');
    return {
      dossier: document.querySelectorAll('.gpp-entry-dossier--composed').length,
      native_table_visible: Boolean(table && getComputedStyle(table).display !== 'none'),
      native_form: document.querySelectorAll('form[id^="gform_"]').length,
      national_id_text: nationalId?.textContent?.replace(/\s+/g, ' ').trim() || '',
    };
  });
  if (state.dossier !== 1 || state.native_table_visible || state.native_form !== 1 || !state.national_id_text.includes('نگاشت نشده')) {
    throw new Error(`Semantic degradation failed: ${JSON.stringify(state)}`);
  }
  return state;
});

await test('WU18-BROWSER-007', 'native authorization denial cannot be bypassed by GPP', async () => {
  const deniedContext = await browser.newContext(); const deniedPage = await deniedContext.newPage();
  await login(deniedPage, 'wu21_viewer', viewerPassword); await deniedPage.goto(entryUrl(manifest.alpha), { waitUntil: 'networkidle' });
  const state = await deniedPage.evaluate(() => ({ dossier: document.querySelectorAll('.gpp-entry-dossier').length, native_table: document.querySelectorAll('.entry-detail-view').length, body_text: document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 1200) }));
  await deniedContext.close();
  const nativeDenial = state.body_text.includes("You don't have permission to view this entry.") || state.body_text.includes('Sorry, you are not allowed to access this page.');
  if (state.dossier !== 0 || state.native_table !== 0 || !nativeDenial) throw new Error(`Authorization boundary failed: ${JSON.stringify(state)}`);
  return { dossier: 0, native_table: 0, native_permission_denial: true };
});

await test('WU18-BROWSER-008', 'authorized non-assignee gets read-only dossier and assignment change is immediate', async () => {
  setCurrentAssignee(manifest.alpha, 'wu21_viewer');
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(entryUrl(manifest.alpha), { waitUntil: 'networkidle' });
    await waitDossier(page);
    const ineligible = await page.evaluate(() => {
      const table = document.querySelector('.entry-detail-view');
      const dossier = document.querySelector('.gpp-entry-dossier--composed');
      const statusBoxes = [...document.querySelectorAll('.gravityflow-status-box')];
      return {
        dossier: document.querySelectorAll('.gpp-entry-dossier--composed').length,
        native_table_visible: Boolean(table && getComputedStyle(table).display !== 'none'),
        native_form: document.querySelectorAll('form[id^="gform_"]').length,
        editor_in_dossier: document.querySelectorAll('[data-gpp-native-editor] .gform_wrapper').length,
        action_containers: document.querySelectorAll('.gravityflow-action-buttons').length,
        status_inside_dossier: statusBoxes.filter(box => box.closest('.gpp-entry-dossier')).length,
        actions_expected: dossier?.dataset.gppActionsExpected || null,
        host_editable: dossier?.dataset.gppHostEditable || null,
      };
    });
    if (ineligible.dossier !== 1 || ineligible.native_table_visible || ineligible.native_form !== 1 || ineligible.editor_in_dossier !== 0 || ineligible.action_containers !== 0 || ineligible.status_inside_dossier !== 0 || ineligible.actions_expected !== '0' || ineligible.host_editable !== '0') {
      throw new Error(`Authorized non-assignee read-only presentation failed: ${JSON.stringify(ineligible)}`);
    }
  } finally {
    setCurrentAssignee(manifest.alpha, 'bootstrap_admin');
  }

  await page.reload({ waitUntil: 'networkidle' });
  await waitDossier(page);
  const restored = await page.evaluate(() => ({
    dossier: document.querySelectorAll('.gpp-entry-dossier--composed').length,
    status_boxes: document.querySelectorAll('.gravityflow-status-box').length,
    status_inside_task: document.querySelectorAll('[data-gpp-entry-region="current-task"] .gravityflow-status-box').length,
    action_containers: document.querySelectorAll('.gravityflow-action-buttons').length,
    approved: document.querySelectorAll('.gravityflow-action-buttons [value="approved"]').length,
    rejected: document.querySelectorAll('.gravityflow-action-buttons [value="rejected"]').length,
  }));
  if (restored.dossier !== 1 || restored.status_boxes !== 1 || restored.status_inside_task !== 1 || restored.action_containers !== 1 || restored.approved !== 1 || restored.rejected !== 1) {
    throw new Error(`Native assignment restoration did not immediately restore GPP eligibility: ${JSON.stringify(restored)}`);
  }
  return { non_assignee_read_only_enhanced: true, assignment_change_immediate: true, restored };
});

await test('WU18-BROWSER-009', 'conditional native regions do not fabricate and ambiguous composition fails closed', async () => {
  setInstructionsEnabled(manifest.alpha, false);
  try {
    await page.goto(entryUrl(manifest.alpha), { waitUntil: 'networkidle' });
    await waitDossier(page);
    const absentInstructions = await page.evaluate(() => ({
      native_instructions: document.querySelectorAll('.gravityflow-instructions').length,
      gpp_instruction_target: document.querySelectorAll('[data-gpp-native-instructions]').length,
      dossier: document.querySelectorAll('.gpp-entry-dossier--composed').length,
    }));
    if (absentInstructions.native_instructions !== 0 || absentInstructions.gpp_instruction_target !== 0 || absentInstructions.dossier !== 1) {
      throw new Error(`Conditional instructions absence was fabricated or rejected: ${JSON.stringify(absentInstructions)}`);
    }
  } finally {
    setInstructionsEnabled(manifest.alpha, true);
  }

  const timelineContext = await browser.newContext();
  await timelineContext.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => document.querySelector('.gravityflow-timeline')?.remove(), { once: true });
  });
  const timelinePage = await timelineContext.newPage();
  await login(timelinePage, 'bootstrap_admin', adminPassword);
  await timelinePage.goto(entryUrl(manifest.alpha), { waitUntil: 'networkidle' });
  await waitDossier(timelinePage);
  const absentTimeline = await timelinePage.evaluate(() => ({
    timeline: document.querySelectorAll('.gravityflow-timeline').length,
    history_section: document.querySelectorAll('[data-gpp-entry-region="history"]').length,
    dossier: document.querySelectorAll('.gpp-entry-dossier--composed').length,
  }));
  await timelineContext.close();
  if (absentTimeline.timeline !== 0 || absentTimeline.history_section !== 0 || absentTimeline.dossier !== 1) {
    throw new Error(`Conditional timeline absence was fabricated or rejected: ${JSON.stringify(absentTimeline)}`);
  }

  const duplicateContext = await browser.newContext();
  await duplicateContext.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const native = document.querySelector('.gravityflow-instructions');
      if (native) native.parentNode?.append(native.cloneNode(true));
    }, { once: true });
  });
  const duplicatePage = await duplicateContext.newPage();
  await login(duplicatePage, 'bootstrap_admin', adminPassword);
  await duplicatePage.goto(entryUrl(manifest.alpha), { waitUntil: 'networkidle' });
  await duplicatePage.waitForSelector('.entry-detail-view', { timeout: 30000 });
  const duplicate = await duplicatePage.evaluate(() => {
    const table = document.querySelector('.entry-detail-view');
    const actions = document.querySelector('.gravityflow-action-buttons');
    const status = document.querySelector('.gravityflow-status-box');
    return {
      dossier: document.querySelectorAll('.gpp-entry-dossier').length,
      duplicate_instructions: document.querySelectorAll('.gravityflow-instructions').length,
      native_table_visible: Boolean(table && getComputedStyle(table).display !== 'none'),
      native_form: document.querySelectorAll('form[id^="gform_"]').length,
      status_boxes: document.querySelectorAll('.gravityflow-status-box').length,
      action_containers: document.querySelectorAll('.gravityflow-action-buttons').length,
      approved: document.querySelectorAll('.gravityflow-action-buttons [value="approved"]').length,
      rejected: document.querySelectorAll('.gravityflow-action-buttons [value="rejected"]').length,
      status_outside_dossier: Boolean(status && !status.closest('.gpp-entry-dossier')),
      actions_in_native_form: Boolean(actions?.closest('form[id^="gform_"]')),
    };
  });
  await duplicateContext.close();
  if (duplicate.dossier !== 0 || duplicate.duplicate_instructions < 2 || !duplicate.native_table_visible || duplicate.native_form !== 1 || duplicate.status_boxes !== 1 || duplicate.action_containers !== 1 || duplicate.approved !== 1 || duplicate.rejected !== 1 || !duplicate.status_outside_dossier || !duplicate.actions_in_native_form) {
    throw new Error(`Ambiguous native region did not fail closed with native actions intact: ${JSON.stringify(duplicate)}`);
  }

  return { conditional_instructions_absent: true, conditional_timeline_absent: true, duplicate_region_native_fallback_with_actions: true };
});

await test('WU18-BROWSER-010', 'native Approval transition preserves enhanced dossier with host-owned non-Approval controls', async () => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(entryUrl(manifest.transition), { waitUntil: 'networkidle' });
  await waitDossier(page);

  const approve = page.locator('.gravityflow-action-buttons [value="approved"]');
  if (await approve.count() !== 1) throw new Error('Transition fixture has no single native Approve control.');

  await Promise.all([
    page.waitForLoadState('networkidle'),
    approve.click(),
  ]);

  await waitDossier(page);
  const state = await page.evaluate(() => {
    const table = document.querySelector('.entry-detail-view');
    const form = document.querySelector('form[data-gpp-entry-detail-composition]');
    const dossier = document.querySelector('.gpp-entry-dossier--composed');
    const actionContainers = [...document.querySelectorAll('.gravityflow-action-buttons')];
    const firstActions = actionContainers[0] || null;
    return {
      composition_state: form?.dataset.gppEntryDetailComposition || null,
      dossier: document.querySelectorAll('.gpp-entry-dossier--composed').length,
      native_table_visible: Boolean(table && getComputedStyle(table).display !== 'none'),
      native_form: document.querySelectorAll('form[id^="gform_"]').length,
      editor_in_dossier: document.querySelectorAll('[data-gpp-native-editor] .gform_wrapper').length,
      action_containers: actionContainers.length,
      action_in_status_box: Boolean(firstActions?.closest('.gravityflow-status-box')),
      action_inside_dossier: Boolean(firstActions?.closest('.gpp-entry-dossier')),
      approved_controls: document.querySelectorAll('.gravityflow-action-buttons [value="approved"]').length,
      rejected_controls: document.querySelectorAll('.gravityflow-action-buttons [value="rejected"]').length,
      actions_expected: dossier?.dataset.gppActionsExpected || null,
      host_editable: dossier?.dataset.gppHostEditable || null,
      body_text: document.body.innerText.replace(/\s+/g, ' ').trim(),
    };
  });

  if (
    state.composition_state !== 'composed' ||
    state.dossier !== 1 ||
    state.native_table_visible ||
    state.native_form !== 1 ||
    state.editor_in_dossier !== 1 ||
    state.action_containers !== 1 ||
    !state.action_in_status_box ||
    state.action_inside_dossier ||
    state.approved_controls !== 0 ||
    state.rejected_controls !== 0 ||
    state.actions_expected !== '0' ||
    state.host_editable !== '1' ||
    !state.body_text.includes('WU18 Follow-up Input')
  ) {
    throw new Error(`Authorized non-Approval follow-up did not preserve host ownership: ${JSON.stringify(state)}`);
  }

  return {
    native_approve_submission_observed: true,
    non_approval_enhanced_dossier: true,
    host_editor_preserved: true,
    host_status_controls_preserved_in_place: true,
    approval_actions_absent: true,
    environment_binding_rebuild_invoked: false,
  };
});

await test('WU18-BROWSER-011', 'repeated Entry Detail script initialization is idempotent', async () => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(entryUrl(manifest.alpha), { waitUntil: 'networkidle' });
  await waitDossier(page);
  await page.evaluate(() => new Promise((resolve, reject) => {
    const current = [...document.scripts].find(script => (script.src || '').includes('srwf-gravity-flow-entry-detail.js'));
    if (!current?.src) { reject(new Error('Entry Detail script source unavailable.')); return; }
    const duplicate = document.createElement('script');
    duplicate.src = `${current.src}${current.src.includes('?') ? '&' : '?'}gpp-reinit=1`;
    duplicate.onload = () => resolve(true);
    duplicate.onerror = () => reject(new Error('Repeated Entry Detail script initialization failed to load.'));
    document.head.append(duplicate);
  }));
  const state = await page.evaluate(() => {
    const form = document.querySelector('form[id^="gform_"]');
    const regions = [...document.querySelectorAll('.gpp-entry-dossier--composed > [data-gpp-entry-region]')].map(node => node.dataset.gppEntryRegion);
    return {
      composition_state: form?.dataset.gppEntryDetailComposition || null,
      dossier: document.querySelectorAll('.gpp-entry-dossier--composed').length,
      forms: document.querySelectorAll('form[id^="gform_"]').length,
      status_boxes: document.querySelectorAll('.gravityflow-status-box').length,
      action_containers: document.querySelectorAll('.gravityflow-action-buttons').length,
      approved: document.querySelectorAll('.gravityflow-action-buttons [value="approved"]').length,
      rejected: document.querySelectorAll('.gravityflow-action-buttons [value="rejected"]').length,
      timelines: document.querySelectorAll('.gravityflow-timeline').length,
      regions,
      unique_regions: new Set(regions).size,
    };
  });
  if (state.composition_state !== 'composed' || state.dossier !== 1 || state.forms !== 1 || state.status_boxes !== 1 || state.action_containers !== 1 || state.approved !== 1 || state.rejected !== 1 || state.timelines !== 1 || state.regions.length !== state.unique_regions) {
    throw new Error(`Repeated composition was not idempotent: ${JSON.stringify(state)}`);
  }
  return state;
});

fs.writeFileSync(path.join(artifactDir, 'wu18-browser-results.json'), JSON.stringify({ suite: 'WU18 browser/runtime', results }, null, 2) + '\n');
for (const result of results) console.log(`${result.status} ${result.id} ${result.name}`);
await browser.close();
if (results.some(result => result.status !== 'PASS')) process.exit(1);
