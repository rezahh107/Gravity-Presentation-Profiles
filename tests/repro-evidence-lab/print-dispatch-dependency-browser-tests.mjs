import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const playwrightVersion = require('playwright/package.json').version;
const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
if (!artifactDir || !wpPath || !wpCli) throw new Error('WU12 Print dispatch qualification environment unavailable.');

function spawnChecked(command, args, options = {}) {
  const cp = spawnSync(command, args, { encoding: 'utf8', env: process.env, ...options });
  if (cp.status !== 0) throw new Error(`${command} failed: ${cp.stderr}\n${cp.stdout}`);
  return cp.stdout.trim();
}
function wpEval(code) {
  return spawnChecked('php', [wpCli, `--path=${wpPath}`, 'eval', code]);
}
function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(artifactDir, name), 'utf8'));
}
function sameHref(a, b) {
  return new URL(a, baseUrl).href === new URL(b, baseUrl).href;
}

const repoHead = spawnChecked('git', ['rev-parse', 'HEAD']);
const manifest = JSON.parse(wpEval('echo wp_json_encode(get_option("gpp_wu19_fixture_manifest"), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);'));
const item = manifest.alpha;
if (!item?.form_id || !item?.entry_id) throw new Error('WU19 alpha fixture unavailable.');
const entryUrl = `${baseUrl}/wp-admin/admin.php?page=gravityflow-inbox&view=entry&id=${item.form_id}&lid=${item.entry_id}`;
const expectedPrintUrl = `${baseUrl}/wp-admin/admin-ajax.php?action=gravityflow_print_entries&lid=${item.entry_id}&gpp_presentation=dossier`;
const buttonSelector = '[data-gpp-print-utility="dossier"] [data-gpp-dossier-print-button]';
const results = [];

function record(id, name, status, details = null) {
  results.push({ id, name, status, details });
}
async function test(id, name, fn) {
  try {
    record(id, name, 'PASS', await fn());
  } catch (error) {
    record(id, name, 'FAIL', { error: String(error?.stack || error).slice(0, 10000) });
  }
}
async function login(page) {
  await page.goto(`${baseUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', 'bootstrap_admin');
  await page.fill('#user_pass', ['wu21', 'bootstrap', 'pass', '2026'].join('-'));
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.click('#wp-submit'),
  ]);
}
async function newAuthenticatedPage(context) {
  const page = await context.newPage();
  await login(page);
  await page.goto(entryUrl, { waitUntil: 'networkidle' });
  const button = page.locator(buttonSelector);
  if (await button.count() !== 1) throw new Error('Authentic Entry Detail Print utility missing.');
  return page;
}
async function installFrameProbe(page, targetHref) {
  await page.evaluate(target => {
    const normalize = value => {
      try { return new URL(value, document.baseURI).href; } catch { return String(value || ''); }
    };
    const expected = normalize(target);
    const seenMatching = new WeakSet();
    window.__wu12FrameProbe = {
      expected,
      matchingAdded: 0,
      matchingLoads: 0,
      unrelatedAdded: 0,
      matchingSrcs: [],
    };
    function inspect(node) {
      if (!node || node.nodeType !== 1) return;
      const frames = node.tagName === 'IFRAME' ? [node] : [...(node.querySelectorAll?.('iframe') || [])];
      for (const iframe of frames) {
        const src = normalize(iframe.getAttribute('src') || iframe.src);
        if (src === expected) {
          if (seenMatching.has(iframe)) continue;
          seenMatching.add(iframe);
          window.__wu12FrameProbe.matchingAdded += 1;
          window.__wu12FrameProbe.matchingSrcs.push(src);
          iframe.addEventListener('load', () => { window.__wu12FrameProbe.matchingLoads += 1; }, { once: true });
        } else {
          window.__wu12FrameProbe.unrelatedAdded += 1;
        }
      }
    }
    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'attributes') inspect(record.target);
        for (const node of record.addedNodes || []) inspect(node);
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
    for (const iframe of document.querySelectorAll('iframe')) inspect(iframe);
    window.__wu12FrameProbeObserver = observer;
  }, targetHref);
}
function attachPrintRequestRecorder(page, targetHref) {
  const records = [];
  const handler = request => {
    try {
      const url = new URL(request.url());
      if (sameHref(url.href, targetHref)) {
        records.push({
          url: url.href,
          method: request.method(),
          action: url.searchParams.get('action'),
          lid: url.searchParams.get('lid'),
          presentation: url.searchParams.get('gpp_presentation'),
        });
      }
    } catch {}
  };
  page.on('request', handler);
  return { records, detach: () => page.off('request', handler) };
}
async function readClientSignals(page) {
  return page.evaluate(() => ({
    topPrintCalls: window.__wu12TopPrintCalls || 0,
    framePrintEvents: window.__wu12FramePrintEvents || [],
    frameProbe: window.__wu12FrameProbe || null,
  }));
}

const browser = await chromium.launch({ headless: true });
const chromiumVersion = browser.version();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addInitScript(() => {
  if (window === window.top) {
    window.__wu12TopPrintCalls = 0;
    window.__wu12FramePrintEvents = [];
    window.addEventListener('message', event => {
      if (event?.data?.wu12NativeFramePrint) {
        window.__wu12FramePrintEvents.push(String(event.data.href || ''));
      }
    });
  }
  window.print = function () {
    if (window === window.top) {
      window.__wu12TopPrintCalls = (window.__wu12TopPrintCalls || 0) + 1;
      return;
    }
    try {
      window.parent.postMessage({ wu12NativeFramePrint: true, href: window.location.href }, '*');
    } catch {}
  };
});

await test('WU12-DISPATCH-001', 'authentic pinned Entry Detail uses native printPage once with exact native Print identity and matching iframe handoff', async () => {
  const page = await newAuthenticatedPage(context);
  const button = page.locator(buttonSelector);
  const targetHref = new URL(expectedPrintUrl).href;
  const authenticState = await page.evaluate(() => ({
    printPageType: typeof window.printPage,
    printPageSourceLength: typeof window.printPage === 'function' ? Function.prototype.toString.call(window.printPage).length : 0,
  }));
  if (authenticState.printPageType !== 'function') throw new Error('Pinned authentic Entry Detail does not expose window.printPage.');

  await installFrameProbe(page, targetHref);
  await page.evaluate(() => {
    const original = window.printPage;
    window.__wu12NativeDispatches = [];
    window.printPage = function (...args) {
      window.__wu12NativeDispatches.push(args.map(value => String(value)));
      return original.apply(this, args);
    };
  });

  const requestRecorder = attachPrintRequestRecorder(page, targetHref);
  await page.route('**/admin-ajax.php?**', async route => {
    const url = new URL(route.request().url());
    if (sameHref(url.href, targetHref)) await new Promise(resolve => setTimeout(resolve, 700));
    await route.continue();
  });

  await button.click();
  await page.waitForFunction(selector => document.querySelector(selector)?.getAttribute('aria-busy') === 'true', buttonSelector);

  await page.evaluate(() => {
    const iframe = document.createElement('iframe');
    iframe.src = 'about:blank';
    iframe.dataset.wu12Unrelated = '1';
    document.body.appendChild(iframe);
  });
  await page.waitForTimeout(100);
  if (await button.getAttribute('aria-busy') !== 'true') throw new Error('Unrelated iframe mutation falsely released GPP Busy state.');

  await button.evaluate(el => el.click());
  await page.waitForTimeout(100);
  const dispatchesWhileBusy = await page.evaluate(() => window.__wu12NativeDispatches || []);
  if (dispatchesWhileBusy.length !== 1) throw new Error(`Duplicate activation changed native dispatch count: ${JSON.stringify(dispatchesWhileBusy)}`);

  await page.waitForFunction(selector => document.querySelector(selector)?.getAttribute('aria-busy') === 'false', buttonSelector, { timeout: 15000 });
  await page.waitForFunction(() => (window.__wu12FrameProbe?.matchingLoads || 0) >= 1, null, { timeout: 5000 });
  await page.waitForTimeout(100);

  const dispatches = await page.evaluate(() => window.__wu12NativeDispatches || []);
  const signals = await readClientSignals(page);
  requestRecorder.detach();
  await page.unroute('**/admin-ajax.php?**');

  if (dispatches.length !== 1 || dispatches[0].length < 1 || !sameHref(dispatches[0][0], targetHref)) {
    throw new Error(`Native printPage invocation identity mismatch: ${JSON.stringify(dispatches)}`);
  }
  if (requestRecorder.records.length !== 1) throw new Error(`Expected one native Print request, observed ${requestRecorder.records.length}.`);
  const request = requestRecorder.records[0];
  if (request.method !== 'GET' || request.action !== 'gravityflow_print_entries' || request.lid !== String(item.entry_id) || request.presentation !== 'dossier') {
    throw new Error(`Native request semantics changed: ${JSON.stringify(request)}`);
  }
  if (!signals.frameProbe || signals.frameProbe.matchingAdded < 1 || signals.frameProbe.matchingLoads < 1) {
    throw new Error(`Matching native Print iframe handoff not observed: ${JSON.stringify(signals.frameProbe)}`);
  }
  if (signals.topPrintCalls !== 0) throw new Error(`GPP parent independently invoked window.print(): ${signals.topPrintCalls}`);
  const matchingFramePrints = signals.framePrintEvents.filter(href => sameHref(href, targetHref));
  if (matchingFramePrints.length < 1) throw new Error(`Native iframe did not reach browser print handoff: ${JSON.stringify(signals.framePrintEvents)}`);

  await page.close();
  return {
    authentic_print_page_available: true,
    print_page_invocations: dispatches.length,
    print_page_argument: new URL(dispatches[0][0]).href,
    native_requests: requestRecorder.records,
    matching_iframes_created: signals.frameProbe.matchingAdded,
    matching_iframe_loads: signals.frameProbe.matchingLoads,
    unrelated_iframe_did_not_release_busy: true,
    duplicate_activation_blocked: true,
    native_frame_browser_print_handoffs: matchingFramePrints.length,
    parent_window_print_calls: signals.topPrintCalls,
    print_page_runtime_source_length: authenticState.printPageSourceLength,
  };
});

await test('WU12-DISPATCH-002', 'printPage-unavailable degraded state uses window.open once with the same URL and no parallel GPP Print machinery', async () => {
  const page = await newAuthenticatedPage(context);
  const button = page.locator(buttonSelector);
  const targetHref = new URL(expectedPrintUrl).href;
  await installFrameProbe(page, targetHref);
  const requestRecorder = attachPrintRequestRecorder(page, targetHref);

  await page.evaluate(() => {
    window.printPage = undefined;
    window.__wu12OpenCalls = [];
    window.open = function (...args) {
      window.__wu12OpenCalls.push(args.map(value => String(value)));
      return {};
    };
  });

  await button.evaluate(el => el.click());
  await page.waitForFunction(selector => document.querySelector(selector)?.getAttribute('aria-busy') === 'false', buttonSelector, { timeout: 2000 });
  await page.waitForTimeout(50);

  const calls = await page.evaluate(() => window.__wu12OpenCalls || []);
  const signals = await readClientSignals(page);
  requestRecorder.detach();

  if (calls.length !== 1) throw new Error(`Fallback window.open count mismatch: ${JSON.stringify(calls)}`);
  if (!sameHref(calls[0][0], targetHref) || calls[0][1] !== '_blank' || calls[0][2] !== 'noopener') {
    throw new Error(`Fallback invocation semantics changed: ${JSON.stringify(calls)}`);
  }
  if (requestRecorder.records.length !== 0) throw new Error('Stubbed fallback unexpectedly created a second parent-page native Print request.');
  if (signals.frameProbe?.matchingAdded !== 0 || signals.frameProbe?.matchingLoads !== 0) throw new Error(`Fallback created matching parent iframe machinery: ${JSON.stringify(signals.frameProbe)}`);
  if (signals.topPrintCalls !== 0 || signals.framePrintEvents.length !== 0) throw new Error(`Fallback independently invoked browser print: ${JSON.stringify(signals)}`);

  await page.close();
  return {
    state_origin: 'SYNTHETIC_DEGRADED_STATE_PRINT_PAGE_REMOVED',
    window_open_calls: calls.length,
    url_preserved: true,
    target: calls[0][1],
    features: calls[0][2],
    parent_native_requests_created_by_stubbed_fallback: requestRecorder.records.length,
    matching_parent_iframes_created: signals.frameProbe?.matchingAdded || 0,
    parent_window_print_calls: signals.topPrintCalls,
    native_frame_print_handoffs: signals.framePrintEvents.length,
    busy_released_without_claiming_print_success: true,
  };
});

await test('WU12-DISPATCH-003', 'native printPage exception releases Busy without fallback, retry, iframe handoff, or independent browser print', async () => {
  const page = await newAuthenticatedPage(context);
  const button = page.locator(buttonSelector);
  const targetHref = new URL(expectedPrintUrl).href;
  await installFrameProbe(page, targetHref);
  const requestRecorder = attachPrintRequestRecorder(page, targetHref);

  await page.evaluate(() => {
    window.__wu12ThrowDispatches = [];
    window.__wu12OpenCalls = [];
    window.__wu12BusyTransitions = [];
    const button = document.querySelector('[data-gpp-print-utility="dossier"] [data-gpp-dossier-print-button]');
    const observer = new MutationObserver(() => window.__wu12BusyTransitions.push(button.getAttribute('aria-busy')));
    observer.observe(button, { attributes: true, attributeFilter: ['aria-busy'] });
    window.__wu12BusyObserver = observer;
    window.printPage = function (url) {
      window.__wu12ThrowDispatches.push(String(url));
      throw new Error('WU12 synthetic native dispatch failure before iframe handoff');
    };
    window.open = function (...args) {
      window.__wu12OpenCalls.push(args.map(value => String(value)));
      return {};
    };
  });

  await button.evaluate(el => el.click());
  await page.waitForTimeout(50);
  const state = await page.evaluate(() => ({
    busy: document.querySelector('[data-gpp-print-utility="dossier"] [data-gpp-dossier-print-button]')?.getAttribute('aria-busy'),
    dispatches: window.__wu12ThrowDispatches || [],
    openCalls: window.__wu12OpenCalls || [],
    transitions: window.__wu12BusyTransitions || [],
  }));
  const signals = await readClientSignals(page);
  requestRecorder.detach();

  if (state.dispatches.length !== 1 || !sameHref(state.dispatches[0], targetHref)) throw new Error(`Exception-path native dispatch mismatch: ${JSON.stringify(state.dispatches)}`);
  if (!state.transitions.includes('true') || state.busy !== 'false') throw new Error(`Exception path did not visibly enter then release Busy: ${JSON.stringify(state)}`);
  if (state.openCalls.length !== 0) throw new Error(`Exception path silently fell back to window.open: ${JSON.stringify(state.openCalls)}`);
  if (requestRecorder.records.length !== 0) throw new Error(`Throw-before-handoff created native requests: ${JSON.stringify(requestRecorder.records)}`);
  if (signals.frameProbe?.matchingAdded !== 0 || signals.frameProbe?.matchingLoads !== 0) throw new Error(`Throw-before-handoff created matching iframe lifecycle: ${JSON.stringify(signals.frameProbe)}`);
  if (signals.topPrintCalls !== 0 || signals.framePrintEvents.length !== 0) throw new Error(`Exception path independently invoked browser print: ${JSON.stringify(signals)}`);

  await page.close();
  return {
    state_origin: 'SYNTHETIC_THROW_FROM_PRESENT_PRINT_PAGE',
    native_dispatch_attempts: state.dispatches.length,
    exact_url_preserved: true,
    busy_entered: true,
    busy_released: true,
    fallback_calls: state.openCalls.length,
    native_requests_after_throw: requestRecorder.records.length,
    matching_iframes_after_throw: signals.frameProbe?.matchingAdded || 0,
    parent_window_print_calls: signals.topPrintCalls,
    native_frame_print_handoffs: signals.framePrintEvents.length,
    auto_retry: false,
  };
});

await browser.close();

const browserResult = {
  suite: 'GPP WU12 Print dispatch dependency qualification browser',
  repository_head: repoHead,
  runtime: {
    node: process.version,
    playwright: playwrightVersion,
    chromium: chromiumVersion,
  },
  expected_native_print_url: new URL(expectedPrintUrl).href,
  results,
};
fs.writeFileSync(path.join(artifactDir, 'print-dispatch-dependency-browser-results.json'), JSON.stringify(browserResult, null, 2) + '\n');

const failed = results.filter(result => result.status === 'FAIL');
if (failed.length) {
  console.error(JSON.stringify({ failed }, null, 2));
  process.exit(1);
}

const hostSeam = readJson('gravityflow-print-host-seam.json');
const existingUx = readJson('print-utility-ux-browser-results.json');
const wu19 = readJson('wu19-browser-results.json');
const byId = (suite, id) => suite.results?.find(result => result.id === id);
const nativeResult = byId(browserResult, 'WU12-DISPATCH-001');
const fallbackResult = byId(browserResult, 'WU12-DISPATCH-002');
const exceptionResult = byId(browserResult, 'WU12-DISPATCH-003');
const timeoutResult = byId(existingUx, 'PRINT-UTILITY-UX-005');
const authResult = byId(wu19, 'WU19-BROWSER-005');

const hardGates = {
  exact_repo_head_captured: /^[0-9a-f]{40}$/.test(repoHead),
  pinned_host_seam_source_observed: Object.values(hostSeam.hard_gates || {}).every(Boolean),
  authentic_print_page_available_and_invoked_once: nativeResult?.status === 'PASS' && nativeResult.details?.print_page_invocations === 1,
  exact_native_request_identity_preserved: nativeResult?.status === 'PASS' && nativeResult.details?.native_requests?.length === 1,
  matching_iframe_creation_and_load_observed: nativeResult?.status === 'PASS' && nativeResult.details?.matching_iframes_created >= 1 && nativeResult.details?.matching_iframe_loads >= 1,
  unrelated_iframe_does_not_release_busy: nativeResult?.status === 'PASS' && nativeResult.details?.unrelated_iframe_did_not_release_busy === true,
  duplicate_activation_guarded: nativeResult?.status === 'PASS' && nativeResult.details?.duplicate_activation_blocked === true,
  native_iframe_reaches_browser_print_handoff: nativeResult?.status === 'PASS' && nativeResult.details?.native_frame_browser_print_handoffs >= 1,
  gpp_parent_does_not_call_window_print: nativeResult?.status === 'PASS' && nativeResult.details?.parent_window_print_calls === 0,
  fallback_same_url_single_dispatch: fallbackResult?.status === 'PASS' && fallbackResult.details?.window_open_calls === 1 && fallbackResult.details?.url_preserved === true,
  fallback_has_no_parallel_iframe_or_browser_print_state_machine: fallbackResult?.status === 'PASS' && fallbackResult.details?.matching_parent_iframes_created === 0 && fallbackResult.details?.parent_window_print_calls === 0,
  native_exception_releases_without_fallback_or_retry: exceptionResult?.status === 'PASS' && exceptionResult.details?.busy_released === true && exceptionResult.details?.fallback_calls === 0 && exceptionResult.details?.auto_retry === false,
  bounded_timeout_recovery_without_retry: timeoutResult?.status === 'PASS' && timeoutResult.details?.auto_retry === false,
  native_authorization_rechecked_on_print_request: authResult?.status === 'PASS' && authResult.details?.fresh_print_denied === true && authResult.details?.gpp_composer_executed === false,
};

const qualification = {
  schema: 'GPP_WU12_PRINT_DISPATCH_QUALIFICATION_V1',
  objective: 'Qualify which existing Gravity Flow Print dispatch dependencies are required versus compatibility fallbacks for the exact pinned supported runtime.',
  evidence_ceiling: 'QUALIFIED_FOR_PINNED_RUNTIME',
  repository: {
    full_name: 'rezahh107/Gravity-Presentation-Profiles',
    head: repoHead,
  },
  runtime: {
    ...hostSeam.runtime,
    node: process.version,
    playwright: playwrightVersion,
    chromium: chromiumVersion,
  },
  host_seam: hostSeam.host_seam,
  observed_paths: {
    native_print_page: nativeResult,
    print_page_unavailable_fallback: fallbackResult,
    print_page_exception: exceptionResult,
    bounded_timeout_recovery: timeoutResult,
    authorization_recheck: authResult,
  },
  hard_gates: hardGates,
  hard_gate_result: Object.values(hardGates).every(Boolean) ? 'PASS' : 'FAIL',
  classifications: {
    native_print_page: {
      classification: 'REQUIRED_FOR_PINNED_RUNTIME',
      basis: 'Authentic pinned Entry Detail exposes printPage; GPP invokes it exactly once with the exact native Gravity Flow Print URL, and that call produces the native request/iframe handoff.',
    },
    matching_iframe_lifecycle: {
      classification: 'REQUIRED_FOR_PINNED_RUNTIME',
      basis: 'The authentic native path creates and loads a matching Print iframe that reaches the browser print handoff; GPP releases Busy only on the matching iframe lifecycle or bounded recovery, while unrelated iframe mutations do not release it.',
    },
    window_open_fallback: {
      classification: 'COMPATIBILITY_FALLBACK_NOT_EXERCISED_IN_PINNED_RUNTIME',
      basis: 'Authentic pinned Entry Detail has printPage, so the fallback branch is not naturally selected. When printPage is deliberately removed, the fallback opens the same native URL once and adds no parallel GPP endpoint, iframe lifecycle, or browser-print state machine.',
    },
    print_page_exception_recovery: {
      classification: 'REQUIRED_FOR_FAILURE_RECOVERY',
      basis: 'An injected throw from a present printPage before native handoff releases GPP Busy without retrying, falling back, creating a Print request/iframe, or pretending browser Print occurred.',
    },
    bounded_recovery_timeout: {
      classification: 'REQUIRED_FOR_FAILURE_RECOVERY',
      basis: 'The existing browser suite proves a native dispatch with no iframe handoff unlocks after the bounded timeout with no automatic retry.',
    },
    removable_path: {
      classification: 'NOT_PROVEN',
      any_current_path_proven_redundant: false,
      basis: 'Pinned-runtime evidence proves the native path and iframe lifecycle are active dependencies; absence of authentic fallback use in this one runtime does not establish compatibility safety for removing the fallback.',
    },
  },
  production_follow_up: {
    recommendation: 'KEEP_AND_QUALIFY',
    code_change_recommended: false,
    rationale: 'No current dispatch path is proven redundant at the evidence ceiling. No production simplification is justified by this qualification alone.',
  },
  not_proven: [
    'The browser/system Print dialog completing or a physical printer producing output; automation stops at the strongest machine-observable iframe-to-window.print handoff boundary.',
    'Target-production environment equivalence to this disposable pinned CI runtime.',
    'Behavior of Gravity Flow versions other than the exact pinned 3.1.0 package identity recorded here.',
    'A naturally occurring printPage-unavailable state on the pinned authentic Entry Detail runtime; fallback behavior is qualified through a deliberate degraded-state injection.',
    'A naturally occurring printPage exception in the pinned runtime; exception recovery is qualified through a deliberate throw-before-handoff injection.',
    'Compatibility safety of deleting window.open or any failure-recovery path.',
  ],
};

if (qualification.hard_gate_result !== 'PASS') {
  console.error(JSON.stringify({ hard_gates: hardGates }, null, 2));
  process.exit(1);
}
fs.writeFileSync(path.join(artifactDir, 'print-dispatch-dependency-qualification.json'), JSON.stringify(qualification, null, 2) + '\n');
console.log('PRINT_DISPATCH_DEPENDENCY_QUALIFICATION_PASS');
