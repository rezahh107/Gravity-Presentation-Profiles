import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
if (!artifactDir || !wpPath || !wpCli) throw new Error('Pinned Correction UX candidate environment is incomplete.');

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
    $entry_id=GFAPI::add_entry(array('form_id'=>${formId},'created_by'=>${operatorId},'1'=>'CANDIDATE-${safe}'));
    if (is_wp_error($entry_id) || !$entry_id) throw new RuntimeException('Correction UX candidate entry creation failed.');
    $api=new Gravity_Flow_API(${formId});
    $api->process_workflow((int)$entry_id);
    $entry=GFAPI::get_entry((int)$entry_id);
    $sent=$api->send_to_step($entry,${reviewId});
    if (false===$sent || is_wp_error($sent)) throw new RuntimeException('Correction UX candidate Review seed failed.');
    echo (int)$entry_id;
  `);
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw new Error(`Invalid Correction UX candidate entry id: ${raw}`);
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
      'current_step'=>$step?array(
        'id'=>(int)$step->get_id(),
        'type'=>(string)$step->get_type(),
        'can_update'=>(bool)Gravity_Flow_Entry_Detail::can_update($step)
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

async function revertToCorrection(page) {
  const button = page.locator('.gravityflow-status-box .gravityflow-action-buttons button[value="revert"]').first();
  if (await button.count() !== 1) throw new Error('Native Revert action unavailable.');
  const dialog = new Promise(resolve => page.once('dialog', async d => { await d.accept(); resolve(); }));
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }), dialog, button.click()]);
}

const candidateCss = `
.gravityflow_workflow_detail form:has(.gpp-entry-journey--correction[data-gpp-entry-journey="correction"]) .gform_wrapper {
  max-width: 1060px;
  margin-inline: auto;
  direction: rtl;
}
.gravityflow_workflow_detail form:has(.gpp-entry-journey--correction[data-gpp-entry-journey="correction"]) .gform_wrapper .gform_fields,
.gravityflow_workflow_detail form:has(.gpp-entry-journey--correction[data-gpp-entry-journey="correction"]) .gform_wrapper .gfield,
.gravityflow_workflow_detail form:has(.gpp-entry-journey--correction[data-gpp-entry-journey="correction"]) .gform_wrapper .ginput_container,
.gravityflow_workflow_detail form:has(.gpp-entry-journey--correction[data-gpp-entry-journey="correction"]) .gform_wrapper .gfield_label {
  direction: rtl;
  text-align: right;
}
.gravityflow_workflow_detail form:has(.gpp-entry-journey--correction[data-gpp-entry-journey="correction"]) .gform_wrapper input[type="text"],
.gravityflow_workflow_detail form:has(.gpp-entry-journey--correction[data-gpp-entry-journey="correction"]) .gform_wrapper textarea,
.gravityflow_workflow_detail form:has(.gpp-entry-journey--correction[data-gpp-entry-journey="correction"]) .gform_wrapper select {
  direction: rtl;
  text-align: right;
}
.gravityflow_workflow_detail form:has(.gpp-entry-journey--correction[data-gpp-entry-journey="correction"]) .gform_wrapper input[type="email"],
.gravityflow_workflow_detail form:has(.gpp-entry-journey--correction[data-gpp-entry-journey="correction"]) .gform_wrapper input[type="url"],
.gravityflow_workflow_detail form:has(.gpp-entry-journey--correction[data-gpp-entry-journey="correction"]) .gform_wrapper input[type="tel"],
.gravityflow_workflow_detail form:has(.gpp-entry-journey--correction[data-gpp-entry-journey="correction"]) .gform_wrapper input[type="number"],
.gravityflow_workflow_detail form:has(.gpp-entry-journey--correction[data-gpp-entry-journey="correction"]) .gform_wrapper input[type="date"] {
  direction: ltr;
  text-align: left;
}
`;

async function captureCandidate(page) {
  return page.evaluate(() => {
    const wrapper = document.querySelector('.gform_wrapper');
    const fields = wrapper?.querySelector('.gform_fields');
    const field = wrapper?.querySelector('.gfield');
    const label = field?.querySelector('.gfield_label,label');
    const input = wrapper?.querySelector('input[name^="input_"]:not([type="hidden"])');
    const submit = document.querySelector('#gravityflow_update_button,#gravityflow_submit_button');
    const main = document.querySelector('#post-body-content');
    const rect = node => node ? node.getBoundingClientRect() : null;
    const style = node => node ? getComputedStyle(node) : null;
    const summarize = node => {
      if (!node) return null;
      const r = rect(node); const s = style(node);
      return {
        rect: { left:r.left,right:r.right,width:r.width,height:r.height },
        edge_distance: { left:r.left,right:window.innerWidth-r.right },
        direction:s.direction,
        text_align:s.textAlign,
        max_width:s.maxWidth,
        margin_inline_start:s.marginInlineStart,
        margin_inline_end:s.marginInlineEnd,
      };
    };
    return {
      viewport: window.innerWidth,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      main: summarize(main),
      wrapper: summarize(wrapper),
      fields: summarize(fields),
      field: summarize(field),
      label: summarize(label),
      input: summarize(input),
      submit: summarize(submit),
    };
  });
}

async function buttonSemantics(page) {
  return page.evaluate(() => {
    const button = document.querySelector('#gravityflow_update_button,#gravityflow_submit_button');
    const form = button?.closest('form');
    if (!button || !form) return null;
    const hidden = [...form.querySelectorAll('input[type="hidden"][name]')].map(node => node.name).sort();
    return {
      button: {
        tag: button.tagName.toLowerCase(),
        id: button.id,
        type: button.getAttribute('type'),
        name: button.getAttribute('name'),
        value: button.getAttribute('value'),
        class: button.getAttribute('class'),
        onclick: button.getAttribute('onclick'),
        formaction: button.getAttribute('formaction'),
        formmethod: button.getAttribute('formmethod'),
      },
      form: {
        id: form.id,
        method: form.getAttribute('method'),
        action: form.getAttribute('action'),
        hidden_names: hidden,
        has_gravityflow_nonce: hidden.includes('_gravityflow_admin_action_nonce'),
        has_step_id: hidden.includes('step_id'),
        has_action: hidden.includes('action'),
        has_gravityflow_submit: hidden.includes('gravityflow_submit'),
      },
    };
  });
}

fs.mkdirSync(artifactDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
context.setDefaultTimeout(10000);
context.setDefaultNavigationTimeout(15000);
await auth(context);
const page = await context.newPage();

const activeTheme = wpEval('echo get_stylesheet();');
if (activeTheme !== 'hello-elementor') throw new Error(`Forward target Hello Elementor host is not active: ${activeTheme}`);

const geometry = [];
for (const width of [1920, 1680, 390]) {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 1080 });
  const entryId = createReviewEntry(`CSS-${width}`);
  await page.goto(frontendEntryUrl(entryId), { waitUntil: 'networkidle' });
  await revertToCorrection(page);
  await page.addStyleTag({ content: candidateCss });
  const state = hostState(entryId);
  const snapshot = await captureCandidate(page);
  if (state.current_step?.id !== correctionId || state.current_step?.type !== 'user_input') throw new Error(`Candidate CSS lost Correction state at ${width}.`);
  if (!snapshot.wrapper || !snapshot.main || !snapshot.fields || !snapshot.label || !snapshot.input || !snapshot.submit) throw new Error(`Candidate topology missing at ${width}.`);
  if (snapshot.overflow > 30.5) throw new Error(`Candidate introduced horizontal overflow at ${width}: ${snapshot.overflow}`);
  if (snapshot.wrapper.edge_distance.left < 10 || snapshot.wrapper.edge_distance.right < 10) throw new Error(`Candidate wrapper gutter is insufficient at ${width}: ${JSON.stringify(snapshot.wrapper)}`);
  if (snapshot.fields.direction !== 'rtl' || snapshot.field.direction !== 'rtl' || snapshot.label.direction !== 'rtl' || snapshot.label.text_align !== 'right' || snapshot.input.direction !== 'rtl' || snapshot.input.text_align !== 'right') {
    throw new Error(`Candidate RTL contract failed at ${width}: ${JSON.stringify(snapshot)}`);
  }
  await page.screenshot({ path: `${artifactDir}/srwf-correction-ux-candidate-${width}.png`, fullPage: true });
  geometry.push({ width, entry_id: entryId, state, snapshot, status: 'PASS' });
}

await page.setViewportSize({ width: 1920, height: 1080 });
const ctaEntryId = createReviewEntry('CTA');
const ctaUrl = frontendEntryUrl(ctaEntryId);
await page.goto(ctaUrl, { waitUntil: 'networkidle' });
await revertToCorrection(page);
const before = await buttonSemantics(page);
if (!before || before.button.id !== 'gravityflow_update_button' || before.button.value !== 'Submit') throw new Error(`Unexpected native CTA baseline: ${JSON.stringify(before)}`);

const muDir = path.join(wpPath, 'wp-content', 'mu-plugins');
fs.mkdirSync(muDir, { recursive: true });
const muPath = path.join(muDir, 'gpp-correction-ux-qualification-label.php');
const muCode = `<?php\nadd_filter('gravityflow_update_button_text_user_input', static function ($text, $form, $step) {\n    $manifest = get_option('gpp_srwf_journey_host_manifest');\n    if (!is_array($manifest)) return $text;\n    $form_id = isset($manifest['form_id']) ? (int) $manifest['form_id'] : 0;\n    $correction_id = isset($manifest['steps']['correction_id']) ? (int) $manifest['steps']['correction_id'] : 0;\n    $step_id = is_object($step) && method_exists($step, 'get_id') ? (int) $step->get_id() : 0;\n    if ((int) rgar($form, 'id') === $form_id && $step_id === $correction_id) return 'اصلاح اطلاعات';\n    return $text;\n}, 10, 3);\n`;
fs.writeFileSync(muPath, muCode);

await page.goto(ctaUrl, { waitUntil: 'networkidle' });
const after = await buttonSemantics(page);
if (!after || after.button.value !== 'اصلاح اطلاعات') throw new Error(`Native CTA text filter did not apply: ${JSON.stringify(after)}`);

const invariantButtonKeys = ['tag','id','type','name','class','onclick','formaction','formmethod'];
for (const key of invariantButtonKeys) {
  if (before.button[key] !== after.button[key]) throw new Error(`CTA filter changed native button ${key}: ${before.button[key]} -> ${after.button[key]}`);
}
for (const key of ['id','method','action','has_gravityflow_nonce','has_step_id','has_action','has_gravityflow_submit']) {
  if (before.form[key] !== after.form[key]) throw new Error(`CTA filter changed native form ${key}: ${JSON.stringify({ before:before.form, after:after.form })}`);
}
if (JSON.stringify(before.form.hidden_names) !== JSON.stringify(after.form.hidden_names)) throw new Error('CTA filter changed native hidden input topology.');

const input = page.locator('input[name="input_1"]').first();
await input.fill('CTA-FILTER-PROVEN');
const submit = page.locator('#gravityflow_update_button').first();
await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }), submit.click()]);
const completed = hostState(ctaEntryId);
if (completed.current_step?.id !== reviewId || completed.current_step?.type !== 'approval' || completed.field_1 !== 'CTA-FILTER-PROVEN') {
  throw new Error(`CTA-filtered native completion did not return to Review: ${JSON.stringify(completed)}`);
}

fs.unlinkSync(muPath);
await browser.close();
const payload = {
  schema_version: '1.0.0',
  scope: 'QUALIFICATION_ONLY',
  runtime: 'REPRODUCIBLE_PINNED_FORWARD_HELLO',
  active_theme: activeTheme,
  candidate_css: candidateCss,
  geometry,
  cta: {
    entry_id: ctaEntryId,
    filter: 'gravityflow_update_button_text_user_input',
    requested_label: 'اصلاح اطلاعات',
    before,
    after,
    completion: completed,
    status: 'PROVEN',
  },
};
fs.writeFileSync(`${artifactDir}/srwf-correction-ux-candidate-browser.json`, JSON.stringify(payload, null, 2) + '\n');
console.log(`SRWF_CORRECTION_UX_CANDIDATE_PASS ${geometry.length} CTA_PROVEN`);
