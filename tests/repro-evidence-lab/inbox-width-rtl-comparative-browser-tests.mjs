import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const artifactDir = process.env.WU21_ARTIFACT_DIR;
const repoRoot = process.env.GITHUB_WORKSPACE;
const repositorySha = process.env.GPP_WU21_REPOSITORY_SHA;
const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const wpCli = process.env.WU21_WP_CLI;
const wpPath = process.env.WU21_WP_PATH;
const tolerancePx = 2;

function wpEval(code) {
  return execFileSync(
    'php',
    [wpCli, '--path=' + wpPath, 'eval', code],
    { cwd: repoRoot, env: process.env, encoding: 'utf8' }
  ).trim();
}

if (!artifactDir || !repoRoot || !repositorySha || !wpCli || !wpPath) {
  throw new Error('RTL_SCROLL_QUALIFICATION_INFRASTRUCTURE_FAILURE: WU21 environment is incomplete.');
}

const fixturePath = path.join(artifactDir, 'fixture-manifest.json');
const runtimePath = path.join(artifactDir, 'runtime.json');
const integratedHostPath = path.join(artifactDir, 'integrated-visual-host.json');
for (const required of [fixturePath, runtimePath, integratedHostPath]) {
  if (!fs.existsSync(required)) throw new Error('RTL_SCROLL_QUALIFICATION_INFRASTRUCTURE_FAILURE: missing ' + required);
}

const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const runtime = JSON.parse(fs.readFileSync(runtimePath, 'utf8'));
const integratedHost = JSON.parse(fs.readFileSync(integratedHostPath, 'utf8'));
if (!fixture.frontend_inbox_url) throw new Error('RTL_SCROLL_QUALIFICATION_INFRASTRUCTURE_FAILURE: authentic Inbox URL unavailable.');
if (integratedHost.classification !== 'INTEGRATED_SRWF_VISUAL_HOST') {
  throw new Error('RTL_SCROLL_QUALIFICATION_INFRASTRUCTURE_FAILURE: integrated Hello Elementor host identity unavailable.');
}
if (!fixture.forms?.[0]?.form_id) {
  throw new Error('RTL_SCROLL_QUALIFICATION_INFRASTRUCTURE_FAILURE: canonical form identity unavailable.');
}

const p06Manifest = JSON.parse(
  wpEval('echo wp_json_encode(get_option("gpp_p06_fixture_manifest"), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);') || 'null'
);
if (!p06Manifest?.authentic_block_page?.url) {
  throw new Error('RTL_SCROLL_QUALIFICATION_INFRASTRUCTURE_FAILURE: authentic gravityflow/inbox Block route unavailable.');
}

const scopedSetup = JSON.parse(wpEval(
  "$existing=get_page_by_path('wu21-mr1-production-form-scoped',OBJECT,'page');"
  + "if($existing instanceof WP_Post){wp_delete_post($existing->ID,true);}"
  + "$id=wp_insert_post(array('post_title'=>'WU21 MR1 Production Form Scoped','post_status'=>'publish','post_type'=>'page','post_name'=>'wu21-mr1-production-form-scoped','post_content'=>'[gravityflow page=\"inbox\" form=\"" + Number(fixture.forms[0].form_id) + "\"]'),true);"
  + "if(is_wp_error($id)){throw new RuntimeException($id->get_error_message());}"
  + "echo wp_json_encode(array('id'=>(int)$id,'url'=>get_permalink($id)),JSON_UNESCAPED_SLASHES);"
));
if (!scopedSetup?.id || !scopedSetup?.url) {
  throw new Error('RTL_SCROLL_QUALIFICATION_INFRASTRUCTURE_FAILURE: authentic form-scoped route setup failed.');
}

const muDir = path.join(wpPath, 'wp-content/mu-plugins');
const muPath = path.join(muDir, 'inbox-direction-scroll-qualification-mu.php');
const muSource = path.join(repoRoot, 'tests/repro-evidence-lab/inbox-visual-design-v2-qualification-mu.php');
fs.mkdirSync(muDir, { recursive: true });
fs.copyFileSync(muSource, muPath);

const phpAuth = "$u=get_user_by('login','bootstrap_admin');"
  + "if(!$u) throw new RuntimeException('Synthetic WU21 admin unavailable.');"
  + "$e=time()+900;"
  + "echo wp_json_encode(array("
  + "array('name'=>AUTH_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'auth')),"
  + "array('name'=>LOGGED_IN_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'logged_in'))"
  + "), JSON_UNESCAPED_SLASHES);";
const authCookies = JSON.parse(execFileSync(
  'php',
  [wpCli, '--path=' + wpPath, 'eval', phpAuth],
  { encoding: 'utf8', env: process.env }
).trim());

const selectors = {
  html: 'html',
  body: 'body',
  surface: '.gpp-inbox-surface',
  surface_host: '.gpp-inbox-surface__host',
  gravityflow_wrap: '.gravityflow_wrap',
  inbox: '.gflow-inbox.gflow-grid.gflow-common',
  ag_root_wrapper: '[data-js="gflow-inbox"] .ag-root-wrapper',
  ag_header_viewport: '[data-js="gflow-inbox"] .ag-header-viewport',
  ag_center_cols_viewport: '[data-js="gflow-inbox"] .ag-center-cols-viewport',
  ag_body_viewport: '[data-js="gflow-inbox"] .ag-body-viewport',
  ag_header_container: '[data-js="gflow-inbox"] .ag-header-container',
  ag_center_cols_container: '[data-js="gflow-inbox"] .ag-center-cols-container',
};

const horizontalViewportCandidates = [
  '[data-js="gflow-inbox"] .ag-body-horizontal-scroll-viewport',
  '[data-js="gflow-inbox"] .ag-body-horizontal-scroll .ag-body-horizontal-scroll-viewport',
];

const desktopCandidates = [
  { width: 1440, height: 1000 },
  { width: 1200, height: 900 },
  { width: 1024, height: 900 },
  { width: 900, height: 900 },
];
const narrowViewport = { width: 390, height: 844 };

function round(value) {
  return Number.isFinite(value) ? Number(value.toFixed(3)) : null;
}

async function waitForGrid(page) {
  await page.waitForSelector(selectors.ag_root_wrapper, { timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container > .ag-row').length > 0, null, { timeout: 30000 });
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await page.waitForTimeout(150);
}

async function resolveHorizontalViewport(page) {
  for (const candidate of horizontalViewportCandidates) {
    if (await page.locator(candidate).count()) return candidate;
  }
  return null;
}

async function load(page, url, viewport) {
  await page.setViewportSize(viewport);
  await page.goto(url, { waitUntil: 'networkidle' });
  await waitForGrid(page);
}

async function inspectRange(page) {
  const horizontalSelector = await resolveHorizontalViewport(page);
  return page.evaluate(({ selectors, horizontalSelector }) => {
    const snap = selector => {
      if (!selector) return null;
      const el = document.querySelector(selector);
      if (!el) return null;
      return {
        scroll_left: el.scrollLeft,
        scroll_width: el.scrollWidth,
        client_width: el.clientWidth,
        range: Math.max(0, el.scrollWidth - el.clientWidth),
        direction: getComputedStyle(el).direction,
      };
    };
    return {
      horizontal_selector: horizontalSelector,
      horizontal: snap(horizontalSelector),
      center: snap(selectors.ag_center_cols_viewport),
      body: snap(selectors.ag_body_viewport),
    };
  }, { selectors, horizontalSelector });
}

async function chooseDesktop(page, rtlUrl) {
  const probes = [];
  for (const viewport of desktopCandidates) {
    await load(page, rtlUrl, viewport);
    const range = await inspectRange(page);
    const effective = Math.max(range.horizontal?.range || 0, range.center?.range || 0, range.body?.range || 0);
    probes.push({ viewport, effective_scroll_range_px: effective, participants: range });
    if (effective > tolerancePx && range.horizontal_selector) return { viewport, probes };
  }
  return { viewport: desktopCandidates[0], probes };
}

async function setDriverScroll(page, driverSelector, range, fraction) {
  if (!driverSelector || range <= tolerancePx || fraction === 0) {
    if (driverSelector) {
      await page.locator(driverSelector).first().evaluate(el => { el.scrollLeft = 0; el.dispatchEvent(new Event('scroll')); });
      await page.waitForTimeout(120);
    }
    return { attempted: [0], selected_target: 0, actual: 0 };
  }
  const magnitude = Math.max(1, Math.round(range * fraction));
  const attempts = [magnitude, -magnitude];
  for (const target of attempts) {
    const actual = await page.locator(driverSelector).first().evaluate((el, value) => {
      el.scrollLeft = value;
      el.dispatchEvent(new Event('scroll'));
      return el.scrollLeft;
    }, target);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.waitForTimeout(120);
    if (Math.abs(actual) > tolerancePx) return { attempted: attempts, selected_target: target, actual };
  }
  return { attempted: attempts, selected_target: attempts[attempts.length - 1], actual: 0 };
}

async function captureState(page, label, movement) {
  const horizontalSelector = await resolveHorizontalViewport(page);
  return page.evaluate(({ selectors, horizontalSelector, label, movement, tolerancePx }) => {
    const rect = el => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: +r.left.toFixed(3), right: +r.right.toFixed(3), top: +r.top.toFixed(3), bottom: +r.bottom.toFixed(3), width: +r.width.toFixed(3), height: +r.height.toFixed(3) };
    };
    const describe = selector => {
      if (!selector) return null;
      const el = document.querySelector(selector);
      if (!el) return null;
      const s = getComputedStyle(el);
      return {
        selector,
        tag: el.tagName.toLowerCase(),
        classes: [...el.classList],
        direction: s.direction,
        overflow_x: s.overflowX,
        position: s.position,
        left: s.left,
        right: s.right,
        transform: s.transform,
        inline_style: {
          left: el.style.left || null,
          right: el.style.right || null,
          transform: el.style.transform || null,
        },
        rect: rect(el),
        scroll_left: el.scrollLeft,
        scroll_width: el.scrollWidth,
        client_width: el.clientWidth,
        scroll_range: Math.max(0, el.scrollWidth - el.clientWidth),
      };
    };

    const resolved = {};
    for (const [name, selector] of Object.entries(selectors)) resolved[name] = describe(selector);
    resolved.ag_body_horizontal_scroll_viewport = describe(horizontalSelector);

    const root = document.querySelector(selectors.ag_root_wrapper);
    const headers = [...document.querySelectorAll('[data-js="gflow-inbox"] .ag-header-cell[col-id]')];
    const firstRow = document.querySelector('[data-js="gflow-inbox"] .ag-center-cols-container > .ag-row');
    const cells = firstRow ? [...firstRow.querySelectorAll('.ag-cell[col-id]')] : [];
    const headerById = new Map(headers.map(el => [el.getAttribute('col-id'), el]));
    const bodyById = new Map(cells.map(el => [el.getAttribute('col-id'), el]));
    const sharedIds = [...headerById.keys()].filter(id => bodyById.has(id));
    const alignment = sharedIds.map(colId => {
      const h = rect(headerById.get(colId));
      const b = rect(bodyById.get(colId));
      return {
        col_id: colId,
        header: h,
        body: b,
        left_delta_px: +(h.left - b.left).toFixed(3),
        right_delta_px: +(h.right - b.right).toFixed(3),
        width_delta_px: +(h.width - b.width).toFixed(3),
      };
    });
    const maxAbs = key => alignment.length ? Math.max(...alignment.map(item => Math.abs(item[key]))) : null;
    const resourceUrls = performance.getEntriesByType('resource').map(entry => entry.name).filter(name => /(?:ag-grid|gravityflow.*grid|grid.*gravityflow)/i.test(name));

    const directions = Object.fromEntries(Object.entries(resolved).map(([name, value]) => [name, value?.direction || null]));
    const missing = Object.entries(resolved).filter(([name, value]) => !value && name !== 'ag_body_viewport').map(([name]) => name);
    const scrollParticipants = {
      header_viewport: resolved.ag_header_viewport,
      center_viewport: resolved.ag_center_cols_viewport,
      body_viewport: resolved.ag_body_viewport,
      horizontal_scroll_viewport: resolved.ag_body_horizontal_scroll_viewport,
    };
    const participantScrollLeft = Object.values(scrollParticipants).filter(Boolean).map(item => item.scroll_left);
    const scrollLeftSpread = participantScrollLeft.length ? Math.max(...participantScrollLeft) - Math.min(...participantScrollLeft) : null;

    return {
      label,
      movement,
      resolved_selectors: Object.fromEntries(Object.entries(resolved).map(([name, value]) => [name, value?.selector || null])),
      missing_resolved_measurements: missing,
      directions,
      ag_grid_direction_identity: {
        root_classes: root ? [...root.classList] : [],
        ag_ltr: Boolean(root?.classList.contains('ag-ltr')),
        ag_rtl: Boolean(root?.classList.contains('ag-rtl')),
        root_dir_attribute: root?.getAttribute('dir') || null,
        runtime_global_version: window.agGrid?.version || window.agGrid?.VERSION || null,
        resource_urls: resourceUrls,
      },
      elements: resolved,
      scroll_participants: scrollParticipants,
      content_positioning: {
        header_container: resolved.ag_header_container,
        center_cols_container: resolved.ag_center_cols_container,
      },
      alignment: {
        shared_column_ids: sharedIds,
        columns: alignment,
        max_abs_left_delta_px: maxAbs('left_delta_px'),
        max_abs_right_delta_px: maxAbs('right_delta_px'),
        max_abs_width_delta_px: maxAbs('width_delta_px'),
      },
      text_direction_samples: {
        headers: [...document.querySelectorAll('[data-js="gflow-inbox"] .ag-header-cell-text')].slice(0, 8).map(el => ({
          text: (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 120),
          direction: getComputedStyle(el).direction,
        })),
        cells: cells.slice(0, 8).map(el => ({
          col_id: el.getAttribute('col-id'),
          text: (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 120),
          direction: getComputedStyle(el).direction,
        })),
      },
      derived: {
        scroll_left_spread_px: scrollLeftSpread,
        document_horizontal_overflow_px: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
        native_horizontal_scrollbar_count: document.querySelectorAll('[data-js="gflow-inbox"] .ag-body-horizontal-scroll-viewport').length,
        horizontal_scrollbar_present: Boolean(
          resolved.ag_body_horizontal_scroll_viewport
          && resolved.ag_body_horizontal_scroll_viewport.scroll_range > tolerancePx
          && resolved.ag_body_horizontal_scroll_viewport.rect?.height > 0
        ),
      },
    };
  }, { selectors, horizontalSelector, label, movement, tolerancePx });
}

async function runScenario(page, id, url, viewport, screenshots) {
  await load(page, url, viewport);
  const initialRange = await inspectRange(page);
  const driverSelector = initialRange.horizontal_selector;
  const range = initialRange.horizontal?.range || 0;

  const originMove = await setDriverScroll(page, driverSelector, range, 0);
  const origin = await captureState(page, 'origin', originMove);
  if (screenshots) {
    await page.locator(selectors.surface).first().screenshot({ path: path.join(artifactDir, 'inbox-direction-scroll-' + id + '-origin.png') });
  }

  if (range <= tolerancePx || !driverSelector) {
    return {
      id,
      viewport,
      scroll_condition_present: false,
      driver_selector: driverSelector,
      scroll_range_px: range,
      states: [origin],
    };
  }

  const intermediateMove = await setDriverScroll(page, driverSelector, range, 0.5);
  const intermediate = await captureState(page, 'intermediate', intermediateMove);
  const endMove = await setDriverScroll(page, driverSelector, range, 1);
  const end = await captureState(page, 'end', endMove);
  if (screenshots) {
    await page.locator(selectors.surface).first().screenshot({ path: path.join(artifactDir, 'inbox-direction-scroll-' + id + '-nonzero.png') });
  }

  return {
    id,
    viewport,
    scroll_condition_present: true,
    driver_selector: driverSelector,
    scroll_range_px: range,
    states: [origin, intermediate, end],
  };
}

function scenarioMetrics(scenario) {
  const states = scenario.states || [];
  const origin = states.find(state => state.label === 'origin');
  const moved = states.filter(state => state.label !== 'origin');
  const align = state => Math.max(state?.alignment?.max_abs_left_delta_px || 0, state?.alignment?.max_abs_right_delta_px || 0);
  const originAlignment = align(origin);
  const maxMovedAlignment = moved.length ? Math.max(...moved.map(align)) : originAlignment;
  const maxGrowth = maxMovedAlignment - originAlignment;
  const nonzeroMovement = moved.some(state => Math.abs(state.movement?.actual || 0) > tolerancePx);
  const relevantNames = ['ag_root_wrapper', 'ag_header_viewport', 'ag_center_cols_viewport', 'ag_body_horizontal_scroll_viewport'];
  const directions = Object.fromEntries(relevantNames.map(name => [name, origin?.directions?.[name] || null]));
  const allRelevantLtr = relevantNames.every(name => directions[name] === 'ltr');
  const anyRelevantRtl = relevantNames.some(name => directions[name] === 'rtl');
  const gridLtr = Boolean(origin?.ag_grid_direction_identity?.ag_ltr) && !origin?.ag_grid_direction_identity?.ag_rtl;
  return {
    grid_ltr_identity: gridLtr,
    relevant_directions: directions,
    all_relevant_ltr: allRelevantLtr,
    any_relevant_rtl: anyRelevantRtl,
    nonzero_movement: nonzeroMovement,
    origin_alignment_max_px: round(originAlignment),
    moved_alignment_max_px: round(maxMovedAlignment),
    alignment_growth_px: round(maxGrowth),
    header_center_client_width_delta_px: round(Math.abs(
      (origin?.elements?.ag_header_viewport?.client_width || 0)
      - (origin?.elements?.ag_center_cols_viewport?.client_width || 0)
    )),
    max_document_overflow_px: states.length ? Math.max(...states.map(state => state.derived?.document_horizontal_overflow_px || 0)) : null,
    native_horizontal_scrollbar_count: origin?.derived?.native_horizontal_scrollbar_count ?? null,
    native_text_leaves_rtl: Boolean(
      origin
      && [...(origin.text_direction_samples?.headers || []), ...(origin.text_direction_samples?.cells || [])].length
      && [...(origin.text_direction_samples?.headers || []), ...(origin.text_direction_samples?.cells || [])].every(item => item.direction === 'rtl')
    ),
  };
}

function dispositionFor(rtlScenario, ltrScenario) {
  const rtl = scenarioMetrics(rtlScenario);
  const ltr = scenarioMetrics(ltrScenario);
  const defectSupported = rtlScenario.scroll_condition_present
    && rtl.grid_ltr_identity
    && rtl.any_relevant_rtl
    && rtl.nonzero_movement
    && rtl.alignment_growth_px > tolerancePx;
  const repairVerified = rtlScenario.scroll_condition_present
    && rtl.grid_ltr_identity
    && rtl.all_relevant_ltr
    && rtl.nonzero_movement
    && rtl.moved_alignment_max_px <= tolerancePx
    && rtl.max_document_overflow_px <= tolerancePx
    && rtl.native_horizontal_scrollbar_count === 1
    && rtl.native_text_leaves_rtl;
  const hypothesisFalsified = rtlScenario.scroll_condition_present
    && rtl.grid_ltr_identity
    && rtl.all_relevant_ltr
    && rtl.nonzero_movement
    && rtl.moved_alignment_max_px <= tolerancePx;

  let disposition = 'NOT_PROVEN';
  if (repairVerified) disposition = 'PRODUCTION_REPAIR_VERIFIED';
  else if (defectSupported) disposition = 'HYPOTHESIS_SUPPORTED';
  else if (hypothesisFalsified) disposition = 'HYPOTHESIS_FALSIFIED';

  let alternative = {
    status: 'NO_ALTERNATIVE_CAUSE_ESTABLISHED',
    candidate: null,
    reason: repairVerified
      ? 'The bounded LTR physical-axis seam keeps native AG Grid header/body synchronization intact under real horizontal scrolling.'
      : 'No independent header/body geometry defect is established by this reproducible integrated host.',
    next_qualification: repairVerified
      ? 'Target-production acceptance remains separate from reproducible WU21 evidence.'
      : 'Capture the same direction/scroll matrix in the reported target environment if the user-visible drift remains reproducible there.',
  };
  if (!defectSupported && !repairVerified && rtl.header_center_client_width_delta_px > tolerancePx) {
    alternative = {
      status: 'EVIDENCE_SUPPORTED_NEXT_LEAD',
      candidate: 'NATIVE_HEADER_BODY_VIEWPORT_WIDTH_MISMATCH',
      reason: 'Header and center viewport client widths differ beyond the qualification tolerance.',
      next_qualification: 'Trace which native/host container introduces the width delta without changing Grid ownership.',
    };
  } else if (!defectSupported && !repairVerified && rtl.moved_alignment_max_px > tolerancePx && !rtl.any_relevant_rtl) {
    alternative = {
      status: 'EVIDENCE_SUPPORTED_NEXT_LEAD',
      candidate: 'NATIVE_SCROLL_TRANSFORM_OR_POSITIONING_PATH',
      reason: 'Header/body alignment diverges during native scrolling without an RTL-computed scroll-container boundary.',
      next_qualification: 'Trace the differing native transform/left path at the first non-zero offset.',
    };
  }

  return {
    disposition,
    defect_supported: defectSupported,
    repair_verified: repairVerified,
    rtl_metrics: rtl,
    ltr_control_metrics: ltr,
    alternative_cause: alternative,
  };
}

const result = {
  schema: 'gpp.inbox_direction_scroll_qualification.v1',
  qualification: 'MR1_INBOX_RTL_LTR_DIRECTION_BOUNDARY',
  repository_sha: repositorySha,
  evidence_class: 'PROVEN_IN_REPRODUCIBLE_WU21_INTEGRATED_HOST_ONLY',
  production_equivalence: 'NOT_PROVEN',
  runtime: {
    wordpress: runtime.wordpress,
    php: runtime.php,
    database: runtime.database,
    gravity_forms: runtime.plugins?.gravity_forms,
    gravity_flow: runtime.plugins?.gravity_flow,
    node: { version: process.version },
    playwright: { version: JSON.parse(fs.readFileSync(path.join(repoRoot, 'node_modules/playwright/package.json'), 'utf8')).version },
    chromium: null,
    ag_grid: { runtime_global_version: null, resource_urls: [] },
  },
  integrated_host: integratedHost,
  desktop_probe: [],
  scenarios: {},
  route_evaluations: {},
  route_desktop_probes: {},
  missing_unresolved_measurements: [],
  disposition: 'NOT_PROVEN',
  hypothesis_evaluation: null,
  proposed_smallest_candidate: null,
  production_files_changed: [],
};

let browser = null;
let fatal = null;
try {
  browser = await chromium.launch({ headless: true });
  result.runtime.chromium = { version: browser.version() };
  const context = await browser.newContext({ locale: 'en-US', timezoneId: 'UTC', reducedMotion: 'reduce' });
  await context.addCookies(authCookies.map(cookie => ({ ...cookie, url: baseUrl })));
  const page = await context.newPage();

  const rtlUrl = new URL(fixture.frontend_inbox_url);
  rtlUrl.searchParams.set('wu21_header_rtl_probe', '1');
  const formScopedRtlUrl = new URL(scopedSetup.url);
  formScopedRtlUrl.searchParams.set('wu21_header_rtl_probe', '1');
  const blockRtlUrl = new URL(p06Manifest.authentic_block_page.url);
  blockRtlUrl.searchParams.set('wu21_header_rtl_probe', '1');

  const desktopChoice = await chooseDesktop(page, rtlUrl.toString());
  result.desktop_probe = desktopChoice.probes;
  result.route_desktop_probes.unscoped = desktopChoice.probes;

  const formDesktopChoice = await chooseDesktop(page, formScopedRtlUrl.toString());
  const blockDesktopChoice = await chooseDesktop(page, blockRtlUrl.toString());
  result.route_desktop_probes.form_scoped = formDesktopChoice.probes;
  result.route_desktop_probes.block = blockDesktopChoice.probes;

  const rtlDesktop = await runScenario(page, 'rtl-desktop-unscoped', rtlUrl.toString(), desktopChoice.viewport, true);
  const formScopedDesktop = await runScenario(page, 'rtl-desktop-form-scoped', formScopedRtlUrl.toString(), formDesktopChoice.viewport, false);
  const blockDesktop = await runScenario(page, 'rtl-desktop-block', blockRtlUrl.toString(), blockDesktopChoice.viewport, false);
  const ltrDesktop = await runScenario(page, 'ltr-desktop-control', fixture.frontend_inbox_url, desktopChoice.viewport, false);
  await load(page, rtlUrl.toString(), narrowViewport);
  const narrowRange = await inspectRange(page);
  const narrowHasScroll = (narrowRange.horizontal?.range || 0) > tolerancePx && Boolean(narrowRange.horizontal_selector);
  const rtlNarrow = await runScenario(page, 'rtl-narrow', rtlUrl.toString(), narrowViewport, false);

  result.scenarios = {
    rtl_desktop: rtlDesktop,
    rtl_desktop_form_scoped: formScopedDesktop,
    rtl_desktop_block: blockDesktop,
    ltr_desktop_control: ltrDesktop,
    rtl_narrow: { ...rtlNarrow, required_by_condition: narrowHasScroll },
  };

  const evaluation = dispositionFor(rtlDesktop, ltrDesktop);
  const formScopedEvaluation = dispositionFor(formScopedDesktop, ltrDesktop);
  const blockEvaluation = dispositionFor(blockDesktop, ltrDesktop);
  result.route_evaluations = {
    unscoped: evaluation,
    form_scoped: formScopedEvaluation,
    block: blockEvaluation,
  };
  result.disposition = [evaluation, formScopedEvaluation, blockEvaluation].every(item => item.repair_verified)
    ? 'PRODUCTION_REPAIR_VERIFIED'
    : 'NOT_PROVEN';
  result.hypothesis_evaluation = evaluation;

  const firstState = rtlDesktop.states?.[0];
  result.runtime.ag_grid = {
    runtime_global_version: firstState?.ag_grid_direction_identity?.runtime_global_version || null,
    resource_urls: firstState?.ag_grid_direction_identity?.resource_urls || [],
  };

  const criticalMissing = [];
  for (const scenario of [rtlDesktop, formScopedDesktop, blockDesktop, ltrDesktop]) {
    const origin = scenario.states?.[0];
    for (const name of ['html','body','surface','surface_host','gravityflow_wrap','inbox','ag_root_wrapper','ag_header_viewport','ag_center_cols_viewport','ag_body_horizontal_scroll_viewport']) {
      if (!origin?.elements?.[name]) criticalMissing.push(scenario.id + ':' + name);
    }
  }
  for (const [routeName, scenario, routeEvaluation] of [
    ['unscoped', rtlDesktop, evaluation],
    ['form-scoped', formScopedDesktop, formScopedEvaluation],
    ['block', blockDesktop, blockEvaluation],
  ]) {
    if (!scenario.scroll_condition_present) criticalMissing.push(routeName + ':horizontal-scroll-condition');
    if (scenario.scroll_condition_present && !routeEvaluation.rtl_metrics.nonzero_movement) criticalMissing.push(routeName + ':nonzero-scroll-movement');
    if (!routeEvaluation.repair_verified) criticalMissing.push(routeName + ':production-repair-not-verified');
  }

  const narrowMetrics = scenarioMetrics(rtlNarrow);
  result.narrow_metrics = narrowMetrics;
  if (evaluation.repair_verified && narrowHasScroll) {
    if (!narrowMetrics.nonzero_movement) criticalMissing.push('rtl-narrow:nonzero-scroll-movement');
    if (!narrowMetrics.all_relevant_ltr) criticalMissing.push('rtl-narrow:physical-axis-not-ltr');
    if (narrowMetrics.moved_alignment_max_px > tolerancePx) criticalMissing.push('rtl-narrow:header-body-desync');
    if (narrowMetrics.max_document_overflow_px > tolerancePx) criticalMissing.push('rtl-narrow:document-horizontal-overflow');
    if (narrowMetrics.native_horizontal_scrollbar_count !== 1) criticalMissing.push('rtl-narrow:native-scrollbar-count');
    if (!narrowMetrics.native_text_leaves_rtl) criticalMissing.push('rtl-narrow:text-direction-not-rtl');
  }
  result.missing_unresolved_measurements = [...new Set(criticalMissing)];

  if (result.missing_unresolved_measurements.length) {
    result.disposition = 'NOT_PROVEN';
  }
} catch (error) {
  fatal = String(error?.stack || error);
  result.fatal = fatal.slice(0, 12000);
  result.disposition = 'NOT_PROVEN';
} finally {
  if (browser) await browser.close().catch(() => {});
  fs.rmSync(muPath, { force: true });
  try {
    wpEval('wp_delete_post(' + Number(scopedSetup.id) + ', true);');
  } catch (cleanupError) {
    result.cleanup_error = String(cleanupError);
    if (!fatal) {
      fatal = String(cleanupError);
      result.disposition = 'NOT_PROVEN';
    }
  }
  fs.writeFileSync(path.join(artifactDir, 'inbox-direction-scroll-qualification.json'), JSON.stringify(result, null, 2) + '\n');

  const rtl = result.hypothesis_evaluation?.rtl_metrics || null;
  const ltr = result.hypothesis_evaluation?.ltr_control_metrics || null;
  console.log('GPP_RTL_SCROLL_DISPOSITION=' + result.disposition);
  console.log('GPP_RTL_SCROLL_REPOSITORY_SHA=' + repositorySha);
  console.log('GPP_RTL_SCROLL_DESKTOP_PROBES=' + JSON.stringify(result.desktop_probe.map(item => ({ viewport: item.viewport, range: item.effective_scroll_range_px }))));
  console.log('GPP_RTL_SCROLL_RTL_METRICS=' + JSON.stringify(rtl));
  console.log('GPP_RTL_SCROLL_LTR_METRICS=' + JSON.stringify(ltr));
  console.log('GPP_RTL_SCROLL_ROUTE_EVALUATIONS=' + JSON.stringify(result.route_evaluations));
  console.log('GPP_RTL_SCROLL_DIRECTIONS=' + JSON.stringify(result.scenarios?.rtl_desktop?.states?.[0]?.directions || null));
  console.log('GPP_RTL_SCROLL_AG_IDENTITY=' + JSON.stringify(result.scenarios?.rtl_desktop?.states?.[0]?.ag_grid_direction_identity || null));
  console.log('GPP_RTL_SCROLL_STATES=' + JSON.stringify((result.scenarios?.rtl_desktop?.states || []).map(state => ({
    label: state.label,
    movement: state.movement,
    alignment: state.alignment,
    scroll: Object.fromEntries(Object.entries(state.scroll_participants || {}).map(([name, value]) => [name, value ? { scroll_left: value.scroll_left, scroll_width: value.scroll_width, client_width: value.client_width, direction: value.direction, transform: value.transform, left: value.left } : null])),
    positioning: state.content_positioning,
  }))));
  console.log('GPP_RTL_SCROLL_NARROW=' + JSON.stringify({
    required_by_condition: result.scenarios?.rtl_narrow?.required_by_condition ?? null,
    scroll_condition_present: result.scenarios?.rtl_narrow?.scroll_condition_present ?? null,
    scroll_range_px: result.scenarios?.rtl_narrow?.scroll_range_px ?? null,
    metrics: result.narrow_metrics || null,
  }));
  console.log('GPP_RTL_SCROLL_ALTERNATIVE=' + JSON.stringify(result.hypothesis_evaluation?.alternative_cause || null));
  console.log('GPP_RTL_SCROLL_MISSING=' + JSON.stringify(result.missing_unresolved_measurements));
}

if (fatal) throw new Error('RTL_SCROLL_QUALIFICATION_INFRASTRUCTURE_FAILURE: ' + fatal);
if (result.missing_unresolved_measurements.length) {
  throw new Error('RTL_SCROLL_QUALIFICATION_INCOMPLETE: ' + result.missing_unresolved_measurements.join(', '));
}
