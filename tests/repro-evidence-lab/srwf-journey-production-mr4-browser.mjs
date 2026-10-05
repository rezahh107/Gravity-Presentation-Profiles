import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
const operatorPassword = 'wu21-bootstrap-pass-2026';
if (!artifactDir || !wpPath || !wpCli) throw new Error('Pinned MR-4 journey environment is incomplete.');

function wpEval(code) {
  const result = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], {
    encoding: 'utf8',
    env: process.env,
  });
  if (result.status !== 0) throw new Error(`${result.stderr}\n${result.stdout}`);
  return result.stdout.trim();
}

const manifest = JSON.parse(
  wpEval('echo wp_json_encode(get_option("gpp_srwf_journey_host_manifest"),JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);')
);
const formId = Number(manifest.form_id);
const reviewId = Number(manifest.steps.review_id);
const correctionId = Number(manifest.steps.correction_id);
const operatorId = Number(manifest.users.operator.id);
const conditionalFieldId = Number(manifest.production_presentation?.conditional_field_id || 0);
if (
  manifest.production_presentation?.entry_detail_setup_status !== 'COMPLETED'
  || manifest.production_presentation?.gtb_registration_opt_in !== true
  || conditionalFieldId !== 5
) {
  throw new Error(`MR-4 production fixture is incomplete: ${JSON.stringify(manifest.production_presentation)}`);
}

function frontendEntryUrl(entryId) {
  const url = new URL(manifest.routes.shortcode.url);
  url.searchParams.set('view', 'entry');
  url.searchParams.set('id', String(formId));
  url.searchParams.set('lid', String(entryId));
  return url.toString();
}

function hostState(entryId) {
  return JSON.parse(wpEval(`
    wp_set_current_user(${operatorId});
    if (!class_exists('Gravity_Flow_Entry_Detail')) require_once gravity_flow()->get_base_path() . '/includes/pages/class-entry-detail.php';
    $entry=GFAPI::get_entry(${Number(entryId)});
    $api=new Gravity_Flow_API(${formId});
    $step=$api->get_current_step($entry);
    echo wp_json_encode(array(
      'field_1'=>(string)rgar($entry,'1'),
      'field_5'=>(string)rgar($entry,'5'),
      'workflow_final_status'=>(string)gform_get_meta((int)$entry['id'],'workflow_final_status'),
      'api_status'=>(string)$api->get_status($entry),
      'current_step'=>$step?array(
        'id'=>(int)$step->get_id(),
        'type'=>(string)$step->get_type(),
        'can_update'=>(bool)Gravity_Flow_Entry_Detail::can_update($step),
        'editable_fields'=>method_exists($step,'get_editable_fields')?array_values(array_map('strval',$step->get_editable_fields())):array()
      ):null
    ),JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
  `));
}

function createReviewEntry(label) {
  const raw = wpEval(`
    wp_set_current_user(${operatorId});
    $entry_id=GFAPI::add_entry(array(
      'form_id'=>${formId},
      'created_by'=>${operatorId},
      '1'=>'MR4-BASE-${label}',
      '2'=>'Journey',
      '3'=>'MR4 ${label}',
      '4'=>'MR4-${label}'
    ));
    if (is_wp_error($entry_id) || !$entry_id) throw new RuntimeException('MR4 entry creation failed.');
    $api=new Gravity_Flow_API(${formId});
    $api->process_workflow((int)$entry_id);
    $entry=GFAPI::get_entry((int)$entry_id);
    $sent=$api->send_to_step($entry,${reviewId});
    if (false===$sent || is_wp_error($sent)) throw new RuntimeException('MR4 Review seed failed.');
    echo (int)$entry_id;
  `);
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw new Error(`Invalid MR-4 entry id: ${raw}`);
  return id;
}

async function login(page) {
  await page.goto(`${baseUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', manifest.users.operator.login);
  await page.fill('#user_pass', operatorPassword);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.click('#wp-submit'),
  ]);
  if (new URL(page.url()).pathname.endsWith('/wp-login.php')) throw new Error('MR-4 operator authentication failed.');
}

async function nativeActions(page) {
  return page.locator('.gravityflow-status-box .gravityflow-action-buttons button').evaluateAll(nodes =>
    nodes.filter(node => node.offsetParent !== null).map(node => ({
      value: node.value,
      onclick: node.getAttribute('onclick') || '',
    }))
  );
}

async function accept(page, value) {
  const button = page.locator(`.gravityflow-status-box .gravityflow-action-buttons button[value="${value}"]`).first();
  if (await button.count() !== 1) throw new Error(`Missing native action ${value}.`);
  let dialogInfo = null;
  const dialog = new Promise(resolve => page.once('dialog', async d => {
    dialogInfo = { type: d.type(), message: d.message() };
    await d.accept();
    resolve();
  }));
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }),
    button.click(),
    dialog,
  ]);
  return dialogInfo;
}

async function printState(page) {
  return page.evaluate(() => {
    const nodes = [...document.querySelectorAll('[data-gpp-print-utility="dossier"]')];
    return {
      dom_count: nodes.length,
      visible_count: nodes.filter(node => node.offsetParent !== null && getComputedStyle(node).display !== 'none').length,
    };
  });
}

async function gtbStyles(page) {
  return page.evaluate(() => [...document.querySelectorAll('link[rel="stylesheet"]')]
    .map(link => ({ id: link.id || '', href: link.href || '' }))
    .filter(link => link.id === 'srwf-registration-theme-css' || link.href.includes('/srwf-registration-theme/srwf-registration.css')));
}

async function correctionGeometry(page) {
  return page.evaluate(() => {
    const html = document.documentElement;
    const orientation = document.querySelector('[data-gpp-entry-journey="correction"]');
    const wrapper = document.querySelector('.gform_wrapper');
    const input = document.querySelector('input[name="input_1"]');
    const submit = document.querySelector('.gform_footer input[type="submit"],.gform_footer button[type="submit"]');
    const rect = element => element ? element.getBoundingClientRect() : null;
    const simplify = value => value ? { left: value.left, right: value.right, width: value.width, height: value.height } : null;
    return {
      viewport: window.innerWidth,
      overflow: html.scrollWidth - window.innerWidth,
      orientation: simplify(rect(orientation)),
      wrapper: simplify(rect(wrapper)),
      input: simplify(rect(input)),
      submit: simplify(rect(submit)),
      labels: input?.labels?.length || 0,
    };
  });
}

const results = [];
async function test(id, name, fn) {
  try {
    results.push({ id, name, status: 'PASS', details: await fn() });
  } catch (error) {
    results.push({ id, name, status: 'FAIL', details: { error: String(error?.stack || error).slice(0, 16000) } });
  }
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
await login(page);

const activeTheme = wpEval('echo get_stylesheet();');
if (activeTheme !== 'hello-elementor') throw new Error(`Forward target Hello Elementor host is not active: ${activeTheme}`);

const entryId = createReviewEntry('END-TO-END');

await test('SRWF-PROD-MR4-REVIEW-001', 'Review remains native-authoritative before correction', async () => {
  await page.goto(frontendEntryUrl(entryId), { waitUntil: 'networkidle' });
  const state = hostState(entryId);
  const actions = await nativeActions(page);
  const print = await printState(page);
  const gtb = await gtbStyles(page);
  if (
    state.current_step?.id !== reviewId
    || state.current_step?.type !== 'approval'
    || actions.map(action => action.value).join(',') !== 'approved,rejected,revert'
    || !actions.every(action => action.onclick.includes('handleApprovalStepButtonClick'))
    || await page.locator('.gpp-entry-dossier[data-gpp-entry-detail="ready"]').count() !== 1
    || print.visible_count !== 1
    || gtb.length !== 0
  ) {
    throw new Error(`Review baseline failed: ${JSON.stringify({ state, actions, print, gtb })}`);
  }
  return { active_theme: activeTheme, state, actions, print, gtb_stylesheets: gtb };
});

wpEval("update_option('gpp_srwf_mr4_expand_editable_fields','1',false); echo '1';");

await test('SRWF-PROD-MR4-CORRECTION-001', 'Revert admits native User Input and correction-family presentation only', async () => {
  await page.goto(frontendEntryUrl(entryId), { waitUntil: 'networkidle' });
  const dialog = await accept(page, 'revert');
  const state = hostState(entryId);
  const visibleInputs = [...new Set(await page.locator('input[name^="input_"]:visible,textarea[name^="input_"]:visible,select[name^="input_"]:visible')
    .evaluateAll(nodes => nodes.map(node => node.getAttribute('name')).filter(Boolean)))].sort();
  const orientationCount = await page.locator('[data-gpp-entry-journey="correction"]:visible').count();
  const gppOwnedInputs = await page.locator('.gpp-entry-journey input,.gpp-entry-journey textarea,.gpp-entry-journey select').count();
  const unauthorized = await page.locator('input[name="input_2"]:visible,input[name="input_3"]:visible,input[name="input_4"]:visible').count();
  const print = await printState(page);
  const gtb = await gtbStyles(page);
  const visual = await page.evaluate(() => {
    const wrapper = document.querySelector('.gform_wrapper');
    const input = document.querySelector('input[name="input_1"]');
    if (!wrapper || !input) return null;
    const wrapperStyle = getComputedStyle(wrapper);
    const inputStyle = getComputedStyle(input);
    return {
      wrapper_border_radius: wrapperStyle.borderRadius,
      wrapper_background: wrapperStyle.backgroundColor,
      wrapper_border_style: wrapperStyle.borderStyle,
      wrapper_box_shadow: wrapperStyle.boxShadow,
      input_height: input.getBoundingClientRect().height,
      input_border_radius: inputStyle.borderRadius,
    };
  });
  const field5Visible = await page.locator('input[name="input_5"]:visible').count();
  if (
    !dialog
    || state.current_step?.id !== correctionId
    || state.current_step?.type !== 'user_input'
    || state.current_step?.can_update !== true
    || JSON.stringify(state.current_step?.editable_fields?.map(String).sort()) !== JSON.stringify(['1', '5'])
    || orientationCount !== 1
    || gppOwnedInputs !== 0
    || unauthorized !== 0
    || visibleInputs.join(',') !== 'input_1'
    || field5Visible !== 0
    || print.visible_count !== 0
    || gtb.length !== 0
    || !visual
    || visual.wrapper_border_radius !== '14px'
    || visual.wrapper_border_style !== 'solid'
    || visual.wrapper_background !== 'rgb(255, 255, 255)'
    || visual.wrapper_box_shadow === 'none'
    || visual.input_height < 44
    || visual.input_border_radius !== '8px'
  ) {
    throw new Error(`Correction admission/composition failed: ${JSON.stringify({ dialog, state, visibleInputs, orientationCount, gppOwnedInputs, unauthorized, print, gtb, visual, field5Visible })}`);
  }
  return { dialog, state, visible_inputs: visibleInputs, print, gtb_stylesheets: gtb, visual };
});

await test('SRWF-PROD-MR4-CONDITIONAL-001', 'native Gravity Forms conditional logic remains live', async () => {
  const input1 = page.locator('input[name="input_1"]').first();
  await input1.fill('SHOW-MR4');
  await page.waitForFunction(() => {
    const node = document.querySelector('input[name="input_5"]');
    return Boolean(node && node.offsetParent !== null);
  });
  const field5 = page.locator('input[name="input_5"]').first();
  await field5.fill('CONDITIONAL-PRESERVED');
  await input1.fill('HIDE-MR4');
  await page.waitForFunction(() => {
    const node = document.querySelector('input[name="input_5"]');
    return Boolean(node && node.offsetParent === null);
  });
  await input1.fill('SHOW-MR4');
  await page.waitForFunction(() => {
    const node = document.querySelector('input[name="input_5"]');
    return Boolean(node && node.offsetParent !== null);
  });
  const preserved = await field5.inputValue();
  if (preserved !== 'CONDITIONAL-PRESERVED') {
    throw new Error(`Native conditional field value was not preserved: ${preserved}`);
  }
  return { controller: await input1.inputValue(), conditional_value: preserved };
});

await test('SRWF-PROD-MR4-VALIDATION-001', 'native validation failure stays in correction with submitted value preserved', async () => {
  const input1 = page.locator('input[name="input_1"]').first();
  const field5 = page.locator('input[name="input_5"]').first();
  await input1.fill('SHOW-MR4');
  await page.waitForFunction(() => {
    const node = document.querySelector('input[name="input_5"]');
    return Boolean(node && node.offsetParent !== null);
  });
  await field5.fill('');
  const submit = page.locator(`#gform_submit_button_${formId},form[id^="gform_"] input[type="submit"],form[id^="gform_"] button[type="submit"]`).filter({ visible: true }).last();
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }),
    submit.click(),
  ]);
  const state = hostState(entryId);
  const restoredController = await page.locator('input[name="input_1"]').first().inputValue();
  const field5Node = page.locator('input[name="input_5"]').first();
  const field5Id = await field5Node.getAttribute('id');
  const errorState = await page.evaluate(id => {
    const input = id ? document.getElementById(id) : null;
    const field = input?.closest('.gfield');
    const messages = field ? [...field.querySelectorAll('.gfield_validation_message,.validation_message')] : [];
    return {
      aria_invalid: input?.getAttribute('aria-invalid') || null,
      field_error: Boolean(field?.classList.contains('gfield_error')),
      visible_messages: messages.filter(node => node.offsetParent !== null).map(node => node.textContent.replace(/\s+/g, ' ').trim()),
    };
  }, field5Id);
  const print = await printState(page);
  if (
    state.current_step?.id !== correctionId
    || state.current_step?.type !== 'user_input'
    || restoredController !== 'SHOW-MR4'
    || await page.locator('[data-gpp-entry-journey="correction"]:visible').count() !== 1
    || await field5Node.count() !== 1
    || (!errorState.field_error && errorState.aria_invalid !== 'true' && errorState.visible_messages.length === 0)
    || print.visible_count !== 0
    || await page.locator('.gpp-entry-dossier[data-gpp-entry-detail="ready"]:visible').count() !== 0
  ) {
    throw new Error(`Validation contract failed: ${JSON.stringify({ state, restoredController, errorState, print })}`);
  }
  return { state, restored_controller: restoredController, error_state: errorState, print };
});

await test('SRWF-PROD-MR4-RESPONSIVE-KEYBOARD-001', 'correction stays usable at 1440/390/320 with native focus semantics', async () => {
  const measurements = [];
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await page.waitForTimeout(50);
    const input = page.locator('input[name="input_1"]').first();
    await input.focus();
    const focus = await input.evaluate(node => {
      const style = getComputedStyle(node);
      return { outline_style: style.outlineStyle, outline_width: style.outlineWidth };
    });
    const geometry = await correctionGeometry(page);
    if (
      geometry.overflow > 1
      || !geometry.orientation
      || !geometry.wrapper
      || !geometry.input
      || !geometry.submit
      || geometry.input.left < -1
      || geometry.input.right > width + 1
      || geometry.submit.left < -1
      || geometry.submit.right > width + 1
      || geometry.input.height < 44
      || geometry.submit.height < 44
      || geometry.labels < 1
      || focus.outline_style === 'none'
      || parseFloat(focus.outline_width || '0') < 1
    ) {
      throw new Error(`Responsive/keyboard contract failed at ${width}: ${JSON.stringify({ geometry, focus })}`);
    }
    measurements.push({ width, geometry, focus });
    if (width !== 1440) {
      await page.screenshot({ path: `${artifactDir}/srwf-journey-mr4-correction-${width}.png`, fullPage: true });
    }
  }
  return measurements;
});

await test('SRWF-PROD-MR4-COMPLETE-001', 'native keyboard completion returns to Review and restores Review utilities', async () => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const input1 = page.locator('input[name="input_1"]').first();
  await input1.fill('SHOW-MR4');
  await page.waitForFunction(() => {
    const node = document.querySelector('input[name="input_5"]');
    return Boolean(node && node.offsetParent !== null);
  });
  const field5 = page.locator('input[name="input_5"]').first();
  await field5.fill('VALID-CONDITIONAL');
  const submit = page.locator(`#gform_submit_button_${formId},form[id^="gform_"] input[type="submit"],form[id^="gform_"] button[type="submit"]`).filter({ visible: true }).last();
  await submit.focus();
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }),
    page.keyboard.press('Enter'),
  ]);
  const state = hostState(entryId);
  const actions = await nativeActions(page);
  const print = await printState(page);
  const gtb = await gtbStyles(page);
  if (
    state.current_step?.id !== reviewId
    || state.current_step?.type !== 'approval'
    || state.field_1 !== 'SHOW-MR4'
    || state.field_5 !== 'VALID-CONDITIONAL'
    || await page.locator('[data-gpp-entry-journey="correction"]:visible').count() !== 0
    || await page.locator('.gpp-entry-dossier[data-gpp-entry-detail="ready"]:visible').count() !== 1
    || actions.map(action => action.value).join(',') !== 'approved,rejected,revert'
    || !actions.every(action => action.onclick.includes('handleApprovalStepButtonClick'))
    || print.visible_count !== 1
    || gtb.length !== 0
  ) {
    throw new Error(`Correction completion/Review regression failed: ${JSON.stringify({ state, actions, print, gtb })}`);
  }
  return { state, actions, print, gtb_stylesheets: gtb };
});

wpEval("delete_option('gpp_srwf_mr4_expand_editable_fields'); echo '1';");
await browser.close();
fs.mkdirSync(artifactDir, { recursive: true });
fs.writeFileSync(
  `${artifactDir}/srwf-journey-production-mr4-browser.json`,
  JSON.stringify({ schema_version: '1.0.0', runtime: 'REPRODUCIBLE_PINNED_LAB', results }, null, 2) + '\n'
);
const failed = results.filter(result => result.status !== 'PASS');
if (failed.length) {
  console.error(JSON.stringify({ failed }, null, 2));
  process.exit(1);
}
console.log(`SRWF_JOURNEY_PRODUCTION_MR4_BROWSER_PASS ${results.length}`);