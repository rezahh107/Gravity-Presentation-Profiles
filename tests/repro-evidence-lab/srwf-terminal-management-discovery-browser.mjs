import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
const adminPassword = 'wu21-bootstrap-pass-2026';
const negativePassword = 'srwf-participant-pass-2026';
if (!artifactDir || !wpPath || !wpCli) throw new Error('Pinned terminal-management discovery environment is incomplete.');

function wpEval(code) {
  const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], { encoding: 'utf8', env: process.env });
  if (cp.status !== 0) throw new Error(`${cp.stderr}\n${cp.stdout}`);
  return cp.stdout.trim();
}

const manifest = JSON.parse(wpEval('echo wp_json_encode(get_option("gpp_srwf_journey_host_manifest"), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);'));
const formId = Number(manifest.form_id);
const entries = {
  approved: Number(manifest.entries.approve),
  rejected: Number(manifest.entries.reject),
};
const frontendEntryUrl = entryId => {
  const url = new URL(manifest.routes.shortcode.url);
  url.searchParams.set('view', 'entry');
  url.searchParams.set('id', String(formId));
  url.searchParams.set('lid', String(entryId));
  return url.toString();
};
const adminEntryUrl = entryId => `${baseUrl}/wp-admin/admin.php?page=gravityflow-inbox&view=entry&id=${formId}&lid=${entryId}`;

function hostState(entryId, userId) {
  return JSON.parse(wpEval(`
    wp_set_current_user(${Number(userId)});
    if (!class_exists('Gravity_Flow_Entry_Detail')) require_once gravity_flow()->get_base_path() . '/includes/pages/class-entry-detail.php';
    $entry=GFAPI::get_entry(${Number(entryId)});
    $api=new Gravity_Flow_API(${formId});
    $step=$api->get_current_step($entry);
    echo wp_json_encode(array(
      'workflow_final_status'=>(string)gform_get_meta((int)$entry['id'],'workflow_final_status'),
      'api_status'=>(string)$api->get_status($entry),
      'current_step'=>$step?array('id'=>(int)$step->get_id(),'type'=>(string)$step->get_type(),'can_update'=>(bool)Gravity_Flow_Entry_Detail::can_update($step)):null,
      'workflow_detail_admin_actions'=>(bool)GFAPI::current_user_can_any('gravityflow_workflow_detail_admin_actions')
    ),JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
  `));
}

async function login(page, user, pass) {
  await page.context().clearCookies();
  await page.goto(`${baseUrl}/wp-login.php`, { waitUntil:'domcontentloaded' });
  await page.fill('#user_login', user);
  await page.fill('#user_pass', pass);
  await Promise.all([page.waitForNavigation({ waitUntil:'domcontentloaded' }), page.click('#wp-submit')]);
  if (new URL(page.url()).pathname.endsWith('/wp-login.php')) throw new Error(`Authentication failed for synthetic user ${user}.`);
}

async function completeReview(page, entryId, state) {
  await page.goto(frontendEntryUrl(entryId), { waitUntil:'networkidle' });
  const button = page.locator(`.gravityflow-status-box .gravityflow-action-buttons button[value="${state}"]`).first();
  if (await button.count() !== 1) throw new Error(`Missing native ${state} action before terminal discovery.`);
  let dialogInfo = null;
  const dialog = new Promise(resolve => page.once('dialog', async d => {
    dialogInfo = { type:d.type(), message:d.message() };
    await d.accept();
    resolve();
  }));
  await Promise.all([page.waitForNavigation({ waitUntil:'networkidle' }), button.click(), dialog]);
  const host = hostState(entryId, manifest.users.operator.id);
  if (host.current_step !== null || host.workflow_final_status !== state || host.api_status !== state) {
    throw new Error(`Native ${state} action did not establish terminal truth: ${JSON.stringify({ dialogInfo, host })}`);
  }
  return { dialog:dialogInfo, host };
}

async function inventory(page) {
  return page.evaluate(() => {
    const visible = node => !!node && node.offsetParent !== null && getComputedStyle(node).visibility !== 'hidden';
    const selectors = {
      result: '[data-gpp-entry-journey-result]',
      identity: '[data-gpp-entry-journey-result] .gpp-entry-journey__case-context',
      dossier: '.gpp-entry-dossier[data-gpp-entry-detail="ready"]',
      workflow_region: '#postbox-container-1',
      timeline_region: '#postbox-container-2',
      status_box: '.gravityflow-status-box',
      native_print: '.detail-view-print',
      gpp_print: '[data-gpp-print-utility="dossier"]',
      timeline: '.gravityflow-timeline',
      entry_table: '.entry-detail-view',
      native_admin_action: '#gravityflow-admin-action',
      native_admin_apply: '[name="_gravityflow_admin_action"]',
      native_admin_nonce: '[name="_gravityflow_admin_action_nonce"]',
      gpp_return: 'a.gpp-entry-journey__return',
    };
    const counts = Object.fromEntries(Object.entries(selectors).map(([key, selector]) => {
      const nodes = [...document.querySelectorAll(selector)];
      return [key, { dom:nodes.length, visible:nodes.filter(visible).length }];
    }));
    const select = document.querySelector('#gravityflow-admin-action');
    const options = select ? [...select.options].map(option => ({ value:option.value, text:(option.textContent || '').trim() })) : [];
    const gppText = [...document.querySelectorAll('.gpp-entry-journey, .gpp-entry-journey-result')]
      .map(node => node.textContent || '').join(' ').replace(/\s+/g, ' ').trim();
    return {
      url: location.href,
      title: document.title,
      body_classes: document.body.className,
      counts,
      admin_action_options: options,
      gpp_text: gppText,
    };
  });
}

async function nativeApprovalActions(page) {
  return page.locator('.gravityflow-status-box .gravityflow-action-buttons button').evaluateAll(nodes =>
    nodes.filter(node => node.offsetParent !== null).map(node => node.value)
  );
}

async function assertAdminManagement(page, state) {
  const inv = await inventory(page);
  if (!/(^|\s)wp-admin(\s|$)/.test(inv.body_classes)) throw new Error(`Expected wp-admin terminal context: ${JSON.stringify(inv)}`);
  if (inv.counts.result.visible !== 1) throw new Error(`GPP terminal result missing in admin ${state}.`);
  if (inv.counts.workflow_region.visible !== 1) throw new Error(`Native management region hidden in admin ${state}: ${JSON.stringify(inv.counts)}`);
  if (inv.counts.native_admin_action.dom !== 1 || inv.counts.native_admin_action.visible !== 1) throw new Error(`Native admin selector hidden in ${state}: ${JSON.stringify(inv.counts)}`);
  if (inv.counts.native_admin_apply.dom !== 1 || inv.counts.native_admin_apply.visible !== 1 || inv.counts.native_admin_nonce.dom !== 1) throw new Error(`Native admin lifecycle controls incomplete in ${state}: ${JSON.stringify(inv.counts)}`);
  if (!inv.admin_action_options.some(option => option.value === 'restart_workflow')) throw new Error(`Restart Workflow option missing in ${state}: ${JSON.stringify(inv.admin_action_options)}`);
  if (!inv.admin_action_options.some(option => option.value && option.value !== 'restart_workflow')) throw new Error(`No native send-to-step option in ${state}: ${JSON.stringify(inv.admin_action_options)}`);
  if (/restart workflow|send to step/i.test(inv.gpp_text)) throw new Error(`GPP manufactured terminal management copy in ${state}: ${inv.gpp_text}`);
  if ((await nativeApprovalActions(page)).some(value => ['approved','rejected','revert'].includes(value))) throw new Error(`Stale Approval action visible in terminal admin ${state}.`);
  return inv;
}

async function assertFrontendResultOnly(page, state) {
  const inv = await inventory(page);
  if (/(^|\s)wp-admin(\s|$)/.test(inv.body_classes)) throw new Error('Expected frontend terminal context.');
  if (inv.counts.result.visible !== 1 || inv.counts.identity.dom !== 0) throw new Error(`Frontend terminal result contract failed for ${state}: ${JSON.stringify(inv.counts)}`);
  for (const key of ['dossier','workflow_region','timeline_region','status_box','native_print','timeline','entry_table']) {
    if (inv.counts[key].visible !== 0) throw new Error(`Competing frontend terminal surface visible (${key}): ${JSON.stringify(inv.counts)}`);
  }
  if (inv.counts.gpp_print.visible !== 1) throw new Error(`GPP Print missing on frontend terminal ${state}: ${JSON.stringify(inv.counts)}`);
  // Gravity Flow may still own/render these controls in the shared frontend DOM;
  // the Result-only contract is that they are not visible or operator-usable.
  if (inv.counts.native_admin_action.visible !== 0 || inv.counts.native_admin_apply.visible !== 0) throw new Error(`Admin management visible on frontend terminal ${state}.`);
  if ((await nativeApprovalActions(page)).length !== 0) throw new Error(`Stale workflow actions visible on frontend terminal ${state}.`);
  if (inv.counts.gpp_return.visible !== 1) throw new Error(`Canonical Inbox return missing on frontend terminal ${state}.`);
  return inv;
}

const browser = await chromium.launch({ headless:true });
const context = await browser.newContext({ viewport:{ width:1280, height:900 } });
const page = await context.newPage();
const result = {
  schema_version: '2.0.0',
  scope: 'QUALIFICATION_AND_PRODUCTION_REGRESSION',
  data_class: 'SYNTHETIC_NON_PII',
  runtime: { gravity_forms:'3.1.1.1', gravity_flow:'3.1.0' },
  entries: {},
  negative_control: null,
  frontend_terminal: null,
};

try {
  await login(page, manifest.users.operator.login, adminPassword);
  const operatorGate = hostState(entries.approved, manifest.users.operator.id);
  if (!operatorGate.workflow_detail_admin_actions) throw new Error(`Synthetic admin lacks native Entry Detail Admin Actions authority: ${JSON.stringify(operatorGate)}`);

  for (const [state, entryId] of Object.entries(entries)) {
    const terminalized = await completeReview(page, entryId, state);
    await page.goto(adminEntryUrl(entryId), { waitUntil:'networkidle' });
    const first = await assertAdminManagement(page, state);
    await page.reload({ waitUntil:'networkidle' });
    const reloaded = await assertAdminManagement(page, state);
    result.entries[state] = { entry_id:entryId, terminalized, first, reloaded };
  }

  await login(page, manifest.users.negative_control.login, negativePassword);
  const negativeHost = hostState(entries.rejected, manifest.users.negative_control.id);
  if (negativeHost.workflow_detail_admin_actions) throw new Error(`Negative-control user unexpectedly has Entry Detail Admin Actions authority: ${JSON.stringify(negativeHost)}`);
  await page.goto(adminEntryUrl(entries.rejected), { waitUntil:'networkidle' });
  const negativeBrowser = await inventory(page);
  if (negativeBrowser.counts.native_admin_action.dom !== 0 || negativeBrowser.counts.native_admin_apply.dom !== 0 || negativeBrowser.counts.native_admin_nonce.dom !== 0) {
    throw new Error(`Unauthorized terminal management controls rendered: ${JSON.stringify(negativeBrowser.counts)}`);
  }
  result.negative_control = { host:negativeHost, browser:negativeBrowser };

  await login(page, manifest.users.operator.login, adminPassword);
  await page.goto(frontendEntryUrl(entries.rejected), { waitUntil:'networkidle' });
  const firstFrontend = await assertFrontendResultOnly(page, 'rejected');
  await page.reload({ waitUntil:'networkidle' });
  const reloadFrontend = await assertFrontendResultOnly(page, 'rejected');
  result.frontend_terminal = { entry_id:entries.rejected, first:firstFrontend, reloaded:reloadFrontend };
} finally {
  await browser.close();
  fs.writeFileSync(
    `${artifactDir}/srwf-terminal-management-discovery-browser.json`,
    JSON.stringify(result, null, 2) + '\n',
    'utf8'
  );
}

console.log('SRWF_TERMINAL_MANAGEMENT_QUALIFICATION_PASS');
