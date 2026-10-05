import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
if (!artifactDir || !wpPath || !wpCli) throw new Error('Pinned MR-6 journey environment is incomplete.');

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
const inboxUrl = manifest.routes?.shortcode?.url;
const fields = manifest.mr6?.fields || {};
if (!inboxUrl || manifest.mr6?.inbox_setup_status !== 'COMPLETED' || manifest.mr6?.inbox_form_scoped !== true || manifest.mr6?.rtl_host_control_enabled !== true) {
  throw new Error(`MR-6 setup is incomplete: ${JSON.stringify(manifest.mr6 || null)}`);
}
if (Number(fields.photo) !== 6 || Number(fields.grade_group) !== 7 || Number(fields.school) !== 8) {
  throw new Error(`MR-6 semantic field contract drifted: ${JSON.stringify(fields)}`);
}

const hostFacts = JSON.parse(wpEval(`
  $active_plugins=(array)get_option('active_plugins',array());
  echo wp_json_encode(array(
    'theme'=>(string)get_stylesheet(),
    'gtb_active'=>in_array('srwf-registration-theme/srwf-registration-theme.php',$active_plugins,true),
    'host_companion_active'=>count(array_filter($active_plugins,static function($p){return false!==stripos((string)$p,'srwf-host-companion');}))>0,
    'twenty_twenty_five_active'=>'twentytwentyfive'===(string)get_stylesheet()
  ));
`));
if (hostFacts.theme !== 'hello-elementor' || hostFacts.gtb_active !== true || hostFacts.host_companion_active !== false || hostFacts.twenty_twenty_five_active !== false) {
  throw new Error(`Forward-host coexistence contract failed: ${JSON.stringify(hostFacts)}`);
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
  const safe = String(label).replace(/[^A-Z0-9_-]/gi, '-');
  const raw = wpEval(`
    wp_set_current_user(${operatorId});
    $entry_id=GFAPI::add_entry(array(
      'form_id'=>${formId},
      'created_by'=>${operatorId},
      '1'=>'MR6-${safe}',
      '2'=>'Journey',
      '3'=>'MR6 ${safe}',
      '4'=>'MR6-${safe}',
      '6'=>'',
      '7'=>'پایه یازدهم — گروه آزمایشی',
      '8'=>'دبیرستان آزمایشی MR6'
    ));
    if (is_wp_error($entry_id) || !$entry_id) throw new RuntimeException('MR6 entry creation failed.');
    $api=new Gravity_Flow_API(${formId});
    $api->process_workflow((int)$entry_id);
    $entry=GFAPI::get_entry((int)$entry_id);
    $sent=$api->send_to_step($entry,${reviewId});
    if (false===$sent || is_wp_error($sent)) throw new RuntimeException('MR6 Review seed failed.');
    echo (int)$entry_id;
  `);
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw new Error(`Invalid MR-6 entry id: ${raw}`);
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

function comparable(url) {
  const value = new URL(url);
  for (const key of ['view', 'lid', 'id', 'paged', 'search', 'sort', 'sort_field', 'sort_direction']) value.searchParams.delete(key);
  return `${value.origin}${value.pathname}${value.search}`;
}

async function waitForInboxRow(page, entryId) {
  await page.waitForSelector('[data-js="gflow-inbox"] .ag-root-wrapper', { timeout: 30000 });
  await page.waitForFunction(id => Boolean(document.querySelector(`[data-js="gflow-inbox"] .ag-row[row-id="${String(id)}"]`)), entryId, { timeout: 30000 });
}

async function inboxSnapshot(page, entryId, width) {
  return page.evaluate(({ id, viewportWidth }) => {
    const visible = node => !!node && node.offsetParent !== null && getComputedStyle(node).visibility !== 'hidden';
    const root = document.querySelector('[data-js="gflow-inbox"]');
    const row = root?.querySelector(`.ag-row[row-id="${String(id)}"]`);
    const headers = [...(root?.querySelectorAll('.ag-header-cell[col-id]') || [])].filter(visible).map(node => {
      const rect = node.getBoundingClientRect();
      return { id: node.getAttribute('col-id'), text: node.textContent.replace(/\s+/g, ' ').trim(), left: rect.left, right: rect.right, width: rect.width };
    }).sort((a, b) => a.left - b.left);
    const cells = [...(row?.querySelectorAll('.ag-cell[col-id]') || [])].filter(visible).map(node => {
      const rect = node.getBoundingClientRect();
      return { id: node.getAttribute('col-id'), left: rect.left, right: rect.right, width: rect.width };
    }).sort((a, b) => a.left - b.left);
    const horizontal = root?.querySelector('.ag-body-horizontal-scroll-viewport');
    const pageDirection = getComputedStyle(document.body).direction;
    const htmlDirection = document.documentElement.getAttribute('dir') || getComputedStyle(document.documentElement).direction;
    let maxDelta = null;
    if (viewportWidth >= 1000 && headers.length === 5 && cells.length === 5) {
      maxDelta = 0;
      for (const header of headers) {
        const cell = cells.find(item => item.id === header.id);
        if (!cell) { maxDelta = Number.POSITIVE_INFINITY; break; }
        maxDelta = Math.max(maxDelta, Math.abs(header.left - cell.left), Math.abs(header.right - cell.right), Math.abs(header.width - cell.width));
      }
    }
    return {
      html_direction: htmlDirection,
      body_direction: pageDirection,
      native_inbox_count: document.querySelectorAll('.gflow-inbox.gflow-grid.gflow-common').length,
      replacement_count: document.querySelectorAll('[data-gpp-replacement-inbox],.gpp-custom-inbox-app,.gpp-inbox-card').length,
      manual_refresh_count: document.querySelectorAll('[data-gpp-inbox-manual-refresh]').length,
      native_search_count: document.querySelectorAll('[data-js="gflow-inbox-search"]').length,
      native_pager_count: root?.querySelectorAll('.ag-paging-panel').length || 0,
      horizontal_scroll_count: root?.querySelectorAll('.ag-body-horizontal-scroll').length || 0,
      horizontal_scroll_width: horizontal?.scrollWidth || 0,
      horizontal_client_width: horizontal?.clientWidth || 0,
      document_overflow: document.documentElement.scrollWidth - window.innerWidth,
      headers,
      cells,
      max_header_body_delta: maxDelta,
      gtb_stylesheets: [...document.querySelectorAll('link[rel="stylesheet"]')].filter(link => link.id === 'srwf-registration-theme-css' || link.href.includes('/srwf-registration-theme/srwf-registration.css')).length,
    };
  }, { id: entryId, viewportWidth: width });
}

function assertInboxSnapshot(snapshot, width) {
  const expectedIds = ['id', 'date_created', String(fields.school), '4', '2'];
  const expectedLabels = ['عملیات', 'تاریخ و ساعت ثبت', 'مدرسه و پایه', 'کد ملی', 'نام دانش‌آموز'];
  const ids = snapshot.headers.map(item => item.id);
  const labels = snapshot.headers.map(item => item.text);
  if (snapshot.html_direction !== 'rtl' || snapshot.body_direction !== 'rtl'
    || snapshot.native_inbox_count !== 1 || snapshot.replacement_count !== 0
    || snapshot.manual_refresh_count !== 1 || snapshot.native_search_count !== 1
    || snapshot.native_pager_count !== 1 || snapshot.horizontal_scroll_count !== 1
    || snapshot.document_overflow > 1 || snapshot.gtb_stylesheets !== 0
    || JSON.stringify(ids) !== JSON.stringify(expectedIds)
    || JSON.stringify(labels) !== JSON.stringify(expectedLabels)) {
    throw new Error(`Inbox composition failed at ${width}: ${JSON.stringify(snapshot)}`);
  }
  if (width >= 1000 && (snapshot.cells.length !== 5 || snapshot.max_header_body_delta === null || snapshot.max_header_body_delta > 1)) {
    throw new Error(`Inbox header/body geometry drifted at ${width}: ${JSON.stringify(snapshot)}`);
  }
  if (width < 1000 && snapshot.horizontal_scroll_width <= snapshot.horizontal_client_width) {
    throw new Error(`Narrow Inbox lost its one native horizontal overflow boundary at ${width}: ${JSON.stringify(snapshot)}`);
  }
}

async function openFromInbox(page, entryId, width, exerciseRefresh = false) {
  await page.goto(inboxUrl, { waitUntil: 'networkidle' });
  await waitForInboxRow(page, entryId);
  let snapshot = await inboxSnapshot(page, entryId, width);
  assertInboxSnapshot(snapshot, width);

  if (exerciseRefresh) {
    const before = page.url();
    const refresh = page.locator('[data-gpp-inbox-manual-refresh]').first();
    await refresh.focus();
    const focused = await refresh.evaluate(node => node === document.activeElement);
    if (!focused) throw new Error('Manual Refresh did not accept keyboard focus.');
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }), refresh.click()]);
    if (page.url() !== before) throw new Error(`Manual Refresh changed route: ${before} -> ${page.url()}`);
    await waitForInboxRow(page, entryId);
    snapshot = await inboxSnapshot(page, entryId, width);
    assertInboxSnapshot(snapshot, width);
  }

  const link = page.locator(`[data-js="gflow-inbox"] .ag-row[row-id="${String(entryId)}"] .gflow-inbox__entry-cell-link`).first();
  if (await link.count() !== 1) throw new Error(`Native Entry Detail link missing for ${entryId}.`);
  await Promise.all([page.waitForURL(/view=entry/, { timeout: 30000 }), link.click()]);
  const current = new URL(page.url());
  if (current.searchParams.get('lid') !== String(entryId) || current.searchParams.get('id') !== String(formId)) {
    throw new Error(`Native Inbox navigation opened the wrong case: ${current}`);
  }
  return snapshot;
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

async function printState(page) {
  return page.evaluate(() => {
    const visible = node => !!node && node.offsetParent !== null && getComputedStyle(node).visibility !== 'hidden';
    const nativeNodes = [...document.querySelectorAll('.detail-view-print')];
    const nativeAffordances = nativeNodes.flatMap(node => [...node.querySelectorAll('a,button,input,label,select,textarea')]);
    const gppNodes = [...document.querySelectorAll('[data-gpp-print-utility="dossier"]')];
    return {
      native_dom: nativeNodes.length,
      native_visible: nativeNodes.filter(visible).length,
      native_affordance_visible: nativeAffordances.filter(visible).length,
      gpp_dom: gppNodes.length,
      gpp_visible: gppNodes.filter(visible).length,
    };
  });
}

async function gtbStyles(page) {
  return page.locator('link#srwf-registration-theme-css,link[href*="/srwf-registration-theme/srwf-registration.css"]').count();
}

async function reviewSnapshot(page, entryId, width) {
  const state = hostState(entryId);
  const actions = await nativeActions(page);
  const print = await printState(page);
  const measurements = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('.gravityflow-status-box .gravityflow-action-buttons button')].filter(node => node.offsetParent !== null).map(node => {
      const rect = node.getBoundingClientRect();
      return { value: node.value, left: rect.left, right: rect.right, height: rect.height };
    });
    return { overflow: document.documentElement.scrollWidth - window.innerWidth, buttons };
  });
  const dossier = await page.locator('.gpp-entry-dossier[data-gpp-entry-detail="ready"]:visible').count();
  const terminal = await page.locator('[data-gpp-entry-journey-result]:visible').count();
  const editable = await page.locator('input[name^="input_"]:visible,textarea[name^="input_"]:visible,select[name^="input_"]:visible').count();
  const gtb = await gtbStyles(page);
  if (state.current_step?.id !== reviewId || state.current_step?.type !== 'approval' || state.current_step?.can_update !== true
    || actions.map(action => action.value).join(',') !== 'approved,rejected,revert'
    || !actions.every(action => action.onclick.includes('handleApprovalStepButtonClick'))
    || dossier !== 1 || terminal !== 0 || editable !== 0 || gtb !== 0
    || print.native_dom !== 1 || print.native_visible !== 0 || print.native_affordance_visible !== 0 || print.gpp_dom !== 1 || print.gpp_visible !== 1
    || measurements.overflow > 1 || measurements.buttons.some(button => button.left < -1 || button.right > width + 1)) {
    throw new Error(`Review contract failed at ${width}: ${JSON.stringify({ state, actions, print, dossier, terminal, editable, gtb, measurements })}`);
  }
  const firstAction = page.locator('.gravityflow-status-box .gravityflow-action-buttons button:visible').first();
  await firstAction.focus();
  const focus = await firstAction.evaluate(node => {
    const style = getComputedStyle(node);
    return { active: node === document.activeElement, outline: style.outlineStyle, outline_width: style.outlineWidth, box_shadow: style.boxShadow };
  });
  if (!focus.active || (focus.outline === 'none' && parseFloat(focus.outline_width || '0') < 1 && focus.box_shadow === 'none')) {
    throw new Error(`Review keyboard focus is not visible at ${width}: ${JSON.stringify(focus)}`);
  }
  return { state, actions, print, measurements, focus };
}

function nativeCorrectionSubmit(page) {
  return page.locator('#gravityflow_update_button:visible,#gravityflow_submit_button:visible').first();
}

async function correctionAndValidation(page, entryId, width) {
  const dialog = await accept(page, 'revert');
  let state = hostState(entryId);
  const editable = [...new Set(await page.locator('input[name^="input_"]:visible,textarea[name^="input_"]:visible,select[name^="input_"]:visible').evaluateAll(nodes => nodes.map(node => node.getAttribute('name')).filter(Boolean)))].sort();
  const unauthorized = await page.locator('input[name="input_2"]:visible,input[name="input_3"]:visible,input[name="input_4"]:visible,input[name="input_6"]:visible,input[name="input_7"]:visible,input[name="input_8"]:visible').count();
  const print = await printState(page);
  const gtb = await gtbStyles(page);
  if (!dialog || state.current_step?.id !== correctionId || state.current_step?.type !== 'user_input' || state.current_step?.can_update !== true
    || JSON.stringify(state.current_step?.editable_fields?.map(String).sort()) !== JSON.stringify(['1', '5'])
    || editable.join(',') !== 'input_1' || unauthorized !== 0
    || await page.locator('[data-gpp-entry-journey="correction"]:visible').count() !== 1
    || await page.locator('.gpp-entry-journey input,.gpp-entry-journey textarea,.gpp-entry-journey select').count() !== 0
    || print.gpp_visible !== 0 || print.native_visible !== 0 || gtb !== 0) {
    throw new Error(`Correction admission failed at ${width}: ${JSON.stringify({ dialog, state, editable, unauthorized, print, gtb })}`);
  }

  const input1 = page.locator('input[name="input_1"]').first();
  await input1.focus();
  const focus = await input1.evaluate(node => {
    const style = getComputedStyle(node);
    return { active: node === document.activeElement, outline: style.outlineStyle, outline_width: style.outlineWidth, box_shadow: style.boxShadow };
  });
  if (!focus.active || (focus.outline === 'none' && parseFloat(focus.outline_width || '0') < 1 && focus.box_shadow === 'none')) {
    throw new Error(`Correction keyboard focus is not visible at ${width}: ${JSON.stringify(focus)}`);
  }
  await input1.fill('SHOW-MR4');
  await input1.press('Tab');
  await page.waitForFunction(() => { const node = document.querySelector('input[name="input_5"]'); return Boolean(node && node.offsetParent !== null); });
  const field5 = page.locator('input[name="input_5"]').first();
  await field5.fill('INVALID-MR4');
  let submit = nativeCorrectionSubmit(page);
  if (await submit.count() !== 1 || await submit.getAttribute('id') !== 'gravityflow_update_button') throw new Error('Native correction update button is unavailable.');
  const correctionGeometry = await page.evaluate(() => {
    const input = document.querySelector('input[name="input_1"]');
    const submitNode = document.querySelector('#gravityflow_update_button');
    const ir = input?.getBoundingClientRect();
    const sr = submitNode?.getBoundingClientRect();
    return {
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      input: ir ? { left: ir.left, right: ir.right, height: ir.height } : null,
      submit: sr ? { left: sr.left, right: sr.right, height: sr.height } : null,
    };
  });
  if (correctionGeometry.overflow > 1 || !correctionGeometry.input || !correctionGeometry.submit
    || correctionGeometry.input.left < -1 || correctionGeometry.input.right > width + 1 || correctionGeometry.input.height < 44
    || correctionGeometry.submit.left < -1 || correctionGeometry.submit.right > width + 1 || correctionGeometry.submit.height < 44) {
    throw new Error(`Correction controls are clipped at ${width}: ${JSON.stringify(correctionGeometry)}`);
  }

  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }), submit.click()]);
  state = hostState(entryId);
  const invalidField = page.locator('input[name="input_5"]').first();
  const invalidState = await invalidField.evaluate(node => {
    const field = node.closest('.gfield');
    const messages = field ? [...field.querySelectorAll('.gfield_validation_message,.validation_message')].filter(message => message.offsetParent !== null).map(message => message.textContent.replace(/\s+/g, ' ').trim()) : [];
    return { value: node.value, aria_invalid: node.getAttribute('aria-invalid'), field_error: Boolean(field?.classList.contains('gfield_error')), messages };
  });
  if (state.current_step?.id !== correctionId || state.current_step?.type !== 'user_input' || invalidState.value !== 'INVALID-MR4'
    || (!invalidState.field_error && invalidState.aria_invalid !== 'true' && invalidState.messages.length === 0)) {
    throw new Error(`Native validation did not hold correction at ${width}: ${JSON.stringify({ state, invalidState })}`);
  }

  await invalidField.fill(`VALID-MR6-${width}`);
  submit = nativeCorrectionSubmit(page);
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }), submit.click()]);
  state = hostState(entryId);
  const review = await reviewSnapshot(page, entryId, width);
  if (state.field_1 !== 'SHOW-MR4' || state.field_5 !== `VALID-MR6-${width}` || state.current_step?.id !== reviewId || state.current_step?.type !== 'approval') {
    throw new Error(`Valid correction did not return to Review at ${width}: ${JSON.stringify(state)}`);
  }
  return { invalid_state: invalidState, persisted_state: state, correction_geometry: correctionGeometry, focus, review };
}

async function terminalInventory(page) {
  return page.evaluate(() => {
    const visible = node => !!node && node.offsetParent !== null && getComputedStyle(node).visibility !== 'hidden';
    const selectors = {
      result: '[data-gpp-entry-journey-result]',
      dossier: '.gpp-entry-dossier[data-gpp-entry-detail="ready"]',
      workflow_region: '#postbox-container-1',
      timeline_region: '#postbox-container-2',
      status_box: '.gravityflow-status-box',
      native_print: '.detail-view-print',
      gpp_print: '[data-gpp-print-utility="dossier"]',
      timeline: '.gravityflow-timeline',
      entry_table: '.entry-detail-view',
      correction: '[data-gpp-entry-journey="correction"]',
      gpp_return: 'a.gpp-entry-journey__return',
      native_back: '.gravityflow-back-link-container a.back-link',
    };
    return Object.fromEntries(Object.entries(selectors).map(([key, selector]) => {
      const nodes = [...document.querySelectorAll(selector)];
      return [key, { dom: nodes.length, visible: nodes.filter(visible).length }];
    }));
  });
}

async function assertTerminal(page, entryId, expected, width) {
  const state = hostState(entryId);
  if (state.current_step !== null || state.workflow_final_status !== expected || state.api_status !== expected) {
    throw new Error(`Fresh ${expected} host truth missing at ${width}: ${JSON.stringify(state)}`);
  }
  const result = page.locator(`[data-gpp-entry-journey-result="${expected}"]:visible`).first();
  if (await result.count() !== 1 || await result.getAttribute('role') !== 'status') throw new Error(`Result-only ${expected} surface missing.`);
  const text = (await result.innerText()).replace(/\s+/g, ' ').trim();
  if (!text.includes('بازگشت به کارهای من')) throw new Error(`Terminal continuation missing: ${text}`);
  if (expected === 'approved' && (!text.includes('پرونده تأیید شد') || !text.includes('نتیجه بررسی با موفقیت ثبت شد.'))) throw new Error(`Approved result copy drifted: ${text}`);
  if (expected === 'rejected' && (!text.includes('پرونده رد شد') || !text.includes('نتیجه رد با موفقیت ثبت شد.') || /technical|خطای فنی|مشکل فنی/i.test(text))) throw new Error(`Rejected result contract drifted: ${text}`);
  const inventory = await terminalInventory(page);
  for (const key of ['dossier', 'workflow_region', 'timeline_region', 'status_box', 'native_print', 'timeline', 'entry_table', 'correction']) {
    if (inventory[key].visible !== 0) throw new Error(`Competing terminal surface remained (${key}): ${JSON.stringify(inventory)}`);
  }
  if (inventory.result.visible !== 1 || inventory.gpp_return.visible !== 1 || inventory.native_back.visible !== 0) throw new Error(`Terminal Result/Return cardinality failed: ${JSON.stringify(inventory)}`);
  if (expected === 'approved' && inventory.gpp_print.visible !== 1) throw new Error(`Authorized Approved Print utility missing: ${JSON.stringify(inventory)}`);
  if ((await nativeActions(page)).length !== 0 || await gtbStyles(page) !== 0) throw new Error(`Terminal host/GPP ownership leaked at ${width}.`);

  const link = page.locator('a.gpp-entry-journey__return:visible').first();
  await link.focus();
  const geometry = await link.evaluate(node => {
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return { active: node === document.activeElement, left: rect.left, right: rect.right, height: rect.height, outline: style.outlineStyle, outline_width: style.outlineWidth, box_shadow: style.boxShadow, overflow: document.documentElement.scrollWidth - window.innerWidth };
  });
  if (!geometry.active || geometry.left < -1 || geometry.right > width + 1 || geometry.height < 44 || geometry.overflow > 1
    || (geometry.outline === 'none' && parseFloat(geometry.outline_width || '0') < 1 && geometry.box_shadow === 'none')) {
    throw new Error(`Terminal continuation is not keyboard/responsive usable at ${width}: ${JSON.stringify(geometry)}`);
  }
  return { state, text, inventory, geometry };
}

async function returnToInbox(page, width) {
  const control = page.locator('a.gpp-entry-journey__return:visible').first();
  const href = await control.getAttribute('href');
  if (!href || comparable(href) !== comparable(inboxUrl)) throw new Error(`Return target is not canonical Inbox page 1: ${href}`);
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }), control.click()]);
  const current = new URL(page.url());
  for (const key of ['view', 'lid', 'id', 'paged', 'search', 'sort', 'sort_field', 'sort_direction']) {
    if (current.searchParams.has(key)) throw new Error(`Return retained non-canonical Inbox state ${key}: ${current}`);
  }
  if (comparable(current.toString()) !== comparable(inboxUrl)) throw new Error(`Return did not reach canonical Inbox: ${current}`);
  await page.waitForSelector('[data-js="gflow-inbox"] .ag-root-wrapper', { timeout: 30000 });
  const basic = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    native: document.querySelectorAll('.gflow-inbox.gflow-grid.gflow-common').length,
    pager: document.querySelectorAll('[data-js="gflow-inbox"] .ag-paging-panel').length,
    direction: getComputedStyle(document.body).direction,
  }));
  if (basic.overflow > 1 || basic.native !== 1 || basic.pager !== 1 || basic.direction !== 'rtl') throw new Error(`Returned Inbox is not usable at ${width}: ${JSON.stringify(basic)}`);
  return { url: current.toString(), basic };
}

const results = [];
async function test(id, name, fn) {
  try {
    results.push({ id, name, status: 'PASS', details: await fn() });
  } catch (error) {
    results.push({ id, name, status: 'FAIL', details: { error: String(error?.stack || error).slice(0, 18000) } });
  }
}

wpEval("update_option('gpp_srwf_mr4_expand_editable_fields','1',false); echo '1';");
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
context.setDefaultTimeout(12000);
context.setDefaultNavigationTimeout(20000);
await auth(context);
const page = await context.newPage();

for (const width of [1440, 390, 320]) {
  await test(`SRWF-PROD-MR6-APPROVE-${width}`, `Inbox → Review → Correction → Review → Approved → Inbox at ${width}px`, async () => {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    const entryId = createReviewEntry(`APPROVE-${width}`);
    const inbox = await openFromInbox(page, entryId, width, width === 1440);
    const reviewBefore = await reviewSnapshot(page, entryId, width);
    const correction = await correctionAndValidation(page, entryId, width);
    const approveDialog = await accept(page, 'approved');
    if (!approveDialog) throw new Error('Native Approve confirmation was not observed.');
    const terminal = await assertTerminal(page, entryId, 'approved', width);
    if (width !== 1440) await page.screenshot({ path: `${artifactDir}/srwf-journey-mr6-approved-${width}.png`, fullPage: true });
    const returned = await returnToInbox(page, width);
    return { entry_id: entryId, inbox, review_before: reviewBefore, correction, approve_dialog: approveDialog, terminal, returned };
  });

  await test(`SRWF-PROD-MR6-REJECT-${width}`, `Inbox → Review → Rejected → Inbox at ${width}px`, async () => {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    const entryId = createReviewEntry(`REJECT-${width}`);
    const inbox = await openFromInbox(page, entryId, width);
    const review = await reviewSnapshot(page, entryId, width);
    const rejectDialog = await accept(page, 'rejected');
    if (!rejectDialog) throw new Error('Native Reject confirmation was not observed.');
    const terminal = await assertTerminal(page, entryId, 'rejected', width);
    if (width !== 1440) await page.screenshot({ path: `${artifactDir}/srwf-journey-mr6-rejected-${width}.png`, fullPage: true });
    const returned = await returnToInbox(page, width);
    return { entry_id: entryId, inbox, review, reject_dialog: rejectDialog, terminal, returned };
  });
}

await browser.close();
wpEval("delete_option('gpp_srwf_mr4_expand_editable_fields'); echo '1';");
fs.mkdirSync(artifactDir, { recursive: true });
fs.writeFileSync(`${artifactDir}/srwf-journey-production-mr6-integrated-browser.json`, JSON.stringify({
  schema_version: '1.0.0',
  runtime: 'REPRODUCIBLE_PINNED_FORWARD_HELLO',
  host: hostFacts,
  results,
}, null, 2) + '\n');
const failed = results.filter(result => result.status !== 'PASS');
if (failed.length) {
  console.error(JSON.stringify({ failed }, null, 2));
  process.exit(1);
}
console.log(`SRWF_JOURNEY_PRODUCTION_MR6_INTEGRATED_PASS ${results.length}`);
