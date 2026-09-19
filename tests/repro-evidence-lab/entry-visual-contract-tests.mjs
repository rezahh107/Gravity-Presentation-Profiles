import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
const ownerHtml = process.env.GPP_ENTRY_OWNER_HTML;
const expectedHtml = { size: 119765, sha256: '1934967b81d82ee77c60ffd547dde6fa7c8a310dbde94556686bd3d515d62a69' };
const comparatorVersion = 'entry-vnext-browser-comparator-v3-native-history';
const evidenceSchemaVersion = '2.0.0';
const admittedReviewSelector = '.gpp-entry-dossier[data-gpp-entry-detail="ready"][data-gpp-review-mode="read-only"]';
const canonical = ['header', 'current-task', 'education', 'candidate-details', 'contact', 'school', 'documents', 'registration-finance', 'history'];
const dossierCanonical = canonical.filter(name => name !== 'history');
const expectedPlacements = {
  'student.first_name': 'candidate-details',
  'student.last_name': 'candidate-details',
  'student.father_name': 'candidate-details',
  'student.birth_date_jalali': 'candidate-details',
  'student.gender': 'candidate-details',
  'student.mobile': 'contact',
  'student.home_phone': 'contact',
  'student.father_mobile': 'contact',
  'student.mother_mobile': 'contact',
  'education.level': 'education',
  'education.grade_group': 'education',
  'school.name': 'school',
  'entry.created_at': 'registration-finance',
  'review.status': 'registration-finance',
  'finance.status': 'registration-finance',
  'finance.tuition_amount': 'registration-finance',
  'finance.discount_amount': 'registration-finance',
  'finance.net_payable_amount': 'registration-finance',
};
const personalHeaderExclusions = ['student.first_name', 'student.last_name', 'student.father_name', 'student.birth_date_jalali', 'student.gender'];
const gridRegions = ['education', 'candidate-details', 'contact', 'school', 'registration-finance'];
const results = [];

const referenceProfile = {
  root: '.dossier',
  regionMatchers: [
    { name: 'header', selector: '.dossier-header', mode: 'self' },
    { name: 'current-task', selector: '.task', mode: 'self' },
    { name: 'education', selector: '.data-grid--education', mode: 'descendant' },
    { name: 'candidate-details', selector: '.data-grid--personal', mode: 'descendant' },
    { name: 'contact', selector: '.data-grid--contact', mode: 'descendant' },
    { name: 'school', selector: '.data-grid--school', mode: 'descendant' },
    { name: 'documents', selector: '.documents', mode: 'descendant' },
    { name: 'registration-finance', selector: '.data-grid--financial', mode: 'descendant' },
    { name: 'history', selector: '.history', mode: 'self' },
  ],
  grids: {
    education: '.data-grid--education',
    'candidate-details': '.data-grid--personal',
    contact: '.data-grid--contact',
    school: '.data-grid--school',
    'registration-finance': '.data-grid--financial',
  },
  h1: '.dossier-header h1',
  taskHeading: '.task h2',
  placementSelector: null,
  genericFactsSelector: null,
};

const productionProfile = {
  root: admittedReviewSelector,
  regionMatchers: dossierCanonical.map(name => ({ name, selector: `[data-gpp-entry-region="${name}"]`, mode: 'self' })),
  grids: {
    education: '[data-gpp-entry-region="education"] .gpp-entry-dossier__facts',
    'candidate-details': '[data-gpp-entry-region="candidate-details"] .gpp-entry-dossier__facts',
    contact: '[data-gpp-entry-region="contact"] .gpp-entry-dossier__facts',
    school: '[data-gpp-entry-region="school"] .gpp-entry-dossier__facts',
    'registration-finance': '[data-gpp-entry-region="registration-finance"] .gpp-entry-dossier__facts',
  },
  h1: '[data-gpp-entry-region="header"] h1',
  taskHeading: '[data-gpp-entry-region="current-task"] .gpp-entry-dossier__task-heading',
  placementSelector: '[data-gpp-slot]',
  genericFactsSelector: '[data-gpp-entry-region="facts"], [data-gpp-section="facts"]',
};

if (!artifactDir || !wpPath || !wpCli || !ownerHtml) throw new Error('Entry vNext visual qualification environment is incomplete.');

function identity(file) {
  const data = fs.readFileSync(file);
  return { size: data.length, sha256: createHash('sha256').update(data).digest('hex') };
}

function command(args) {
  const cp = spawnSync(args[0], args.slice(1), { encoding: 'utf8', env: process.env });
  if (cp.status !== 0) throw new Error(`${args.join(' ')} failed:\n${cp.stderr}\n${cp.stdout}`);
  return cp.stdout.trim();
}

const htmlIdentity = identity(ownerHtml);
if (htmlIdentity.size !== expectedHtml.size || htmlIdentity.sha256 !== expectedHtml.sha256) {
  throw new Error(`Entry vNext authority mismatch: ${JSON.stringify(htmlIdentity)}`);
}
const repositoryHead = command(['git', 'rev-parse', 'HEAD']);
if (!/^[0-9a-f]{40}$/.test(repositoryHead)) throw new Error('Exact repository Head is unavailable.');

function wpEval(code) {
  const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], { encoding: 'utf8', env: process.env });
  if (cp.status !== 0) throw new Error(`${cp.stderr}\n${cp.stdout}`);
  return cp.stdout.trim();
}

const manifest = JSON.parse(wpEval('echo wp_json_encode(get_option("gpp_wu19_fixture_manifest"), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);'));
const alpha = manifest.alpha;
const runtimePassword = `gppv-${randomBytes(18).toString('hex')}-A1!`;
wpEval(`wp_set_password(${JSON.stringify(runtimePassword)}, ${Number(manifest.bootstrap_id)}); echo 'credential-ready';`);
const entryUrl = `${baseUrl}/wp-admin/admin.php?page=gravityflow-inbox&view=entry&id=${alpha.form_id}&lid=${alpha.entry_id}`;

function closeEnough(actual, expected, tolerance) {
  return Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual - expected) <= tolerance;
}

function sameArray(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function executableResultBase(id, scenarioType, viewport, comparatorResult, failedRuleIds) {
  return {
    id,
    status: 'PASS',
    scenario_type: scenarioType,
    viewport,
    repository_head: repositoryHead,
    owner_authority: { file: path.basename(ownerHtml), ...htmlIdentity },
    comparator_version: comparatorVersion,
    comparator_executed: true,
    comparator_result: comparatorResult,
    failed_rule_ids: failedRuleIds,
  };
}

async function collectRenderedEntryDetailState(page, profile) {
  return page.evaluate(({ profile, canonicalNames }) => {
    const root = document.querySelector(profile.root);
    if (!root) return { missing: true };

    const rect = element => {
      if (!element) return null;
      const value = element.getBoundingClientRect();
      return {
        top: value.top,
        right: value.right,
        bottom: value.bottom,
        left: value.left,
        width: value.width,
        height: value.height,
      };
    };
    const style = element => {
      if (!element) return null;
      const value = getComputedStyle(element);
      return {
        backgroundColor: value.backgroundColor,
        borderTopColor: value.borderTopColor,
        borderTopStyle: value.borderTopStyle,
        borderTopWidth: parseFloat(value.borderTopWidth),
        borderRadius: parseFloat(value.borderRadius),
        paddingInlineStart: parseFloat(value.paddingInlineStart),
        paddingInlineEnd: parseFloat(value.paddingInlineEnd),
        fontSize: parseFloat(value.fontSize),
        fontWeight: value.fontWeight,
        lineHeight: parseFloat(value.lineHeight),
        transform: value.transform,
      };
    };
    const matchesRegion = (child, matcher) => matcher.mode === 'self'
      ? child.matches(matcher.selector)
      : Boolean(child.querySelector(matcher.selector));

    const order = [];
    const regionElements = {};
    for (const child of root.children) {
      const matcher = profile.regionMatchers.find(candidate => matchesRegion(child, candidate));
      if (!matcher) continue;
      order.push(matcher.name);
      regionElements[matcher.name] = child;
    }

    const grids = {};
    for (const [name, selector] of Object.entries(profile.grids)) {
      const element = root.querySelector(selector);
      if (!element) continue;
      const columns = getComputedStyle(element).gridTemplateColumns.trim();
      grids[name] = columns ? columns.split(/\s+/).length : 0;
    }

    const placements = {};
    if (profile.placementSelector) {
      root.querySelectorAll(profile.placementSelector).forEach(node => {
        const slot = node.dataset.gppSlot;
        if (!slot) return;
        const region = node.closest('[data-gpp-entry-region]')?.dataset.gppEntryRegion || null;
        (placements[slot] ||= []).push(region);
      });
    }

    const header = regionElements.header || null;
    const task = regionElements['current-task'] || null;
    const education = regionElements.education || null;
    const h1 = root.querySelector(profile.h1);
    const taskHeading = root.querySelector(profile.taskHeading);
    const rootRect = rect(root);
    const headerRect = rect(header);
    const taskRect = rect(task);
    const educationRect = rect(education);

    return {
      missing: false,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      order,
      grids,
      placements,
      genericFacts: profile.genericFactsSelector ? root.querySelectorAll(profile.genericFactsSelector).length : 0,
      rootOverflow: root.scrollWidth > root.clientWidth + 1,
      viewportOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      geometry: {
        root: rootRect,
        header: headerRect,
        task: taskRect,
        education: educationRect,
        taskGapFromHeader: headerRect && taskRect ? taskRect.top - headerRect.bottom : null,
        educationGapFromTask: taskRect && educationRect ? educationRect.top - taskRect.bottom : null,
      },
      tokens: {
        root: style(root),
        task: style(task),
        h1: style(h1),
        taskHeading: style(taskHeading),
      },
      knownRegions: canonicalNames.reduce((out, name) => {
        out[name] = Boolean(regionElements[name]);
        return out;
      }, {}),
    };
  }, { profile, canonicalNames: canonical });
}

function compareAgainstVNextContract(actual, reference, context) {
  const failedRuleIds = [];
  const ruleDetails = {};
  const fail = (ruleId, details) => {
    failedRuleIds.push(ruleId);
    ruleDetails[ruleId] = details;
  };

  if (actual?.missing || reference?.missing) {
    fail('DOSSIER_PRESENT', { actualMissing: Boolean(actual?.missing), referenceMissing: Boolean(reference?.missing) });
    return { comparator_result: 'REJECTED', failed_rule_ids: failedRuleIds, rule_details: ruleDetails };
  }

  if (!sameArray(reference.order, canonical) || !sameArray(actual.order, dossierCanonical)) {
    fail('ENTRY_REGION_ORDER', {
      reference: reference.order,
      actual: actual.order,
      expected_reference: canonical,
      expected_gpp_dossier: dossierCanonical,
      history_owner: 'native_gravity_flow_timeline',
    });
  }

  const placementFailures = [];
  for (const [slot, expectedRegion] of Object.entries(expectedPlacements)) {
    const actualRegions = actual.placements[slot] || [];
    if (!actualRegions.includes(expectedRegion)) placementFailures.push({ slot, expectedRegion, actualRegions });
  }
  for (const slot of personalHeaderExclusions) {
    if ((actual.placements[slot] || []).includes('header')) placementFailures.push({ slot, forbiddenRegion: 'header' });
  }
  if (actual.genericFacts !== 0 || placementFailures.length) {
    fail('SEMANTIC_REGION_PLACEMENT', { genericFacts: actual.genericFacts, placementFailures });
  }

  const gridFailures = gridRegions.filter(name => actual.grids[name] !== reference.grids[name]);
  if (gridFailures.length) {
    fail('GRID_STRUCTURE', {
      failures: gridFailures.map(name => ({ name, actual: actual.grids[name], reference: reference.grids[name] })),
    });
  }

  if (actual.rootOverflow || actual.viewportOverflow) {
    fail('HORIZONTAL_OVERFLOW', { rootOverflow: actual.rootOverflow, viewportOverflow: actual.viewportOverflow });
  }

  const referenceWidth = reference.geometry.root?.width;
  const actualWidth = actual.geometry.root?.width;
  const widthTolerance = Math.max(10, (referenceWidth || 0) * 0.02);
  const rootPaddingStartOk = closeEnough(actual.tokens.root?.paddingInlineStart, reference.tokens.root?.paddingInlineStart, 0.75);
  const rootPaddingEndOk = closeEnough(actual.tokens.root?.paddingInlineEnd, reference.tokens.root?.paddingInlineEnd, 0.75);
  if (!closeEnough(actualWidth, referenceWidth, widthTolerance) || !rootPaddingStartOk || !rootPaddingEndOk) {
    fail('DOSSIER_INLINE_GEOMETRY', {
      actualWidth,
      referenceWidth,
      widthTolerance,
      actualPaddingInlineStart: actual.tokens.root?.paddingInlineStart,
      referencePaddingInlineStart: reference.tokens.root?.paddingInlineStart,
      actualPaddingInlineEnd: actual.tokens.root?.paddingInlineEnd,
      referencePaddingInlineEnd: reference.tokens.root?.paddingInlineEnd,
    });
  }

  if (!closeEnough(actual.geometry.taskGapFromHeader, reference.geometry.taskGapFromHeader, 2)
      || !closeEnough(actual.geometry.educationGapFromTask, reference.geometry.educationGapFromTask, 2)) {
    fail('CURRENT_TASK_RELATIVE_POSITION', {
      actualTaskGapFromHeader: actual.geometry.taskGapFromHeader,
      referenceTaskGapFromHeader: reference.geometry.taskGapFromHeader,
      actualEducationGapFromTask: actual.geometry.educationGapFromTask,
      referenceEducationGapFromTask: reference.geometry.educationGapFromTask,
    });
  }

  const typographyRules = [
    ['H1_TYPOGRAPHY', actual.tokens.h1, reference.tokens.h1],
    ['TASK_HEADING_TYPOGRAPHY', actual.tokens.taskHeading, reference.tokens.taskHeading],
  ];
  for (const [ruleId, actualStyle, referenceStyle] of typographyRules) {
    if (!actualStyle || !referenceStyle
        || !closeEnough(actualStyle.fontSize, referenceStyle.fontSize, 0.5)
        || String(actualStyle.fontWeight) !== String(referenceStyle.fontWeight)
        || !closeEnough(actualStyle.lineHeight, referenceStyle.lineHeight, 0.75)) {
      fail(ruleId, { actual: actualStyle, reference: referenceStyle });
    }
  }

  if (!closeEnough(actual.tokens.root?.borderRadius, reference.tokens.root?.borderRadius, 0.5)) {
    fail('DOSSIER_RADIUS', { actual: actual.tokens.root?.borderRadius, reference: reference.tokens.root?.borderRadius });
  }
  if (actual.tokens.root?.backgroundColor !== reference.tokens.root?.backgroundColor) {
    fail('DOSSIER_BACKGROUND', { actual: actual.tokens.root?.backgroundColor, reference: reference.tokens.root?.backgroundColor });
  }
  if (!closeEnough(actual.tokens.root?.borderTopWidth, reference.tokens.root?.borderTopWidth, 0.25)
      || actual.tokens.root?.borderTopStyle !== reference.tokens.root?.borderTopStyle
      || actual.tokens.root?.borderTopColor !== reference.tokens.root?.borderTopColor) {
    fail('DOSSIER_BORDER', { actual: actual.tokens.root, reference: reference.tokens.root });
  }
  if (!closeEnough(actual.tokens.task?.borderRadius, reference.tokens.task?.borderRadius, 0.5)) {
    fail('CURRENT_TASK_RADIUS', { actual: actual.tokens.task?.borderRadius, reference: reference.tokens.task?.borderRadius });
  }
  if (actual.tokens.task?.backgroundColor !== reference.tokens.task?.backgroundColor) {
    fail('CURRENT_TASK_BACKGROUND', { actual: actual.tokens.task?.backgroundColor, reference: reference.tokens.task?.backgroundColor });
  }

  return {
    comparator_result: failedRuleIds.length ? 'REJECTED' : 'PASS',
    failed_rule_ids: failedRuleIds,
    rule_details: ruleDetails,
    context,
  };
}

function requireComparatorPass(comparison, label) {
  if (comparison.comparator_result !== 'PASS') {
    throw new Error(`${label} comparator rejected: ${JSON.stringify(comparison)}`);
  }
}

async function login(context) {
  const page = await context.newPage();
  await page.goto(`${baseUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', 'bootstrap_admin');
  await page.fill('#user_pass', runtimePassword);
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#wp-submit')]);
  await page.close();
}

async function freshProductionPage(context, viewport) {
  const page = await context.newPage();
  await page.setViewportSize(viewport);
  await page.goto(entryUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector(admittedReviewSelector, { timeout: 30000 });
  const admission = await page.evaluate(reviewSelector => {
    const root = document.querySelector(reviewSelector);
    const native = document.querySelector('.entry-detail-view');
    const timeline = document.querySelector('.gravityflow-timeline');
    const timelineStyle = timeline ? getComputedStyle(timeline) : null;
    return {
      profile: root?.dataset.gppProfileId || null,
      suppression: root?.dataset.gppNativeTableSuppression || null,
      native_present: Boolean(native),
      native_display: native ? getComputedStyle(native).display : null,
      timeline_count: document.querySelectorAll('.gravityflow-timeline').length,
      timeline_visible: Boolean(timeline && timelineStyle.display !== 'none' && timelineStyle.visibility !== 'hidden'),
      timeline_inside_dossier: Boolean(timeline && root?.contains(timeline)),
    };
  }, admittedReviewSelector);
  if (admission.suppression !== 'read-only-review'
      || !admission.native_present
      || admission.native_display !== 'none'
      || admission.timeline_count !== 1
      || !admission.timeline_visible
      || admission.timeline_inside_dossier) {
    await page.close();
    throw new Error(`Server-admitted Review/native-history contract failed: ${JSON.stringify(admission)}`);
  }
  return page;
}

async function collectReference(referencePage, surface, viewport) {
  await referencePage.setViewportSize(viewport);
  await referencePage.evaluate(name => window.showSurface(name), surface);
  return collectRenderedEntryDetailState(referencePage, referenceProfile);
}

async function runPositive(context, reference, viewport, resultId, viewportId, screenshotName) {
  const page = await freshProductionPage(context, viewport);
  try {
    const actual = await collectRenderedEntryDetailState(page, productionProfile);
    const comparison = compareAgainstVNextContract(actual, reference, { scenario: 'positive', viewport: viewportId });
    requireComparatorPass(comparison, resultId);
    if (screenshotName) await page.screenshot({ path: path.join(artifactDir, screenshotName), fullPage: true });
    return {
      ...executableResultBase(resultId, 'positive', viewportId, comparison.comparator_result, comparison.failed_rule_ids),
      mutation_id: null,
      mutation_confirmed: null,
      server_review_admission: true,
      native_duplicate_suppressed: true,
      native_history_owned_by_gravity_flow: true,
      comparison_summary: {
        actual_root_width: actual.geometry.root?.width,
        reference_root_width: reference.geometry.root?.width,
        actual_task_gap_from_header: actual.geometry.taskGapFromHeader,
        reference_task_gap_from_header: reference.geometry.taskGapFromHeader,
      },
    };
  } finally {
    await page.close();
  }
}

async function runNegativeControl({
  context,
  reference,
  viewport,
  viewportId,
  resultId,
  mutationId,
  expectedRuleId,
  mutate,
}) {
  const page = await freshProductionPage(context, viewport);
  try {
    const baseline = await collectRenderedEntryDetailState(page, productionProfile);
    const baselineComparison = compareAgainstVNextContract(baseline, reference, { scenario: 'falsification-baseline', viewport: viewportId, mutationId });
    requireComparatorPass(baselineComparison, `${resultId} baseline`);

    const mutationEvidence = await mutate(page, baseline);
    if (!mutationEvidence?.confirmed) throw new Error(`${resultId} mutation did not materially apply: ${JSON.stringify(mutationEvidence)}`);

    const mutated = await collectRenderedEntryDetailState(page, productionProfile);
    const comparison = compareAgainstVNextContract(mutated, reference, { scenario: 'falsification', viewport: viewportId, mutationId });
    if (comparison.comparator_result !== 'REJECTED') throw new Error(`${resultId} comparator failed to reject the mutated DOM.`);
    if (!comparison.failed_rule_ids.includes(expectedRuleId)) {
      throw new Error(`${resultId} rejected for unrelated rules: ${JSON.stringify(comparison.failed_rule_ids)}`);
    }

    return {
      ...executableResultBase(resultId, 'falsification', viewportId, comparison.comparator_result, comparison.failed_rule_ids),
      mutation_id: mutationId,
      mutation_confirmed: true,
      baseline_comparator_result: baselineComparison.comparator_result,
      expected_failed_rule_id: expectedRuleId,
      mutation_evidence: mutationEvidence,
    };
  } finally {
    await page.close();
  }
}

async function collectFlowOwnershipState(page) {
  return page.evaluate(reviewSelector => {
    const dossier = document.querySelector(reviewSelector);
    const form = document.querySelector('form[id^="gform_"]');
    const task = dossier?.querySelector('[data-gpp-entry-region="current-task"]');
    const status = document.querySelector('.gravityflow-status-box');
    const actions = document.querySelector('.gravityflow-action-buttons');
    const statusStyle = status ? getComputedStyle(status) : null;
    return {
      forms: document.querySelectorAll('form[id^="gform_"]').length,
      statusBoxes: document.querySelectorAll('.gravityflow-status-box').length,
      actionContainers: document.querySelectorAll('.gravityflow-action-buttons').length,
      approved: document.querySelectorAll('.gravityflow-action-buttons [value="approved"]').length,
      rejected: document.querySelectorAll('.gravityflow-action-buttons [value="rejected"]').length,
      revert: document.querySelectorAll('.gravityflow-action-buttons [value="revert"]').length,
      note: document.querySelectorAll('.gravityflow-status-box textarea[name="gravityflow_note"]').length,
      nonce: document.querySelectorAll('.gravityflow-status-box input[name="_wpnonce"]').length,
      statusVisible: Boolean(status && statusStyle.display !== 'none' && statusStyle.visibility !== 'hidden'),
      statusInsideDossier: Boolean(status && dossier?.contains(status)),
      statusInsideTask: Boolean(status && task?.contains(status)),
      actionsInsideStatus: Boolean(actions && status?.contains(actions)),
      statusInForm: Boolean(status && status.closest('form[id^="gform_"]') === form),
      actionsInForm: Boolean(actions && actions.closest('form[id^="gform_"]') === form),
    };
  }, admittedReviewSelector);
}

function flowOwnershipAccepted(state) {
  return state.forms === 1
    && state.statusBoxes === 1
    && state.actionContainers === 1
    && state.approved === 1
    && state.rejected === 1
    && state.revert === 1
    && state.note === 1
    && state.nonce === 1
    && state.statusVisible
    && !state.statusInsideDossier
    && !state.statusInsideTask
    && state.actionsInsideStatus
    && state.statusInForm
    && state.actionsInForm;
}

async function runCase(name, fn) {
  try {
    const result = await fn();
    results.push(result);
    console.log(`PASS ${result.id} ${name}`);
  } catch (error) {
    const failed = {
      id: name,
      status: 'FAIL',
      scenario_type: 'qualification',
      repository_head: repositoryHead,
      owner_authority: { file: path.basename(ownerHtml), ...htmlIdentity },
      comparator_version: comparatorVersion,
      comparator_executed: false,
      comparator_result: 'FAIL',
      failed_rule_ids: [],
      error: String(error?.stack || error).slice(0, 10000),
    };
    results.push(failed);
    console.log(`FAIL ${name}`);
  }
}

const browser = await chromium.launch({ headless: true });
const referenceContext = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const referencePage = await referenceContext.newPage();
await referencePage.goto(pathToFileURL(ownerHtml).href, { waitUntil: 'load' });
await referencePage.waitForFunction(() => typeof window.showSurface === 'function');
const referenceDesktop = await collectReference(referencePage, 'detail-desktop', { width: 1440, height: 1100 });
const referenceMobile = await collectReference(referencePage, 'detail-mobile', { width: 390, height: 844 });

const context = await browser.newContext();
await login(context);

await runCase('ENTRY-VNEXT-POSITIVE-DESKTOP-C', () => runPositive(
  context,
  referenceDesktop,
  { width: 1440, height: 1100 },
  'ENTRY-VNEXT-POSITIVE-DESKTOP-C',
  'desktop-C',
  'entry-vnext-desktop.png',
));

await runCase('ENTRY-VNEXT-POSITIVE-MOBILE-D', () => runPositive(
  context,
  referenceMobile,
  { width: 390, height: 844 },
  'ENTRY-VNEXT-POSITIVE-MOBILE-D',
  'mobile-D',
  'entry-vnext-mobile.png',
));

await runCase('ENTRY-VNEXT-NEGATIVE-TASK-DISPLACEMENT', () => runNegativeControl({
  context,
  reference: referenceDesktop,
  viewport: { width: 1440, height: 1100 },
  viewportId: 'desktop-C',
  resultId: 'ENTRY-VNEXT-NEGATIVE-TASK-DISPLACEMENT',
  mutationId: 'task_translate_y_120px',
  expectedRuleId: 'CURRENT_TASK_RELATIVE_POSITION',
  mutate: async page => page.evaluate(() => {
    const task = document.querySelector('[data-gpp-entry-region="current-task"]');
    if (!task) return { confirmed: false, reason: 'task_missing' };
    const before = task.getBoundingClientRect();
    task.style.setProperty('transform', 'translateY(120px)', 'important');
    const after = task.getBoundingClientRect();
    const deltaTop = after.top - before.top;
    return {
      confirmed: Math.abs(deltaTop) >= 110,
      before_top: before.top,
      after_top: after.top,
      delta_top: deltaTop,
      computed_transform: getComputedStyle(task).transform,
    };
  }),
}));

await runCase('ENTRY-VNEXT-NEGATIVE-NARROW-LAYOUT', () => runNegativeControl({
  context,
  reference: referenceDesktop,
  viewport: { width: 1440, height: 1100 },
  viewportId: 'desktop-C',
  resultId: 'ENTRY-VNEXT-NEGATIVE-NARROW-LAYOUT',
  mutationId: 'dossier_width_72_percent',
  expectedRuleId: 'DOSSIER_INLINE_GEOMETRY',
  mutate: async page => page.evaluate(reviewSelector => {
    const root = document.querySelector(reviewSelector);
    if (!root) return { confirmed: false, reason: 'dossier_missing' };
    const before = root.getBoundingClientRect();
    root.style.setProperty('width', '72%', 'important');
    const after = root.getBoundingClientRect();
    const ratio = before.width > 0 ? after.width / before.width : 1;
    return {
      confirmed: before.width - after.width >= 120 && ratio <= 0.82,
      before_width: before.width,
      after_width: after.width,
      width_ratio: ratio,
      computed_width: getComputedStyle(root).width,
    };
  }, admittedReviewSelector),
}));

await runCase('ENTRY-VNEXT-NEGATIVE-OWNED-VISUAL-TOKEN', () => runNegativeControl({
  context,
  reference: referenceDesktop,
  viewport: { width: 1440, height: 1100 },
  viewportId: 'desktop-C',
  resultId: 'ENTRY-VNEXT-NEGATIVE-OWNED-VISUAL-TOKEN',
  mutationId: 'h1_font_size_plus_7px',
  expectedRuleId: 'H1_TYPOGRAPHY',
  mutate: async page => page.evaluate(() => {
    const h1 = document.querySelector('[data-gpp-entry-region="header"] h1');
    if (!h1) return { confirmed: false, reason: 'h1_missing' };
    const before = parseFloat(getComputedStyle(h1).fontSize);
    h1.style.setProperty('font-size', `${before + 7}px`, 'important');
    const after = parseFloat(getComputedStyle(h1).fontSize);
    return {
      confirmed: Number.isFinite(before) && Number.isFinite(after) && Math.abs(after - before) >= 6.5,
      before_font_size: before,
      after_font_size: after,
      delta_font_size: after - before,
    };
  }),
}));

await runCase('ENTRY-VNEXT-FLOW-OWNERSHIP', async () => {
  const page = await freshProductionPage(context, { width: 1440, height: 1100 });
  try {
    const baseline = await collectFlowOwnershipState(page);
    if (!flowOwnershipAccepted(baseline)) throw new Error(`Native Flow ownership changed: ${JSON.stringify(baseline)}`);

    const mutation = await page.evaluate(reviewSelector => {
      const dossier = document.querySelector(reviewSelector);
      const task = dossier?.querySelector('[data-gpp-entry-region="current-task"]');
      const status = document.querySelector('.gravityflow-status-box');
      if (!task || !status) return { confirmed: false, reason: 'required_nodes_missing' };
      task.append(status);
      return {
        confirmed: task.contains(status) && Boolean(status.closest(reviewSelector)),
        status_inside_task: task.contains(status),
        status_inside_dossier: Boolean(status.closest(reviewSelector)),
      };
    }, admittedReviewSelector);
    if (!mutation.confirmed) throw new Error(`Flow ownership falsification mutation did not materially apply: ${JSON.stringify(mutation)}`);

    const mutated = await collectFlowOwnershipState(page);
    if (flowOwnershipAccepted(mutated) || !mutated.statusInsideDossier || !mutated.statusInsideTask) {
      throw new Error(`Flow ownership oracle failed to reject status reparenting into the GPP dossier: ${JSON.stringify(mutated)}`);
    }

    return {
      id: 'ENTRY-VNEXT-FLOW-OWNERSHIP',
      status: 'PASS',
      scenario_type: 'runtime-invariant',
      viewport: 'desktop-C',
      repository_head: repositoryHead,
      owner_authority: { file: path.basename(ownerHtml), ...htmlIdentity },
      comparator_version: comparatorVersion,
      comparator_executed: false,
      comparator_result: 'NOT_APPLICABLE',
      failed_rule_ids: [],
      details: {
        baseline,
        moved_inside_dossier_rejected: true,
        mutation,
      },
    };
  } finally {
    await page.close();
  }
});

const positiveDesktop = results.find(result => result.id === 'ENTRY-VNEXT-POSITIVE-DESKTOP-C');
const positiveMobile = results.find(result => result.id === 'ENTRY-VNEXT-POSITIVE-MOBILE-D');
const output = {
  schema_version: evidenceSchemaVersion,
  suite: 'Entry Detail vNext shared browser/runtime visual contract',
  comparator_version: comparatorVersion,
  repository_head: repositoryHead,
  admission_oracle: 'server_admitted_read_only_review',
  history_oracle: 'native_gravity_flow_timeline_outside_gpp_dossier',
  authority: { file: path.basename(ownerHtml), ...htmlIdentity },
  surfaces: {
    entry_desktop_C: positiveDesktop?.status === 'PASS' && positiveDesktop.comparator_result === 'PASS' ? 'PASS' : 'FAIL',
    entry_mobile_D: positiveMobile?.status === 'PASS' && positiveMobile.comparator_result === 'PASS' ? 'PASS' : 'FAIL',
  },
  results,
};
fs.writeFileSync(path.join(artifactDir, 'entry-visual-contract-results.json'), JSON.stringify(output, null, 2) + '\n');

await referenceContext.close();
await context.close();
await browser.close();

if (results.some(result => result.status !== 'PASS')) process.exit(1);
