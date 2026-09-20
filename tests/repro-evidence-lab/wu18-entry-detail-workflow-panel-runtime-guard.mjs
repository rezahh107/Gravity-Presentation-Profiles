import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
const adminPassword = 'wu21-bootstrap-pass-2026';
const fullProfile = 'srwf.operations.entry-detail.full-width.v1';
const safeProfile = 'srwf.operations.entry-detail.v1';

if (!artifactDir || !wpPath || !wpCli) throw new Error('WU18 workflow-panel runtime guard environment is incomplete.');

const expected = Object.freeze({
  wideBodyPadding: 24,
  boundedBodyPadding: 20,
  wideOuterRadius: 18,
  narrowOuterRadius: 16,
  outerBackground: 'rgb(251, 252, 254)',
  outerBorder: 'rgb(228, 232, 240)',
  noteMinHeight: 129,
  noteBorder: 'rgb(221, 227, 238)',
  noteRadius: 11,
  actionGap: 16,
  actionHeight: 57,
  actionRadius: 9,
  approveBackground: 'rgb(55, 155, 82)',
  rejectBackground: 'rgb(229, 89, 103)',
  revertBackground: 'rgb(252, 242, 216)',
  revertBorder: 'rgb(216, 177, 74)',
  revertColor: 'rgb(138, 100, 20)',
  white: 'rgb(255, 255, 255)',
  heading: 'اقدام شما',
  guidancePrimary: 'این پرونده منتظر اقدام شماست.',
  guidanceSupport: 'لطفاً پس از بررسی اطلاعات، یکی از گزینه‌های زیر را انتخاب کنید.',
  noteLabel: 'یادداشت (اختیاری)',
  stageTitle: 'اطلاعات مرحله فعلی',
  footer: 'تمامی عملیات بر اساس تنظیمات Gravity Flow انجام می‌شود.',
});

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

function switchVariant(target) {
  const encoded = Buffer.from(target, 'utf8').toString('base64');
  return JSON.parse(wpEval(`
    $target=base64_decode('${encoded}');
    $s=\\GravityPresentationProfiles\\GravityForms\\EntryDetailVisualVariantService::forWordPress();
    $f=$s->activeFacts();
    $r=$s->switchVariant(array('target_variant'=>$target,'expected_current_activation'=>$f['activation']));
    echo wp_json_encode(array('result'=>$r,'active'=>$s->activeFacts()),JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
  `));
}

const manifest = JSON.parse(wpEval('echo wp_json_encode(get_option("gpp_wu18_fixture_manifest"), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);'));
if (!manifest?.alpha?.form_id || !manifest?.alpha?.entry_id) throw new Error('WU18 alpha fixture unavailable.');
const entryUrl = `${baseUrl}/wp-admin/admin.php?page=gravityflow-inbox&view=entry&id=${manifest.alpha.form_id}&lid=${manifest.alpha.entry_id}`;

function hostFacts() {
  return JSON.parse(wpEval(`
    $m=get_option('gpp_wu18_fixture_manifest');
    $entry=GFAPI::get_entry((int)$m['alpha']['entry_id']);
    $step=(new Gravity_Flow_API((int)$m['alpha']['form_id']))->get_current_step($entry);
    if(!$step) throw new RuntimeException('Current WU18 step unavailable.');
    $names=array();
    foreach($step->get_assignees() as $assignee){
      if(is_object($assignee)&&method_exists($assignee,'get_display_name')){
        $name=trim((string)$assignee->get_display_name());
        if($name!=='') $names[]=$name;
      }
    }
    $names=array_values(array_unique($names));
    $due=null;
    if(method_exists($step,'supports_due_date')&&method_exists($step,'get_due_date_timestamp')&&$step->supports_due_date()){
      $ts=$step->get_due_date_timestamp();
      if(is_numeric($ts)&&(int)$ts>0) $due=\\GravityPresentationProfiles\\SRWF\\GravityFlow\\PersianDateFormatter::formatDateTime((int)$ts);
    }
    echo wp_json_encode(array(
      'current_step_label'=>(string)$step->get_name(),
      'assignee_label'=>empty($names)?null:implode('، ',$names),
      'due_date_label'=>$due,
      'native_revert_enabled'=>!empty($step->revertEnable),
    ),JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
  `));
}

function px(value) { return Number.parseFloat(String(value || '').replace('px', '')); }
function exactPx(actual, wanted, label, tolerance = 0.05) {
  const value = px(actual);
  if (!Number.isFinite(value) || Math.abs(value - wanted) > tolerance) throw new Error(`${label}: expected ${wanted}px, got ${String(actual)}`);
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

async function inspect(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('#gravityflow-status-box-container');
    const body = panel?.querySelector('.gravityflow-status-box') || null;
    const note = body?.querySelector('textarea[name="gravityflow_note"]') || null;
    const noteLabel = body?.querySelector('label[for="gravityflow-note"]') || null;
    const group = body?.querySelector('.gravityflow-action-buttons') || null;
    const title = body?.querySelector('.gpp-entry-workflow-panel__title') || null;
    const guidance = body?.querySelector('.gpp-entry-workflow-panel__guidance') || null;
    const stage = body?.querySelector('.gpp-entry-workflow-panel__stage') || null;
    const footer = body?.querySelector('.gpp-entry-workflow-panel__footer') || null;
    const style = node => node ? getComputedStyle(node) : null;
    const rect = node => node ? node.getBoundingClientRect() : null;
    const panelStyle = style(panel);
    const bodyStyle = style(body);
    const noteStyle = style(note);
    const groupStyle = style(group);
    const actions = Array.from(group?.querySelectorAll('button') || []).map(button => {
      const s = getComputedStyle(button);
      const r = button.getBoundingClientRect();
      return {
        value: button.value,
        height: r.height,
        radius: s.borderRadius,
        background: s.backgroundColor,
        border: s.borderColor,
        color: s.color,
        display: s.display,
        align_items: s.alignItems,
        justify_content: s.justifyContent,
        text_align: s.textAlign,
        parent_is_native_action_group: button.parentElement?.classList.contains('gravityflow-action-buttons') || false,
      };
    });
    const profile = document.querySelector('.gpp-entry-dossier[data-gpp-entry-detail="ready"]')?.dataset.gppProfileId || null;
    const refinement = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some(link => {
      const haystack = `${link.id || ''} ${link.getAttribute('href') || ''}`;
      return haystack.includes('entry-detail-full-width-workflow-panel');
    });
    const facts = Object.fromEntries(Array.from(stage?.querySelectorAll('[data-gpp-workflow-fact]') || []).map(node => [node.dataset.gppWorkflowFact, node.textContent?.replace(/\s+/g, ' ').trim() || '']));
    const presentationNodes = [title, guidance, stage, footer].filter(Boolean);
    const presentationHtml = presentationNodes.map(node => node.outerHTML).join('');
    const nativeHeading = panel?.querySelector(':scope > h3.hndle') || null;
    return {
      profile,
      refinement_stylesheet_loaded: refinement,
      panel: panel && panelStyle ? {
        radius: panelStyle.borderRadius,
        background: panelStyle.backgroundColor,
        border_color: panelStyle.borderColor,
        border_width: panelStyle.borderWidth,
      } : null,
      body: body && bodyStyle ? {
        padding_left: bodyStyle.paddingLeft,
        padding_right: bodyStyle.paddingRight,
        background: bodyStyle.backgroundColor,
      } : null,
      note: note && noteStyle && rect(note) ? {
        height: rect(note).height,
        min_block_size: noteStyle.minBlockSize,
        radius: noteStyle.borderRadius,
        border_color: noteStyle.borderColor,
        id: note.id,
        name: note.getAttribute('name'),
      } : null,
      note_label: noteLabel?.textContent?.replace(/\s+/g, ' ').trim() || null,
      group: group && groupStyle ? { gap: groupStyle.gap, row_gap: groupStyle.rowGap } : null,
      actions,
      presentation: {
        title_count: body?.querySelectorAll('.gpp-entry-workflow-panel__title').length || 0,
        title: title?.textContent?.replace(/\s+/g, ' ').trim() || null,
        guidance_count: body?.querySelectorAll('.gpp-entry-workflow-panel__guidance').length || 0,
        guidance_primary: guidance?.querySelector('strong')?.textContent?.replace(/\s+/g, ' ').trim() || null,
        guidance_support: guidance?.querySelector('p')?.textContent?.replace(/\s+/g, ' ').trim() || null,
        stage_count: body?.querySelectorAll('.gpp-entry-workflow-panel__stage').length || 0,
        stage_title: stage?.querySelector('h4')?.textContent?.replace(/\s+/g, ' ').trim() || null,
        facts,
        footer_count: body?.querySelectorAll('.gpp-entry-workflow-panel__footer').length || 0,
        footer: footer?.textContent?.replace(/\s+/g, ' ').trim() || null,
        created_button_count: presentationNodes.reduce((sum, node) => sum + node.querySelectorAll('button,input[type="submit"]').length, 0),
        element_count: presentationNodes.reduce((sum, node) => sum + 1 + node.querySelectorAll('*').length, 0),
        html_bytes: new TextEncoder().encode(presentationHtml).length,
        native_heading_display: nativeHeading ? getComputedStyle(nativeHeading).display : null,
      },
      ownership: {
        panel_count: document.querySelectorAll('#gravityflow-status-box-container').length,
        group_count: document.querySelectorAll('.gravityflow-status-box .gravityflow-action-buttons').length,
        note_count: document.querySelectorAll('textarea[name="gravityflow_note"]').length,
        in_native_form: Boolean(body?.closest('form[id^="gform_"]')),
        in_dossier: Boolean(body?.closest('.gpp-entry-dossier')),
      },
      tab_order_signature: Array.from(document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]'))
        .filter(node => !node.disabled && node.getAttribute('tabindex') !== '-1' && getComputedStyle(node).display !== 'none' && getComputedStyle(node).visibility !== 'hidden')
        .map(node => `${node.tagName.toLowerCase()}:${node.id || node.getAttribute('name') || node.getAttribute('value') || node.className || ''}`),
      viewport_width: document.documentElement.clientWidth,
      document_scroll_width: document.documentElement.scrollWidth,
    };
  });
}

function assertNoOverflow(state, label) {
  if (state.document_scroll_width > state.viewport_width + 1) throw new Error(`${label}: horizontal overflow ${state.document_scroll_width}/${state.viewport_width}`);
}

function assertNativeSafe(state, label) {
  if (state.profile !== safeProfile || state.refinement_stylesheet_loaded) throw new Error(`${label}: Full Width leaked into Current / Safe.`);
  if (state.presentation.title_count || state.presentation.guidance_count || state.presentation.stage_count || state.presentation.footer_count) throw new Error(`${label}: Full Width presentation markup leaked into Current / Safe.`);
  if (state.ownership.note_count !== 1 || state.note?.name !== 'gravityflow_note') throw new Error(`${label}: native Note ownership changed.`);
  for (const action of state.actions) {
    if (Math.abs(action.height - 44) > 0.05) throw new Error(`${label}: ${action.value} expected native 44px, got ${action.height}px`);
  }
  assertNoOverflow(state, label);
}

function assertPresentation(state, host, label) {
  const p = state.presentation;
  if (p.title_count !== 1 || p.title !== expected.heading) throw new Error(`${label}: presentation heading mismatch: ${JSON.stringify(p)}`);
  if (p.guidance_count !== 1 || p.guidance_primary !== expected.guidancePrimary || p.guidance_support !== expected.guidanceSupport) throw new Error(`${label}: static yellow guidance mismatch: ${JSON.stringify(p)}`);
  if (p.stage_count !== 1 || p.stage_title !== expected.stageTitle) throw new Error(`${label}: current-stage section mismatch: ${JSON.stringify(p)}`);
  if (p.footer_count !== 1 || p.footer !== expected.footer) throw new Error(`${label}: static Gravity Flow footer mismatch: ${JSON.stringify(p)}`);
  if (p.created_button_count !== 0) throw new Error(`${label}: GPP presentation markup manufactured workflow controls.`);
  if (p.native_heading_display !== 'none') throw new Error(`${label}: duplicate native technical heading remains visible alongside GPP heading.`);
  if (p.facts['current-step'] !== host.current_step_label) throw new Error(`${label}: current step does not match the authentic server step: ${JSON.stringify({ browser:p.facts['current-step'], host:host.current_step_label })}`);
  if (host.assignee_label === null) {
    if ('assignee' in p.facts) throw new Error(`${label}: unavailable assignee row was fabricated.`);
  } else if (p.facts.assignee !== host.assignee_label) {
    throw new Error(`${label}: assignee does not match authentic server assignee: ${JSON.stringify({ browser:p.facts.assignee, host:host.assignee_label })}`);
  }
  if (host.due_date_label === null) {
    if ('due-date' in p.facts) throw new Error(`${label}: unavailable due-date row was fabricated.`);
  } else if (p.facts['due-date'] !== host.due_date_label) {
    throw new Error(`${label}: due date does not match authentic server due date: ${JSON.stringify({ browser:p.facts['due-date'], host:host.due_date_label })}`);
  }
  if (!Number.isFinite(p.html_bytes) || p.html_bytes <= 0 || p.html_bytes > 4096) throw new Error(`${label}: presentation markup is not small/bounded: ${p.html_bytes} bytes.`);
  if (!Number.isFinite(p.element_count) || p.element_count < 10 || p.element_count > 20) throw new Error(`${label}: presentation DOM is unexpectedly large: ${p.element_count} elements.`);
}

function assertFullWidth(state, host, label, bodyPadding, outerRadius) {
  if (state.profile !== fullProfile || !state.refinement_stylesheet_loaded) throw new Error(`${label}: Full Width refinement is not lifecycle-active.`);
  if (!state.panel || !state.body || !state.note || !state.group) throw new Error(`${label}: authentic workflow panel is incomplete.`);
  if (state.ownership.panel_count !== 1 || state.ownership.group_count !== 1 || state.ownership.note_count !== 1 || !state.ownership.in_native_form || state.ownership.in_dossier) throw new Error(`${label}: native Gravity Flow ownership changed.`);
  if (state.panel.background !== expected.outerBackground || state.panel.border_color !== expected.outerBorder) throw new Error(`${label}: panel surface/border drifted.`);
  exactPx(state.panel.border_width, 1, `${label} panel border`);
  exactPx(state.panel.radius, outerRadius, `${label} panel radius`);
  if (state.body.background !== expected.outerBackground) throw new Error(`${label}: panel body surface drifted.`);
  exactPx(state.body.padding_left, bodyPadding, `${label} body left inset`);
  exactPx(state.body.padding_right, bodyPadding, `${label} body right inset`);
  exactPx(state.note.min_block_size, expected.noteMinHeight, `${label} Note min-block-size`);
  if (state.note.height + 0.05 < expected.noteMinHeight || state.note.border_color !== expected.noteBorder || state.note.id !== 'gravityflow-note' || state.note.name !== 'gravityflow_note') throw new Error(`${label}: native Note control/geometry drifted.`);
  exactPx(state.note.radius, expected.noteRadius, `${label} Note radius`);
  if (state.note_label !== expected.noteLabel) throw new Error(`${label}: optional Note label mismatch: ${state.note_label}`);
  exactPx(state.group.row_gap || state.group.gap, expected.actionGap, `${label} action gap`);
  const values = state.actions.map(item => item.value).sort();
  if (!values.includes('approved') || !values.includes('rejected')) throw new Error(`${label}: authentic Approve/Reject action inventory drifted: ${JSON.stringify(state.actions)}`);
  if (values.some(value => !['approved','rejected','revert'].includes(value))) throw new Error(`${label}: unexpected workflow action was introduced: ${JSON.stringify(values)}`);
  for (const action of state.actions) {
    if (Math.abs(action.height - expected.actionHeight) > 0.05) throw new Error(`${label}: ${action.value} expected ${expected.actionHeight}px, got ${action.height}px`);
    exactPx(action.radius, expected.actionRadius, `${label} ${action.value} radius`);
    if (action.display !== 'flex' || action.align_items !== 'center' || action.justify_content !== 'center' || action.text_align !== 'center' || !action.parent_is_native_action_group) throw new Error(`${label}: ${action.value} label/icon group is not centered on the original native action.`);
  }
  const approve = state.actions.find(item => item.value === 'approved');
  const reject = state.actions.find(item => item.value === 'rejected');
  const revert = state.actions.find(item => item.value === 'revert');
  if (approve.background !== expected.approveBackground || approve.border !== expected.approveBackground || approve.color !== expected.white) throw new Error(`${label}: Approve computed palette drifted.`);
  if (reject.background !== expected.rejectBackground || reject.border !== expected.rejectBackground || reject.color !== expected.white) throw new Error(`${label}: Reject computed palette drifted.`);
  if (revert && (revert.background !== expected.revertBackground || revert.border !== expected.revertBorder || revert.color !== expected.revertColor)) throw new Error(`${label}: native Revert computed palette drifted.`);
  if (Boolean(revert) !== Boolean(host.native_revert_enabled)) throw new Error(`${label}: Revert presence no longer matches native Gravity Flow configuration.`);
  assertPresentation(state, host, label);
  assertNoOverflow(state, label);
}

function assertPreserved(before, after, label) {
  for (const surface of ['gravity_flow.inbox', 'print.dossier']) {
    if (JSON.stringify(before.activations[surface]) !== JSON.stringify(after.activations[surface])) throw new Error(`${label}: ${surface} activation changed.`);
  }
  if (before.binding_hash !== after.binding_hash) throw new Error(`${label}: EnvironmentBindingSet changed.`);
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
const raw = name => path.join(artifactDir, `wu18-panel-markup-${name}.raw.png`);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
let initialFacts = null;
let switched = false;
let evidence = null;

try {
  await login(page);
  initialFacts = lifecycleFacts();
  const host = hostFacts();
  const initialVariant = activeVariantFacts();
  if (initialVariant.state !== 'active' || initialVariant.variant !== 'current_safe' || initialVariant.activation?.profile_id !== safeProfile) throw new Error(`Current / Safe baseline unavailable: ${JSON.stringify(initialVariant)}`);

  await gotoProfile(page, { width: 1440, height: 1000 }, safeProfile);
  const safeDesktop = await inspect(page);
  assertNativeSafe(safeDesktop, 'Current / Safe desktop');
  await screenshot(page, raw('current-safe-desktop'));

  await gotoProfile(page, { width: 390, height: 844 }, safeProfile);
  const safeNarrow = await inspect(page);
  assertNativeSafe(safeNarrow, 'Current / Safe narrow');
  await screenshot(page, raw('current-safe-narrow'));

  const switchedFacts = switchVariant('full_width');
  switched = true;
  if (switchedFacts.active?.variant !== 'full_width' || switchedFacts.active?.activation?.profile_id !== fullProfile) throw new Error(`Full Width lifecycle switch failed: ${JSON.stringify(switchedFacts)}`);
  assertPreserved(initialFacts, lifecycleFacts(), 'Full Width activation');

  await gotoProfile(page, { width: 1600, height: 1000 }, fullProfile);
  const wide = await inspect(page);
  assertFullWidth(wide, host, 'Full Width wide', expected.wideBodyPadding, expected.wideOuterRadius);
  await screenshot(page, raw('full-width-wide'));

  await gotoProfile(page, { width: 1024, height: 900 }, fullProfile);
  const medium = await inspect(page);
  assertFullWidth(medium, host, 'Full Width medium', expected.boundedBodyPadding, expected.wideOuterRadius);
  await screenshot(page, raw('full-width-medium'));

  await gotoProfile(page, { width: 390, height: 844 }, fullProfile);
  const narrow = await inspect(page);
  assertFullWidth(narrow, host, 'Full Width narrow', expected.boundedBodyPadding, expected.narrowOuterRadius);
  await screenshot(page, raw('full-width-narrow'));

  // PRI-FND-001 remains a mandatory falsification control for the original host-cascade defect class.
  await gotoProfile(page, { width: 1600, height: 1000 }, fullProfile);
  await page.addStyleTag({ content: `
    #poststuff #gravityflow-status-box-container .gravityflow-status-box {
      padding-inline-start: 12px !important;
      padding-inline-end: 12px !important;
    }
    .gravityflow-status-box .gravityflow-action-buttons button {
      box-sizing: border-box !important;
      min-block-size: 44px !important;
      block-size: 44px !important;
      height: 44px !important;
      padding-block: 0 !important;
    }
  ` });
  const syntheticFallback = await inspect(page);
  exactPx(syntheticFallback.body.padding_left, 12, 'Synthetic fallback left inset');
  exactPx(syntheticFallback.body.padding_right, 12, 'Synthetic fallback right inset');
  for (const action of syntheticFallback.actions) {
    if (Math.abs(action.height - 44) > 0.05) throw new Error(`Synthetic fallback failed to force 44px for ${action.value}: ${action.height}px`);
  }
  let rejection = null;
  try { assertFullWidth(syntheticFallback, host, 'Synthetic host-cascade fallback', expected.wideBodyPadding, expected.wideOuterRadius); }
  catch (error) { rejection = String(error?.message || error); }
  if (!rejection) throw new Error('Runtime guard accepted the synthetic host/cascade fallback.');

  const blockedContext = await browser.newContext();
  let scriptBlocked = false;
  await blockedContext.route('**/assets/js/srwf-gravity-flow-entry-detail.js*', route => { scriptBlocked = true; return route.abort(); });
  const blockedPage = await blockedContext.newPage();
  await login(blockedPage);
  await gotoProfile(blockedPage, { width: 1600, height: 1000 }, fullProfile);
  const jsBlocked = await inspect(blockedPage);
  assertFullWidth(jsBlocked, host, 'Full Width JS-blocked', expected.wideBodyPadding, expected.wideOuterRadius);
  if (!scriptBlocked) throw new Error('Entry Detail progressive-enhancement JS was not actually blocked.');
  await screenshot(blockedPage, raw('full-width-js-blocked'));
  await blockedContext.close();

  switchVariant('current_safe');
  switched = false;
  const restoredFacts = activeVariantFacts();
  if (restoredFacts.variant !== 'current_safe' || restoredFacts.activation?.profile_id !== safeProfile) throw new Error(`Current / Safe rollback failed: ${JSON.stringify(restoredFacts)}`);
  assertPreserved(initialFacts, lifecycleFacts(), 'Current / Safe rollback');
  await gotoProfile(page, { width: 1440, height: 1000 }, safeProfile);
  const safeRestored = await inspect(page);
  assertNativeSafe(safeRestored, 'Restored Current / Safe');

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

  evidence = {
    status: 'PASS',
    enforcement_boundary: 'authentic WU18 Playwright computed styles and server-rendered presentation on lifecycle-activated Full Width Entry Detail',
    expected,
    host_facts: host,
    current_safe: { desktop: safeDesktop, narrow: safeNarrow, restored: safeRestored },
    full_width: { wide, medium, narrow, js_blocked: jsBlocked },
    original_defect_falsification: {
      result: 'PASS',
      forced_body_padding: syntheticFallback.body,
      forced_actions: syntheticFallback.actions,
      rejection,
    },
    performance: {
      new_server_rendered_dom_elements: wide.presentation.element_count,
      additional_html_bytes: wide.presentation.html_bytes,
      additional_network_request: false,
      new_javascript: false,
      new_dependency: false,
    },
    computed_style_guard_proven: true,
    presentation_markup_proven: true,
    authentic_fact_projection_proven: true,
    missing_fact_omission_proven: host.due_date_label === null ? !('due-date' in wide.presentation.facts) : true,
    no_gpp_workflow_controls_proven: wide.presentation.created_button_count === 0,
    original_defect_falsification_proven: true,
    current_safe_44_proven: safeDesktop.actions.every(action => Math.abs(action.height - 44) <= 0.05),
    medium_narrow_proven: true,
    js_blocked_proven: true,
    lifecycle_preservation_proven: true,
  };
} finally {
  if (switched) {
    try { switchVariant('current_safe'); } catch (_) {}
  }
  await context.close();
  await browser.close();
}

if (!evidence) throw new Error('WU18 workflow-panel runtime evidence was not produced.');
const output = path.join(artifactDir, 'wu18-entry-detail-workflow-panel-runtime-guard.json');
fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify({
  status: 'PASS',
  computed_style_guard_proven: true,
  presentation_markup_proven: true,
  authentic_fact_projection_proven: true,
  original_defect_falsification_proven: true,
  current_safe_44_proven: true,
  medium_narrow_proven: true,
  js_blocked_proven: true,
  lifecycle_preservation_proven: true,
  dom_elements: evidence.performance.new_server_rendered_dom_elements,
  html_bytes: evidence.performance.additional_html_bytes,
}));
