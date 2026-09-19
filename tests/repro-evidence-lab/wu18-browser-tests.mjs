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

const ownerAuthorityPath = path.resolve('tests/fixtures/owner-visual/PersianGravity-Visual-Reference-Final-vNext.html');
const entryCssPath = path.resolve('assets/css/srwf-gravity-flow-entry-detail.css');
const ownerAuthority = fs.readFileSync(ownerAuthorityPath, 'utf8');
const entryCss = fs.readFileSync(entryCssPath, 'utf8');

function requireMatch(source, pattern, label) {
  const match = source.match(pattern);
  if (!match?.[1]) throw new Error(`Owner authority value unavailable: ${label}`);
  return match[1].trim();
}
function normalizeHex(value) {
  let hex = value.trim().toLowerCase().replace(/^#/, '');
  if (hex.length === 3) hex = hex.split('').map(char => `${char}${char}`).join('');
  return `#${hex}`;
}
function hexToRgb(value) {
  const hex = normalizeHex(value).slice(1, 7);
  const parts = [0, 2, 4].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16));
  return `rgb(${parts[0]}, ${parts[1]}, ${parts[2]})`;
}
function numericPx(value) {
  return Number.parseFloat(String(value).replace('px', ''));
}

const authority = {
  surface: requireMatch(ownerAuthority, /--surface:\s*(#[0-9a-fA-F]{3,8})\s*;/, 'surface'),
  text: requireMatch(ownerAuthority, /--text:\s*(#[0-9a-fA-F]{3,8})\s*;/, 'text'),
  secondary: requireMatch(ownerAuthority, /--secondary:\s*(#[0-9a-fA-F]{3,8})\s*;/, 'secondary'),
  primary: requireMatch(ownerAuthority, /--primary:\s*(#[0-9a-fA-F]{3,8})\s*;/, 'primary'),
  control: requireMatch(ownerAuthority, /--control:\s*(#[0-9a-fA-F]{3,8})\s*;/, 'control'),
  line: requireMatch(ownerAuthority, /--line:\s*(#[0-9a-fA-F]{3,8})\s*;/, 'line'),
  error: requireMatch(ownerAuthority, /--error:\s*(#[0-9a-fA-F]{3,8})\s*;/, 'error'),
  warning: requireMatch(ownerAuthority, /--warning:\s*(#[0-9a-fA-F]{3,8})\s*;/, 'warning'),
  shadow: requireMatch(ownerAuthority, /--shadow:\s*([^;]+)\s*;/, 'shadow'),
  taskBorder: requireMatch(ownerAuthority, /\.task\s*\{[\s\S]*?border:\s*1px solid\s*(#[0-9a-fA-F]{3,8})\s*;/, 'task border'),
  taskBackground: requireMatch(ownerAuthority, /\.task\s*\{[\s\S]*?background:\s*(#[0-9a-fA-F]{3,8})\s*;/, 'task background'),
  taskRadius: requireMatch(ownerAuthority, /\.task\s*\{[\s\S]*?border-radius:\s*([^;]+)\s*;/, 'task radius'),
  buttonMinHeight: numericPx(requireMatch(ownerAuthority, /button\s*\{[^}]*min-height:\s*([0-9.]+px)\s*;/s, 'button min-height')),
  disabledOpacity: Number.parseFloat(requireMatch(ownerAuthority, /button:disabled\s*\{[^}]*opacity:\s*([0-9.]+)\s*;/s, 'disabled opacity')),
  focusWidth: numericPx(requireMatch(ownerAuthority, /button:focus-visible[\s\S]*?outline:\s*([0-9.]+px)\s+solid\s+var\(--primary\)\s*;/, 'focus width')),
  focusOffset: numericPx(requireMatch(ownerAuthority, /button:focus-visible[\s\S]*?outline-offset:\s*([0-9.]+px)\s*;/, 'focus offset')),
  buttonRadius: requireMatch(ownerAuthority, /\.btn\s*\{[\s\S]*?border-radius:\s*([^;]+)\s*;/, 'button radius'),
  inputRadius: requireMatch(ownerAuthority, /input, select, textarea\s*\{[\s\S]*?border-radius:\s*([^;]+)\s*;/, 'input radius'),
  historyPaddingTop: numericPx(requireMatch(ownerAuthority, /\.history\s*\{\s*padding:\s*([0-9.]+px)\s+0\s+0\s*;/, 'history top padding')),
  historyTitleSize: numericPx(requireMatch(ownerAuthority, /\.history summary strong\s*\{[^}]*font-size:\s*([0-9.]+px)\s*;/s, 'history title size')),
  historyContentMargin: numericPx(requireMatch(ownerAuthority, /\.history-content\s*\{\s*margin-top:\s*([0-9.]+px)\s*;/, 'history content margin')),
  historyEventPadding: numericPx(requireMatch(ownerAuthority, /\.history-event\s*\{[\s\S]*?padding:\s*([0-9.]+px)\s+0\s*;/, 'history event padding')),
  historyMetaSize: numericPx(requireMatch(ownerAuthority, /\.history-event time\s*\{[^}]*font-size:\s*([0-9.]+px)\s*;/s, 'history metadata size')),
};
const authorityRgb = Object.fromEntries(
  ['surface', 'text', 'secondary', 'primary', 'control', 'line', 'error', 'warning', 'taskBorder', 'taskBackground']
    .map(key => [key, hexToRgb(authority[key])])
);

function nativeChromeSource() {
  const start = entryCss.indexOf('/*\n * Native Gravity Flow chrome remains structurally and behaviorally host-owned.');
  const end = entryCss.indexOf('/*\n * The host Print node stays in the DOM', start);
  if (start < 0 || end <= start) throw new Error('Unable to isolate scoped native-chrome CSS enforcement boundary.');
  return entryCss.slice(start, end);
}
function timelineSource(source) {
  const start = source.indexOf('/*\n * Gravity Flow 3.1.0 keeps Timeline/event markup and ordering.');
  if (start < 0) throw new Error('Unable to isolate Timeline CSS enforcement boundary.');
  return source.slice(start);
}

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

await test('WU18-BROWSER-000', 'native-chrome CSS values and Timeline pattern are admitted-authority derived', async () => {
  const nativeCss = nativeChromeSource();
  const timelineCss = timelineSource(nativeCss);
  const allowedHexes = new Set(
    [...ownerAuthority.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(match => normalizeHex(match[0]))
  );
  const nativeHexes = [...new Set(
    [...nativeCss.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(match => normalizeHex(match[0]))
  )];
  const unauthorizedHexes = nativeHexes.filter(value => !allowedHexes.has(value));
  if (unauthorizedHexes.length) throw new Error(`Native chrome contains colors absent from Owner authority: ${unauthorizedHexes.join(', ')}`);

  const nativeColorFunctions = [...new Set([...nativeCss.matchAll(/rgba?\([^)]*\)/g)].map(match => match[0]))];
  const unauthorizedColorFunctions = nativeColorFunctions.filter(value => !ownerAuthority.includes(value));
  if (unauthorizedColorFunctions.length) throw new Error(`Native chrome contains color functions absent from Owner authority: ${unauthorizedColorFunctions.join(', ')}`);

  const removedDriftColors = ['#a6f4c5', '#ecfdf3', '#027a48', '#fecdca', '#fff5f5', '#fedf89', '#fffaeb', '#92400e', '#dbe4f0', '#344054'];
  const returnedDrift = removedDriftColors.filter(value => nativeCss.toLowerCase().includes(value));
  if (returnedDrift.length) throw new Error(`Previously rejected native-chrome palette returned: ${returnedDrift.join(', ')}`);

  const noteRule = requireMatch(timelineCss, /\.gravityflow-timeline \.gravityflow-note\s*\{([\s\S]*?)\}/, 'Timeline note rule');
  if (/display\s*:\s*grid\b/i.test(noteRule)) throw new Error('Unauthorized per-event grid/card composition returned.');
  if (/\bborder\s*:\s*1px\b/i.test(noteRule)) throw new Error('Unauthorized full per-event card border returned.');
  const noteRadius = requireMatch(noteRule, /border-radius:\s*([^;]+);/, 'Timeline note radius');
  const noteBackground = requireMatch(noteRule, /background:\s*([^;]+);/, 'Timeline note background');
  const noteShadow = requireMatch(noteRule, /box-shadow:\s*([^;]+);/, 'Timeline note shadow');
  if (numericPx(noteRadius) !== 0) throw new Error(`Unauthorized per-event card radius returned: ${noteRadius}`);
  if (noteBackground.toLowerCase() !== 'transparent') throw new Error(`Unauthorized per-event card surface returned: ${noteBackground}`);
  if (noteShadow.toLowerCase() !== 'none') throw new Error(`Unauthorized per-event card shadow returned: ${noteShadow}`);
  if (!new RegExp(`border-top:\\s*1px solid\\s*${authority.line.replace('#', '\\#')}`, 'i').test(noteRule)) throw new Error('Timeline event chronology is not using the admitted line token.');
  if (/approved|rejected|revert|approve|reject|success|error|warning|تأیید|رد|اصلاح/i.test(timelineCss)) throw new Error('Timeline styling contains outcome classification instead of neutral chronology.');

  return {
    authority_file: path.relative(process.cwd(), ownerAuthorityPath),
    authority_colors_used: nativeHexes,
    button_min_height: authority.buttonMinHeight,
    focus_width: authority.focusWidth,
    focus_offset: authority.focusOffset,
    history_event_padding: authority.historyEventPadding,
    per_event_card_pattern: false,
  };
});

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

await test('WU18-BROWSER-002', 'native workflow controls remain original and conform to admitted control tokens', async () => {
  const status = page.locator('.gravityflow-status-box');
  if (await status.count() !== 1) throw new Error('Expected exactly one native workflow status box.');
  if (await status.locator('textarea[name="gravityflow_note"]').count() !== 1) throw new Error('Native Note textarea missing.');
  if (await status.locator('input[name="_wpnonce"]').count() !== 1) throw new Error('Native workflow nonce missing.');

  const actions = await status.locator('.gravityflow-action-buttons button').evaluateAll(buttons => buttons.map(button => {
    const style = getComputedStyle(button);
    const rect = button.getBoundingClientRect();
    return {
      value: button.value,
      name: button.name,
      text: button.textContent.replace(/\s+/g, ' ').trim(),
      height: rect.height,
      background: style.backgroundColor,
      border: style.borderColor,
      color: style.color,
      radius: style.borderRadius,
    };
  }));
  const values = actions.map(action => action.value).sort();
  if (JSON.stringify(values) !== JSON.stringify(['approved', 'rejected', 'revert'])) throw new Error(`Unexpected native actions: ${JSON.stringify(actions)}`);
  if (!actions.find(action => action.value === 'approved')?.text.includes('تأیید پرونده')) throw new Error('Existing GPP Approve label filter was not preserved.');
  if (!actions.find(action => action.value === 'rejected')?.text.includes('رد پرونده')) throw new Error('Existing GPP Reject label filter was not preserved.');
  if (actions.some(action => action.height + 0.01 < authority.buttonMinHeight)) throw new Error(`Native action target is below admitted minimum height: ${JSON.stringify(actions)}`);
  if (actions.some(action => action.radius !== authority.buttonRadius)) throw new Error(`Native action radius drifted from admitted .btn authority: ${JSON.stringify(actions)}`);

  const approveStyle = actions.find(action => action.value === 'approved');
  const rejectStyle = actions.find(action => action.value === 'rejected');
  const revertStyle = actions.find(action => action.value === 'revert');
  if (approveStyle?.background !== authorityRgb.primary || approveStyle?.border !== authorityRgb.primary || approveStyle?.color !== authorityRgb.surface) throw new Error(`Approve control does not match admitted primary action: ${JSON.stringify(approveStyle)}`);
  if (rejectStyle?.background !== authorityRgb.surface || rejectStyle?.border !== authorityRgb.error || rejectStyle?.color !== authorityRgb.error) throw new Error(`Reject control does not match admitted danger action: ${JSON.stringify(rejectStyle)}`);
  if (revertStyle?.background !== authorityRgb.surface || revertStyle?.border !== authorityRgb.warning || revertStyle?.color !== authorityRgb.warning) throw new Error(`Revert control does not use admitted warning token: ${JSON.stringify(revertStyle)}`);

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
  const focus = await approve.evaluate(button => {
    const style = getComputedStyle(button);
    return {
      visible: button.matches(':focus-visible'),
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      outlineOffset: style.outlineOffset,
      outlineColor: style.outlineColor,
    };
  });
  if (!focus.visible || focus.outlineStyle === 'none' || numericPx(focus.outlineWidth) !== authority.focusWidth || numericPx(focus.outlineOffset) !== authority.focusOffset || focus.outlineColor !== authorityRgb.primary) throw new Error(`Native action focus treatment drifted from authority: ${JSON.stringify(focus)}`);

  const disabled = await approve.evaluate(button => {
    button.disabled = true;
    const style = getComputedStyle(button);
    const result = { opacity: Number.parseFloat(style.opacity), cursor: style.cursor };
    button.disabled = false;
    return result;
  });
  if (disabled.opacity !== authority.disabledOpacity || disabled.cursor !== 'default') throw new Error(`Disabled native action state drifted from authority: ${JSON.stringify(disabled)}`);

  const note = status.locator('textarea[name="gravityflow_note"]');
  const noteBase = await note.evaluate(textarea => {
    const style = getComputedStyle(textarea);
    return { border: style.borderColor, radius: style.borderRadius };
  });
  if (noteBase.border !== authorityRgb.control || noteBase.radius !== authority.inputRadius) throw new Error(`Native Note control drifted from admitted input treatment: ${JSON.stringify(noteBase)}`);
  const noteFocus = await note.evaluate(textarea => {
    textarea.focus();
    const style = getComputedStyle(textarea);
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, outlineOffset: style.outlineOffset, outlineColor: style.outlineColor };
  });
  if (noteFocus.outlineStyle === 'none' || numericPx(noteFocus.outlineWidth) !== authority.focusWidth || numericPx(noteFocus.outlineOffset) !== authority.focusOffset || noteFocus.outlineColor !== authorityRgb.primary) throw new Error(`Native Note focus treatment drifted from authority: ${JSON.stringify(noteFocus)}`);

  return { actions, ownership, focus, disabled, noteBase, noteFocus };
});

await test('WU18-BROWSER-003', 'native Timeline stays in place and follows admitted neutral History chronology', async () => {
  const state = await page.evaluate(() => {
    const timeline = document.querySelector('.gravityflow-timeline');
    const notes = Array.from(timeline?.querySelectorAll('.gravityflow-note') || []);
    const first = notes[0] || null;
    const bodyWrap = first?.querySelector('.gravityflow-note-body-wrap');
    const title = first?.querySelector('.gravityflow-note-title');
    const meta = first?.querySelector('.gravityflow-note-meta');
    const body = first?.querySelector('.gravityflow-note-body');
    const heading = timeline?.querySelector(':scope > h3');
    const inside = timeline?.querySelector(':scope > .inside');
    const avatar = first?.querySelector('.gravityflow-note-avatar');
    const timelineStyle = timeline ? getComputedStyle(timeline) : null;
    const noteStyle = first ? getComputedStyle(first) : null;
    const bodyWrapStyle = bodyWrap ? getComputedStyle(bodyWrap) : null;
    return {
      count: document.querySelectorAll('.gravityflow-timeline').length,
      parent_id: timeline?.parentElement?.id || null,
      inside_dossier: Boolean(timeline?.closest('.gpp-entry-dossier')),
      note_count: notes.length,
      note_classes: notes.map(note => [...note.classList]),
      timeline_background: timelineStyle?.backgroundColor || null,
      timeline_border_style: timelineStyle?.borderTopStyle || null,
      timeline_radius: timelineStyle?.borderRadius || null,
      timeline_shadow: timelineStyle?.boxShadow || null,
      heading_padding_top: heading ? getComputedStyle(heading).paddingTop : null,
      heading_font_size: heading ? getComputedStyle(heading).fontSize : null,
      heading_color: heading ? getComputedStyle(heading).color : null,
      inside_padding_top: inside ? getComputedStyle(inside).paddingTop : null,
      note_display: noteStyle?.display || null,
      note_background: noteStyle?.backgroundColor || null,
      note_border_top_style: noteStyle?.borderTopStyle || null,
      note_border_top_width: noteStyle?.borderTopWidth || null,
      note_border_top_color: noteStyle?.borderTopColor || null,
      note_border_radius: noteStyle?.borderRadius || null,
      note_shadow: noteStyle?.boxShadow || null,
      note_padding_top: noteStyle?.paddingTop || null,
      note_padding_bottom: noteStyle?.paddingBottom || null,
      body_wrap_border_style: bodyWrapStyle?.borderTopStyle || null,
      body_wrap_background: bodyWrapStyle?.backgroundColor || null,
      body_wrap_margin_inline_start: bodyWrapStyle?.marginInlineStart || null,
      title_present: Boolean(title),
      title_color: title ? getComputedStyle(title).color : null,
      title_size: title ? getComputedStyle(title).fontSize : null,
      meta_present: Boolean(meta),
      meta_color: meta ? getComputedStyle(meta).color : null,
      meta_size: meta ? getComputedStyle(meta).fontSize : null,
      body_color: body ? getComputedStyle(body).color : null,
      body_size: body ? getComputedStyle(body).fontSize : null,
      avatar_present: Boolean(avatar),
      avatar_width: avatar ? avatar.getBoundingClientRect().width : null,
    };
  });

  if (state.count !== 1 || state.parent_id !== 'postbox-container-2' || state.inside_dossier) throw new Error(`Timeline native ownership changed: ${JSON.stringify(state)}`);
  if (state.note_count < 1 || !state.title_present || !state.meta_present || !state.avatar_present || !state.avatar_width) throw new Error(`Authentic Timeline event structure unavailable: ${JSON.stringify(state)}`);
  if (state.timeline_background !== authorityRgb.surface || state.timeline_border_style !== 'none' || state.timeline_radius !== '0px' || state.timeline_shadow !== 'none') throw new Error(`Timeline outer chrome does not match neutral admitted History language: ${JSON.stringify(state)}`);
  if (numericPx(state.heading_padding_top) !== authority.historyPaddingTop || numericPx(state.heading_font_size) !== authority.historyTitleSize || state.heading_color !== authorityRgb.text || numericPx(state.inside_padding_top) !== authority.historyContentMargin) throw new Error(`Timeline heading/content rhythm drifted from admitted History: ${JSON.stringify(state)}`);
  if (state.note_display === 'grid' || state.note_background !== 'rgba(0, 0, 0, 0)' || state.note_border_top_style !== 'solid' || state.note_border_top_width !== '1px' || state.note_border_top_color !== authorityRgb.line || state.note_border_radius !== '0px' || state.note_shadow !== 'none') throw new Error(`Timeline event returned to unauthorized card treatment: ${JSON.stringify(state)}`);
  if (numericPx(state.note_padding_top) !== authority.historyEventPadding || numericPx(state.note_padding_bottom) !== authority.historyEventPadding) throw new Error(`Timeline chronology spacing drifted from admitted History event rhythm: ${JSON.stringify(state)}`);
  if (state.body_wrap_border_style !== 'none' || state.body_wrap_background !== 'rgba(0, 0, 0, 0)' || numericPx(state.body_wrap_margin_inline_start) <= 0) throw new Error(`Timeline host avatar/body ownership was not conservatively preserved: ${JSON.stringify(state)}`);
  if (state.title_color !== authorityRgb.text || numericPx(state.title_size) !== 15 || state.meta_color !== authorityRgb.secondary || numericPx(state.meta_size) !== authority.historyMetaSize || state.body_color !== authorityRgb.secondary || numericPx(state.body_size) !== authority.historyMetaSize) throw new Error(`Timeline text hierarchy drifted from admitted History language: ${JSON.stringify(state)}`);

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

await test('WU18-BROWSER-005', 'blocking Entry Detail JavaScript preserves table/Print suppression and native Timeline/workflow ownership', async () => {
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
    const note = timeline?.querySelector('.gravityflow-note');
    const nativePrint = document.querySelector('.detail-view-print');
    const gppPrint = document.querySelector('.gpp-entry-print-utility[data-gpp-print-utility="dossier"]');
    return {
      marker: dossier?.dataset.gppNativeTableSuppression || null,
      table_display: table ? getComputedStyle(table).display : null,
      native_print_display: nativePrint ? getComputedStyle(nativePrint).display : null,
      gpp_print_visible: Boolean(gppPrint && getComputedStyle(gppPrint).display !== 'none'),
      status_count: document.querySelectorAll('.gravityflow-status-box').length,
      status_visible: Boolean(status && getComputedStyle(status).display !== 'none' && getComputedStyle(status).visibility !== 'hidden'),
      timeline_count: document.querySelectorAll('.gravityflow-timeline').length,
      timeline_visible: Boolean(timeline && getComputedStyle(timeline).display !== 'none' && getComputedStyle(timeline).visibility !== 'hidden'),
      timeline_inside_dossier: Boolean(timeline?.closest('.gpp-entry-dossier')),
      timeline_note_border_top_color: note ? getComputedStyle(note).borderTopColor : null,
      preview_bound: dossier?.dataset.gppPreviewBound || null,
    };
  });
  await blockedContext.close();
  if (!scriptBlocked) throw new Error('Entry Detail progressive-enhancement script was not actually blocked.');
  if (state.marker !== 'read-only-review' || state.table_display !== 'none' || state.native_print_display !== 'none' || !state.gpp_print_visible || state.status_count !== 1 || !state.status_visible || state.timeline_count !== 1 || !state.timeline_visible || state.timeline_inside_dossier || state.timeline_note_border_top_color !== authorityRgb.line) throw new Error(`Visual/native ownership still depended on Entry Detail JS: ${JSON.stringify(state)}`);
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

await test('WU18-BROWSER-007', 'dedicated Approval editor fallback keeps native Print and excludes admitted-Review native-chrome treatment', async () => {
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
      timeline_note_border_top_color: timelineNote ? getComputedStyle(timelineNote).borderTopColor : null,
      timeline_note_padding_top: timelineNote ? getComputedStyle(timelineNote).paddingTop : null,
      timeline_body_border_style: timelineNote?.querySelector('.gravityflow-note-body-wrap') ? getComputedStyle(timelineNote.querySelector('.gravityflow-note-body-wrap')).borderTopStyle : null,
    };
  }, intendedFieldSelector);
  if (state.dossier_count !== 0 || state.marker_count !== 0 || !state.native_editor_visible || !state.intended_field_visible || state.native_table_display === 'none' || !state.status_visible) throw new Error(`Native editor fallback failed: ${JSON.stringify(state)}`);
  if (!state.native_print_present || state.native_print_display === 'none') throw new Error(`Native Print suppression leaked into editor fallback: ${JSON.stringify(state)}`);
  if (state.timeline_present && state.timeline_note_border_top_color === authorityRgb.line && numericPx(state.timeline_note_padding_top) === authority.historyEventPadding && state.timeline_body_border_style === 'none') throw new Error(`Admitted Review Timeline treatment leaked into native editor fallback: ${JSON.stringify(state)}`);
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
    const timelineNote = timeline?.querySelector('.gravityflow-note');
    return {
      dossier_count: document.querySelectorAll('.gpp-entry-dossier[data-gpp-entry-detail="ready"]').length,
      marker_count: document.querySelectorAll('[data-gpp-native-table-suppression]').length,
      native_table_display: table ? getComputedStyle(table).display : null,
      native_editor_visible: Boolean(editor && getComputedStyle(editor).display !== 'none'),
      status_boxes: document.querySelectorAll('.gravityflow-status-box').length,
      native_print_present: Boolean(nativePrint),
      native_print_display: nativePrint ? getComputedStyle(nativePrint).display : null,
      timeline_note_border_top_color: timelineNote ? getComputedStyle(timelineNote).borderTopColor : null,
      timeline_body_border_style: timelineNote?.querySelector('.gravityflow-note-body-wrap') ? getComputedStyle(timelineNote.querySelector('.gravityflow-note-body-wrap')).borderTopStyle : null,
    };
  });
  if (state.dossier_count !== 0 || state.marker_count !== 0 || !state.native_editor_visible || state.native_table_display === 'none') throw new Error(`User Input did not remain native: ${JSON.stringify(state)}`);
  if (state.native_print_present && state.native_print_display === 'none') throw new Error(`Native Print suppression leaked into User Input: ${JSON.stringify(state)}`);
  if (state.timeline_note_border_top_color === authorityRgb.line && state.timeline_body_border_style === 'none') throw new Error(`Admitted Review Timeline treatment leaked into User Input: ${JSON.stringify(state)}`);
  return state;
});

await test('WU18-BROWSER-009', 'narrow admitted Review has no target-region clipping and retains admitted interaction size', async () => {
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
      return { value: button.value, width: rect.width, height: rect.height, left: rect.left, right: rect.right, visible: rect.width > 0 && rect.height > 0 };
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
  if (!state.actions.length || state.actions.some(action => !action.visible || action.width <= 0 || action.height + 0.01 < authority.buttonMinHeight)) throw new Error(`Narrow native actions violate admitted interaction size: ${JSON.stringify(state)}`);
  if (state.note_count < 1) throw new Error(`Narrow Timeline has no authentic native events: ${JSON.stringify(state)}`);
  if (state.native_print_display !== 'none' || state.gpp_print_display === 'none') throw new Error(`Narrow one-Print-entry-point contract failed: ${JSON.stringify(state)}`);

  await page.screenshot({ path: path.join(artifactDir, 'wu18-entry-detail-native-chrome-mobile.png'), fullPage: true });
  return state;
});

await browser.close();

const failures = results.filter(result => result.status === 'FAIL');
const output = { schema_version: '7.0.0', surface: 'gravity_flow.entry_detail', results };
fs.writeFileSync(path.join(artifactDir, 'wu18-browser-results.json'), `${JSON.stringify(output, null, 2)}\n`);

if (failures.length) {
  console.error(JSON.stringify(output, null, 2));
  process.exit(1);
}

console.log('WU18_BROWSER_NATIVE_CHROME_AUTHORITY_PASS');
