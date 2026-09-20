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
    const group = body?.querySelector('.gravityflow-action-buttons') || null;
    const style = node => node ? getComputedStyle(node) : null;
    const rect = node => node ? node.getBoundingClientRect() : null;
    const panelStyle = style(panel);
    const bodyStyle = style(body);
    const noteStyle = style(note);
    const groupStyle = style(group);
    const actions = Array.from(group?.querySelectorAll('button') || []).map(button => {
      const s = getComputedStyle(button);
      const r = button.getBoundingClientRect();
      return { value: button.value, height: r.height, radius: s.borderRadius, background: s.backgroundColor, border: s.borderColor, color: s.color };
    });
    const profile = document.querySelector('.gpp-entry-dossier[data-gpp-entry-detail="ready"]')?.dataset.gppProfileId || null;
    const refinement = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some(link => {
      const haystack = `${link.id || ''} ${link.getAttribute('href') || ''}`;
      return haystack.includes('entry-detail-full-width-workflow-panel');
    });
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
      } : null,
      group: group && groupStyle ? { gap: groupStyle.gap, row_gap: groupStyle.rowGap } : null,
      actions,
      ownership: {
        panel_count: document.querySelectorAll('#gravityflow-status-box-container').length,
        group_count: document.querySelectorAll('.gravityflow-status-box .gravityflow-action-buttons').length,
        in_native_form: Boolean(body?.closest('form[id^="gform_"]')),
        in_dossier: Boolean(body?.closest('.gpp-entry-dossier')),
      },
      viewport_width: document.documentElement.clientWidth,
      document_scroll_width: document.documentElement.scrollWidth,
    };
  });
}

function assertNoOverflow(state, label) {
  if (state.document_scroll_width > state.viewport_width + 1) throw new Error(`${label}: horizontal overflow ${state.document_scroll_width}/${state.viewport_width}`);
}

function assertNative44(state, label) {
  if (state.profile !== safeProfile || state.refinement_stylesheet_loaded) throw new Error(`${label}: Full Width leaked into Current / Safe.`);
  const values = state.actions.map(item => item.value).sort();
  if (JSON.stringify(values) !== JSON.stringify(['approved', 'rejected', 'revert'])) throw new Error(`${label}: native action inventory drifted: ${JSON.stringify(state.actions)}`);
  for (const action of state.actions) {
    if (Math.abs(action.height - 44) > 0.05) throw new Error(`${label}: ${action.value} expected native 44px, got ${action.height}px`);
  }
  assertNoOverflow(state, label);
}

function assertFullWidth(state, label, bodyPadding, outerRadius) {
  if (state.profile !== fullProfile || !state.refinement_stylesheet_loaded) throw new Error(`${label}: Full Width refinement is not lifecycle-active.`);
  if (!state.panel || !state.body || !state.note || !state.group) throw new Error(`${label}: authentic workflow panel is incomplete.`);
  if (state.ownership.panel_count !== 1 || state.ownership.group_count !== 1 || !state.ownership.in_native_form || state.ownership.in_dossier) throw new Error(`${label}: native Gravity Flow ownership changed.`);
  if (state.panel.background !== expected.outerBackground || state.panel.border_color !== expected.outerBorder) throw new Error(`${label}: panel surface/border drifted.`);
  exactPx(state.panel.border_width, 1, `${label} panel border`);
  exactPx(state.panel.radius, outerRadius, `${label} panel radius`);
  if (state.body.background !== expected.outerBackground) throw new Error(`${label}: panel body surface drifted.`);
  exactPx(state.body.padding_left, bodyPadding, `${label} body left inset`);
  exactPx(state.body.padding_right, bodyPadding, `${label} body right inset`);
  exactPx(state.note.min_block_size, expected.noteMinHeight, `${label} Note min-block-size`);
  if (state.note.height + 0.05 < expected.noteMinHeight || state.note.border_color !== expected.noteBorder) throw new Error(`${label}: Note geometry/border drifted.`);
  exactPx(state.note.radius, expected.noteRadius, `${label} Note radius`);
  exactPx(state.group.row_gap || state.group.gap, expected.actionGap, `${label} action gap`);
  const values = state.actions.map(item => item.value).sort();
  if (JSON.stringify(values) !== JSON.stringify(['approved', 'rejected', 'revert'])) throw new Error(`${label}: Full Width action inventory drifted: ${JSON.stringify(state.actions)}`);
  for (const action of state.actions) {
    if (Math.abs(action.height - expected.actionHeight) > 0.05) throw new Error(`${label}: ${action.value} expected ${expected.actionHeight}px, got ${action.height}px`);
    exactPx(action.radius, expected.actionRadius, `${label} ${action.value} radius`);
  }
  const approve = state.actions.find(item => item.value === 'approved');
  const reject = state.actions.find(item => item.value === 'rejected');
  const revert = state.actions.find(item => item.value === 'revert');
  if (approve.background !== expected.approveBackground || approve.border !== expected.approveBackground || approve.color !== expected.white) throw new Error(`${label}: Approve computed palette drifted.`);
  if (reject.background !== expected.rejectBackground || reject.border !== expected.rejectBackground || reject.color !== expected.white) throw new Error(`${label}: Reject computed palette drifted.`);
  if (revert.background !== expected.revertBackground || revert.border !== expected.revertBorder || revert.color !== expected.revertColor) throw new Error(`${label}: Revert computed palette drifted.`);
  assertNoOverflow(state, label);
}

function assertPreserved(before, after, label) {
  for (const surface of ['gravity_flow.inbox', 'print.dossier']) {
    if (JSON.stringify(before.activations[surface]) !== JSON.stringify(after.activations[surface])) throw new Error(`${label}: ${surface} activation changed.`);
  }
  if (before.binding_hash !== after.binding_hash) throw new Error(`${label}: EnvironmentBindingSet changed.`);
}

fs.mkdirSync(artifactDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
let initialFacts = null;
let switched = false;
let evidence = null;

try {
  await login(page);
  initialFacts = lifecycleFacts();
  const initialVariant = activeVariantFacts();
  if (initialVariant.state !== 'active' || initialVariant.variant !== 'current_safe' || initialVariant.activation?.profile_id !== safeProfile) throw new Error(`Current / Safe baseline unavailable: ${JSON.stringify(initialVariant)}`);

  await gotoProfile(page, { width: 1440, height: 1000 }, safeProfile);
  const safeDesktop = await inspect(page);
  assertNative44(safeDesktop, 'Current / Safe desktop');
  await gotoProfile(page, { width: 390, height: 844 }, safeProfile);
  const safeNarrow = await inspect(page);
  assertNative44(safeNarrow, 'Current / Safe narrow');

  const switchedFacts = switchVariant('full_width');
  switched = true;
  if (switchedFacts.active?.variant !== 'full_width' || switchedFacts.active?.activation?.profile_id !== fullProfile) throw new Error(`Full Width lifecycle switch failed: ${JSON.stringify(switchedFacts)}`);
  assertPreserved(initialFacts, lifecycleFacts(), 'Full Width activation');

  await gotoProfile(page, { width: 1600, height: 1000 }, fullProfile);
  const wide = await inspect(page);
  assertFullWidth(wide, 'Full Width wide', expected.wideBodyPadding, expected.wideOuterRadius);
  await gotoProfile(page, { width: 1024, height: 900 }, fullProfile);
  const medium = await inspect(page);
  assertFullWidth(medium, 'Full Width medium', expected.boundedBodyPadding, expected.wideOuterRadius);
  await gotoProfile(page, { width: 390, height: 844 }, fullProfile);
  const narrow = await inspect(page);
  assertFullWidth(narrow, 'Full Width narrow', expected.boundedBodyPadding, expected.narrowOuterRadius);

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
  try { assertFullWidth(syntheticFallback, 'Synthetic host-cascade fallback', expected.wideBodyPadding, expected.wideOuterRadius); }
  catch (error) { rejection = String(error?.message || error); }
  if (!rejection) throw new Error('Runtime guard accepted the synthetic host/cascade fallback.');

  const blockedContext = await browser.newContext();
  let scriptBlocked = false;
  await blockedContext.route('**/assets/js/srwf-gravity-flow-entry-detail.js*', route => { scriptBlocked = true; return route.abort(); });
  const blockedPage = await blockedContext.newPage();
  await login(blockedPage);
  await gotoProfile(blockedPage, { width: 1600, height: 1000 }, fullProfile);
  const jsBlocked = await inspect(blockedPage);
  assertFullWidth(jsBlocked, 'Full Width JS-blocked', expected.wideBodyPadding, expected.wideOuterRadius);
  if (!scriptBlocked) throw new Error('Entry Detail progressive-enhancement JS was not actually blocked.');
  await blockedContext.close();

  switchVariant('current_safe');
  switched = false;
  const restoredFacts = activeVariantFacts();
  if (restoredFacts.variant !== 'current_safe' || restoredFacts.activation?.profile_id !== safeProfile) throw new Error(`Current / Safe rollback failed: ${JSON.stringify(restoredFacts)}`);
  assertPreserved(initialFacts, lifecycleFacts(), 'Current / Safe rollback');
  await gotoProfile(page, { width: 1440, height: 1000 }, safeProfile);
  const safeRestored = await inspect(page);
  assertNative44(safeRestored, 'Restored Current / Safe');

  evidence = {
    status: 'PASS',
    enforcement_boundary: 'authentic WU18 Playwright computed styles on lifecycle-activated Full Width Entry Detail',
    expected,
    current_safe: { desktop: safeDesktop, narrow: safeNarrow, restored: safeRestored },
    full_width: { wide, medium, narrow, js_blocked: jsBlocked },
    original_defect_falsification: {
      status: 'PASS',
      refinement_stylesheet_still_loaded: syntheticFallback.refinement_stylesheet_loaded,
      forced_body_padding: { left: syntheticFallback.body.padding_left, right: syntheticFallback.body.padding_right },
      forced_action_heights: syntheticFallback.actions.map(action => ({ value: action.value, height: action.height })),
      guard_rejection: rejection,
    },
    lifecycle_preservation: {
      inbox_unchanged: true,
      print_unchanged: true,
      environment_binding_set_unchanged: true,
      restored_exact_current_safe_activation: true,
    },
    target_bitmap_numerical_diff: 'NOT_PROVEN',
  };
  fs.writeFileSync(path.join(artifactDir, 'wu18-entry-detail-workflow-panel-runtime-guard.json'), `${JSON.stringify(evidence, null, 2)}\n`);
} finally {
  if (switched) {
    try { switchVariant('current_safe'); } catch (_) { /* Preserve original failure while best-effort restoring the fixture. */ }
  }
  await browser.close();
}

console.log(JSON.stringify({
  status: evidence?.status || 'FAIL',
  computed_style_guard_proven: evidence?.status === 'PASS',
  original_defect_falsification_proven: evidence?.original_defect_falsification?.status === 'PASS',
  current_safe_44_proven: Boolean(evidence?.current_safe?.desktop && evidence?.current_safe?.narrow && evidence?.current_safe?.restored),
  medium_narrow_proven: Boolean(evidence?.full_width?.medium && evidence?.full_width?.narrow),
  js_blocked_proven: Boolean(evidence?.full_width?.js_blocked),
  lifecycle_preservation_proven: Boolean(evidence?.lifecycle_preservation?.restored_exact_current_safe_activation),
}));
