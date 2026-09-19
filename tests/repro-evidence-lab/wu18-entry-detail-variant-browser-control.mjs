import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
const adminPassword = 'wu21-bootstrap-pass-2026';

if (!artifactDir || !wpPath || !wpCli) throw new Error('WU18 Full Width browser environment is incomplete.');

function wpEval(code) {
  const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], { encoding: 'utf8', env: process.env });
  if (cp.status !== 0) throw new Error(`${cp.stderr}\n${cp.stdout}`);
  return cp.stdout.trim();
}

function lifecycleFacts() {
  return JSON.parse(wpEval(`
    $v=new \\GravityPresentationProfiles\\Core\\Lifecycle\\VisualPackageLifecycle(new \\GravityPresentationProfiles\\Core\\Lifecycle\\WordPressOptionStateStore(\\GravityPresentationProfiles\\Core\\Lifecycle\\VisualPackageLifecycle::OPTION_NAME));
    $b=get_option(\\GravityPresentationProfiles\\Core\\Lifecycle\\BindingSetLifecycle::OPTION_NAME);
    echo wp_json_encode(array('activations'=>$v->snapshot()['activations'],'binding_hash'=>hash('sha256',wp_json_encode($b))),JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
  `));
}

function activeVariantFacts() {
  return JSON.parse(wpEval(`
    $s=\\GravityPresentationProfiles\\GravityForms\\EntryDetailVisualVariantService::forWordPress();
    echo wp_json_encode($s->activeFacts(),JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
  `));
}

function staleCommandResult(command) {
  const encoded = Buffer.from(command, 'utf8').toString('base64');
  return JSON.parse(wpEval(`
    $value=base64_decode('${encoded}');
    try { \\GravityPresentationProfiles\\GravityForms\\EntryDetailVisualVariantService::forWordPress()->applySettingsValue($value); echo wp_json_encode(array('status'=>'UNEXPECTED_SUCCESS')); }
    catch (\\GravityPresentationProfiles\\Core\\Lifecycle\\LifecycleException $e) { echo wp_json_encode(array('status'=>'REJECTED','reason'=>$e->reasonCode())); }
  `));
}

const manifest = JSON.parse(wpEval('echo wp_json_encode(get_option("gpp_wu18_fixture_manifest"), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);'));
if (!manifest?.alpha?.form_id || !manifest?.alpha?.entry_id || !manifest?.transition?.form_id || !manifest?.transition?.entry_id) {
  throw new Error('WU18 fixture manifest is incomplete for visual variant qualification.');
}

const entryUrl = item => `${baseUrl}/wp-admin/admin.php?page=gravityflow-inbox&view=entry&id=${item.form_id}&lid=${item.entry_id}`;
const settingsUrl = `${baseUrl}/wp-admin/admin.php?page=gf_settings&subview=gravity-presentation-profiles`;
const fullProfile = 'srwf.operations.entry-detail.full-width.v1';
const safeProfile = 'srwf.operations.entry-detail.v1';
const raw = name => path.join(artifactDir, `wu18-variant-${name}.raw.png`);

async function login(page) {
  await page.goto(`${baseUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', 'bootstrap_admin');
  await page.fill('#user_pass', adminPassword);
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#wp-submit')]);
}

async function waitDossier(page, profile) {
  await page.waitForSelector(`.gpp-entry-dossier[data-gpp-entry-detail="ready"][data-gpp-profile-id="${profile}"]`, { timeout: 30000 });
}

async function gotoReview(page, viewport, profile) {
  await page.setViewportSize(viewport);
  await page.goto(entryUrl(manifest.alpha), { waitUntil: 'networkidle' });
  await waitDossier(page, profile);
}

async function selectVariantThroughSettings(page, labelFragment) {
  await page.goto(settingsUrl, { waitUntil: 'networkidle' });
  const select = page.locator('#entry_detail_visual_variant_action');
  if (await select.count() !== 1) throw new Error('Entry Detail design selector is not reachable in the authentic GPP settings renderer.');
  const options = await select.locator('option').evaluateAll(items => items.map(item => ({ label: item.textContent?.trim() || '', value: item.value })));
  const choice = options.find(item => item.label.includes(labelFragment) && item.value);
  if (!choice) throw new Error(`Selectable visual variant missing from settings: ${labelFragment}; options=${JSON.stringify(options)}`);
  await select.selectOption(choice.value);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }),
    page.click('#gform-settings-save'),
  ]);
  return { choice, options };
}

async function inspectReview(page) {
  return page.evaluate(() => {
    const visible = node => Boolean(node && getComputedStyle(node).display !== 'none' && getComputedStyle(node).visibility !== 'hidden');
    const rect = node => node ? (() => { const r=node.getBoundingClientRect(); return { x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom }; })() : null;
    const dossier = document.querySelector('.gpp-entry-dossier[data-gpp-entry-detail="ready"]');
    const postBody = document.querySelector('#post-body');
    const main = document.querySelector('#post-body-content');
    const workflow = document.querySelector('#postbox-container-1');
    const timelineContainer = document.querySelector('#postbox-container-2');
    const status = document.querySelector('.gravityflow-status-box');
    const timeline = document.querySelector('.gravityflow-timeline');
    const notes = Array.from(document.querySelectorAll('.gravityflow-timeline .gravityflow-note'));
    const firstNote = notes[0] || null;
    const firstTitle = firstNote?.querySelector('.gravityflow-note-title') || null;
    const nativePrint = document.querySelector('.detail-view-print');
    const gppPrint = document.querySelector('.gpp-entry-print-utility[data-gpp-print-utility="dossier"]');
    const table = document.querySelector('.entry-detail-view');
    const actions = Array.from(document.querySelectorAll('.gravityflow-status-box .gravityflow-action-buttons button')).map(button => {
      const style = getComputedStyle(button);
      const r = button.getBoundingClientRect();
      return { value: button.value, height: r.height, background: style.backgroundColor, color: style.color, border: style.borderColor, disabled: button.disabled || button.getAttribute('aria-disabled') === 'true' };
    });
    const noteStyle = firstNote ? getComputedStyle(firstNote) : null;
    const inside = timeline?.querySelector(':scope > .inside') || null;
    const titlePseudo = firstTitle ? getComputedStyle(firstTitle, '::before') : null;
    const fullStyle = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).find(link => (link.id || '').includes('entry-detail-full-width'));
    const rootStyle = document.querySelector('.gravityflow_workflow_detail') ? getComputedStyle(document.querySelector('.gravityflow_workflow_detail')) : null;
    return {
      profile: dossier?.dataset.gppProfileId || null,
      dossier_count: document.querySelectorAll('.gpp-entry-dossier[data-gpp-entry-detail="ready"]').length,
      dossier_rect: rect(dossier),
      post_body_display: postBody ? getComputedStyle(postBody).display : null,
      post_body_grid_columns: postBody ? getComputedStyle(postBody).gridTemplateColumns : null,
      post_body_rect: rect(postBody),
      main_parent: main?.parentElement?.id || null,
      workflow_parent: workflow?.parentElement?.id || null,
      timeline_parent: timelineContainer?.parentElement?.id || null,
      main_rect: rect(main),
      workflow_rect: rect(workflow),
      timeline_container_rect: rect(timelineContainer),
      status_count: document.querySelectorAll('.gravityflow-status-box').length,
      status_visible: visible(status),
      status_inside_dossier: Boolean(status?.closest('.gpp-entry-dossier')),
      timeline_count: document.querySelectorAll('.gravityflow-timeline').length,
      timeline_visible: visible(timeline),
      timeline_inside_dossier: Boolean(timeline?.closest('.gpp-entry-dossier')),
      event_count: notes.length,
      event_classes: notes.map(note => [...note.classList]),
      event_border: noteStyle?.borderTopWidth || null,
      event_radius: noteStyle?.borderRadius || null,
      event_background: noteStyle?.backgroundColor || null,
      event_shadow: noteStyle?.boxShadow || null,
      timeline_spine_width: inside ? getComputedStyle(inside).borderInlineStartWidth : null,
      marker_content: titlePseudo?.content || null,
      marker_border: titlePseudo?.borderTopWidth || null,
      native_table_display: table ? getComputedStyle(table).display : null,
      native_print_display: nativePrint ? getComputedStyle(nativePrint).display : null,
      gpp_print_count: document.querySelectorAll('.gpp-entry-print-utility[data-gpp-print-utility="dossier"]').length,
      gpp_print_visible: visible(gppPrint),
      actions,
      workflow_content: {
        heading: Boolean(document.querySelector('#gravityflow-status-box-container > h3.hndle')),
        step_status: Boolean(document.querySelector('.gravityflow-status-box-field-step-status')),
        assignee: Boolean(document.querySelector('.gravityflow-status-box-field-assignees')),
        note_textarea: Boolean(document.querySelector('textarea[name="gravityflow_note"]')),
        approve: Boolean(document.querySelector('.gravityflow-action-buttons button[value="approved"]')),
        reject: Boolean(document.querySelector('.gravityflow-action-buttons button[value="rejected"]')),
        revert: Boolean(document.querySelector('.gravityflow-action-buttons button[value="revert"]')),
        instructions: Boolean(document.querySelector('.gravityflow-instructions')),
        due_known_selector: Boolean(document.querySelector('.gravityflow-status-box-field-due, [data-gravityflow-due-date]')),
      },
      full_width_stylesheet_loaded: Boolean(fullStyle),
      root_background: rootStyle?.backgroundColor || null,
      viewport_width: document.documentElement.clientWidth,
      document_scroll_width: document.documentElement.scrollWidth,
      tab_order_signature: Array.from(document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]'))
        .filter(node => !node.disabled && node.getAttribute('tabindex') !== '-1' && visible(node))
        .slice(0, 80)
        .map(node => `${node.tagName.toLowerCase()}:${node.id || node.getAttribute('name') || node.getAttribute('value') || node.className || ''}`),
    };
  });
}

function assertNoHorizontalOverflow(state, label) {
  if (state.document_scroll_width > state.viewport_width + 1) throw new Error(`${label} horizontal overflow: ${JSON.stringify({ viewport: state.viewport_width, scroll: state.document_scroll_width })}`);
}

function assertOnePrintAndNativeOwnership(state, label) {
  if (state.dossier_count !== 1 || state.status_count !== 1 || !state.status_visible || state.status_inside_dossier || state.timeline_count !== 1 || !state.timeline_visible || state.timeline_inside_dossier) {
    throw new Error(`${label} native ownership changed: ${JSON.stringify(state)}`);
  }
  if (state.native_table_display !== 'none' || state.native_print_display !== 'none' || state.gpp_print_count !== 1 || !state.gpp_print_visible) {
    throw new Error(`${label} duplicate suppression/Print contract failed: ${JSON.stringify(state)}`);
  }
}

async function screenshot(page, file) {
  await page.screenshot({ path: file, fullPage: true });
  if (!fs.statSync(file).size) throw new Error(`Empty screenshot: ${file}`);
}

async function makeComposite(browser, entries, output, columns = 2) {
  const composite = await browser.newPage({ viewport: { width: 1560, height: 1000 } });
  const cards = entries.map(entry => {
    const data = fs.readFileSync(entry.file).toString('base64');
    return `<figure><figcaption>${entry.label}</figcaption><img src="data:image/png;base64,${data}"></figure>`;
  }).join('');
  await composite.setContent(`<!doctype html><meta charset="utf-8"><style>
    body{margin:0;padding:20px;background:#eef2f7;font-family:Arial,sans-serif;color:#172033}
    main{display:grid;grid-template-columns:repeat(${columns},minmax(0,1fr));gap:18px;align-items:start}
    figure{margin:0;background:white;border:1px solid #d7dee8;border-radius:12px;padding:10px;overflow:hidden}
    figcaption{font-size:16px;font-weight:700;padding:4px 6px 10px;text-align:center}
    img{display:block;width:100%;height:auto;border:1px solid #e5e7eb}
  </style><main>${cards}</main>`);
  await composite.screenshot({ path: output, fullPage: true });
  await composite.close();
}

fs.mkdirSync(artifactDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
await login(page);

const before = lifecycleFacts();
const initial = activeVariantFacts();
if (initial.state !== 'active' || initial.variant !== 'current_safe' || initial.activation?.profile_id !== safeProfile) {
  throw new Error(`Current / Safe baseline activation unavailable: ${JSON.stringify(initial)}`);
}

await gotoReview(page, { width: 1440, height: 1000 }, safeProfile);
const safeDesktop = await inspectReview(page);
assertOnePrintAndNativeOwnership(safeDesktop, 'Current / Safe desktop');
assertNoHorizontalOverflow(safeDesktop, 'Current / Safe desktop');
if (safeDesktop.full_width_stylesheet_loaded) throw new Error('Full Width stylesheet leaked into Current / Safe.');
await screenshot(page, raw('current-safe-desktop'));

await gotoReview(page, { width: 390, height: 844 }, safeProfile);
const safeNarrow = await inspectReview(page);
assertOnePrintAndNativeOwnership(safeNarrow, 'Current / Safe narrow');
assertNoHorizontalOverflow(safeNarrow, 'Current / Safe narrow');
await screenshot(page, raw('current-safe-narrow'));

// Use the authentic native Gravity Forms Add-On settings page to switch.
await page.goto(settingsUrl, { waitUntil: 'networkidle' });
const selector = page.locator('#entry_detail_visual_variant_action');
if (await selector.count() !== 1) throw new Error('Entry Detail design selector was not rendered in the existing GPP settings page.');
const optionsBefore = await selector.locator('option').evaluateAll(items => items.map(item => ({ label: item.textContent?.trim() || '', value: item.value })));
const fullChoiceBefore = optionsBefore.find(item => item.label.includes('Full Width') && item.label.includes('طرح جدید تمام‌عرض') && item.value);
if (!fullChoiceBefore) throw new Error(`Owner-readable Full Width choice unavailable: ${JSON.stringify(optionsBefore)}`);
const staleFullCommand = fullChoiceBefore.value;
await selector.selectOption(staleFullCommand);
await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }), page.click('#gform-settings-save')]);
await page.waitForSelector('[data-gpp-entry-detail-visual-variant="full_width"]', { timeout: 30000 });
if (await page.locator('[data-gpp-entry-detail-visual-switch="completed"]').count() !== 1) throw new Error('Successful Full Width switch did not provide truthful settings feedback.');

const afterSwitch = activeVariantFacts();
if (afterSwitch.state !== 'active' || afterSwitch.variant !== 'full_width' || afterSwitch.activation?.profile_id !== fullProfile) {
  throw new Error(`Settings save did not activate Full Width through lifecycle: ${JSON.stringify(afterSwitch)}`);
}
const afterFullLifecycle = lifecycleFacts();
for (const surface of ['gravity_flow.inbox', 'print.dossier']) {
  if (JSON.stringify(before.activations[surface]) !== JSON.stringify(afterFullLifecycle.activations[surface])) throw new Error(`${surface} activation changed during Entry Detail visual switch.`);
}
if (before.binding_hash !== afterFullLifecycle.binding_hash) throw new Error('EnvironmentBindingSet changed during Entry Detail visual switch.');

// The command captured before switching is now stale and must fail clearly.
const stale = staleCommandResult(staleFullCommand);
if (stale.status !== 'REJECTED' || stale.reason !== 'visual_activation_conflict') throw new Error(`Stale visual action was not conflict-rejected: ${JSON.stringify(stale)}`);
if (activeVariantFacts().variant !== 'full_width') throw new Error('Stale action changed the newer Full Width activation.');

await gotoReview(page, { width: 1600, height: 1000 }, fullProfile);
const fullWide = await inspectReview(page);
assertOnePrintAndNativeOwnership(fullWide, 'Full Width wide');
assertNoHorizontalOverflow(fullWide, 'Full Width wide');
if (!fullWide.full_width_stylesheet_loaded || fullWide.post_body_display !== 'grid') throw new Error(`Full Width stylesheet/grid not active: ${JSON.stringify(fullWide)}`);
if (fullWide.main_parent !== 'post-body' || fullWide.workflow_parent !== 'post-body' || fullWide.timeline_parent !== 'post-body') throw new Error(`CSS-only sibling seam changed: ${JSON.stringify(fullWide)}`);
if (!fullWide.main_rect || !fullWide.workflow_rect || fullWide.main_rect.width <= fullWide.workflow_rect.width * 2) throw new Error(`Wide dominant-main/bounded-workflow geometry not achieved: ${JSON.stringify(fullWide)}`);
if (Math.abs(fullWide.main_rect.y - fullWide.workflow_rect.y) > 3 || fullWide.timeline_container_rect?.y <= fullWide.main_rect.y) throw new Error(`Wide grid row placement differs from approved two-region structure: ${JSON.stringify(fullWide)}`);
if (fullWide.event_count < 1 || fullWide.event_radius === '0px' || fullWide.timeline_spine_width !== '2px' || fullWide.marker_content === 'none') throw new Error(`Native Timeline did not become neutral event cards/spine/markers: ${JSON.stringify(fullWide)}`);
if (fullWide.actions.length < 2 || fullWide.actions.some(action => action.height + 0.01 < 44)) throw new Error(`Full Width native actions are not usable: ${JSON.stringify(fullWide.actions)}`);
if (!fullWide.workflow_content.heading || !fullWide.workflow_content.step_status || !fullWide.workflow_content.note_textarea || !fullWide.workflow_content.approve || !fullWide.workflow_content.reject) throw new Error(`Authentic workflow-panel content inventory incomplete: ${JSON.stringify(fullWide.workflow_content)}`);
await screenshot(page, raw('full-width-wide'));

await gotoReview(page, { width: 1024, height: 900 }, fullProfile);
const fullMedium = await inspectReview(page);
assertOnePrintAndNativeOwnership(fullMedium, 'Full Width medium');
assertNoHorizontalOverflow(fullMedium, 'Full Width medium');
if (fullMedium.post_body_display !== 'grid' || !fullMedium.main_rect || !fullMedium.workflow_rect || fullMedium.main_rect.width <= fullMedium.workflow_rect.width) throw new Error(`Full Width medium grid did not remain bounded and readable: ${JSON.stringify(fullMedium)}`);
await screenshot(page, raw('full-width-medium'));

await gotoReview(page, { width: 390, height: 844 }, fullProfile);
const fullNarrow = await inspectReview(page);
assertOnePrintAndNativeOwnership(fullNarrow, 'Full Width narrow');
assertNoHorizontalOverflow(fullNarrow, 'Full Width narrow');
if (!fullNarrow.main_rect || !fullNarrow.workflow_rect || !fullNarrow.timeline_container_rect || !(fullNarrow.main_rect.y < fullNarrow.workflow_rect.y && fullNarrow.workflow_rect.y < fullNarrow.timeline_container_rect.y)) {
  throw new Error(`Full Width narrow layout did not collapse in logical source order: ${JSON.stringify(fullNarrow)}`);
}
if (fullNarrow.actions.some(action => action.height + 0.01 < 44)) throw new Error(`Full Width narrow actions violate interaction size: ${JSON.stringify(fullNarrow.actions)}`);
await screenshot(page, raw('full-width-narrow'));

// Full Width must not depend on Entry Detail progressive-enhancement JS.
const blockedContext = await browser.newContext();
let scriptBlocked = false;
await blockedContext.route('**/assets/js/srwf-gravity-flow-entry-detail.js*', route => {
  scriptBlocked = true;
  return route.abort();
});
const blockedPage = await blockedContext.newPage();
await login(blockedPage);
await gotoReview(blockedPage, { width: 1600, height: 1000 }, fullProfile);
const fullBlocked = await inspectReview(blockedPage);
assertOnePrintAndNativeOwnership(fullBlocked, 'Full Width JS-blocked');
assertNoHorizontalOverflow(fullBlocked, 'Full Width JS-blocked');
if (!scriptBlocked || fullBlocked.post_body_display !== 'grid' || !fullBlocked.full_width_stylesheet_loaded) throw new Error(`Full Width structural geometry depended on Entry Detail JS: ${JSON.stringify({ scriptBlocked, fullBlocked })}`);
const previewBound = await blockedPage.locator('.gpp-entry-dossier').getAttribute('data-gpp-preview-bound');
if (previewBound === '1') throw new Error('Blocked progressive-enhancement JS unexpectedly executed.');
await screenshot(blockedPage, raw('full-width-js-blocked'));
await blockedContext.close();

// Native User Input/editor fallback remains outside Full Width selector scope.
await page.setViewportSize({ width: 1280, height: 900 });
await page.goto(entryUrl(manifest.transition), { waitUntil: 'networkidle' });
const fallback = await page.evaluate(() => {
  const postBody = document.querySelector('#post-body');
  const table = document.querySelector('.entry-detail-view');
  return {
    dossier_count: document.querySelectorAll('.gpp-entry-dossier[data-gpp-entry-detail="ready"]').length,
    full_profile_count: document.querySelectorAll('.gpp-entry-dossier[data-gpp-profile-id="srwf.operations.entry-detail.full-width.v1"]').length,
    native_editor_visible: Boolean(table?.querySelector('.gform_wrapper') && getComputedStyle(table.querySelector('.gform_wrapper')).display !== 'none'),
    native_table_display: table ? getComputedStyle(table).display : null,
    post_body_grid_columns: postBody ? getComputedStyle(postBody).gridTemplateColumns : null,
  };
});
if (fallback.dossier_count !== 0 || fallback.full_profile_count !== 0 || !fallback.native_editor_visible || fallback.native_table_display === 'none') throw new Error(`Full Width leaked into native User Input fallback: ${JSON.stringify(fallback)}`);

// Roll back through the same authentic settings selector.
const rollbackSelection = await selectVariantThroughSettings(page, 'Current / Safe');
await page.waitForSelector('[data-gpp-entry-detail-visual-variant="current_safe"]', { timeout: 30000 });
if (await page.locator('[data-gpp-entry-detail-visual-switch="completed"]').count() !== 1) throw new Error('Current / Safe rollback did not provide truthful settings feedback.');
const finalVariant = activeVariantFacts();
if (finalVariant.variant !== 'current_safe' || finalVariant.activation?.profile_id !== safeProfile) throw new Error(`Current / Safe rollback did not restore exact baseline activation: ${JSON.stringify(finalVariant)}`);
const finalLifecycle = lifecycleFacts();
for (const surface of ['gravity_flow.inbox', 'print.dossier']) {
  if (JSON.stringify(before.activations[surface]) !== JSON.stringify(finalLifecycle.activations[surface])) throw new Error(`${surface} activation changed after visual rollback.`);
}
if (before.binding_hash !== finalLifecycle.binding_hash) throw new Error('EnvironmentBindingSet changed after visual rollback.');

await gotoReview(page, { width: 1440, height: 1000 }, safeProfile);
const safeRestored = await inspectReview(page);
assertOnePrintAndNativeOwnership(safeRestored, 'Restored Current / Safe');
if (safeRestored.full_width_stylesheet_loaded) throw new Error('Full Width stylesheet remained active after Current / Safe rollback.');
if (safeRestored.event_radius !== '0px' || safeRestored.event_background !== 'rgba(0, 0, 0, 0)') throw new Error(`Current / Safe Timeline did not return to PR47 neutral chronology: ${JSON.stringify(safeRestored)}`);

// Preserve all required exact-path WU18 screenshot evidence without workflow YAML changes.
await makeComposite(browser, [
  { label: 'Current / Safe — desktop', file: raw('current-safe-desktop') },
  { label: 'Full Width — wide desktop', file: raw('full-width-wide') },
  { label: 'Full Width — medium', file: raw('full-width-medium') },
  { label: 'Full Width — wide / Entry Detail JS blocked', file: raw('full-width-js-blocked') },
], path.join(artifactDir, 'wu18-entry-detail-native-chrome-desktop.png'), 2);
await makeComposite(browser, [
  { label: 'Current / Safe — narrow', file: raw('current-safe-narrow') },
  { label: 'Full Width — narrow', file: raw('full-width-narrow') },
], path.join(artifactDir, 'wu18-entry-detail-native-chrome-mobile.png'), 2);

const browserResultsPath = path.join(artifactDir, 'wu18-browser-results.json');
const browserResults = JSON.parse(fs.readFileSync(browserResultsPath, 'utf8'));
browserResults.entry_detail_visual_variants = {
  status: 'PASS',
  settings_selector_reached: true,
  current_safe: { desktop: safeDesktop, narrow: safeNarrow, restored: safeRestored },
  full_width: { wide: fullWide, medium: fullMedium, narrow: fullNarrow, js_blocked: fullBlocked },
  structural_feasibility: {
    result: 'PASS',
    common_ancestor: '#post-body',
    direct_siblings: ['#post-body-content', '#postbox-container-1', '#postbox-container-2'],
    layout_method: 'CSS Grid normal flow',
    display_contents_required: false,
    absolute_fixed_transform_relocation_required: false,
    dom_reparenting_required: false,
  },
  workflow_content_truth: {
    heading: fullWide.workflow_content.heading ? 'AUTHENTIC_NATIVE_PRESENT' : 'NOT_PROVEN',
    current_status_step: fullWide.workflow_content.step_status ? 'AUTHENTIC_NATIVE_PRESENT' : 'NOT_PROVEN',
    assignee: fullWide.workflow_content.assignee ? 'AUTHENTIC_NATIVE_PRESENT' : 'NOT_PROVEN',
    note_textarea: fullWide.workflow_content.note_textarea ? 'AUTHENTIC_NATIVE_PRESENT' : 'NOT_PROVEN',
    approve: fullWide.workflow_content.approve ? 'AUTHENTIC_NATIVE_PRESENT' : 'NOT_PROVEN',
    reject: fullWide.workflow_content.reject ? 'AUTHENTIC_NATIVE_PRESENT' : 'NOT_PROVEN',
    revert: fullWide.workflow_content.revert ? 'AUTHENTIC_NATIVE_PRESENT' : 'NOT_PROVEN',
    instructions: fullWide.workflow_content.instructions ? 'AUTHENTIC_NATIVE_PRESENT' : 'NOT_PROVEN',
    due_date: 'NOT_AVAILABLE_IN_CURRENT_DOM',
  },
  timeline_feasibility: {
    event_wrapper: '.gravityflow-note',
    avatar: '.gravityflow-note-avatar',
    title: '.gravityflow-note-title',
    metadata: '.gravityflow-note-meta',
    body: '.gravityflow-note-body',
    stable_machine_readable_outcome: false,
    semantic_tinting: 'NOT_ACHIEVABLE_WITHIN_CSS_ONLY_BOUNDARY',
    neutral_event_cards: true,
  },
  stale_action: stale,
  lifecycle_preservation: {
    inbox_unchanged: true,
    print_unchanged: true,
    environment_binding_set_unchanged: true,
    restored_exact_current_safe_activation: true,
  },
  raw_screenshots_generated_in_job: [
    path.basename(raw('current-safe-desktop')),
    path.basename(raw('current-safe-narrow')),
    path.basename(raw('full-width-wide')),
    path.basename(raw('full-width-medium')),
    path.basename(raw('full-width-narrow')),
    path.basename(raw('full-width-js-blocked')),
  ],
  uploaded_composites: [
    'wu18-entry-detail-native-chrome-desktop.png',
    'wu18-entry-detail-native-chrome-mobile.png',
  ],
  rollback_choice: rollbackSelection.choice.label,
};
fs.writeFileSync(browserResultsPath, `${JSON.stringify(browserResults, null, 2)}\n`);

await browser.close();
console.log(JSON.stringify({
  status: 'PASS',
  full_width_profile: fullProfile,
  restored_profile: finalVariant.activation.profile_id,
  settings_selector_reached: true,
  stale_action_conflict_proven: true,
  css_only_grid_proven: true,
  js_blocked_proven: true,
  screenshots: ['wu18-entry-detail-native-chrome-desktop.png', 'wu18-entry-detail-native-chrome-mobile.png'],
}));
