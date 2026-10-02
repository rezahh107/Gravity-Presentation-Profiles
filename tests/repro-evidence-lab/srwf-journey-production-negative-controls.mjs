import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
const operatorPassword = 'wu21-bootstrap-pass-2026';
const negativePassword = 'srwf-participant-pass-2026';
if (!artifactDir || !wpPath || !wpCli) throw new Error('Pinned production-journey environment is incomplete.');

function wpEval(code) {
  const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], { encoding: 'utf8', env: process.env });
  if (cp.status !== 0) throw new Error(`${cp.stderr}\n${cp.stdout}`);
  return cp.stdout.trim();
}

function wpEvalFile(path) {
  const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval-file', path], { encoding: 'utf8', env: process.env });
  if (cp.status !== 0) throw new Error(`${cp.stderr}\n${cp.stdout}`);
  return cp.stdout.trim();
}

const manifest = JSON.parse(wpEval('echo wp_json_encode(get_option("gpp_srwf_journey_host_manifest"), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);'));
const formId = Number(manifest.form_id);
if (!manifest.production_presentation?.host_args_control) throw new Error('Production host-args control was not installed.');

function hostState(entryId, userId) {
  return JSON.parse(wpEval(`
    wp_set_current_user(${Number(userId)});
    if (!class_exists('Gravity_Flow_Entry_Detail')) require_once gravity_flow()->get_base_path() . '/includes/pages/class-entry-detail.php';
    $entry=GFAPI::get_entry(${Number(entryId)}); $api=new Gravity_Flow_API(${formId}); $step=$api->get_current_step($entry);
    $meta=($step && method_exists($step,'get_feed_meta'))?$step->get_feed_meta():array();
    echo wp_json_encode(array(
      'current_step'=>$step?array(
        'id'=>(int)$step->get_id(),
        'type'=>(string)$step->get_type(),
        'can_update'=>(bool)Gravity_Flow_Entry_Detail::can_update($step),
        'assignees'=>isset($meta['assignees'])?array_values(array_map('strval',(array)$meta['assignees'])):array()
      ):null
    ),JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
  `));
}

function frontendEntryUrl(route, entryId) {
  const url = new URL(route.url);
  url.searchParams.set('view', 'entry');
  url.searchParams.set('id', String(formId));
  url.searchParams.set('lid', String(entryId));
  return url.toString();
}

async function login(page, user, pass) {
  await page.context().clearCookies();
  await page.goto(`${baseUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', user);
  await page.fill('#user_pass', pass);
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#wp-submit')]);
  if (new URL(page.url()).pathname.endsWith('/wp-login.php')) throw new Error(`Authentication failed for synthetic user ${user}.`);
}

async function returnControls(page) {
  return page.evaluate(() => ({
    gpp: [...document.querySelectorAll('a.gpp-entry-journey__return')]
      .filter(a => a.offsetParent !== null)
      .map(a => ({ text: a.textContent.replace(/\s+/g, ' ').trim(), href: a.href })),
    native: [...document.querySelectorAll('.gravityflow-back-link-container a.back-link')]
      .filter(a => a.offsetParent !== null)
      .map(a => ({ text: a.textContent.replace(/\s+/g, ' ').trim(), href: a.href }))
  }));
}

function comparable(url) {
  const u = new URL(url);
  for (const k of ['view', 'lid', 'id', 'paged', 'search', 'sort', 'sort_field', 'sort_direction']) u.searchParams.delete(k);
  return `${u.origin}${u.pathname}${u.search}`;
}

function assertCanonicalPageOneHref(href, route) {
  const actual = new URL(href);
  for (const k of ['view', 'lid', 'id', 'paged', 'search', 'sort', 'sort_field', 'sort_direction']) {
    if (actual.searchParams.has(k)) throw new Error(`Return href retained transient ${k}: ${href}`);
  }
  if (comparable(href) !== comparable(route.url)) throw new Error(`Return href is not canonical Inbox page 1: ${JSON.stringify({ href, expected: route.url })}`);
}

async function assertPrimaryReturnVisual(page, route, entryId, expectedMode) {
  const selector = expectedMode === 'native'
    ? '.gravityflow-back-link-container a.back-link'
    : 'a.gpp-entry-journey__return';
  const evidence = [];

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
    { width: 320, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(frontendEntryUrl(route, entryId), { waitUntil: 'networkidle' });

    const controls = await returnControls(page);
    const all = [...controls.gpp, ...controls.native];
    if (all.length !== 1) throw new Error(`Expected exactly one return control at ${viewport.width}px: ${JSON.stringify(controls)}`);
    if (expectedMode === 'native' && (controls.native.length !== 1 || controls.gpp.length !== 0)) throw new Error(`Native return mode drifted at ${viewport.width}px: ${JSON.stringify(controls)}`);
    if (expectedMode === 'gpp' && (controls.gpp.length !== 1 || controls.native.length !== 0)) throw new Error(`GPP return mode drifted at ${viewport.width}px: ${JSON.stringify(controls)}`);
    if (all[0].text !== 'بازگشت به کارهای من') throw new Error(`Return label drifted at ${viewport.width}px: ${JSON.stringify(all[0])}`);
    assertCanonicalPageOneHref(all[0].href, route);

    const control = page.locator(selector).filter({ visible: true }).first();
    const visual = await control.evaluate(el => {
      const style = getComputedStyle(el);
      const before = getComputedStyle(el, '::before');
      const rect = el.getBoundingClientRect();
      return {
        text: el.textContent.replace(/\s+/g, ' ').trim(),
        aria_label: el.getAttribute('aria-label'),
        background: style.backgroundColor,
        border_color: style.borderTopColor,
        color: style.color,
        border_radius: style.borderRadius,
        min_block_size: style.minBlockSize,
        box_shadow: style.boxShadow,
        white_space: style.whiteSpace,
        rect: { left: rect.left, right: rect.right, width: rect.width, height: rect.height },
        client_width: el.clientWidth,
        scroll_width: el.scrollWidth,
        pseudo: {
          content: before.content,
          background_image: before.backgroundImage,
          width: before.width,
          height: before.height,
        },
      };
    });

    if (
      visual.background !== 'rgb(37, 99, 235)'
      || visual.border_color !== 'rgb(37, 99, 235)'
      || visual.color !== 'rgb(255, 255, 255)'
      || visual.border_radius !== '12px'
      || visual.min_block_size !== '44px'
      || !visual.box_shadow.includes('rgba(37, 99, 235, 0.14)')
    ) {
      throw new Error(`Primary-navigation visual tokens drifted at ${viewport.width}px: ${JSON.stringify(visual)}`);
    }
    if (
      visual.text !== 'بازگشت به کارهای من'
      || visual.aria_label !== null
      || visual.pseudo.content !== '""'
      || !visual.pseudo.background_image.includes('data:image/svg+xml')
      || visual.pseudo.width !== '18px'
      || visual.pseudo.height !== '18px'
    ) {
      throw new Error(`Decorative return icon/accessibility contract drifted at ${viewport.width}px: ${JSON.stringify(visual)}`);
    }
    if (
      visual.rect.height < 44
      || visual.rect.left < -1
      || visual.rect.right > viewport.width + 1
      || visual.scroll_width > visual.client_width + 1
      || visual.white_space === 'nowrap'
    ) {
      throw new Error(`Return control clipped or overflowed at ${viewport.width}px: ${JSON.stringify(visual)}`);
    }

    await control.hover();
    const hover = await control.evaluate(el => {
      const style = getComputedStyle(el);
      return { background: style.backgroundColor, border_color: style.borderTopColor, color: style.color };
    });
    if (hover.background !== 'rgb(29, 78, 216)' || hover.border_color !== 'rgb(29, 78, 216)' || hover.color !== 'rgb(255, 255, 255)') {
      throw new Error(`Primary-navigation hover contract drifted at ${viewport.width}px: ${JSON.stringify(hover)}`);
    }

    await page.mouse.move(0, 0);
    await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
    let keyboardFocused = false;
    for (let i = 0; i < 120; i += 1) {
      await page.keyboard.press('Tab');
      keyboardFocused = await control.evaluate(el => document.activeElement === el);
      if (keyboardFocused) break;
    }
    if (!keyboardFocused) throw new Error(`Return control was not keyboard reachable at ${viewport.width}px.`);
    const focus = await control.evaluate(el => {
      const style = getComputedStyle(el);
      return {
        focus_visible: el.matches(':focus-visible'),
        outline_style: style.outlineStyle,
        outline_width: style.outlineWidth,
        outline_color: style.outlineColor,
        outline_offset: style.outlineOffset,
      };
    });
    if (!focus.focus_visible || focus.outline_style !== 'solid' || focus.outline_width !== '3px' || focus.outline_color !== 'rgb(147, 197, 253)' || focus.outline_offset !== '3px') {
      throw new Error(`Return focus-visible contract drifted at ${viewport.width}px: ${JSON.stringify(focus)}`);
    }

    evidence.push({ viewport, mode: expectedMode, visual, hover, focus });
  }

  return evidence;
}

function controlMode() {
  return wpEval('echo get_option("gpp_journey_back_link_control", "__MISSING__");');
}

function setControlMode(mode) {
  wpEval(`update_option("gpp_journey_back_link_control", ${JSON.stringify(mode)}, false);`);
  const actual = controlMode();
  if (actual !== mode) throw new Error(`Unable to set host Back-link control: ${JSON.stringify({ expected: mode, actual })}`);
}

function clearControlMode() {
  wpEval('delete_option("gpp_journey_back_link_control");');
  const actual = controlMode();
  if (actual !== '__MISSING__') throw new Error(`Host Back-link control leaked after reset: ${JSON.stringify({ actual })}`);
}

async function accept(page, value) {
  const button = page.locator(`.gravityflow-status-box .gravityflow-action-buttons button[value="${value}"]`).first();
  if (await button.count() !== 1) throw new Error(`Missing native action ${value}`);
  let dialogInfo = null;
  const dialog = new Promise(resolve => page.once('dialog', async d => {
    dialogInfo = { type: d.type(), message: d.message() };
    await d.accept();
    resolve();
  }));
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }), button.click(), dialog]);
  return dialogInfo;
}

const results = [];
async function test(id, name, fn) {
  try {
    results.push({ id, name, status: 'PASS', details: await fn() });
  } catch (error) {
    results.push({ id, name, status: 'FAIL', details: { error: String(error?.stack || error).slice(0, 12000) } });
  }
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
await login(page, manifest.users.operator.login, operatorPassword);

const route = manifest.routes.shortcode;
const stableEntryId = Number(manifest.entries.revert);
clearControlMode();
await page.goto(frontendEntryUrl(route, stableEntryId), { waitUntil: 'networkidle' });
const baselineControls = await returnControls(page);
if ([...baselineControls.gpp, ...baselineControls.native].length !== 1) throw new Error(`Baseline return control is not singular: ${JSON.stringify(baselineControls)}`);

await test('SRWF-PROD-BACK-LINK-FORCE-ON-001', 'force_on yields one canonical Persian native return control with primary-navigation presentation', async () => {
  try {
    setControlMode('force_on');
    const visual = await assertPrimaryReturnVisual(page, route, stableEntryId, 'native');
    const controls = await returnControls(page);
    return { mode: 'force_on', controls, visual };
  } finally {
    clearControlMode();
  }
});

await test('SRWF-PROD-BACK-LINK-FORCE-OFF-001', 'force_off yields one canonical GPP return control with primary-navigation presentation', async () => {
  try {
    if (controlMode() !== '__MISSING__') throw new Error('force_on leaked into force_off scenario.');
    setControlMode('force_off');
    const visual = await assertPrimaryReturnVisual(page, route, stableEntryId, 'gpp');
    const controls = await returnControls(page);
    return { mode: 'force_off', controls, visual };
  } finally {
    clearControlMode();
  }
});

await test('SRWF-PROD-BACK-LINK-CONTROL-RESET-001', 'Back-link test modes do not leak into later requests', async () => {
  if (controlMode() !== '__MISSING__') throw new Error('Back-link control option remained set after negative controls.');
  await page.goto(frontendEntryUrl(route, stableEntryId), { waitUntil: 'networkidle' });
  const controls = await returnControls(page);
  if (JSON.stringify(controls) !== JSON.stringify(baselineControls)) throw new Error(`Default effective Back-link args did not return to baseline: ${JSON.stringify({ baselineControls, controls })}`);
  return { control_mode: '__MISSING__', baseline: baselineControls, after_reset: controls };
});

await test('SRWF-PROD-SPLIT-ASSIGNEE-NEGATIVE-001', 'split-assignee User Input is not labeled SAME-OPERATOR Correction', async () => {
  if (controlMode() !== '__MISSING__') throw new Error('Back-link control leaked into split-assignee scenario.');
  const split = JSON.parse(wpEvalFile('tests/repro-evidence-lab/srwf-journey-production-split-assignee-setup.php'));
  const operatorId = Number(manifest.users.operator.id);
  const negativeId = Number(manifest.users.negative_control.id);

  await login(page, manifest.users.operator.login, operatorPassword);
  await page.goto(frontendEntryUrl(route, split.entry_id), { waitUntil: 'networkidle' });
  const reviewState = hostState(split.entry_id, operatorId);
  if (reviewState.current_step?.id !== Number(split.review_id) || reviewState.current_step?.type !== 'approval' || JSON.stringify(reviewState.current_step?.assignees) !== JSON.stringify([`user_id|${operatorId}`])) {
    throw new Error(`Live Review topology does not match split fixture: ${JSON.stringify({ split, reviewState })}`);
  }

  const dialog = await accept(page, 'revert');
  const operatorCorrection = hostState(split.entry_id, operatorId);
  const operatorOrientation = await page.locator('[data-gpp-entry-journey="correction"]').count();
  if (!dialog || operatorCorrection.current_step?.id !== Number(split.correction_id) || operatorCorrection.current_step?.type !== 'user_input' || JSON.stringify(operatorCorrection.current_step?.assignees) !== JSON.stringify([`user_id|${negativeId}`]) || operatorCorrection.current_step?.can_update || operatorOrientation !== 0) {
    throw new Error(`Split-assignee operator view was mislabeled or host topology drifted: ${JSON.stringify({ dialog, operatorCorrection, operatorOrientation })}`);
  }

  await login(page, manifest.users.negative_control.login, negativePassword);
  await page.goto(frontendEntryUrl(route, split.entry_id), { waitUntil: 'networkidle' });
  const negativeCorrection = hostState(split.entry_id, negativeId);
  const negativeOrientation = await page.locator('[data-gpp-entry-journey="correction"]').count();
  const editable = await page.locator('input[name="input_1"]:visible').count();
  if (negativeCorrection.current_step?.id !== Number(split.correction_id) || negativeCorrection.current_step?.type !== 'user_input' || JSON.stringify(negativeCorrection.current_step?.assignees) !== JSON.stringify([`user_id|${negativeId}`]) || !negativeCorrection.current_step?.can_update || editable !== 1 || negativeOrientation !== 0) {
    throw new Error(`Different-assignee authorized User Input was mislabeled SAME-OPERATOR Correction: ${JSON.stringify({ negativeCorrection, editable, negativeOrientation })}`);
  }

  return { split, live_review: reviewState, live_operator_correction: operatorCorrection, live_negative_correction: negativeCorrection, operator_orientation_count: operatorOrientation, negative_orientation_count: negativeOrientation, negative_editable_input_count: editable };
});

clearControlMode();
await browser.close();
fs.mkdirSync(artifactDir, { recursive: true });
fs.writeFileSync(
  `${artifactDir}/srwf-journey-production-negative-controls.json`,
  JSON.stringify({ schema_version: '1.0.0', runtime: 'REPRODUCIBLE_PINNED_LAB', results }, null, 2) + '\n'
);
const failed = results.filter(x => x.status !== 'PASS');
if (failed.length) {
  console.error(JSON.stringify({ failed }, null, 2));
  process.exit(1);
}
console.log(`SRWF_JOURNEY_PRODUCTION_NEGATIVE_CONTROLS_PASS ${results.length}`);
