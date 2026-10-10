import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
if (!artifactDir || !wpPath || !wpCli) throw new Error('Pinned MR-4 journey environment is incomplete.');

function wpEval(code) {
  const result = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], { encoding: 'utf8', env: process.env });
  if (result.status !== 0) throw new Error(`${result.stderr}\n${result.stdout}`);
  return result.stdout.trim();
}

const manifest = JSON.parse(wpEval('echo wp_json_encode(get_option("gpp_srwf_journey_host_manifest"),JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);'));
const formId = Number(manifest.form_id);
const reviewId = Number(manifest.steps.review_id);
const correctionId = Number(manifest.steps.correction_id);
const operatorId = Number(manifest.users.operator.id);
const conditionalFieldId = Number(manifest.production_presentation?.conditional_field_id || 0);
const semanticLtrFieldId = Number(manifest.production_presentation?.semantic_ltr_field_id || 0);
const textareaFieldId = Number(manifest.production_presentation?.textarea_field_id || 0);
const selectFieldId = Number(manifest.production_presentation?.select_field_id || 0);
if (
  manifest.production_presentation?.entry_detail_setup_status !== 'COMPLETED'
  || manifest.production_presentation?.gtb_registration_opt_in !== true
  || conditionalFieldId !== 5
  || semanticLtrFieldId !== 6
  || textareaFieldId !== 7
  || selectFieldId !== 8
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
      'field_6'=>(string)rgar($entry,'6'),
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
  const safe = String(label).replace(/[^A-Z0-9_-]/gi, '-');
  const raw = wpEval(`
    wp_set_current_user(${operatorId});
    $entry_id=GFAPI::add_entry(array(
      'form_id'=>${formId},
      'created_by'=>${operatorId},
      '1'=>'MR4-BASE-${safe}',
      '2'=>'Journey',
      '3'=>'MR4 ${safe}',
      '4'=>'MR4-${safe}'
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

async function auth(context) {
  const cookies = JSON.parse(wpEval(`
    $expiry=time()+3600;
    echo wp_json_encode(array(
      array('name'=>AUTH_COOKIE,'value'=>wp_generate_auth_cookie(${operatorId},$expiry,'auth'),'expires'=>$expiry),
      array('name'=>LOGGED_IN_COOKIE,'value'=>wp_generate_auth_cookie(${operatorId},$expiry,'logged_in'),'expires'=>$expiry)
    ));
  `));
  await context.addCookies(cookies.map(cookie => ({
    name: cookie.name,
    value: cookie.value,
    domain: '127.0.0.1',
    path: '/',
    expires: Number(cookie.expires),
    httpOnly: true,
    secure: false,
    sameSite: 'Lax',
  })));
}

async function nativeActions(page) {
  return page.locator('.gravityflow-status-box .gravityflow-action-buttons button').evaluateAll(nodes =>
    nodes.filter(node => node.offsetParent !== null).map(node => ({ value: node.value, onclick: node.getAttribute('onclick') || '' }))
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
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }), button.click(), dialog]);
  return dialogInfo;
}

function nativeCorrectionSubmit(page) {
  return page.locator('#gravityflow_update_button:visible,#gravityflow_submit_button:visible').first();
}

async function commitTextByKeyboard(page, locator, value) {
  await locator.focus();
  await page.keyboard.press('Control+A');
  await page.keyboard.type(value);
  await page.keyboard.press('Tab');
}

async function focusByKeyboard(page, locator) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  for (let index = 0; index < 80; index += 1) {
    await page.keyboard.press('Tab');
    if (await locator.evaluate(node => document.activeElement === node)) return index + 1;
  }
  throw new Error('Native editable control is not reachable through document keyboard traversal.');
}

async function printState(page) {
  return page.evaluate(() => {
    const isVisible = node => {
      if (!node || node.offsetParent === null) return false;
      const style = getComputedStyle(node);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.visibility !== 'collapse' && parseFloat(style.opacity || '1') > 0;
    };
    const summarize = nodes => ({
      dom_count: nodes.length,
      visible_count: nodes.filter(isVisible).length,
      displays: nodes.map(node => getComputedStyle(node).display),
      visibilities: nodes.map(node => getComputedStyle(node).visibility),
    });
    const nativeNodes = [...document.querySelectorAll('.detail-view-print')];
    const nativeAffordances = nativeNodes.flatMap(node => [...node.querySelectorAll('a,button,input,label,select,textarea')]);
    const gppNodes = [...document.querySelectorAll('[data-gpp-print-utility="dossier"]')];
    return {
      native: {
        ...summarize(nativeNodes),
        affordance_dom_count: nativeAffordances.length,
        affordance_visible_count: nativeAffordances.filter(isVisible).length,
      },
      gpp: summarize(gppNodes),
    };
  });
}

function reviewPrintStateIsValid(print) {
  return print.native.dom_count === 1
    && print.native.visible_count === 0
    && print.native.affordance_visible_count === 0
    && print.gpp.dom_count === 1
    && print.gpp.visible_count === 1;
}

function correctionPrintStateIsValid(print) {
  return print.native.dom_count === 1
    && print.native.visible_count === 0
    && print.native.affordance_visible_count === 0
    && print.gpp.dom_count === 1
    && print.gpp.visible_count === 0;
}

async function gtbStyles(page) {
  return page.evaluate(() => [...document.querySelectorAll('link[rel="stylesheet"]')]
    .map(link => ({ id: link.id || '', href: link.href || '' }))
    .filter(link => link.id === 'srwf-registration-theme-css' || link.href.includes('/srwf-registration-theme/srwf-registration.css')));
}

async function pageOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

function hasVisibleFocusIndicator(focus) {
  const outlineVisible = focus.outline_style !== 'none' && parseFloat(focus.outline_width || '0') >= 1;
  const gppFocusRingVisible = focus.box_shadow.includes('rgb(147, 197, 253)') && focus.box_shadow.includes('0px 0px 0px 3px');
  return outlineVisible || gppFocusRingVisible;
}

function semanticControlIdentity(signature) {
  if (!signature?.form || !signature?.button) return null;
  return {
    form: signature.form,
    button: {
      id: signature.button.id,
      name: signature.button.name,
      type: signature.button.type,
      formaction: signature.button.formaction,
      formmethod: signature.button.formmethod,
      onclick: signature.button.onclick,
    },
    hidden: signature.hidden,
    successful_names: signature.successful_names,
  };
}

async function correctionControlSignature(page) {
  return page.evaluate(() => {
    const form = document.querySelector('.gravityflow_workflow_detail form');
    const button = document.querySelector('#gravityflow_update_button,#gravityflow_submit_button');
    const hidden = form ? [...form.querySelectorAll('input[type="hidden"]')]
      .filter(node => node.name || node.id)
      .map(node => ({ name: node.name || '', id: node.id || '', nonempty: Boolean(node.value) }))
      .sort((a, b) => `${a.name}:${a.id}`.localeCompare(`${b.name}:${b.id}`)) : [];
    const successfulNames = form ? [...form.querySelectorAll('input,select,textarea,button')]
      .filter(node => node.name && !node.disabled)
      .map(node => ({ tag: node.tagName.toLowerCase(), type: node.getAttribute('type') || '', name: node.name, id: node.id || '' }))
      .sort((a, b) => `${a.name}:${a.id}`.localeCompare(`${b.name}:${b.id}`)) : [];
    return {
      form: form ? {
        id: form.id || '',
        action: form.getAttribute('action') || '',
        method: (form.getAttribute('method') || '').toLowerCase(),
      } : null,
      button: button ? {
        id: button.id || '',
        name: button.getAttribute('name') || '',
        type: button.getAttribute('type') || '',
        value: 'value' in button ? button.value : '',
        text: (button.textContent || '').replace(/\s+/g, ' ').trim(),
        formaction: button.getAttribute('formaction'),
        formmethod: button.getAttribute('formmethod'),
        onclick: button.getAttribute('onclick'),
      } : null,
      hidden,
      successful_names: successfulNames,
    };
  });
}

async function correctionDirectionState(page) {
  return page.evaluate(() => {
    const pick = selector => document.querySelector(selector);
    const summarize = node => {
      if (!node) return null;
      const style = getComputedStyle(node);
      return {
        direction: style.direction,
        text_align: style.textAlign,
        unicode_bidi: style.unicodeBidi,
        rect: {
          left: node.getBoundingClientRect().left,
          right: node.getBoundingClientRect().right,
          width: node.getBoundingClientRect().width,
        },
      };
    };
    return {
      host: summarize(pick('.gravityflow_workflow_detail form:has(.gpp-entry-journey--correction[data-gpp-entry-journey="correction"])')),
      fields: summarize(pick('.gform_wrapper .gform_fields')),
      field: summarize(pick('.gform_wrapper .gfield')),
      label: summarize(pick('.gform_wrapper .gfield_label')),
      persian_text: summarize(pick('input[name="input_1"]')),
      semantic_email: summarize(pick('input[name="input_6"]')),
      textarea: summarize(pick('textarea[name="input_7"]')),
      select: summarize(pick('select[name="input_8"]')),
    };
  });
}

async function correctionGeometry(page) {
  return page.evaluate(() => {
    const content = document.querySelector('.gravityflow_workflow_detail form:has([data-gpp-entry-journey="correction"]) #post-body-content');
    const orientation = document.querySelector('[data-gpp-entry-journey="correction"]');
    const wrapper = document.querySelector('.gform_wrapper');
    const fields = document.querySelector('.gform_fields');
    const input = document.querySelector('input[name="input_1"]');
    const field = input?.closest('.gfield') || null;
    const label = input?.labels?.[0] || field?.querySelector('.gfield_label') || null;
    const email = document.querySelector('input[name="input_6"]');
    const textarea = document.querySelector('textarea[name="input_7"]');
    const select = document.querySelector('select[name="input_8"]');
    const submit = document.querySelector('#gravityflow_update_button,#gravityflow_submit_button');
    const rect = element => element ? element.getBoundingClientRect() : null;
    const simplify = value => value ? { left: value.left, right: value.right, width: value.width, height: value.height } : null;
    const style = element => {
      if (!element) return null;
      const computed = getComputedStyle(element);
      return {
        direction: computed.direction,
        text_align: computed.textAlign,
        unicode_bidi: computed.unicodeBidi,
        padding_inline_start: computed.paddingInlineStart,
        padding_inline_end: computed.paddingInlineEnd,
      };
    };
    return {
      viewport: window.innerWidth,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      content: simplify(rect(content)),
      content_style: style(content),
      orientation: simplify(rect(orientation)),
      orientation_style: style(orientation),
      wrapper: simplify(rect(wrapper)),
      wrapper_style: style(wrapper),
      fields_style: style(fields),
      field_style: style(field),
      label_style: style(label),
      input: simplify(rect(input)),
      input_style: style(input),
      email: simplify(rect(email)),
      email_style: style(email),
      textarea: simplify(rect(textarea)),
      textarea_style: style(textarea),
      select: simplify(rect(select)),
      select_style: style(select),
      submit: simplify(rect(submit)),
      submit_id: submit?.id || null,
      labels: input?.labels?.length || 0,
    };
  });
}

async function nativeSubmissionSignature(page) {
  return page.evaluate(() => {
    const form = document.querySelector('.gravityflow_workflow_detail form');
    const button = document.querySelector('#gravityflow_update_button');
    const hidden = form ? [...form.querySelectorAll('input[type="hidden"]')].map(node => ({
      name: node.name || '',
      id: node.id || '',
      has_value: (node.value || '').length > 0,
    })) : [];
    return {
      form: form ? {
        id: form.id || '',
        action: form.getAttribute('action') || '',
        method: (form.getAttribute('method') || '').toLowerCase(),
      } : null,
      button: button ? {
        id: button.id || '',
        name: button.getAttribute('name') || '',
        type: button.getAttribute('type') || '',
        value: button.value || '',
        formaction: button.getAttribute('formaction'),
        formmethod: button.getAttribute('formmethod'),
        onclick: button.getAttribute('onclick') || '',
      } : null,
      hidden,
    };
  });
}

function nativeSubmissionSignatureIsValid(signature) {
  const hidden = new Map((signature?.hidden || []).map(item => [item.name, item]));
  const requiredHidden = ['_gravityflow_admin_action_nonce', 'action', 'gravityflow_status', 'gravityflow_submit', 'step_id', `state_${formId}`, 'gforms_save_entry'];
  return signature?.form?.id === `gform_${formId}`
    && signature?.form?.method === 'post'
    && signature?.button?.id === 'gravityflow_update_button'
    && signature?.button?.name === 'save'
    && signature?.button?.type === 'submit'
    && signature?.button?.value === 'اصلاح اطلاعات'
    && signature?.button?.formaction === null
    && signature?.button?.formmethod === null
    && signature?.button?.onclick.includes("jQuery('#action').val('update')")
    && signature?.button?.onclick.includes(`jQuery('#gform_${formId}').submit()`)
    && requiredHidden.every(name => hidden.has(name))
    && hidden.get('_gravityflow_admin_action_nonce')?.has_value === true;
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
context.setDefaultTimeout(10000);
context.setDefaultNavigationTimeout(15000);
await auth(context);
const page = await context.newPage();

const activeTheme = wpEval('echo get_stylesheet();');
if (activeTheme !== 'hello-elementor') throw new Error(`Forward target Hello Elementor host is not active: ${activeTheme}`);
const entryId = createReviewEntry('END-TO-END');

await test('SRWF-PROD-MR4-REVIEW-001', 'Review remains native-authoritative before correction', async () => {
  await page.goto(frontendEntryUrl(entryId), { waitUntil: 'networkidle' });
  const state = hostState(entryId);
  const actions = await nativeActions(page);
  const print = await printState(page);
  const gtb = await gtbStyles(page);
  if (state.current_step?.id !== reviewId || state.current_step?.type !== 'approval' || actions.map(action => action.value).join(',') !== 'approved,rejected,revert' || !actions.every(action => action.onclick.includes('handleApprovalStepButtonClick')) || await page.locator('.gpp-entry-dossier[data-gpp-entry-detail="ready"]').count() !== 1 || !reviewPrintStateIsValid(print)) {
    throw new Error(`Review baseline failed: ${JSON.stringify({ state, actions, print, gtb })}`);
  }
  return { active_theme: activeTheme, state, actions, print, gtb_stylesheets_observed: gtb };
});

wpEval("update_option('gpp_srwf_mr4_expand_editable_fields','1',false); echo '1';");

await test('SRWF-PROD-MR4-CORRECTION-001', 'Revert admits native User Input with bounded RTL presentation and native CTA identity', async () => {
  await page.goto(frontendEntryUrl(entryId), { waitUntil: 'networkidle' });
  const dialog = await accept(page, 'revert');
  const state = hostState(entryId);
  const visibleInputs = [...new Set(await page.locator('input[name^="input_"]:visible,textarea[name^="input_"]:visible,select[name^="input_"]:visible').evaluateAll(nodes => nodes.map(node => node.getAttribute('name')).filter(Boolean)))].sort();
  const orientationCount = await page.locator('[data-gpp-entry-journey="correction"]:visible').count();
  const gppOwnedInputs = await page.locator('.gpp-entry-journey input,.gpp-entry-journey textarea,.gpp-entry-journey select').count();
  const unauthorized = await page.locator('input[name="input_2"]:visible,input[name="input_3"]:visible,input[name="input_4"]:visible').count();
  const print = await printState(page);
  const gtb = await gtbStyles(page);
  const signature = await nativeSubmissionSignature(page);
  const visual = await page.evaluate(() => {
    const wrapper = document.querySelector('.gform_wrapper');
    const input = document.querySelector('input[name="input_1"]');
    const submit = document.querySelector('#gravityflow_update_button,#gravityflow_submit_button');
    if (!wrapper || !input || !submit) return null;
    const wrapperStyle = getComputedStyle(wrapper);
    const inputStyle = getComputedStyle(input);
    const submitStyle = getComputedStyle(submit);
    return {
      wrapper_border_radius: wrapperStyle.borderRadius,
      wrapper_background: wrapperStyle.backgroundColor,
      wrapper_border_style: wrapperStyle.borderStyle,
      wrapper_box_shadow: wrapperStyle.boxShadow,
      input_height: input.getBoundingClientRect().height,
      input_border_radius: inputStyle.borderRadius,
      submit_id: submit.id,
      submit_height: submit.getBoundingClientRect().height,
      submit_border_radius: submitStyle.borderRadius,
    };
  });
  const geometry = await correctionGeometry(page);
  const field5Visible = await page.locator('input[name="input_5"]:visible').count();
  const rtlOk = geometry.content_style?.direction === 'rtl'
    && geometry.wrapper_style?.direction === 'rtl'
    && geometry.fields_style?.direction === 'rtl'
    && geometry.field_style?.direction === 'rtl'
    && geometry.label_style?.direction === 'rtl'
    && geometry.input_style?.direction === 'rtl'
    && geometry.input_style?.text_align === 'right'
    && geometry.textarea_style?.direction === 'rtl'
    && geometry.textarea_style?.text_align === 'right'
    && geometry.select_style?.direction === 'rtl'
    && geometry.select_style?.text_align === 'right';
  const ltrOk = geometry.email_style?.direction === 'ltr'
    && geometry.email_style?.text_align === 'left'
    && geometry.email_style?.unicode_bidi === 'plaintext';
  if (
    !dialog
    || state.current_step?.id !== correctionId
    || state.current_step?.type !== 'user_input'
    || state.current_step?.can_update !== true
    || JSON.stringify(state.current_step?.editable_fields?.map(String).sort()) !== JSON.stringify(['1', '5', '6', '7', '8'])
    || orientationCount !== 1
    || gppOwnedInputs !== 0
    || unauthorized !== 0
    || visibleInputs.join(',') !== 'input_1,input_6,input_7,input_8'
    || field5Visible !== 0
    || !correctionPrintStateIsValid(print)
    || !visual
    || visual.wrapper_border_radius !== '14px'
    || visual.wrapper_border_style !== 'solid'
    || visual.wrapper_background !== 'rgb(255, 255, 255)'
    || visual.wrapper_box_shadow === 'none'
    || visual.input_height < 44
    || visual.input_border_radius !== '8px'
    || visual.submit_id !== 'gravityflow_update_button'
    || visual.submit_height < 44
    || visual.submit_border_radius !== '8px'
    || !nativeSubmissionSignatureIsValid(signature)
    || !rtlOk
    || !ltrOk
  ) {
    throw new Error(`Correction admission/composition failed: ${JSON.stringify({ dialog, state, visibleInputs, orientationCount, gppOwnedInputs, unauthorized, print, gtb, visual, geometry, field5Visible, signature, rtlOk, ltrOk })}`);
  }
  return { dialog, state, visible_inputs: visibleInputs, print, gtb_stylesheets_observed: gtb, visual, geometry, native_submission_signature: signature, rtl_ok: rtlOk, semantic_ltr_ok: ltrOk };
});

await test('SRWF-PROD-MR4-CTA-IDENTITY-001', 'native User Input CTA relabel preserves exact semantic form/button transport identity', async () => {
  const ctaEntryId = createReviewEntry('CTA-IDENTITY');
  await page.goto(frontendEntryUrl(ctaEntryId), { waitUntil: 'networkidle' });
  await accept(page, 'revert');

  wpEval("update_option('gpp_srwf_mr4_native_cta_baseline','1',false); echo '1';");
  await page.reload({ waitUntil: 'networkidle' });
  const baseline = await correctionControlSignature(page);
  const baselineState = hostState(ctaEntryId);

  wpEval("delete_option('gpp_srwf_mr4_native_cta_baseline'); echo '1';");
  await page.reload({ waitUntil: 'networkidle' });
  const filtered = await correctionControlSignature(page);
  const filteredState = hostState(ctaEntryId);

  const baselineIdentity = semanticControlIdentity(baseline);
  const filteredIdentity = semanticControlIdentity(filtered);
  const identityPreserved = JSON.stringify(baselineIdentity) === JSON.stringify(filteredIdentity);
  const labelChanged = (filtered?.button?.value === 'اصلاح اطلاعات' || filtered?.button?.text === 'اصلاح اطلاعات')
    && baseline?.button?.value !== 'اصلاح اطلاعات'
    && baseline?.button?.text !== 'اصلاح اطلاعات';
  const statePreserved = baselineState.current_step?.id === correctionId
    && filteredState.current_step?.id === correctionId
    && baselineState.current_step?.type === 'user_input'
    && filteredState.current_step?.type === 'user_input'
    && baselineState.current_step?.can_update === true
    && filteredState.current_step?.can_update === true;
  const hiddenNames = filtered?.hidden?.map(item => item.name).filter(Boolean) || [];
  const nonceTransport = hiddenNames.includes('_gravityflow_admin_action_nonce');
  const workflowTransport = ['gravityflow_status', 'gravityflow_submit', 'step_id', `state_${formId}`, 'gforms_save_entry']
    .every(name => hiddenNames.includes(name));

  if (!identityPreserved || !labelChanged || !statePreserved || !nonceTransport || !workflowTransport) {
    throw new Error(`CTA identity contract failed: ${JSON.stringify({ identityPreserved, labelChanged, statePreserved, nonceTransport, workflowTransport, baseline, filtered, baselineState, filteredState })}`);
  }

  return {
    baseline,
    filtered,
    baseline_semantic_identity: baselineIdentity,
    filtered_semantic_identity: filteredIdentity,
    identity_preserved: identityPreserved,
    label_changed: labelChanged,
    state_preserved: statePreserved,
    nonce_transport_present: nonceTransport,
    workflow_transport_present: workflowTransport,
  };
});

await test('SRWF-PROD-MR4-ACTION-PAINT-001', 'native Correction completion is primary; hover and unavailable states remain accessible and scoped', async () => {
  const originalViewport = page.viewportSize();
  const signatureBefore = semanticControlIdentity(await correctionControlSignature(page));
  const observations = [];
  try {
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      const submit = page.locator('#gravityflow_update_button:visible').first();
      if (await submit.count() !== 1 || await submit.inputValue() !== 'اصلاح اطلاعات') {
        throw new Error('Original native Correction completion control or its Persian label changed.');
      }
      const style = () => submit.evaluate(node => {
        const css = getComputedStyle(node);
        const box = node.getBoundingClientRect();
        return { background: css.backgroundColor, color: css.color, opacity: css.opacity,
          cursor: css.cursor, outline: css.outlineStyle, outlineWidth: css.outlineWidth,
          height: box.height, left: box.left, right: box.right };
      });
      await page.mouse.move(0, 0);
      const idle = await style();
      await submit.hover();
      await page.waitForTimeout(240);
      const hover = await style();
      await page.mouse.move(0, 0);
      await submit.evaluate(node => { node.disabled = true; });
      const disabled = await style();
      await submit.evaluate(node => { node.disabled = false; });
      await submit.evaluate(node => { node.setAttribute('aria-disabled', 'true'); });
      const ariaDisabled = await style();
      await submit.evaluate(node => { node.removeAttribute('aria-disabled'); });
      await submit.focus();
      const focus = await style();
      const optionalSave = page.locator('#gravityflow_save_progress_button:visible');
      const save = await optionalSave.count() ? await optionalSave.first().evaluate(node => {
        const css = getComputedStyle(node);
        return { background: css.backgroundColor, color: css.color };
      }) : null;
      if (idle.background !== 'rgb(29, 78, 216)'
        || hover.background !== 'rgb(30, 64, 175)'
        || disabled.opacity !== '0.65' || ariaDisabled.opacity !== '0.65'
        || disabled.cursor !== 'default' || focus.outline === 'none'
        || idle.height < 44 || idle.left < -1 || idle.right > width + 1
        || (save && (save.background !== 'rgb(248, 250, 254)' || save.color !== 'rgb(29, 78, 216)'))) {
        throw new Error(`Native Correction action-paint contract failed at ${width}: ${JSON.stringify({ idle, hover, disabled, ariaDisabled, focus, save })}`);
      }
      observations.push({ width, idle, hover, disabled, ariaDisabled, focus, optional_save_visible: save !== null, save });
    }
  } finally {
    await page.locator('#gravityflow_update_button').first().evaluate(node => {
      node.disabled = false;
      node.removeAttribute('aria-disabled');
    });
    if (originalViewport) await page.setViewportSize(originalViewport);
  }
  const signatureAfter = semanticControlIdentity(await correctionControlSignature(page));
  if (JSON.stringify(signatureBefore) !== JSON.stringify(signatureAfter)) {
    throw new Error('Action presentation changed the native form/button transport identity.');
  }
  return { observations, native_semantic_identity_unchanged: true };
});

await test('SRWF-PROD-MR4-CONDITIONAL-001', 'native Gravity Forms conditional logic remains live', async () => {
  const input1 = page.locator('input[name="input_1"]').first();
  await commitTextByKeyboard(page, input1, 'SHOW-MR4');
  await page.waitForFunction(() => { const node = document.querySelector('input[name="input_5"]'); return Boolean(node && node.offsetParent !== null); });
  const field5 = page.locator('input[name="input_5"]').first();
  await field5.fill('CONDITIONAL-PRESERVED');
  await commitTextByKeyboard(page, input1, 'HIDE-MR4');
  await page.waitForFunction(() => { const node = document.querySelector('input[name="input_5"]'); return Boolean(node && node.offsetParent === null); });
  await commitTextByKeyboard(page, input1, 'SHOW-MR4');
  await page.waitForFunction(() => { const node = document.querySelector('input[name="input_5"]'); return Boolean(node && node.offsetParent !== null); });
  const preserved = await field5.inputValue();
  if (preserved !== 'CONDITIONAL-PRESERVED') throw new Error(`Native conditional field value was not preserved: ${preserved}`);
  return { controller: await input1.inputValue(), conditional_value: preserved };
});

await test('SRWF-PROD-MR4-VALIDATION-001', 'native validation failure stays in correction with submitted value preserved', async () => {
  const input1 = page.locator('input[name="input_1"]').first();
  const field5 = page.locator('input[name="input_5"]').first();
  await commitTextByKeyboard(page, input1, 'SHOW-MR4');
  await page.waitForFunction(() => { const node = document.querySelector('input[name="input_5"]'); return Boolean(node && node.offsetParent !== null); });
  await field5.fill('INVALID-MR4');
  const submit = nativeCorrectionSubmit(page);
  if (await submit.count() !== 1 || await submit.getAttribute('id') !== 'gravityflow_update_button') throw new Error('Pinned native User Input update button is unavailable.');
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }), submit.click()]);
  const state = hostState(entryId);
  const restoredController = await page.locator('input[name="input_1"]').first().inputValue();
  const field5Node = page.locator('input[name="input_5"]').first();
  const field5Id = await field5Node.getAttribute('id');
  const restoredInvalidValue = await field5Node.inputValue();
  const errorState = await page.evaluate(id => {
    const input = id ? document.getElementById(id) : null;
    const field = input?.closest('.gfield');
    const messages = field ? [...field.querySelectorAll('.gfield_validation_message,.validation_message')] : [];
    return { aria_invalid: input?.getAttribute('aria-invalid') || null, field_error: Boolean(field?.classList.contains('gfield_error')), visible_messages: messages.filter(node => node.offsetParent !== null).map(node => node.textContent.replace(/\s+/g, ' ').trim()) };
  }, field5Id);
  const print = await printState(page);
  if (state.current_step?.id !== correctionId || state.current_step?.type !== 'user_input' || restoredController !== 'SHOW-MR4' || restoredInvalidValue !== 'INVALID-MR4' || await page.locator('[data-gpp-entry-journey="correction"]:visible').count() !== 1 || await field5Node.count() !== 1 || (!errorState.field_error && errorState.aria_invalid !== 'true' && errorState.visible_messages.length === 0) || !correctionPrintStateIsValid(print) || await page.locator('.gpp-entry-dossier[data-gpp-entry-detail="ready"]:visible').count() !== 0) {
    throw new Error(`Validation contract failed: ${JSON.stringify({ state, restoredController, restoredInvalidValue, errorState, print })}`);
  }
  return { state, restored_controller: restoredController, restored_invalid_value: restoredInvalidValue, error_state: errorState, print };
});

await test('SRWF-PROD-MR4-RESPONSIVE-KEYBOARD-001', 'correction is centered/bounded at 1920/1680 and usable at 390/320 without added overflow', async () => {
  const measurements = [];
  for (const width of [1920, 1680, 390, 320]) {
    await page.setViewportSize({ width, height: width >= 1680 ? 1080 : 844 });
    const responsiveEntryId = createReviewEntry(`RESP-${width}`);
    await page.goto(frontendEntryUrl(responsiveEntryId), { waitUntil: 'networkidle' });
    const baselineOverflow = await pageOverflow(page);
    await accept(page, 'revert');
    const input = page.locator('input[name="input_1"]').first();
    const tabCount = await focusByKeyboard(page, input);
    await page.waitForFunction(() => {
      const node = document.querySelector('input[name="input_1"]');
      if (!node || document.activeElement !== node) return false;
      const style = getComputedStyle(node);
      const outlineVisible = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth || '0') >= 1;
      const focusRingVisible = style.boxShadow.includes('rgb(147, 197, 253)') && style.boxShadow.includes('0px 0px 0px 3px');
      return outlineVisible || focusRingVisible;
    }, null, { timeout: 1500 });
    const focus = await input.evaluate(node => {
      const style = getComputedStyle(node);
      return { outline_style: style.outlineStyle, outline_width: style.outlineWidth, box_shadow: style.boxShadow };
    });
    const geometry = await correctionGeometry(page);
    const print = await printState(page);
    const submit = nativeCorrectionSubmit(page);
    const desktop = width >= 1680;
    const contentInsetStart = geometry.content && geometry.wrapper ? geometry.wrapper.left - geometry.content.left : -1;
    const contentInsetEnd = geometry.content && geometry.wrapper ? geometry.content.right - geometry.wrapper.right : -1;
    const centeredWithinContent = !desktop || Math.abs(contentInsetStart - contentInsetEnd) <= 2;
    const usefulDesktopGutter = !desktop || (contentInsetStart >= 16 && contentInsetEnd >= 16 && geometry.wrapper.width <= 1062 && geometry.orientation.width <= 1062);
    const mobileGutter = desktop || (
      contentInsetStart >= 11
      && contentInsetEnd >= 11
      && geometry.orientation.left >= 11
      && (width - geometry.orientation.right) >= 11
    );
    const withinViewport = [geometry.orientation, geometry.wrapper, geometry.input, geometry.email, geometry.textarea, geometry.select, geometry.submit]
      .every(rect => rect && rect.left >= -1 && rect.right <= width + 1);
    if (
      geometry.overflow > baselineOverflow + 1
      || !geometry.content
      || !withinViewport
      || !centeredWithinContent
      || !usefulDesktopGutter
      || !mobileGutter
      || geometry.input.height < 44
      || geometry.submit.height < 44
      || geometry.submit_id !== 'gravityflow_update_button'
      || geometry.labels < 1
      || await submit.count() !== 1
      || !hasVisibleFocusIndicator(focus)
      || !correctionPrintStateIsValid(print)
      || geometry.input_style?.direction !== 'rtl'
      || geometry.textarea_style?.direction !== 'rtl'
      || geometry.select_style?.direction !== 'rtl'
      || geometry.email_style?.direction !== 'ltr'
    ) {
      throw new Error(`Responsive/keyboard contract failed at ${width}: ${JSON.stringify({ baselineOverflow, geometry, focus, tabCount, print, contentInsetStart, contentInsetEnd, centeredWithinContent, usefulDesktopGutter, mobileGutter, withinViewport })}`);
    }
    measurements.push({ width, baseline_overflow: baselineOverflow, correction_overflow: geometry.overflow, geometry, focus, tab_count: tabCount, print, content_inset_start: contentInsetStart, content_inset_end: contentInsetEnd, centered_within_content: centeredWithinContent, useful_desktop_gutter: usefulDesktopGutter, mobile_gutter: mobileGutter });
    await page.screenshot({ path: `${artifactDir}/srwf-journey-mr4-correction-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1680, height: 1080 });
  await page.goto(frontendEntryUrl(entryId), { waitUntil: 'networkidle' });
  return measurements;
});

await test('SRWF-PROD-MR4-COMPLETE-001', 'native keyboard completion returns to Review and restores Review utilities', async () => {
  await page.setViewportSize({ width: 1680, height: 1080 });
  await page.goto(frontendEntryUrl(entryId), { waitUntil: 'networkidle' });
  const input1 = page.locator('input[name="input_1"]').first();
  await commitTextByKeyboard(page, input1, 'SHOW-MR4');
  await page.waitForFunction(() => { const node = document.querySelector('input[name="input_5"]'); return Boolean(node && node.offsetParent !== null); });
  const field5 = page.locator('input[name="input_5"]').first();
  await field5.fill('VALID-CONDITIONAL');
  const field6 = page.locator('input[name="input_6"]').first();
  await field6.fill('operator@example.invalid');
  const submit = nativeCorrectionSubmit(page);
  if (await submit.count() !== 1 || await submit.getAttribute('id') !== 'gravityflow_update_button') throw new Error('Pinned native User Input update button is unavailable for completion.');
  const submitTabCount = await focusByKeyboard(page, submit);
  const submitFocus = await submit.evaluate(node => {
    const style = getComputedStyle(node);
    return {
      active: node === document.activeElement,
      outline_style: style.outlineStyle,
      outline_width: style.outlineWidth,
      box_shadow: style.boxShadow,
    };
  });
  if (!submitFocus.active || !hasVisibleFocusIndicator(submitFocus)) {
    throw new Error(`Native correction submit is not keyboard reachable with visible focus: ${JSON.stringify({ submitTabCount, submitFocus })}`);
  }
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }), page.keyboard.press('Enter')]);
  const state = hostState(entryId);
  const actions = await nativeActions(page);
  const print = await printState(page);
  const gtb = await gtbStyles(page);
  if (state.current_step?.id !== reviewId || state.current_step?.type !== 'approval' || state.field_1 !== 'SHOW-MR4' || state.field_5 !== 'VALID-CONDITIONAL' || state.field_6 !== 'operator@example.invalid' || await page.locator('[data-gpp-entry-journey="correction"]:visible').count() !== 0 || await page.locator('.gpp-entry-dossier[data-gpp-entry-detail="ready"]:visible').count() !== 1 || actions.map(action => action.value).join(',') !== 'approved,rejected,revert' || !actions.every(action => action.onclick.includes('handleApprovalStepButtonClick')) || !reviewPrintStateIsValid(print)) {
    throw new Error(`Correction completion/Review regression failed: ${JSON.stringify({ state, actions, print, gtb })}`);
  }
  return { state, actions, print, gtb_stylesheets_observed: gtb, submit_tab_count: submitTabCount, submit_focus: submitFocus };
});

wpEval("delete_option('gpp_srwf_mr4_expand_editable_fields'); delete_option('gpp_srwf_mr4_native_cta_baseline'); echo '1';");
await browser.close();
fs.mkdirSync(artifactDir, { recursive: true });
fs.writeFileSync(`${artifactDir}/srwf-journey-production-mr4-browser.json`, JSON.stringify({ schema_version: '1.3.0', runtime: 'REPRODUCIBLE_PINNED_LAB', results }, null, 2) + '\n');
const failed = results.filter(result => result.status !== 'PASS');
if (failed.length) {
  console.error(JSON.stringify({ failed }, null, 2));
  process.exit(1);
}
console.log(`SRWF_JOURNEY_PRODUCTION_MR4_BROWSER_PASS ${results.length}`);
