import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
if (!artifactDir || !wpPath || !wpCli) throw new Error('Pinned Blocksy journey runtime unavailable.');

function run(command, args) {
  const cp = spawnSync(command, args, { encoding: 'utf8', env: process.env });
  if (cp.status !== 0) throw new Error(command + ': ' + cp.stderr + '\n' + cp.stdout);
  return cp.stdout.trim();
}
const wpEval = code => run('php', [wpCli, '--path=' + wpPath, 'eval', code]);
const head = run('git', ['rev-parse', 'HEAD']);
const manifest = JSON.parse(wpEval('echo wp_json_encode(get_option("gpp_srwf_journey_host_manifest"),JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);'));
const formId = Number(manifest.form_id);
const operatorId = Number(manifest.users?.operator?.id);
const deniedId = Number(manifest.users?.negative_control?.id);
const inboxUrl = manifest.routes?.shortcode?.url;
if (wpEval('echo get_stylesheet();') !== 'blocksy' ||
    wpEval('echo wp_get_theme()->get("Version");') !== '2.1.59' ||
    !inboxUrl || !formId || !operatorId || !deniedId || operatorId === deniedId ||
    manifest.mr6?.inbox_setup_status !== 'COMPLETED' || !manifest.steps?.review_id) {
  throw new Error('Real pinned Blocksy Free 2.1.59 journey prerequisites are not satisfied.');
}
const active = JSON.parse(wpEval('echo wp_json_encode((array)get_option("active_plugins",array()));'));
if (active.some(name => /^(elementor\/|elementor-pro\/|blocksy-companion\/)/.test(name))) {
  throw new Error('Disallowed Elementor or Blocksy Companion in pinned Blocksy fixture.');
}

// Seed only a genuinely native synthetic GF/Flow entry. The production
// workflow, GPP presentation activation and financial mappings are untouched.
const entryId = Number(wpEval(
  'wp_set_current_user(' + operatorId + ');' +
  '$id=GFAPI::add_entry(array("form_id"=>' + formId + ',"created_by"=>' + operatorId +
  ',"1"=>"PRINT-BLOCKSY","2"=>"Synthetic","3"=>"Print","4"=>"PRINT-BLOCKSY-WITNESS"));' +
  'if(is_wp_error($id)||!$id)throw new RuntimeException("Cannot create synthetic Print entry");' +
  '$api=new Gravity_Flow_API(' + formId + ');$api->process_workflow((int)$id);' +
  '$entry=GFAPI::get_entry((int)$id);$sent=$api->send_to_step($entry,' + Number(manifest.steps.review_id) + ');' +
  'if(false===$sent||is_wp_error($sent))throw new RuntimeException("Cannot seed native Review");' +
  'echo (int)$id;'
));
if (!Number.isInteger(entryId) || entryId < 1) throw new Error('Native entry seeding did not return an entry ID.');
const protectedWitness = wpEval(
  '$entry=GFAPI::get_entry(' + entryId + ');' +
  'if(is_wp_error($entry))throw new RuntimeException("Missing entry");echo (string)rgar($entry,"4");'
);
if (protectedWitness !== 'PRINT-BLOCKSY-WITNESS') throw new Error('Selected entry protected witness mismatch.');

const expectedIds = ['BLOCKSY-FRONTEND-PRINT-AUTHORIZED', 'BLOCKSY-FRONTEND-PRINT-UNASSIGNED-DENIED'];
const results = [];
const errors = [];
function assert(condition, message) { if (!condition) throw new Error(message); }
async function test(id, fn) {
  try { results.push({ id, status: 'PASS', details: await fn() }); }
  catch (error) { results.push({ id, status: 'FAIL', error: String(error?.stack || error).slice(0, 12000) }); }
}
async function auth(context, userId) {
  const cookies = JSON.parse(wpEval(
    '$expiry=time()+3600;echo wp_json_encode(array(' +
    'array("name"=>AUTH_COOKIE,"value"=>wp_generate_auth_cookie(' + userId + ',$expiry,"auth"),"expires"=>$expiry),' +
    'array("name"=>LOGGED_IN_COOKIE,"value"=>wp_generate_auth_cookie(' + userId + ',$expiry,"logged_in"),"expires"=>$expiry)));'
  ));
  await context.addCookies(cookies.map(cookie => ({
    name: cookie.name, value: cookie.value, domain: '127.0.0.1', path: '/',
    expires: Number(cookie.expires), httpOnly: true, secure: false, sameSite: 'Lax',
  })));
}
async function proveIdentity(page, expectedLogin) {
  const url = new URL('/wp-admin/profile.php', inboxUrl).href;
  const response = await page.goto(url, { waitUntil: 'networkidle' });
  const login = await page.locator('#user_login').inputValue();
  assert(response?.status() === 200 && new URL(page.url()).pathname === '/wp-admin/profile.php' &&
    login === expectedLogin, 'Native WordPress session does not prove the independent user identity.');
  return login;
}
function nativePrintUrl(url) {
  const parsed = new URL(url);
  return parsed.pathname === '/wp-admin/admin-ajax.php' &&
    parsed.searchParams.get('action') === 'gravityflow_print_entries' &&
    parsed.searchParams.get('gpp_presentation') === 'dossier';
}
function matchedUrl(url, expected) {
  return nativePrintUrl(url) && new URL(url).href === new URL(expected).href;
}
function nativeTrace(html) {
  const match = html.match(/<script[^>]*class=["']gpp-print-decision-trace["'][^>]*>([\s\S]*?)<\/script>/i);
  return match ? JSON.parse(match[1]) : null;
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
context.setDefaultTimeout(12000);
context.setDefaultNavigationTimeout(20000);
// Suppress only the physical print-dialog side effect; preserve the real native
// dispatcher, iframe/popup navigation and actual HTTP/permission responses.
await context.addInitScript(() => {
  window.print = () => {
    if (window.parent !== window) {
      window.parent.postMessage({ gppBlocksyPrintFrame: location.href }, '*');
    }
  };
});
const page = await context.newPage();
page.on('pageerror', error => errors.push(String(error?.message || error).slice(0, 1000)));
await auth(context, operatorId);
const state = { printUrl: null, positivePassed: false };
await test(expectedIds[0], async () => {
  const login = await proveIdentity(page, manifest.users.operator.login);
  await page.goto(inboxUrl, { waitUntil: 'networkidle' });
  const row = page.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row[row-id="' + entryId + '"]');
  await row.waitFor({ state: 'visible', timeout: 30000 });
  const link = row.locator('.gflow-inbox__entry-cell-link').first();
  assert(await link.count() === 1, 'Selected native Inbox link unavailable.');
  await Promise.all([page.waitForURL(/view=entry/, { timeout: 30000 }), link.click()]);
  const current = new URL(page.url());
  assert(current.searchParams.get('lid') === String(entryId) &&
    current.searchParams.get('id') === String(formId), 'Native Inbox opened a different entry.');
  assert((await page.locator('body').innerText()).includes(protectedWitness),
    'Authorized frontend Detail did not expose the selected protected synthetic witness.');

  const button = page.locator('[data-gpp-print-utility="dossier"] [data-gpp-dossier-print-button]:visible');
  assert(await button.count() === 1, 'Exactly one authentic GPP Print button required on frontend Review.');
  const url = await button.getAttribute('data-gpp-dossier-print-url');
  assert(url && nativePrintUrl(url) && new URL(url).searchParams.get('lid') === String(entryId),
    'Rendered Print button does not bind to the selected native entry.');
  state.printUrl = new URL(url).href;

  // Transparent probes: invoke the original functions, never synthesize a
  // request, replace a response or force the native/fallback branch.
  const dispatchAvailable = await page.evaluate(() => {
    window.__blocksyPrintDispatch = { nativeCalls: [], fallbackCalls: [], iframePrints: [] };
    window.addEventListener('message', event => {
      if (event.data?.gppBlocksyPrintFrame) window.__blocksyPrintDispatch.iframePrints.push(String(event.data.gppBlocksyPrintFrame));
    });
    if (typeof window.printPage === 'function') {
      const original = window.printPage;
      window.printPage = function (...args) {
        window.__blocksyPrintDispatch.nativeCalls.push(args.map(String));
        return original.apply(this, args);
      };
    }
    const originalOpen = window.open;
    window.open = function (...args) {
      window.__blocksyPrintDispatch.fallbackCalls.push(args.map(String));
      return originalOpen.apply(this, args);
    };
    return typeof window.printPage === 'function';
  });
  await page.screenshot({ path: path.join(artifactDir, 'blocksy-frontend-print-before-click.png'), fullPage: true });
  const requests = [];
  const onRequest = request => {
    if (nativePrintUrl(request.url())) {
      requests.push({ url: request.url(), method: request.method(), resource_type: request.resourceType() });
    }
  };
  context.on('request', onRequest);
  let response;
  try {
    [response] = await Promise.all([
      context.waitForEvent('response', { predicate: r => matchedUrl(r.url(), state.printUrl), timeout: 30000 }),
      button.click(),
    ]);
  } finally {
    context.off('request', onRequest);
  }
  const html = await response.text();
  const trace = nativeTrace(html);
  assert(response.status() === 200 && /text\/html/i.test(response.headers()['content-type'] || ''),
    'Authentic native Print response was not successful HTML.');
  assert(requests.length === 1 && matchedUrl(requests[0].url, state.printUrl) &&
    requests[0].method === 'GET', 'Native request identity or cardinality drifted: ' + JSON.stringify(requests));
  assert(/class=["'][^"']*gpp-print-dossier\b/.test(html) &&
    /data-gpp-print-state=["']ready["']/.test(html), 'Authenticated native response did not contain a ready dossier.');
  assert(html.includes(protectedWitness), 'Real selected protected entry value absent from authorized Print response.');
  assert(Array.isArray(trace) && trace.some(x => x.stage === 'HOST_PRINT_CONTEXT_ADMITTED' &&
    x.outcome === 'post_permission_seam_reached') &&
    trace.some(x => x.stage === 'PRINT_COMPOSITION_READY' && x.outcome === 'ready_two_pages'),
    'Actual native Print response lacks the post-permission and two-page ready decision trace.');

  const observed = await page.evaluate(() => window.__blocksyPrintDispatch);
  const native = observed.nativeCalls.length === 1 && observed.fallbackCalls.length === 0;
  const fallback = observed.fallbackCalls.length === 1 && observed.nativeCalls.length === 0;
  assert(native !== fallback && (native === dispatchAvailable),
    'Real dispatch path disagrees with the available host capability: ' + JSON.stringify(observed));
  const call = native ? observed.nativeCalls[0] : observed.fallbackCalls[0];
  assert(call.length >= 1 && matchedUrl(call[0], state.printUrl),
    'Observed dispatcher did not receive the button-selected URL.');
  if (native) {
    await page.waitForFunction(expected =>
      [...document.querySelectorAll('iframe')].some(frame => {
        try { return new URL(frame.src).href === expected; } catch { return false; }
      }), state.printUrl, { timeout: 10000 });
  } else {
    assert(call[1] === '_blank' && call[2] === 'noopener',
      'Fallback was not the supported native-URL popup.');
  }
  state.positivePassed = true;
  return {
    entry_id: entryId, authenticated_as: login, selected_entry_verified: true,
    dispatch: native ? 'gravity_flow_printPage' : 'supported_window_open_fallback',
    print_page_available: dispatchAvailable, dispatched_native_request: requests[0],
    native_response_status: response.status(), print_state: 'ready',
    permission_trace: 'post_permission_seam_reached', composition_trace: 'ready_two_pages',
    protected_entry_witness_confirmed: true, native_iframe_observed: native,
  };
});

await test(expectedIds[1], async () => {
  assert(state.printUrl && nativePrintUrl(state.printUrl), 'Positive scenario did not capture the real Print target.');
  const viewer = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    await auth(viewer, deniedId);
    const target = await viewer.newPage();
    const login = await proveIdentity(target, manifest.users.negative_control.login);
    const response = await target.goto(state.printUrl, { waitUntil: 'networkidle' });
    assert(response && matchedUrl(response.url(), state.printUrl) &&
      response.request().method() === 'GET', 'Unassigned browser did not request the same native Print URL.');
    const html = await response.text();
    const visible = (await target.locator('body').innerText()).replace(/\s+/g, ' ');
    // Absence of a dossier alone is NOT a permission decision: require the
    // actual pinned Gravity Flow denial rendered by its Print boundary.
    assert(visible.includes("You don't have permission to view this entry."),
      'Pinned native Gravity Flow permission denial was not observed.');
    assert(!html.includes(protectedWitness) &&
      !/class=["'][^"']*gpp-print-dossier\b/.test(html) &&
      !html.includes('gpp-print-decision-trace'),
      'Protected dossier or post-permission GPP output leaked to the unassigned user.');
    await target.screenshot({ path: path.join(artifactDir, 'blocksy-frontend-print-unassigned-denied.png'), fullPage: true });
    return {
      entry_id: entryId, independently_authenticated_as: login, native_session_verified: true,
      same_print_request: true, native_response_status: response.status(),
      explicit_native_permission_denial: true, protected_entry_witness_absent: true,
      post_permission_gpp_renderer_absent: true,
    };
  } finally { await viewer.close(); }
});

await context.close();
await browser.close();
const data = {
  schema: 'BLOCKSY_FRONTEND_NATIVE_PRINT_V1', repository_head: head,
  runtime: manifest.runtime, theme: 'blocksy', theme_version: '2.1.59',
  selected_entry_id: entryId, expected_case_ids: expectedIds,
  results, page_errors: errors,
};
fs.mkdirSync(artifactDir, { recursive: true });
fs.writeFileSync(path.join(artifactDir, 'blocksy-frontend-native-print.json'), JSON.stringify(data, null, 2) + '\n');
const complete = results.length === expectedIds.length &&
  expectedIds.every(id => results.filter(x => x.id === id && x.status === 'PASS').length === 1) &&
  errors.length === 0 && state.positivePassed;
if (!complete) {
  console.error('BLOCKSY_FRONTEND_NATIVE_PRINT_FAIL ' + JSON.stringify({ results, errors }));
  process.exit(1);
}
console.log('BLOCKSY_FRONTEND_NATIVE_PRINT_PASS cases=' + results.length);
