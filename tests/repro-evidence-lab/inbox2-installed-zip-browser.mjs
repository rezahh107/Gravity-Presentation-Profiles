import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';
import {independentBrowser,context as nativeContext,tab,transition,holdReadResponses,
  inboxView,selectSecondPage,poll} from './p1c-native-browser.mjs';
import {retainedWhilePending} from './p1c-lifecycle-oracle.mjs';

const env = process.env;
const fixture = JSON.parse(fs.readFileSync(path.join(env.WU21_ARTIFACT_DIR, 'gpp-inbox2-installed-fixture.json'), 'utf8'));
const checks = [];
function wp(code) {
  const result = spawnSync('php', [env.WU21_WP_CLI, '--path=' + env.WU21_WP_PATH, 'eval', code],
    {env, encoding: 'utf8', timeout: 90000});
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}
function cookies(id) {
  const code = "$u=get_user_by('id'," + id + ");$e=time()+3600;echo wp_json_encode([['name'=>AUTH_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'auth')],['name'=>LOGGED_IN_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'logged_in')]]);";
  return JSON.parse(wp(code)).map(x => ({...x, url: env.WU21_BASE_URL}));
}
const ids = async page => page.locator('[data-ciq2-entry]').evaluateAll(nodes =>
  nodes.map(node => Number(node.dataset.ciq2Entry)));
const visible = async page => page.locator('[data-ciq2-entry]').evaluateAll(nodes =>
  nodes.filter(node => !node.hidden).map(node => Number(node.dataset.ciq2Entry)));
const browser = await chromium.launch({headless: true});
const report = {status: 'FAIL', fixtureVersion: fixture.version, installedVersion: null, checks};
const errors = [], assets = [], failedRequests = [];
try {
  const context = await browser.newContext({viewport: {width: 390, height: 844}});
  const probeUrl = new URL(env.GPP_INBOX2_HTTP_PROBE_URL);
  assert.equal(probeUrl.origin, env.WU21_BASE_URL);
  const probeResponse = await context.request.get(probeUrl.href, {maxRedirects: 0, timeout: 10000});
  assert.equal(probeResponse.status(), 200);
  const observedHttp = await probeResponse.json();
  const validatedHttp = JSON.parse(fs.readFileSync(path.join(env.WU21_ARTIFACT_DIR, 'gpp-inbox2-http-before-browser.json'), 'utf8'));
  assert.deepEqual(observedHttp, validatedHttp, 'browser HTTP identity differs from independently validated listener');
  assert.equal(observedHttp.pid, Number(env.GPP_INBOX2_HTTP_LISTENER_PID));
  assert.equal(observedHttp.addon_version, env.GPP_INBOX2_EXPECTED_VERSION);
  report.installedVersion = observedHttp.addon_version;
  report.httpRuntime = observedHttp;
  checks.push('independent_browser_context_http_runtime_identity');
  await context.addCookies(cookies(fixture.operator_id));
  const page = await context.newPage();
  // Test-only observer starts before the real footer bundle is evaluated.
  // It captures state transitions, not synthetic DOM events or replacement product logic.
  await page.addInitScript(() => {
    window.__ciq2InitTrace = [];
    let last = '';
    const trace = reason => {
      const root = document.querySelector('[data-ciq2-root]');
      if (!root || window.__ciq2InitTrace.length >= 65) return;
      const nodes = [...root.querySelectorAll('[data-ciq2-entry]')];
      const observation = {
        reason, at_ms: Math.round(performance.now()),
        state: root.dataset.ciq2State,
        core_present: typeof window.GPPInbox2?.initAll === 'function',
        cards: nodes.length, hidden: nodes.filter(n => n.hidden).length
      };
      const fingerprint = [observation.state, observation.core_present,
        observation.cards, observation.hidden].join('/');
      if (fingerprint !== last) { last = fingerprint; window.__ciq2InitTrace.push(observation); }
    };
    const observer = new MutationObserver(() => trace('dom_mutation'));
    observer.observe(document, {subtree:true, childList:true, attributes:true,
      attributeFilter:['hidden','data-ciq2-state']});
    document.addEventListener('DOMContentLoaded', () => trace('dom_content_loaded'), {once:true});
  });
  page.on('requestfailed', request => failedRequests.push({
    url: request.url().replace(/\?.*$/, ''), failure: request.failure()?.errorText ?? null
  }));
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.url().includes('/gpp-inbox2.')) assets.push({url: response.url(), status: response.status()});
  });
  const response = await page.goto(fixture.url, {waitUntil: 'networkidle'});
  assert.equal(response.status(), 200);
  assert.equal(new URL(response.url()).origin, env.WU21_BASE_URL);
  assert.match(response.headers()['cache-control'] || '', /\bno-store\b/i);
  checks.push('personalized_shortcode_page_has_no_store_response_header');
  assert.equal(await page.locator('[data-ciq2-root][data-ciq2-state="current"]').count(), 1);
  const received = await ids(page);
  const expected = fixture.expected_native_ids;
  assert.deepEqual([...received].sort((a,b)=>a-b), expected);
  assert.equal(new Set(received).size, received.length);
  // Persist the exact observed boundary BEFORE the 20/5 rejecting assertion.
  // Server-rendered "current" is not accepted as evidence of JS draw().
  report.initial_observation = await page.evaluate(() => {
    const root = document.querySelector('[data-ciq2-root]');
    const cards = [...root.querySelectorAll('[data-ciq2-entry]')];
    return {
      ready_state: document.readyState, root_state: root.dataset.ciq2State,
      core_present: typeof window.GPPInbox2?.initAll === 'function',
      scripts: [...document.scripts].map(s => s.src).filter(s => /gpp-inbox2/.test(s)),
      cards: cards.length, hidden_ids: cards.filter(n => n.hidden).map(n => n.dataset.ciq2Entry),
      shown_ids: cards.filter(n => !n.hidden).map(n => n.dataset.ciq2Entry),
      computed_visible: cards.filter(n => getComputedStyle(n).display !== 'none').length,
      init_trace: window.__ciq2InitTrace ?? []
    };
  });
  report.asset_responses = assets;
  report.failed_requests = failedRequests;
  report.page_errors = errors;
  console.log('GPP_INBOX2_PREASSERT_DIAGNOSTICS ' + JSON.stringify({
    head: env.GPP_WU21_REPOSITORY_SHA || null,
    version: fixture.version, observation: report.initial_observation,
    asset_responses: assets, failed_requests: failedRequests, page_errors: errors
  }));
  assert.equal((await visible(page)).length, Math.min(20, received.length));
  assert.ok(assets.some(x => x.url.includes('gpp-inbox2.js') && x.status === 200));
  assert.ok(assets.some(x => x.url.includes('gpp-inbox2.css') && x.status === 200));
  checks.push('real_installed_zip_with_native_authorized_task_identity_and_assets');
  // An authentic 25-task *single-form* Native Inbox must paginate 20/5,
  // preserve server FIFO order, and reset to page one when searching.
  assert.ok(Array.isArray(fixture.expected_fifo_ids) && fixture.expected_fifo_ids.length >= 25);
  assert.deepEqual(received, fixture.expected_fifo_ids, 'initial server FIFO differs from Native chronology');
  assert.deepEqual(await visible(page), fixture.expected_fifo_ids.slice(0, 20));
  await page.locator('[data-ciq2-next]').click();
  assert.deepEqual(await visible(page), fixture.expected_fifo_ids.slice(20, 40));
  assert.match(await page.locator('[data-ciq2-pager] [data-ciq2-page]').innerText(), /۲ از ۲/);
  await page.locator('[data-ciq2-search]').fill('Paging 24');
  assert.equal((await visible(page)).length, 1);
  assert.match(await page.locator('[data-ciq2-pager] [data-ciq2-page]').innerText(), /۱ از ۱/);
  await page.locator('[data-ciq2-search]').fill('');
  assert.deepEqual(await visible(page), fixture.expected_fifo_ids.slice(0, 20));
  checks.push('installed_zip_25_authorized_single_form_fifo_pagination_and_search_reset');

  const visibilityRecords=[];
  const recordVisibility=(name,status,details)=>visibilityRecords.push({name,status,...details});
  await independentBrowser(recordVisibility,async({cdp,neutral,visibility})=>{
    assert.ok(visibility,'NATIVE_SHORTCODE_VISIBILITY_UNPROVEN');
    await nativeContext(cdp,async id=>{
      const other=await tab(cdp,id);await other.activate();await other.navigate(neutral+'/away');
      const shortcode=await tab(cdp,id);await shortcode.activate();
      for(const cookie of cookies(fixture.operator_id)){
        assert.equal((await shortcode.send('Network.setCookie',cookie)).success,true);
      }
      await shortcode.navigate(fixture.url);
      await selectSecondPage(shortcode,fixture.form_id,'SYN-');
      const before=await inboxView(shortcode,fixture.form_id);
      assert.deepEqual(before.entries,fixture.expected_fifo_ids);
      const hidden=await transition(shortcode,other.activate,'hidden');
      const hiddenView=await inboxView(shortcode,fixture.form_id);
      assert.deepEqual(hiddenView.entries,before.entries,'SHORTCODE_HIDDEN_VERIFIED_VIEW_LOST');

      const changed=before.entries[0];
      assert.ok(Number.isSafeInteger(changed)&&changed>0);
      const setStatus=status=>wp('if (!GFAPI::update_entry_property('+changed+',"status","'+status+'") || '+
        'GFAPI::get_entry('+changed+')["status"]!=="'+status+'") throw new RuntimeException("SHORTCODE_FIXTURE_STATUS");');
      assert.ok(Number.isSafeInteger(fixture.operator_id)&&Number.isSafeInteger(fixture.form_id));
      try{
        setStatus('trash');
        const native=JSON.parse(wp('wp_set_current_user('+fixture.operator_id+');'+
          '$args=apply_filters("gravityflow_inbox_args",array_merge(Gravity_Flow_Inbox::get_defaults(),'+
          '["form_id"=>'+fixture.form_id+',"paging"=>["offset"=>0,"page_size"=>2001]]));'+
          '$total=0;$entries=Gravity_Flow_API::get_inbox_entries($args,$total);'+
          'if(!is_array($entries)||$total!==count($entries))throw new RuntimeException("SHORTCODE_NATIVE_ORACLE");'+
          '$ids=array_map("intval",array_column($entries,"id"));sort($ids,SORT_NUMERIC);echo wp_json_encode($ids);'));
        assert.deepEqual(native,fixture.expected_native_ids.filter(entry=>entry!==changed));
        const hold=await holdReadResponses(cdp,shortcode,env.WU21_BASE_URL);
        let shown,pending,responses;
        try{
          shown=await transition(shortcode,shortcode.activate,'visible');
          assert.equal(shown.doc,hidden.doc);
          responses=await hold.responses(1);
          pending=await inboxView(shortcode,fixture.form_id);
          assert.ok(retainedWhilePending(before,pending,responses,String(fixture.form_id)),
            'SHORTCODE_PENDING_VERIFIED_VIEW_LOST');
        }finally{await hold.release();}
        const after=await poll('SHORTCODE_RECONCILIATION_UNPROVEN',async()=>{
          const view=await inboxView(shortcode,fixture.form_id);
          return view?.state==='current'?view:null;
        });
        assert.deepEqual([...after.entries].sort((a,b)=>a-b),native);
        assert.equal(after.query,before.query);assert.equal(after.page,before.page);assert.equal(after.focus,before.focus);
        // Observe the actual departure handler after GPP's capture has run.
        await shortcode.evaluate(`window.addEventListener('pagehide',event=>{
          const root=document.querySelector('[data-ciq2-root]');
          sessionStorage.setItem('gpp-wu21-pagehide',JSON.stringify({trusted:event.isTrusted,
            state:root.dataset.ciq2State,cards:root.querySelectorAll('[data-ciq2-entry]').length}));
        })`);
        await shortcode.navigate(env.WU21_BASE_URL+'/wp-login.php',true);
        const departure=await shortcode.evaluate(`(()=>{
          const result=JSON.parse(sessionStorage.getItem('gpp-wu21-pagehide'));
          sessionStorage.removeItem('gpp-wu21-pagehide');return result;
        })()`);
        assert.deepEqual(departure,{trusted:true,state:'stale',cards:0});
        report.ordinary_visibility={hidden,shown,before,pending,responses,after,departure};
      }finally{setStatus('active');}
    });
  });
  report.ordinary_visibility.browser=visibilityRecords.find(record=>record.name==='INDEPENDENT_BROWSER_IDENTITY');
  checks.push('genuine_shortcode_tab_return_retains_verified_view_and_reconciles_native_change');

  // Independently read the pinned Native Task Model at setup; compare every
  // final permitted text cell against the actual installed shortcode DOM.
  const actualCells = await page.locator('[data-ciq2-entry]').evaluateAll(nodes =>
    Object.fromEntries(nodes.map(node => [
      node.dataset.ciq2Entry,
      {
        student_name: node.querySelector('[data-ciq2-name]').textContent.trim(),
        national_id: node.querySelector('[data-ciq2-national-id]').textContent.trim(),
        school_grade: node.querySelector('[data-ciq2-school-grade]').textContent.trim()
      }
    ])));
  for (const [id, cells] of Object.entries(fixture.expected_final_cells)) {
    assert.deepEqual(actualCells[id], {
      student_name: cells.student_name.trim(),
      national_id: cells.national_id.trim(),
      school_grade: cells.school_grade.trim()
    }, 'final Native Task Model cells diverged on entry ' + id);
  }
  assert.equal(Object.keys(actualCells).length, Object.keys(fixture.expected_final_cells).length);
  checks.push('installed_shortcode_exact_final_native_task_model_cell_parity');

  // The installed shortcode must retain focus on the SAME authorized case
  // when a server-confirmed redraw replaces the old element.
  const focusedId = await page.locator('[data-ciq2-entry]').first().getAttribute('data-ciq2-entry');
  await page.locator('[data-ciq2-detail]').first().focus();
  await page.evaluate(() => document.querySelector('[data-ciq2-refresh]').closest('form').requestSubmit());
  await page.waitForFunction(() => document.querySelector('[data-ciq2-root]')?.dataset.ciq2State === 'current');
  assert.equal(await page.evaluate(() =>
    document.activeElement.closest('[data-ciq2-entry]')?.dataset.ciq2Entry), focusedId);
  checks.push('same_entry_keyboard_focus_survives_authoritative_refresh');

  // Two independently rendered PHP shortcodes on the same authenticated page:
  // IDs/labels, search, controls, and requested data remain per instance.
  const multi = await context.newPage();
  const multiResponse = await multi.goto(fixture.multi_url, {waitUntil:'networkidle'});
  assert.equal(multiResponse.status(), 200);
  assert.match(multiResponse.headers()['cache-control'] || '', /\bno-store\b/i);
  const roots = multi.locator('[data-ciq2-root]');
  assert.equal(await roots.count(), 2);
  const headingIds = await roots.locator('h2').evaluateAll(nodes => nodes.map(node => node.id));
  const searchIds = await roots.locator('[data-ciq2-search]').evaluateAll(nodes => nodes.map(node => node.id));
  assert.equal(new Set(headingIds).size, 2);
  assert.equal(new Set(searchIds).size, 2);
  await roots.nth(0).locator('[data-ciq2-search]').fill('متن-ساختگی-بدون-تطابق-۹۹۹');
  assert.equal(await roots.nth(0).locator('[data-ciq2-entry]:visible').count(), 0);
  assert.ok((await roots.nth(1).locator('[data-ciq2-entry]:visible').count()) > 0);
  await roots.nth(0).locator('[data-ciq2-search]').fill('');
  checks.push('two_shortcode_instances_have_unique_ids_and_isolated_search');

  // Avoid a screen-reader status burst for each intermediate search keystroke.
  const announcements = await multi.evaluate(async () => {
    const root = document.querySelector('[data-ciq2-root]');
    const output = root.querySelector('[data-ciq2-announcement]');
    const search = root.querySelector('[data-ciq2-search]');
    let changes = 0;
    const observer = new MutationObserver(mutations => { changes += mutations.length; });
    observer.observe(output, {childList:true,characterData:true,subtree:true});
    for (const value of ['الف-یک', 'الف-دو', 'الف-سه']) {
      search.value = value;
      search.dispatchEvent(new Event('input', {bubbles:true}));
    }
    await new Promise(resolve => setTimeout(resolve, 500));
    observer.disconnect();
    search.value = '';
    search.dispatchEvent(new Event('input', {bubbles:true}));
    return changes;
  });
  assert.equal(announcements, 1, 'rapid search emitted repetitive live announcements');
  checks.push('debounced_accessible_search_status_announcements');


  // Dynamic Elementor-like insertion is NOT a widget qualification: no
  // personalized copied HTML may remain while the new root revalidates.
  let releaseRead;
  let signalHeld;
  const requestHeld = new Promise(resolve => { signalHeld = resolve; });
  const readGate = new Promise(resolve => { releaseRead = resolve; });
  await multi.route('**/admin-ajax.php', async route => {
    if (route.request().postData()?.includes('gpp_inbox2_read')) {
      signalHeld();
      await readGate;
    }
    await route.continue();
  });
  await multi.evaluate(() => {
    const clone = document.querySelector('[data-ciq2-root]').cloneNode(true);
    clone.querySelectorAll('[id]').forEach(node => { node.id += '-dynamic'; });
    clone.querySelectorAll('label[for]').forEach(node => { node.htmlFor += '-dynamic'; });
    document.body.appendChild(clone);
  });
  await requestHeld;
  assert.equal(await roots.count(), 3);
  assert.equal(await roots.nth(2).locator('[data-ciq2-entry]').count(), 0);
  assert.equal(await roots.nth(2).getAttribute('data-ciq2-state'), 'syncing');
  releaseRead();
  await multi.waitForFunction(() => {
    const candidate = [...document.querySelectorAll('[data-ciq2-root]')].at(-1);
    return candidate?.dataset.ciq2State === 'current' &&
      candidate.querySelectorAll('[data-ciq2-entry]').length > 0;
  });
  await multi.unroute('**/admin-ajax.php');
  await multi.evaluate(() => {
    window.GPPInbox2.initAll(document);
    window.GPPInbox2.initAll(document);
  });
  let refreshCalls = 0;
  multi.on('request', request => {
    if (request.url().includes('admin-ajax.php') &&
        request.postData()?.includes('gpp_inbox2_read')) refreshCalls++;
  });
  await roots.nth(2).locator('[data-ciq2-refresh]').click();
  await multi.waitForFunction(() =>
    [...document.querySelectorAll('[data-ciq2-root]')].at(-1)?.dataset.ciq2State === 'current');
  assert.equal(refreshCalls, 1, 'repeated initialization duplicated refresh listeners');
  await multi.evaluate(() => [...document.querySelectorAll('[data-ciq2-root]')].at(-1).remove());
  await multi.waitForFunction(() => document.querySelectorAll('[data-ciq2-root]').length === 2);
  checks.push('dynamic_instance_clears_old_cells_idempotent_init_and_removal');

  // Local test helper: copies only synthetic authorized cards in this
  // disposable browser host. Every inserted copy has distinct DOM IDs.
  await multi.evaluate(() => {
    let serial = 0;
    window.__ciq2SyntheticClone = () => {
      const clone = document.querySelector('[data-ciq2-root]').cloneNode(true);
      const suffix = '-copy-' + (++serial);
      clone.querySelectorAll('[id]').forEach(el => { el.id += suffix; });
      clone.querySelectorAll('label[for]').forEach(el => { el.htmlFor += suffix; });
      const labelled = clone.getAttribute('aria-labelledby');
      if (labelled) clone.setAttribute('aria-labelledby', labelled + suffix);
      return clone;
    };
  });

  // T1/T2: call public initAll synchronously before observer delivery.
  // A mixed authorized+copied-stale list must be blank before any AJAX reply.
  let allowT1, seenT1;
  const t1Request = new Promise(resolve => { seenT1 = resolve; });
  const t1Gate = new Promise(resolve => { allowT1 = resolve; });
  const t1Route = async route => {
    if (route.request().postData()?.includes('gpp_inbox2_read')) {
      seenT1();
      await t1Gate;
    }
    await route.continue();
  };
  await multi.route('**/admin-ajax.php', t1Route);
  const t1 = await multi.evaluate(() => {
    const clone = window.__ciq2SyntheticClone();
    const copied = clone.querySelector('[data-ciq2-entry]').cloneNode(true);
    copied.dataset.ciq2Entry = '999999';
    copied.querySelector('[data-ciq2-name]').textContent = 'SYNTHETIC-COPIED-STALE';
    clone.querySelector('[data-ciq2-list]').appendChild(copied);
    document.body.appendChild(clone);
    window.GPPInbox2.initAll(document); // same JS task; observer not delivered
    return {
      state:clone.dataset.ciq2State,
      cards:clone.querySelectorAll('[data-ciq2-entry]').length,
      hasOld:clone.textContent.includes('SYNTHETIC-COPIED-STALE')
    };
  });
  assert.equal(t1.state, 'syncing');
  assert.equal(t1.cards, 0);
  assert.equal(t1.hasOld, false);
  await t1Request;
  assert.equal(await roots.last().locator('[data-ciq2-entry]').count(), 0);
  allowT1();
  await multi.waitForFunction(() =>
    [...document.querySelectorAll('[data-ciq2-root]')].at(-1)?.dataset.ciq2State === 'current');
  assert.equal(await roots.last().locator('[data-ciq2-entry]').count(), fixture.expected_count);
  await multi.unroute('**/admin-ajax.php', t1Route);
  await multi.evaluate(() => [...document.querySelectorAll('[data-ciq2-root]')].at(-1).remove());
  checks.push('T1_T2_public_init_clears_mixed_stale_copied_cards_pre_observer');

  // T4: loading the same script twice must never re-enable trusted hydration.
  const exactScript = fs.readFileSync(path.resolve('assets/js/gpp-inbox2.js'), 'utf8');
  const t4 = await multi.evaluate(script => {
    const clone = window.__ciq2SyntheticClone();
    document.body.appendChild(clone);
    (0, eval)(script);
    return {state:clone.dataset.ciq2State, count:clone.querySelectorAll('[data-ciq2-entry]').length};
  }, exactScript);
  assert.equal(t4.count, 0);
  assert.equal(t4.state, 'syncing');
  await multi.waitForFunction(() =>
    [...document.querySelectorAll('[data-ciq2-root]')].at(-1)?.dataset.ciq2State === 'current');
  await multi.evaluate(() => [...document.querySelectorAll('[data-ciq2-root]')].at(-1).remove());
  checks.push('T4_duplicate_script_cannot_trust_new_copied_root');

  // T5/T7: neither a narrow public mount nor a boolean passed from outside
  // grants initial-server authority.
  const t5 = await multi.evaluate(() => {
    const clone = window.__ciq2SyntheticClone();
    document.body.appendChild(clone);
    window.GPPInbox2.initAll(clone);
    return {state:clone.dataset.ciq2State, cards:clone.querySelectorAll('[data-ciq2-entry]').length};
  });
  assert.equal(t5.state, 'syncing'); assert.equal(t5.cards, 0);
  await multi.waitForFunction(() =>
    [...document.querySelectorAll('[data-ciq2-root]')].at(-1)?.dataset.ciq2State === 'current');
  await multi.evaluate(() => [...document.querySelectorAll('[data-ciq2-root]')].at(-1).remove());
  const t7 = await multi.evaluate(() => {
    const clone = window.__ciq2SyntheticClone();
    document.body.appendChild(clone);
    window.GPPInbox2.initAll(document, false);
    return {state:clone.dataset.ciq2State, cards:clone.querySelectorAll('[data-ciq2-entry]').length};
  });
  assert.equal(t7.state, 'syncing'); assert.equal(t7.cards, 0);
  await multi.waitForFunction(() =>
    [...document.querySelectorAll('[data-ciq2-root]')].at(-1)?.dataset.ciq2State === 'current');
  await multi.evaluate(() => [...document.querySelectorAll('[data-ciq2-root]')].at(-1).remove());
  checks.push('T5_T7_public_initialization_has_no_trust_override');

  // T9: malformed roots are sanitized even when missing an essential control.
  const t9 = await multi.evaluate(() => {
    const clone = window.__ciq2SyntheticClone();
    clone.querySelector('[data-ciq2-announcement]').remove();
    document.body.appendChild(clone);
    window.GPPInbox2.initAll(clone);
    return {state:clone.dataset.ciq2State, cards:clone.querySelectorAll('[data-ciq2-entry]').length,
      text:clone.textContent, alerts:clone.querySelectorAll('[role=alert]').length};
  });
  assert.equal(t9.state, 'stale'); assert.equal(t9.cards, 0); assert.equal(t9.alerts, 1);
  assert.doesNotMatch(t9.text, /WU21 Alpha|SYN-PAGING/);
  await multi.evaluate(() => [...document.querySelectorAll('[data-ciq2-root]')].at(-1).remove());
  checks.push('T9_malformed_root_fail_closed_without_old_cells');
  const malformedDuplicate = await multi.evaluate(() => {
    const clone = window.__ciq2SyntheticClone();
    clone.appendChild(clone.querySelector('[data-ciq2-list]').cloneNode(true));
    document.body.appendChild(clone);
    window.GPPInbox2.initAll(clone);
    return {state:clone.dataset.ciq2State, cards:clone.querySelectorAll('[data-ciq2-entry]').length,
      alerts:clone.querySelectorAll('[role=alert]').length};
  });
  assert.deepEqual(malformedDuplicate, {state:'stale', cards:0, alerts:1});
  await multi.evaluate(() => [...document.querySelectorAll('[data-ciq2-root]')].at(-1).remove());
  checks.push('T9_duplicate_list_malformed_root_fails_closed');

  // A tampered dynamic scope is rejected by the actual WordPress AJAX
  // admission check, with no pre-confirmation display in the browser.
  const wrongScope = await multi.evaluate(() => {
    const clone = window.__ciq2SyntheticClone();
    clone.dataset.ciq2Form = String(Number(clone.dataset.ciq2Form) + 99999);
    document.body.appendChild(clone);
    window.GPPInbox2.initAll(clone);
    return {state:clone.dataset.ciq2State, cards:clone.querySelectorAll('[data-ciq2-entry]').length};
  });
  assert.equal(wrongScope.state, 'syncing'); assert.equal(wrongScope.cards, 0);
  await multi.waitForFunction(() =>
    [...document.querySelectorAll('[data-ciq2-root]')].at(-1)?.dataset.ciq2State === 'stale');
  assert.equal(await roots.last().locator('[data-ciq2-entry]').count(), 0);
  await multi.evaluate(() => [...document.querySelectorAll('[data-ciq2-root]')].at(-1).remove());
  checks.push('dynamic_wrong_scope_cannot_display_copied_cards');

  // Pending response must never resurrect a destroyed/remounted instance.
  let releaseAbort, sawAbort;
  const abortSeen = new Promise(resolve => { sawAbort = resolve; });
  const abortGate = new Promise(resolve => { releaseAbort = resolve; });
  const abortRoute = async route => {
    if (route.request().postData()?.includes('gpp_inbox2_read')) {
      sawAbort();
      await abortGate;
    }
    try { await route.continue(); } catch (_) { /* Request aborted by the client. */ }
  };
  await multi.route('**/admin-ajax.php', abortRoute);
  const teardown = await multi.evaluate(() => {
    const root = window.__ciq2SyntheticClone();
    document.body.appendChild(root);
    window.GPPInbox2.initAll(root);
    window.__ciq2DisposedRoot = root;
    return {state:root.dataset.ciq2State, cards:root.querySelectorAll('[data-ciq2-entry]').length};
  });
  assert.equal(teardown.state, 'syncing'); assert.equal(teardown.cards, 0);
  await abortSeen;
  await multi.evaluate(() => {
    window.GPPInbox2.destroy(window.__ciq2DisposedRoot);
    window.__ciq2DisposedRoot.remove();
  });
  releaseAbort();
  await multi.unroute('**/admin-ajax.php', abortRoute);
  await multi.waitForTimeout(100);
  const afterAbort = await multi.evaluate(() => ({
    state:window.__ciq2DisposedRoot.dataset.ciq2State,
    cards:window.__ciq2DisposedRoot.querySelectorAll('[data-ciq2-entry]').length
  }));
  assert.equal(afterAbort.state, 'stale');
  assert.equal(afterAbort.cards, 0);
  checks.push('destroy_aborts_pending_read_without_resurrecting_old_cards');

  // T8/T10: in-place *host* edits of a mounted root are explicitly unsupported,
  // not claimed fail-closed. A supported rebind uses destroy + new root and
  // always begins with cleared cards. GPP's own draw() mutations are unchanged.
  const unsupported = await multi.evaluate(() => {
    const root = document.querySelector('[data-ciq2-root]');
    const originalScope = root.dataset.ciq2Form;
    const oldCount = root.querySelectorAll('[data-ciq2-entry]').length;
    const extra = root.querySelector('[data-ciq2-entry]').cloneNode(true);
    extra.dataset.ciq2Entry = '999998';
    root.querySelector('[data-ciq2-list]').appendChild(extra);
    root.dataset.ciq2Form = '999997';
    const snapshot = {state:root.dataset.ciq2State,
      cardCount:root.querySelectorAll('[data-ciq2-entry]').length,
      scope:root.dataset.ciq2Form};
    extra.remove();
    root.dataset.ciq2Form = originalScope;
    return {...snapshot, oldCount};
  });
  assert.equal(unsupported.state, 'current');
  assert.equal(unsupported.cardCount, unsupported.oldCount + 1);
  assert.equal(unsupported.scope, '999997');
  const t8t10 = await multi.evaluate(() => {
    const previous = document.querySelector('[data-ciq2-root]');
    const replacement = window.__ciq2SyntheticClone();
    window.GPPInbox2.destroy(previous);
    previous.replaceWith(replacement);
    window.GPPInbox2.initAll(replacement);
    return {state:replacement.dataset.ciq2State,
      cards:replacement.querySelectorAll('[data-ciq2-entry]').length};
  });
  assert.equal(t8t10.state, 'syncing'); assert.equal(t8t10.cards, 0);
  await multi.waitForFunction(() =>
    document.querySelector('[data-ciq2-root]')?.dataset.ciq2State === 'current');
  assert.equal(await roots.count(), 2);
  checks.push('T8_T10_unsupported_inplace_mutation_and_supported_replacement_revalidation');

  // Parent-constrained layout at desktop viewport: genuine CSS container query,
  // not only a narrow device-width media query.
  await multi.setViewportSize({width:1440,height:900});
  await multi.evaluate(() => {
    const parent = document.querySelector('[data-ciq2-root]').parentElement;
    parent.style.width = '390px';
    parent.style.maxWidth = '390px';
  });
  const columns = await roots.first().locator('[data-ciq2-entry]').first().evaluate(node =>
    getComputedStyle(node).gridTemplateColumns.trim().split(/\s+/).length);
  assert.equal(columns, 2, 'narrow parent did not stack the case row');
  checks.push('desktop_viewport_with_390px_parent_uses_mobile_card_columns');
  await multi.close();

  // A valid nonce for this page/form must not authorize a different target.
  const tamperResults = await page.evaluate(async () => {
    const root = document.querySelector('[data-ciq2-root]');
    const args = {
      action: 'gpp_inbox2_read', nonce: root.dataset.ciq2Nonce,
      page_id: root.dataset.ciq2Page, form_id: root.dataset.ciq2Form,
      native_page_id: root.dataset.ciq2NativePage
    };
    const outcomes = [];
    for (const property of ['form_id', 'native_page_id']) {
      const params = {...args, [property]: String(Number(args[property]) + 1)};
      const response = await fetch(root.dataset.ciq2Ajax, {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: {'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'},
        body: new URLSearchParams(params)
      });
      outcomes.push({status: response.status, payload: await response.json()});
    }
    return outcomes;
  });
  for (const check of tamperResults) {
    assert.equal(check.status, 403);
    assert.equal(check.payload.success, false);
    assert.equal(check.payload.data?.reason, 'authorization_required');
  }
  checks.push('forged_form_and_native_page_ajax_targets_rejected');

  const firstName = await page.locator('[data-ciq2-name]').first().innerText();
  assert.ok(firstName.trim().length > 0);
  assert.ok(await page.locator('[data-ciq2-national-id]').first().innerText());
  assert.ok(await page.locator('[data-ciq2-school-grade]').first().innerText());
  await page.locator('[data-ciq2-search]').fill(firstName);
  assert.ok((await visible(page)).length > 0);
  await page.locator('[data-ciq2-search]').fill('');
  checks.push('final_native_cells_and_bounded_local_search');

  const detail = await page.locator('a[data-ciq2-detail]').first().getAttribute('href');
  const native = new URL(detail);
  assert.equal(native.searchParams.get('page'), 'gravityflow-inbox');
  assert.equal(native.searchParams.get('view'), 'entry');
  assert.equal(Number(native.searchParams.get('id')), fixture.form_id);
  assert.ok(received.includes(Number(native.searchParams.get('lid'))));
  await Promise.all([page.waitForNavigation({waitUntil: 'domcontentloaded'}), page.locator('a[data-ciq2-detail]').first().click()]);
  assert.equal(new URL(page.url()).searchParams.get('view'), 'entry');
  await page.locator('.gravityflow_workflow_detail').waitFor({timeout: 15000});
  const detailText = await page.locator('.gravityflow_workflow_detail').innerText();
  assert.doesNotMatch(detailText, /You don't have permission to view this entry\./);
  checks.push('authentic_native_entry_detail_renderer_and_navigation');

  await page.goBack({waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => document.querySelector('[data-ciq2-root]')?.dataset.ciq2State === 'current');
  await page.locator('[data-ciq2-refresh]').click();
  await page.waitForFunction(() => document.querySelector('[data-ciq2-root]')?.dataset.ciq2State === 'current');
  assert.deepEqual([...await ids(page)].sort((a,b)=>a-b), expected);
  checks.push('manual_refresh_and_detail_return');

  await page.evaluate(() => document.querySelector('[data-ciq2-root]').dataset.ciq2Nonce = 'invalid');
  await page.locator('[data-ciq2-refresh]').click();
  await page.waitForFunction(() => document.querySelector('[data-ciq2-root]')?.dataset.ciq2State === 'stale');
  assert.deepEqual(await ids(page), []);
  checks.push('invalid_nonce_clears_stale_task_cards');

  await page.reload({waitUntil: 'networkidle'});
  assert.deepEqual([...await ids(page)].sort((a,b)=>a-b), expected);
  await context.clearCookies();
  await page.locator('[data-ciq2-refresh]').click();
  await page.waitForFunction(() => document.querySelector('[data-ciq2-root]')?.dataset.ciq2State === 'stale');
  assert.deepEqual(await ids(page), []);
  checks.push('expired_login_clears_old_authorized_cells');
  const viewerContext = await browser.newContext({viewport: {width: 390, height: 844}});
  await viewerContext.addCookies(cookies(fixture.viewer_id));
  const viewerPage = await viewerContext.newPage();
  await viewerPage.goto(fixture.url, {waitUntil: 'networkidle'});
  const viewerIds = await ids(viewerPage);
  const viewerQuery = "wp_set_current_user(" + fixture.viewer_id + ");" +
    "$a=apply_filters('gravityflow_inbox_args',array_merge(Gravity_Flow_Inbox::get_defaults(),['form_id'=>" +
    fixture.form_id + ",'paging'=>['offset'=>0,'page_size'=>2001]]));$n=0;" +
    "$p=Gravity_Flow_API::get_inbox_entries($a,$n);if(is_wp_error($p))$p=[];" +
    "echo wp_json_encode(array_map('intval',array_column($p,'id')));";
  const viewerAllowed = JSON.parse(wp(viewerQuery));
  assert.deepEqual([...viewerIds].sort((a,b)=>a-b), [...viewerAllowed].sort((a,b)=>a-b));
  await viewerContext.close();
  checks.push('second_actor_exact_native_list_authorization_parity');
  assert.deepEqual(errors, []);
  checks.push('no_page_javascript_exceptions');
  report.status = 'PASS';
} catch (error) {
  report.error = String(error?.stack || error);
  console.error('GPP_INBOX2_FAILURE_DIAGNOSTICS ' + JSON.stringify({
    head: env.GPP_WU21_REPOSITORY_SHA || null,
    version: fixture.version, initial: report.initial_observation ?? null,
    asset_responses: assets, failed_requests: failedRequests, page_errors: errors
  }));
  throw error;
} finally {
  fs.writeFileSync(path.join(env.WU21_ARTIFACT_DIR, 'gpp-inbox2-installed-browser.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
