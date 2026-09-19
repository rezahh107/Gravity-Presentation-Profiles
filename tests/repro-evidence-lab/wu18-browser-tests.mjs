import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
const adminPassword = 'wu21-bootstrap-pass-2026';
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
async function login(page) {
  await page.goto(`${baseUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', 'bootstrap_admin');
  await page.fill('#user_pass', adminPassword);
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#wp-submit')]);
}
async function waitDossier(page) {
  await page.waitForSelector('.gpp-entry-dossier[data-gpp-entry-detail="ready"][data-gpp-review-mode="read-only"]', { timeout: 30000 });
}
async function gotoAdmittedReview(page, viewport = { width: 1440, height: 1000 }) {
  await page.setViewportSize(viewport);
  await page.goto(entryUrl(manifest.alpha), { waitUntil: 'networkidle' });
  await waitDossier(page);
}

fs.mkdirSync(artifactDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
await login(page);

await test('WU18-BROWSER-001', 'admitted Review keeps native nodes but exposes one visible GPP Print entry point', async () => {
  await gotoAdmittedReview(page);

  const state = await page.evaluate(() => {
    const dossier = document.querySelector('.gpp-entry-dossier[data-gpp-entry-detail="ready"]');
    const table = document.querySelector('.entry-detail-view');
    const status = document.querySelector('.gravityflow-status-box');
    const timeline = document.querySelector('.gravityflow-timeline');
    const nativePrint = document.querySelector('.detail-view-print');
    const gppPrint = document.querySelector('.gpp-entry-print-utility[data-gpp-print-utility="dossier"]');
    const gppPrintButton = gppPrint?.querySelector('[data-gpp-dossier-print-button]');
    const task = dossier?.querySelector('[data-gpp-entry-region="current-task"]');
    return {
      profile: dossier?.dataset.gppProfileId || null,
      marker: dossier?.dataset.gppNativeTableSuppression || null,
      composed_class: dossier?.classList.contains('gpp-entry-dossier--composed') || false,
      native_table_present: Boolean(table),
      native_table_display: table ? getComputedStyle(table).display : null,
      status_count: document.querySelectorAll('.gravityflow-status-box').length,
      status_visible: Boolean(status && getComputedStyle(status).display !== 'none' && getComputedStyle(status).visibility !== 'hidden'),
      status_inside_dossier: Boolean(status?.closest('.gpp-entry-dossier')),
      status_inside_native_form: Boolean(status?.closest('form[id^="gform_"]')),
      task_contains_status: Boolean(task?.querySelector('.gravityflow-status-box')),
      timeline_count: document.querySelectorAll('.gravityflow-timeline').length,
      timeline_visible: Boolean(timeline && getComputedStyle(timeline).display !== 'none' && getComputedStyle(timeline).visibility !== 'hidden'),
      timeline_inside_dossier: Boolean(timeline?.closest('.gpp-entry-dossier')),
      timeline_parent_id: timeline?.parentElement?.id || null,
      native_print_present: Boolean(nativePrint),
      native_print_display: nativePrint ? getComputedStyle(nativePrint).display : null,
      native_print_inside_dossier: Boolean(nativePrint?.closest('.gpp-entry-dossier')),
      gpp_print_count: document.querySelectorAll('.gpp-entry-print-utility[data-gpp-print-utility="dossier"]').length,
      gpp_print_display: gppPrint ? getComputedStyle(gppPrint).display : null,
      gpp_print_button_display: gppPrintButton ? getComputedStyle(gppPrintButton).display : null,
      gpp_print_label: gppPrintButton?.textContent?.replace(/\s+/g, ' ').trim() || null,
    };
  });

  if (state.profile !== 'srwf.operations.entry-detail.v1' || state.marker !== 'read-only-review') throw new Error(`Server Review marker missing: ${JSON.stringify(state)}`);
  if (!state.native_table_present || state.native_table_display !== 'none') throw new Error(`Duplicate native field table not visually suppressed: ${JSON.stringify(state)}`);
  if (state.status_count !== 1 || !state.status_visible || state.status_inside_dossier || !state.status_inside_native_form || state.task_contains_status) throw new Error(`Native workflow box ownership changed: ${JSON.stringify(state)}`);
  if (state.timeline_count !== 1 || !state.timeline_visible || state.timeline_inside_dossier || state.timeline_parent_id !== 'postbox-container-2') throw new Error(`Native Timeline was moved, cloned or removed: ${JSON.stringify(state)}`);
  if (!state.native_print_present || state.native_print_display !== 'none' || state.native_print_inside_dossier) throw new Error(`Native Print suppression is not the admitted visual-only state: ${JSON.stringify(state)}`);
  if (state.gpp_print_count !== 1 || state.gpp_print_display === 'none' || state.gpp_print_button_display === 'none' || !state.gpp_print_label?.includes('چاپ پرونده')) throw new Error(`GPP Print utility is not the one visible Print entry point: ${JSON.stringify(state)}`);
  if (state.composed_class) throw new Error(`Obsolete composition state observed: ${JSON.stringify(state)}`);

  await page.screenshot({ path: path.join(artifactDir, 'wu18-entry-detail-native-chrome-desktop.png'), fullPage: true });
  return state;
});

await test('WU18-BROWSER-002', 'native workflow controls remain original and receive scoped accessible visual treatment', async () => {
  const status = page.locator('.gravityflow-status-box');
  if (await status.count() !== 1) throw new Error('Expected exactly one native workflow status box.');
  if (await status.locator('textarea[name="gravityflow_note"]').count() !== 1) throw new Error('Native Note textarea missing.');
  if (await status.locator('input[name="_wpnonce"]').count() !== 1) throw new Error('Native workflow nonce missing.');

  const actions = await status.locator('.gravityflow-action-buttons button').evaluateAll(buttons => buttons.map(button => ({
    value: button.value,
    name: button.name,
    text: button.textContent.replace(/\s+/g, ' ').trim(),
    background: getComputedStyle(button).backgroundColor,
    border: getComputedStyle(button).borderColor,
    color: getComputedStyle(button).color,
  })));
  const values = actions.map(action => action.value).sort();
  if (JSON.stringify(values) !== JSON.stringify(['approved', 'rejected', 'revert'])) throw new Error(`Unexpected native actions: ${JSON.stringify(actions)}`);
  if (!actions.find(action => action.value === 'approved')?.text.includes('تأیید پرونده')) throw new Error('Existing GPP Approve label filter was not preserved.');
  if (!actions.find(action => action.value === 'rejected')?.text.includes('رد پرونده')) throw new Error('Existing GPP Reject label filter was not preserved.');
  if (actions.find(action => action.value === 'approved')?.background !== 'rgb(236, 253, 243)') throw new Error(`Approve positive emphasis missing: ${JSON.stringify(actions)}`);
  if (actions.find(action => action.value === 'rejected')?.background !== 'rgb(255, 245, 245)') throw new Error(`Reject restrained destructive emphasis missing: ${JSON.stringify(actions)}`);
  if (actions.find(action => action.value === 'revert')?.background !== 'rgb(255, 250, 235)') throw new Error(`Revert attention emphasis missing: ${JSON.stringify(actions)}`);

  const ownership = await status.evaluate(node => ({
    in_dossier: Boolean(node.closest('.gpp-entry-dossier')),
    in_native_form: Boolean(node.closest('form[id^="gform_"]')),
    action_boxes: document.querySelectorAll('.gravityflow-action-buttons').length,
    status_boxes: document.querySelectorAll('.gravityflow-status-box').length,
  }));
  if (ownership.in_dossier || !ownership.in_native_form || ownership.action_boxes !== 1 || ownership.status_boxes !== 1) throw new Error(`Native controls were cloned/moved: ${JSON.stringify(ownership)}`);

  const approve = status.locator('button[value="approved"]');
  await page.evaluate(() => document.activeElement?.blur());
  let keyboardFocused = false;
  for (let i = 0; i < 80; i += 1) {
    await page.keyboard.press('Tab');
    keyboardFocused = await page.evaluate(() => document.activeElement?.value === 'approved');
    if (keyboardFocused) break;
  }
  if (!keyboardFocused) throw new Error('Could not keyboard-focus the native Approve button.');
  const focus = await approve.evaluate(button => ({
    visible: button.matches(':focus-visible'),
    outlineStyle: getComputedStyle(button).outlineStyle,
    outlineWidth: getComputedStyle(button).outlineWidth,
  }));
  if (!focus.visible || focus.outlineStyle === 'none' || focus.outlineWidth === '0px') throw new Error(`Native action focus-visible treatment is not detectable: ${JSON.stringify(focus)}`);

  const disabled = await approve.evaluate(button => {
    button.disabled = true;
    const style = getComputedStyle(button);
    const result = { opacity: style.opacity, cursor: style.cursor };
    button.disabled = false;
    return result;
  });
  if (Number(disabled.opacity) >= 1 || disabled.cursor !== 'not-allowed') throw new Error(`Disabled native action state is visually masked: ${JSON.stringify(disabled)}`);

  const noteFocus = await status.locator('textarea[name="gravityflow_note"]').evaluate(textarea => {
    textarea.focus();
    const style = getComputedStyle(textarea);
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, overflow: style.overflowX };
  });
  if (noteFocus.outlineStyle === 'none' || noteFocus.outlineWidth === '0px') throw new Error(`Native Note focus treatment is not detectable: ${JSON.stringify(noteFocus)}`);

  return { actions, ownership, focus, disabled, noteFocus };
});

await test('WU18-BROWSER-003', 'native Timeline stays in place and renders neutral event cards without text classification', async () => {
  const state = await page.evaluate(() => {
    const timeline = document.querySelector('.gravityflow-timeline');
    const notes = Array.from(timeline?.querySelectorAll('.gravityflow-note') || []);
    const first = notes[0] || null;
    const body = first?.querySelector('.gravityflow-note-body-wrap');
    const title = first?.querySelector('.gravityflow-note-title');
    const meta = first?.querySelector('.gravityflow-note-meta');
    const timelineStyle = timeline ? getComputedStyle(timeline) : null;
    const noteStyle = first ? getComputedStyle(first) : null;
    return {
      count: document.querySelectorAll('.gravityflow-timeline').length,
      parent_id: timeline?.parentElement?.id || null,
      inside_dossier: Boolean(timeline?.closest('.gpp-entry-dossier')),
      note_count: notes.length,
      note_classes: notes.map(note => [...note.classList]),
      timeline_border_radius: timelineStyle?.borderRadius || null,
      timeline_border_style: timelineStyle?.borderStyle || null,
      timeline_background: timelineStyle?.backgroundColor || null,
      note_display: noteStyle?.display || null,
      note_background: noteStyle?.backgroundColor || null,
      note_border_style: noteStyle?.borderStyle || null,
      note_border_radius: noteStyle?.borderRadius || null,
      body_margin_inline_start: body ? getComputedStyle(body).marginInlineStart : null,
      title_present: Boolean(title),
      meta_present: Boolean(meta),
    };
  });

  if (state.count !== 1 || state.parent_id !== 'postbox-container-2' || state.inside_dossier) throw new Error(`Timeline native ownership changed: ${JSON.stringify(state)}`);
  if (state.note_count < 1 || !state.title_present || !state.meta_present) throw new Error(`Authentic Timeline event structure unavailable: ${JSON.stringify(state)}`);
  if (state.timeline_border_radius !== '14px' || state.timeline_border_style !== 'solid' || state.timeline_background !== 'rgb(255, 255, 255)') throw new Error(`Scoped Timeline card treatment missing: ${JSON.stringify(state)}`);
  if (state.note_display !== 'grid' || state.note_background !== 'rgb(248, 250, 254)' || state.note_border_style !== 'solid' || state.note_border_radius !== '11px') throw new Error(`Neutral Timeline event treatment missing: ${JSON.stringify(state)}`);
  if (state.body_margin_inline_start !== '0px') throw new Error(`Legacy note offset was not safely neutralized: ${JSON.stringify(state)}`);

  return state;
});

await test('WU18-BROWSER-004', 'image preview remains progressive enhancement', async () => {
  const trigger = page.locator('[data-gpp-image-preview]').first();
  if (await trigger.count() !== 1) throw new Error('Bound image preview trigger missing.');
  await trigger.click();
  const dialog = page.locator('[data-gpp-image-dialog]');
  await dialog.waitFor({ state: 'visible' });
  const open = await dialog.evaluate(node => node.open === true);
  if (!open) throw new Error('Image preview dialog did not open.');
  await dialog.locator('[data-gpp-image-close]').click();
  await page.waitForFunction(() => !document.querySelector('[data-gpp-image-dialog]')?.open);
  return { preview_opened_and_closed: true };
});

await test('WU18-BROWSER-005', 'blocking Entry Detail JavaScript preserves table/Print suppression and native Timeline/workflow chrome', async () => {
  const blockedContext = await browser.newContext();
  let scriptBlocked = false;
  await blockedContext.route('**/assets/js/srwf-gravity-flow-entry-detail.js*', route => {
    scriptBlocked = true;
    return route.abort();
  });
  const blockedPage = await blockedContext.newPage();
  await login(blockedPage);
  await blockedPage.goto(entryUrl(manifest.alpha), { waitUntil: 'networkidle' });
  await waitDossier(blockedPage);
  const state = await blockedPage.evaluate(() => {
    const dossier = document.querySelector('.gpp-entry-dossier[data-gpp-entry-detail="ready"]');
    const table = document.querySelector('.entry-detail-view');
    const status = document.querySelector('.gravityflow-status-box');
    const timeline = document.querySelector('.gravityflow-timeline');
    const nativePrint = document.querySelector('.detail-view-print');
    const gppPrint = document.querySelector('.gpp-entry-print-utility[data-gpp-print-utility="dossier"]');
    return {
      marker: dossier?.dataset.gppNativeTableSuppression || null,
      table_display: table ? getComputedStyle(table).display : null,
      native_print_display: nativePrint ? getComputedStyle(nativePrint).display : null,
      gpp_print_visible: Boolean(gppPrint && getComputedStyle(gppPrint).display !== 'none'),
      status_visible: Boolean(status && getComputedStyle(status).display !== 'none' && getComputedStyle(status).visibility !== 'hidden'),
      timeline_visible: Boolean(timeline && getComputedStyle(timeline).display !== 'none' && getComputedStyle(timeline).visibility !== 'hidden'),
      timeline_note_display: timeline?.querySelector('.gravityflow-note') ? getComputedStyle(timeline.querySelector('.gravityflow-note')).display : null,
      preview_bound: dossier?.dataset.gppPreviewBound || null,
    };
  });
  await blockedContext.close();
  if (!scriptBlocked) throw new Error('Entry Detail progressive-enhancement script was not actually blocked.');
  if (state.marker !== 'read-only-review' || state.table_display !== 'none' || state.native_print_display !== 'none' || !state.gpp_print_visible || !state.status_visible || !state.timeline_visible || state.timeline_note_display !== 'grid') throw new Error(`Visual/native chrome behavior still depended on Entry Detail JS: ${JSON.stringify(state)}`);
  if (state.preview_bound === '1') throw new Error('Blocked progressive-enhancement JS unexpectedly executed.');
  return { script_blocked: scriptBlocked, ...state };
});

await test('WU18-BROWSER-006', 'UNMAPPED data degrades one slot without restoring duplicate native presentation or Print', async () => {
  await page.goto(entryUrl(manifest.negative), { waitUntil: 'networkidle' });
  await waitDossier(page);
  const state = await page.evaluate(() => {
    const slot = document.querySelector('[data-gpp-slot="student.national_id"] dd');
    const table = document.querySelector('.entry-detail-view');
    const nativePrint = document.querySelector('.detail-view-print');
    return {
      slot_text: slot?.textContent?.trim() || null,
      marker: document.querySelector('.gpp-entry-dossier')?.dataset.gppNativeTableSuppression || null,
      table_display: table ? getComputedStyle(table).display : null,
      native_print_present: Boolean(nativePrint),
      native_print_display: nativePrint ? getComputedStyle(nativePrint).display : null,
    };
  });
  if (state.slot_text !== 'نگاشت نشده' || state.marker !== 'read-only-review' || state.table_display !== 'none' || !state.native_print_present || state.native_print_display !== 'none') throw new Error(`Semantic degradation affected structural/Print suppression admission: ${JSON.stringify(state)}`);
  return state;
});

await test('WU18-BROWSER-007', 'dedicated Approval editor fallback keeps native Print and native Timeline/status styling unsuppressed', async () => {
  await page.goto(entryUrl(manifest.editor), { waitUntil: 'networkidle' });
  const intendedFieldSelector = `#input_${manifest.editor.form_id}_${manifest.editor.editable_field_id}`;
  const state = await page.evaluate(selector => {
    const table = document.querySelector('.entry-detail-view');
    const editor = table?.querySelector('.gform_wrapper');
    const status = document.querySelector('.gravityflow-status-box');
    const timeline = document.querySelector('.gravityflow-timeline');
    const nativePrint = document.querySelector('.detail-view-print');
    const timelineNote = timeline?.querySelector('.gravityflow-note');
    return {
      dossier_count: document.querySelectorAll('.gpp-entry-dossier[data-gpp-entry-detail="ready"]').length,
      marker_count: document.querySelectorAll('[data-gpp-native-table-suppression]').length,
      native_table_display: table ? getComputedStyle(table).display : null,
      native_editor_visible: Boolean(editor && getComputedStyle(editor).display !== 'none'),
      intended_field_visible: Boolean(document.querySelector(selector)),
      status_visible: Boolean(status && getComputedStyle(status).display !== 'none'),
      native_print_present: Boolean(nativePrint),
      native_print_display: nativePrint ? getComputedStyle(nativePrint).display : null,
      timeline_present: Boolean(timeline),
      timeline_custom_radius_leaked: timeline ? getComputedStyle(timeline).borderRadius === '14px' : false,
      timeline_event_grid_leaked: timelineNote ? getComputedStyle(timelineNote).display === 'grid' : false,
    };
  }, intendedFieldSelector);
  if (state.dossier_count !== 0 || state.marker_count !== 0 || !state.native_editor_visible || !state.intended_field_visible || state.native_table_display === 'none' || !state.status_visible) throw new Error(`Native editor fallback failed: ${JSON.stringify(state)}`);
  if (!state.native_print_present || state.native_print_display === 'none') throw new Error(`Native Print suppression leaked into editor fallback: ${JSON.stringify(state)}`);
  if (state.timeline_present && (state.timeline_custom_radius_leaked || state.timeline_event_grid_leaked)) throw new Error(`Admitted Review Timeline treatment leaked into native fallback: ${JSON.stringify(state)}`);
  return state;
});

await test('WU18-BROWSER-008', 'native Approval transition reaches native User Input with GPP chrome suppression disabled', async () => {
  await page.goto(entryUrl(manifest.transition), { waitUntil: 'networkidle' });
  await waitDossier(page);
  const approve = page.locator('.gravityflow-status-box .gravityflow-action-buttons button[value="approved"]');
  if (await approve.count() !== 1) throw new Error('Transition fixture native Approve control missing.');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }),
    approve.click(),
  ]);
  const state = await page.evaluate(() => {
    const table = document.querySelector('.entry-detail-view');
    const editor = table?.querySelector('.gform_wrapper');
    const nativePrint = document.querySelector('.detail-view-print');
    const timeline = document.querySelector('.gravityflow-timeline');
    return {
      dossier_count: document.querySelectorAll('.gpp-entry-dossier[data-gpp-entry-detail="ready"]').length,
      marker_count: document.querySelectorAll('[data-gpp-native-table-suppression]').length,
      native_table_display: table ? getComputedStyle(table).display : null,
      native_editor_visible: Boolean(editor && getComputedStyle(editor).display !== 'none'),
      status_boxes: document.querySelectorAll('.gravityflow-status-box').length,
      native_print_present: Boolean(nativePrint),
      native_print_display: nativePrint ? getComputedStyle(nativePrint).display : null,
      timeline_custom_radius_leaked: timeline ? getComputedStyle(timeline).borderRadius === '14px' : false,
    };
  });
  if (state.dossier_count !== 0 || state.marker_count !== 0 || !state.native_editor_visible || state.native_table_display === 'none') throw new Error(`User Input did not remain native: ${JSON.stringify(state)}`);
  if (state.native_print_present && state.native_print_display === 'none') throw new Error(`Native Print suppression leaked into User Input: ${JSON.stringify(state)}`);
  if (state.timeline_custom_radius_leaked) throw new Error(`Admitted Review Timeline treatment leaked into User Input: ${JSON.stringify(state)}`);
  return state;
});

await test('WU18-BROWSER-009', 'narrow admitted Review has no target-region horizontal clipping and keeps actions/timeline usable', async () => {
  await gotoAdmittedReview(page, { width: 390, height: 844 });
  const state = await page.evaluate(() => {
    const selectors = [
      '.gpp-entry-dossier',
      '#gravityflow-status-box-container',
      '.gravityflow-status-box',
      '.gravityflow-action-buttons',
      '.gravityflow-timeline',
      '.gravityflow-timeline .inside',
      '.gravityflow-timeline .gravityflow-note',
    ];
    const regions = selectors.map(selector => {
      const node = document.querySelector(selector);
      if (!node) return { selector, present: false };
      const rect = node.getBoundingClientRect();
      return {
        selector,
        present: true,
        width: rect.width,
        left: rect.left,
        right: rect.right,
        clientWidth: node.clientWidth,
        scrollWidth: node.scrollWidth,
        clipped: node.scrollWidth > node.clientWidth + 1,
      };
    });
    const actions = Array.from(document.querySelectorAll('.gravityflow-action-buttons button')).map(button => {
      const rect = button.getBoundingClientRect();
      return { value: button.value, width: rect.width, left: rect.left, right: rect.right, visible: rect.width > 0 && rect.height > 0 };
    });
    const notes = Array.from(document.querySelectorAll('.gravityflow-timeline .gravityflow-note'));
    return {
      viewport: document.documentElement.clientWidth,
      regions,
      actions,
      note_count: notes.length,
      native_print_display: getComputedStyle(document.querySelector('.detail-view-print')).display,
      gpp_print_display: getComputedStyle(document.querySelector('.gpp-entry-print-utility')).display,
    };
  });

  const missing = state.regions.filter(region => !region.present);
  const clipped = state.regions.filter(region => region.present && region.clipped);
  if (missing.length || clipped.length) throw new Error(`Narrow target-region clipping detected: ${JSON.stringify(state)}`);
  if (!state.actions.length || state.actions.some(action => !action.visible || action.width <= 0)) throw new Error(`Narrow native actions are not usable: ${JSON.stringify(state)}`);
  if (state.note_count < 1) throw new Error(`Narrow Timeline has no authentic event cards: ${JSON.stringify(state)}`);
  if (state.native_print_display !== 'none' || state.gpp_print_display === 'none') throw new Error(`Narrow one-Print-entry-point contract failed: ${JSON.stringify(state)}`);

  await page.screenshot({ path: path.join(artifactDir, 'wu18-entry-detail-native-chrome-mobile.png'), fullPage: true });
  return state;
});

await browser.close();

const failures = results.filter(result => result.status === 'FAIL');
const output = { schema_version: '6.0.0', surface: 'gravity_flow.entry_detail', results };
fs.writeFileSync(path.join(artifactDir, 'wu18-browser-results.json'), `${JSON.stringify(output, null, 2)}\n`);

if (failures.length) {
  console.error(JSON.stringify(output, null, 2));
  process.exit(1);
}

console.log('WU18_BROWSER_NATIVE_CHROME_REFINEMENT_PASS');
