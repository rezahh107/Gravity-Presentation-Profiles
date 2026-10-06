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
      'gravityflow_admin_actions'=>(bool)current_user_can('gravityflow_admin_actions')
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

async function inventory(page) {
  return page.evaluate(() => {
    const visible = node => !!node && node.offsetParent !== null && getComputedStyle(node).visibility !== 'hidden';
    const descriptor = node => ({
      tag: node.tagName.toLowerCase(),
      id: node.id || '',
      class: node.className?.toString?.() || '',
      type: node.getAttribute('type') || '',
      name: node.getAttribute('name') || '',
      value: node.getAttribute('value') || '',
      text: (node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 500),
      href: node.href || '',
      visible: visible(node),
      form_action: node.form?.action || '',
      form_method: node.form?.method || '',
    });
    const controlSelector = 'button,input[type="submit"],input[type="button"],input[type="hidden"],select,a';
    const regions = {};
    for (const [key, selector] of Object.entries({
      postbox_1: '#postbox-container-1',
      status_box: '.gravityflow-status-box',
      admin_action_candidates: '.postbox, .gravityflow-status-box, #postbox-container-1',
    })) {
      const nodes = [...document.querySelectorAll(selector)];
      regions[key] = nodes.map(node => ({
        descriptor: descriptor(node),
        text: (node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 4000),
        controls: [...node.querySelectorAll(controlSelector)].map(descriptor),
      }));
    }
    const actionText = /admin actions|restart|cancel workflow|send to step|ارسال|راه.?اندازی|لغو/i;
    const candidateControls = [...document.querySelectorAll(controlSelector)]
      .map(descriptor)
      .filter(item => actionText.test(`${item.text} ${item.value} ${item.name} ${item.id} ${item.class} ${item.href}`));
    const matchingPostboxes = [...document.querySelectorAll('.postbox')]
      .map(node => ({
        descriptor: descriptor(node),
        text: (node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 5000),
        controls: [...node.querySelectorAll(controlSelector)].map(descriptor),
      }))
      .filter(item => actionText.test(item.text) || item.controls.some(control => actionText.test(`${control.text} ${control.value} ${control.name} ${control.id} ${control.class}`)));
    return {
      url: location.href,
      title: document.title,
      body_classes: document.body.className,
      gpp_result: [...document.querySelectorAll('[data-gpp-entry-journey-result]')].map(descriptor),
      regions,
      candidate_controls: candidateControls,
      matching_postboxes: matchingPostboxes,
    };
  });
}

const browser = await chromium.launch({ headless:true });
const context = await browser.newContext({ viewport:{ width:1280, height:900 } });
const page = await context.newPage();
const result = {
  schema_version: '1.0.0',
  scope: 'QUALIFICATION_ONLY',
  data_class: 'SYNTHETIC_NON_PII',
  runtime: {
    gravity_forms: '3.1.1.1',
    gravity_flow: '3.1.0',
  },
  entries: {},
  negative_control: null,
};

await login(page, manifest.users.operator.login, adminPassword);
for (const [state, entryId] of Object.entries(entries)) {
  const host = hostState(entryId, manifest.users.operator.id);
  if (host.current_step !== null || host.workflow_final_status !== state || host.api_status !== state) {
    throw new Error(`Expected terminal ${state} host truth before discovery: ${JSON.stringify(host)}`);
  }
  await page.goto(adminEntryUrl(entryId), { waitUntil:'networkidle' });
  const first = await inventory(page);
  await page.reload({ waitUntil:'networkidle' });
  const reloaded = await inventory(page);
  result.entries[state] = { entry_id:entryId, host, first, reloaded };
}

await login(page, manifest.users.negative_control.login, negativePassword);
await page.goto(adminEntryUrl(entries.approved), { waitUntil:'networkidle' });
result.negative_control = {
  host: hostState(entries.approved, manifest.users.negative_control.id),
  browser: await inventory(page),
};

await browser.close();
fs.writeFileSync(
  `${artifactDir}/srwf-terminal-management-discovery-browser.json`,
  JSON.stringify(result, null, 2) + '\n',
  'utf8'
);
console.log('SRWF_TERMINAL_MANAGEMENT_DISCOVERY_CAPTURED');