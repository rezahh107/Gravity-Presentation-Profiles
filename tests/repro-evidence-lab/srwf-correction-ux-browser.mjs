import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
if (!artifactDir || !wpPath || !wpCli) throw new Error('Pinned Correction UX qualification environment is incomplete.');

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
    $entry_id=GFAPI::add_entry(array('form_id'=>${formId},'created_by'=>${operatorId},'1'=>'CORRECTION-UX-${safe}'));
    if (is_wp_error($entry_id) || !$entry_id) throw new RuntimeException('Correction UX entry creation failed.');
    $api=new Gravity_Flow_API(${formId});
    $api->process_workflow((int)$entry_id);
    $entry=GFAPI::get_entry((int)$entry_id);
    $sent=$api->send_to_step($entry,${reviewId});
    if (false===$sent || is_wp_error($sent)) throw new RuntimeException('Correction UX Review seed failed.');
    echo (int)$entry_id;
  `);
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw new Error(`Invalid Correction UX entry id: ${raw}`);
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

async function revertToCorrection(page) {
  const button = page.locator('.gravityflow-status-box .gravityflow-action-buttons button[value="revert"]').first();
  if (await button.count() !== 1) throw new Error('Native Revert action unavailable.');
  const dialog = new Promise(resolve => page.once('dialog', async d => { await d.accept(); resolve({ type: d.type(), message: d.message() }); }));
  const [, info] = await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }), dialog, button.click()]);
  return info;
}

async function capture(page) {
  return page.evaluate(() => {
    const visible = node => Boolean(node && node.offsetParent !== null && getComputedStyle(node).visibility !== 'hidden');
    const orientation = document.querySelector('[data-gpp-entry-journey="correction"]');
    const form = orientation?.closest('form') || null;
    const pick = selector => [...document.querySelectorAll(selector)].find(visible) || null;
    const workflow = orientation?.closest('.gravityflow_workflow_detail') || document.querySelector('.gravityflow_workflow_detail');
    const wrapper = form?.querySelector('.gform_wrapper') || document.querySelector('.gform_wrapper');
    const fields = wrapper?.querySelector('.gform_fields') || null;
    const field = wrapper ? [...wrapper.querySelectorAll('.gfield')].find(visible) || null : null;
    const label = field?.querySelector('.gfield_label,label') || null;
    const input = pick('.gform_wrapper input[name^="input_"]:not([type="hidden"])');
    const select = pick('.gform_wrapper select[name^="input_"]');
    const textarea = pick('.gform_wrapper textarea[name^="input_"]');
    const footer = pick('.gform_wrapper .gform_footer,.gravityflow-action-buttons');
    const submit = pick('#gravityflow_update_button,#gravityflow_submit_button,.gform_wrapper input[type="submit"],.gform_wrapper button[type="submit"]');

    function nodeSummary(node) {
      if (!node) return null;
      const r = node.getBoundingClientRect();
      const s = getComputedStyle(node);
      return {
        tag: node.tagName.toLowerCase(),
        id: node.id || null,
        classes: typeof node.className === 'string' ? node.className : null,
        rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height },
        edge_distance: { left: r.left, right: window.innerWidth - r.right },
        computed: {
          width: s.width,
          max_width: s.maxWidth,
          min_width: s.minWidth,
          margin_inline_start: s.marginInlineStart,
          margin_inline_end: s.marginInlineEnd,
          padding_inline_start: s.paddingInlineStart,
          padding_inline_end: s.paddingInlineEnd,
          direction: s.direction,
          text_align: s.textAlign,
          display: s.display,
          box_sizing: s.boxSizing,
          overflow_x: s.overflowX,
          position: s.position,
        },
      };
    }

    const ancestors = [];
    let cursor = wrapper;
    let depth = 0;
    while (cursor && depth < 12) {
      ancestors.push(nodeSummary(cursor));
      if (cursor === document.body) break;
      cursor = cursor.parentElement;
      depth += 1;
    }

    const matchingRules = [];
    for (const sheet of [...document.styleSheets]) {
      let rules;
      try { rules = [...sheet.cssRules]; } catch { continue; }
      for (const rule of rules) {
        if (!rule.selectorText) continue;
        const selector = rule.selectorText;
        if (!selector.includes('gpp-entry-journey--correction') && !selector.includes('gravityflow_workflow_detail') && !selector.includes('gform_wrapper')) continue;
        let matched = false;
        for (const target of [workflow, form, wrapper, fields, field, label, input, footer, submit].filter(Boolean)) {
          try { if (target.matches(selector)) { matched = true; break; } } catch {}
        }
        if (matched) matchingRules.push({ selector, css_text: rule.cssText.slice(0, 4000), href: sheet.href || 'inline' });
      }
    }

    const submitSummary = submit ? {
      tag: submit.tagName.toLowerCase(),
      id: submit.id || null,
      type: submit.getAttribute('type'),
      name: submit.getAttribute('name'),
      value_attribute: submit.getAttribute('value'),
      value_property: 'value' in submit ? submit.value : null,
      text: submit.textContent?.replace(/\s+/g, ' ').trim() || null,
      class: submit.getAttribute('class'),
      formaction: submit.getAttribute('formaction'),
      formmethod: submit.getAttribute('formmethod'),
      onclick: submit.getAttribute('onclick'),
    } : null;

    const formSummary = form ? {
      id: form.id || null,
      method: form.getAttribute('method'),
      action: form.getAttribute('action'),
      hidden_names: [...form.querySelectorAll('input[type="hidden"][name]')].map(node => node.name),
    } : null;

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      document_scroll_width: document.documentElement.scrollWidth,
      document_overflow_x: document.documentElement.scrollWidth - window.innerWidth,
      html_direction: getComputedStyle(document.documentElement).direction,
      body_direction: getComputedStyle(document.body).direction,
      nodes: {
        workflow: nodeSummary(workflow),
        form: nodeSummary(form),
        orientation: nodeSummary(orientation),
        wrapper: nodeSummary(wrapper),
        fields: nodeSummary(fields),
        field: nodeSummary(field),
        label: nodeSummary(label),
        input: nodeSummary(input),
        select: nodeSummary(select),
        textarea: nodeSummary(textarea),
        footer: nodeSummary(footer),
        submit: nodeSummary(submit),
      },
      wrapper_ancestor_chain: ancestors,
      submit: submitSummary,
      form_semantics: formSummary,
      matching_rules: matchingRules,
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

const results = [];
for (const width of [1920, 1680, 390]) {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 1080 });
  const entryId = createReviewEntry(`RAW-${width}`);
  await page.goto(frontendEntryUrl(entryId), { waitUntil: 'networkidle' });
  const dialog = await revertToCorrection(page);
  const state = hostState(entryId);
  if (state.current_step?.id !== correctionId || state.current_step?.type !== 'user_input' || state.current_step?.can_update !== true) {
    throw new Error(`Correction route not authentic at ${width}: ${JSON.stringify(state)}`);
  }
  const snapshot = await capture(page);
  if (!snapshot.nodes.workflow || !snapshot.nodes.form || !snapshot.nodes.orientation || !snapshot.nodes.wrapper || !snapshot.nodes.field || !snapshot.nodes.label || !snapshot.nodes.input || !snapshot.nodes.submit) {
    throw new Error(`Required native Correction topology missing at ${width}: ${JSON.stringify(snapshot.nodes)}`);
  }
  const screenshot = `${artifactDir}/srwf-correction-ux-${width}.png`;
  await page.screenshot({ path: screenshot, fullPage: true });
  results.push({ width, entry_id: entryId, dialog, state, snapshot, screenshot: screenshot.split('/').pop(), status: 'CAPTURED' });
}

await browser.close();
const payload = {
  schema_version: '1.0.0',
  scope: 'QUALIFICATION_ONLY',
  runtime: 'REPRODUCIBLE_PINNED_FORWARD_HELLO',
  active_theme: activeTheme,
  form_id: formId,
  review_step_id: reviewId,
  correction_step_id: correctionId,
  results,
};
fs.writeFileSync(`${artifactDir}/srwf-correction-ux-browser.json`, JSON.stringify(payload, null, 2) + '\n');
console.log(`SRWF_CORRECTION_UX_BROWSER_CAPTURED ${results.length}`);
