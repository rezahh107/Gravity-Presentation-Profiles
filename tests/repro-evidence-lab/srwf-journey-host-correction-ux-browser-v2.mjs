import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
if (!artifactDir || !wpPath || !wpCli) throw new Error('Correction UX qualification environment is incomplete.');

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
if (!formId || !reviewId || !correctionId || !operatorId) throw new Error('Journey manifest is incomplete.');

function frontendEntryUrl(entryId) {
  const url = new URL(manifest.routes.shortcode.url);
  url.searchParams.set('view', 'entry');
  url.searchParams.set('id', String(formId));
  url.searchParams.set('lid', String(entryId));
  return url.toString();
}

function createReviewEntry(label) {
  const safe = String(label).replace(/[^A-Z0-9_-]/gi, '-');
  const raw = wpEval(`
    wp_set_current_user(${operatorId});
    $entry_id=GFAPI::add_entry(array(
      'form_id'=>${formId},
      'created_by'=>${operatorId},
      '1'=>'UX2-${safe}',
      '2'=>'Journey',
      '3'=>'Correction UX V2',
      '4'=>'UX2-${safe}'
    ));
    if (is_wp_error($entry_id) || !$entry_id) throw new RuntimeException('Correction UX V2 entry creation failed.');
    $api=new Gravity_Flow_API(${formId});
    $api->process_workflow((int)$entry_id);
    $entry=GFAPI::get_entry((int)$entry_id);
    $sent=$api->send_to_step($entry,${reviewId});
    if (false===$sent || is_wp_error($sent)) throw new RuntimeException('Correction UX V2 Review seed failed.');
    echo (int)$entry_id;
  `);
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw new Error(`Invalid Correction UX V2 entry id: ${raw}`);
  return id;
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

async function acceptRevert(page) {
  const button = page.locator('.gravityflow-status-box .gravityflow-action-buttons button[value="revert"]').first();
  if (await button.count() !== 1) throw new Error('Native Revert button is unavailable.');
  const dialog = new Promise(resolve => page.once('dialog', async d => {
    const info = { type: d.type(), message: d.message() };
    await d.accept();
    resolve(info);
  }));
  const [, info] = await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }), button.click(), dialog]);
  return info;
}

async function captureGeometry(page, width) {
  return page.evaluate(viewportWidth => {
    const selectors = {
      workflow_detail: '.gravityflow_workflow_detail',
      form: '.gravityflow_workflow_detail form',
      orientation: '[data-gpp-entry-journey="correction"]',
      wrapper: '.gform_wrapper',
      fields: '.gform_wrapper .gform_fields',
      field: '.gform_wrapper .gfield',
      label: '.gform_wrapper .gfield_label',
      input: '.gform_wrapper input[name="input_1"]',
      footer: '.gform_wrapper .gform_footer',
      status_box: '.gravityflow-status-box',
      action_buttons: '.gravityflow-status-box .gravityflow-action-buttons',
      submit: '#gravityflow_update_button,#gravityflow_submit_button',
    };
    const visible = node => Boolean(node && node.offsetParent !== null);
    const record = node => {
      if (!node) return null;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return {
        tag: node.tagName.toLowerCase(),
        id: node.id || '',
        class: typeof node.className === 'string' ? node.className : '',
        visible: visible(node),
        rect: {
          left: Number(rect.left.toFixed(2)), right: Number(rect.right.toFixed(2)),
          top: Number(rect.top.toFixed(2)), bottom: Number(rect.bottom.toFixed(2)),
          width: Number(rect.width.toFixed(2)), height: Number(rect.height.toFixed(2)),
        },
        viewport_gap_left: Number(rect.left.toFixed(2)),
        viewport_gap_right: Number((viewportWidth - rect.right).toFixed(2)),
        width: style.width,
        max_width: style.maxWidth,
        margin_left: style.marginLeft,
        margin_right: style.marginRight,
        padding_left: style.paddingLeft,
        padding_right: style.paddingRight,
        direction: style.direction,
        text_align: style.textAlign,
        display: style.display,
        overflow_x: style.overflowX,
      };
    };
    const nodes = Object.fromEntries(Object.entries(selectors).map(([key, selector]) => [key, document.querySelector(selector)]));
    const ancestorChain = start => {
      const result = [];
      let current = start?.parentElement || null;
      for (let index = 0; current && index < 10; index += 1, current = current.parentElement) {
        result.push(record(current));
        if (current === document.body) break;
      }
      return result;
    };
    const correctionSelector = '.gravityflow_workflow_detail form:has(.gpp-entry-journey--correction[data-gpp-entry-journey="correction"]) .gform_wrapper';
    return {
      viewport: {
        width: viewportWidth,
        height: window.innerHeight,
        document_scroll_width: document.documentElement.scrollWidth,
        overflow: document.documentElement.scrollWidth - viewportWidth,
        html_dir_attribute: document.documentElement.getAttribute('dir'),
        html_computed_direction: getComputedStyle(document.documentElement).direction,
        body_computed_direction: getComputedStyle(document.body).direction,
        body_text_align: getComputedStyle(document.body).textAlign,
      },
      nodes: Object.fromEntries(Object.entries(nodes).map(([key, node]) => [key, record(node)])),
      wrapper_matches_current_correction_selector: Boolean(nodes.wrapper?.matches(correctionSelector)),
      wrapper_ancestors: ancestorChain(nodes.wrapper),
      submit_ancestors: ancestorChain(nodes.submit),
    };
  }, width);
}

async function ctaSignature(page) {
  return page.evaluate(() => {
    const form = document.querySelector('.gravityflow_workflow_detail form');
    const button = document.querySelector('#gravityflow_update_button,#gravityflow_submit_button');
    const hidden = form ? [...form.querySelectorAll('input[type="hidden"]')].map(node => ({
      name: node.name || '', id: node.id || '', value: node.value || '',
    })).sort((a, b) => `${a.name}:${a.id}`.localeCompare(`${b.name}:${b.id}`)) : [];
    const successfulNames = form ? [...form.querySelectorAll('input,select,textarea,button')]
      .filter(node => node.name && !node.disabled)
      .map(node => ({ tag: node.tagName.toLowerCase(), type: node.getAttribute('type') || '', name: node.name, id: node.id || '' }))
      .sort((a, b) => `${a.name}:${a.id}`.localeCompare(`${b.name}:${b.id}`)) : [];
    return {
      form: form ? { id: form.id || '', action: form.getAttribute('action') || '', method: (form.getAttribute('method') || '').toLowerCase() } : null,
      button: button ? {
        id: button.id || '', name: button.getAttribute('name') || '', type: button.getAttribute('type') || '',
        value: 'value' in button ? button.value : '', text: (button.textContent || '').replace(/\s+/g, ' ').trim(),
        formaction: button.getAttribute('formaction'), formmethod: button.getAttribute('formmethod'), onclick: button.getAttribute('onclick'),
      } : null,
      hidden,
      successful_names: successfulNames,
    };
  });
}

const volatileRenderStateNames = new Set(['state_1', 'gform_currency']);
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
    hidden: signature.hidden.map(item => volatileRenderStateNames.has(item.name)
      ? { name: item.name, id: item.id, value_class: 'VOLATILE_RENDER_STATE' }
      : item),
    successful_names: signature.successful_names,
  };
}

fs.mkdirSync(artifactDir, { recursive: true });
const sourceProbePath = `${artifactDir}/srwf-correction-ux-source-probe.json`;
if (!fs.existsSync(sourceProbePath)) throw new Error('Correction UX source probe artifact is missing.');
const sourceProbe = JSON.parse(fs.readFileSync(sourceProbePath, 'utf8'));
const exactHookPresent = sourceProbe?.hook_presence?.gravityflow_update_button_text_user_input === true;
if (!exactHookPresent) throw new Error('Exact pinned Gravity Flow source does not expose gravityflow_update_button_text_user_input.');

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
context.setDefaultTimeout(12000);
context.setDefaultNavigationTimeout(18000);
await auth(context);
const page = await context.newPage();

const activeTheme = wpEval('echo get_stylesheet();');
if (activeTheme !== 'hello-elementor') throw new Error(`Expected Hello Elementor host, got ${activeTheme}`);
const entryId = createReviewEntry('QUALIFICATION');
const route = frontendEntryUrl(entryId);
await page.goto(route, { waitUntil: 'networkidle' });
const revertDialog = await acceptRevert(page);
let correctionState = hostState(entryId);
if (correctionState.current_step?.id !== correctionId || correctionState.current_step?.type !== 'user_input' || correctionState.current_step?.can_update !== true) {
  throw new Error(`Native User Input correction was not reached: ${JSON.stringify(correctionState)}`);
}

const geometry = [];
for (const width of [1920, 1680, 390]) {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 1080 });
  await page.waitForTimeout(50);
  geometry.push(await captureGeometry(page, width));
  await page.screenshot({ path: `${artifactDir}/srwf-correction-ux-v2-${width}.png`, fullPage: true });
}

await page.setViewportSize({ width: 1680, height: 1080 });
const baselineCta = await ctaSignature(page);
const baselineIdentity = semanticControlIdentity(baselineCta);

const labelControlSource = `${wpPath}/wp-content/plugins/gravity-presentation-profiles/tests/repro-evidence-lab/srwf-journey-host-correction-ux-label-control.php`;
const labelControlTarget = `${wpPath}/wp-content/mu-plugins/gpp-srwf-correction-ux-label-control.php`;
let filteredCta = null;
let filteredIdentity = null;
let filteredState = null;
let completionState = null;
let reviewActionsAfterCompletion = null;
let identityPreserved = false;
let labelChanged = false;
let statePreserved = false;
let capability = 'NOT_PROVEN';
let reason = 'QUALIFICATION_NOT_COMPLETED';

try {
  const install = wpEval(`
    wp_mkdir_p(WPMU_PLUGIN_DIR);
    $source='${labelControlSource.replaceAll("'", "\\'")}';
    $target='${labelControlTarget.replaceAll("'", "\\'")}';
    if (!is_readable($source) || !copy($source,$target)) throw new RuntimeException('Unable to install Correction UX label control.');
    echo 'INSTALLED';
  `);
  if (install !== 'INSTALLED') throw new Error(`Unexpected label-control install result: ${install}`);

  await page.reload({ waitUntil: 'networkidle' });
  filteredCta = await ctaSignature(page);
  filteredIdentity = semanticControlIdentity(filteredCta);
  filteredState = hostState(entryId);
  identityPreserved = JSON.stringify(baselineIdentity) === JSON.stringify(filteredIdentity);
  labelChanged = filteredCta?.button?.value === 'اصلاح اطلاعات' || filteredCta?.button?.text === 'اصلاح اطلاعات';
  statePreserved = filteredState.current_step?.id === correctionId
    && filteredState.current_step?.type === 'user_input'
    && filteredState.current_step?.can_update === true;

  if (!labelChanged || !identityPreserved || !statePreserved) {
    reason = JSON.stringify({ labelChanged, identityPreserved, statePreserved });
  } else {
    const input = page.locator('input[name="input_1"]').first();
    await input.fill('CTA-SEAM-PROVEN');
    const submit = page.locator('#gravityflow_update_button:visible,#gravityflow_submit_button:visible').first();
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }), submit.click()]);
    completionState = hostState(entryId);
    reviewActionsAfterCompletion = await page.locator('.gravityflow-status-box .gravityflow-action-buttons button:visible')
      .evaluateAll(nodes => nodes.map(node => ({ id: node.id || '', value: node.value || '', text: (node.textContent || '').replace(/\s+/g, ' ').trim() })));

    if (completionState.current_step?.id === reviewId
      && completionState.current_step?.type === 'approval'
      && completionState.field_1 === 'CTA-SEAM-PROVEN') {
      capability = 'PROVEN';
      reason = 'EXACT_PINNED_NATIVE_TEXT_FILTER_PRESERVES_SEMANTIC_CONTROL_IDENTITY_AND_COMPLETION';
    } else {
      reason = 'FILTERED_NATIVE_COMPLETION_DID_NOT_RETURN_TO_REVIEW';
    }
  }
} finally {
  wpEval(`$target='${labelControlTarget.replaceAll("'", "\\'")}'; if (file_exists($target)) unlink($target); echo 'REMOVED';`);
}

const result = {
  schema_version: '2.0.0',
  scope: 'QUALIFICATION_ONLY',
  runtime: {
    wordpress: wpEval('echo get_bloginfo("version");'),
    php: wpEval('echo PHP_VERSION;'),
    gravity_forms: wpEval('$d=get_file_data(WP_PLUGIN_DIR."/gravityforms/gravityforms.php",array("Version"=>"Version")); echo $d["Version"];'),
    gravity_flow: wpEval('$d=get_file_data(WP_PLUGIN_DIR."/gravityflow/gravityflow.php",array("Version"=>"Version")); echo $d["Version"];'),
    theme: activeTheme,
  },
  route,
  form_id: formId,
  entry_id: entryId,
  review_step_id: reviewId,
  correction_step_id: correctionId,
  revert_dialog: revertDialog,
  correction_state: correctionState,
  geometry,
  cta: {
    exact_hook_present: exactHookPresent,
    capability,
    reason,
    volatile_render_state_names: [...volatileRenderStateNames],
    label_changed: labelChanged,
    semantic_identity_preserved: identityPreserved,
    state_preserved_before_completion: statePreserved,
    baseline: baselineCta,
    filtered: filteredCta,
    baseline_semantic_identity: baselineIdentity,
    filtered_semantic_identity: filteredIdentity,
    filtered_state: filteredState,
    completion_state: completionState,
    review_actions_after_completion: reviewActionsAfterCompletion,
  },
};

fs.writeFileSync(`${artifactDir}/srwf-correction-ux-browser.json`, JSON.stringify(result, null, 2) + '\n');
await browser.close();
if (capability !== 'PROVEN') {
  console.error(JSON.stringify({ cta: result.cta }, null, 2));
  process.exit(1);
}
console.log(`SRWF_CORRECTION_UX_BROWSER_V2_PASS CTA=${capability}`);
