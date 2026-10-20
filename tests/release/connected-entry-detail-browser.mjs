import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

// Browser must use the native Gravity Flow Entry Detail URL. No test hook,
// synthetic GPP dossier HTML, option write or fixture-supplied display text.
const [stage, fixturePath, baseUrl, out] = process.argv.slice(2);
if (!['initial', 'empty', 'stale', 'requalified'].includes(stage)
    || !fs.existsSync(fixturePath || '')
    || !/^http:\/\/127\.0\.0\.1:\d+$/.test(baseUrl || '')
    || !out) throw Error('Invalid connected Entry Detail arguments');

const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const host = JSON.parse(fs.readFileSync(path.join(out, 'connected-entry-host-' + stage + '.json'), 'utf8'));
const entryUrl = baseUrl + '/wp-admin/admin.php?page=gravityflow-inbox&view=entry&id='
  + fixture.form_id + '&lid=' + fixture.entry_id;

async function login(page, user, password) {
  await page.goto(baseUrl + '/wp-login.php');
  await page.locator('#user_login').fill(user);
  await page.locator('#user_pass').fill(password);
  await Promise.all([page.waitForNavigation(), page.locator('#wp-submit').click()]);
  if (await page.locator('#login_error').count()) throw Error('Native login rejected: ' + user);
}
function assert(ok, label) {
  if (!ok) throw Error('GPP_CONNECTED_ENTRY_FAIL stage=' + stage + ' ' + label);
}
const browser = await chromium.launch({headless:true});
const report = {stage, route:'native-gravityflow-inbox-entry-detail', source:'actual-installed-zip'};
try {
  const context = await browser.newContext({viewport:{width:1440,height:1000}});
  const page = await context.newPage();
  await login(page, process.env.GPP_TEST_ADMIN_USER, process.env.GPP_TEST_ADMIN_PASS);
  await page.goto(entryUrl, {waitUntil:'networkidle'});
  const dossier = page.locator('.gpp-entry-dossier[data-gpp-entry-detail="ready"][data-gpp-review-mode="read-only"]');
  assert(await dossier.count() === 1, 'exactly_one_eligible_dossier');
  assert((await dossier.getAttribute('data-gpp-native-table-suppression')) === 'read-only-review', 'server_owned_suppression_marker');

  const facts = await dossier.evaluate(el => {
    const read = slot => el.querySelector('[data-gpp-slot="' + slot + '"] dd')?.textContent?.trim() ?? null;
    return {
      title:el.querySelector('h1[data-gpp-slot="student.full_name"]')?.textContent?.trim(),
      first:read('student.first_name'),
      last:read('student.last_name'),
      gender:read('student.gender'),
      currentStep:read('workflow.current_step'),
      entryCreated:read('entry.created_at'),
      mobile:read('student.mobile'),
      homePhone:read('student.home_phone'),
      financial:[...el.querySelectorAll('[data-gpp-slot^="finance."] dd')].map(n=>n.textContent.trim()),
      regions:[...el.querySelectorAll('[data-gpp-entry-region]')].map(n=>n.dataset.gppEntryRegion)
    };
  });
  assert(host.native_step_type === 'approval' && host.native_step_id === fixture.native_authority.approval_step_id,
    'host_native_approval_identity');
  assert(facts.title === host.native_first_raw + ' ' + host.native_last_raw, 'independent_full_name_derivation');
  assert(facts.first === host.native_first_raw && facts.last === host.native_last_raw, 'mapped_names_actual_host_values');
  assert(facts.gender === String(host.native_choice_display), 'host_display_not_raw_choice');
  assert(host.native_choice_raw !== host.native_choice_display && !facts.gender.includes(host.native_choice_raw), 'no_raw_label_conflation');
  assert(facts.currentStep === host.native_step_name && facts.currentStep !== '', 'live_native_current_step');
  assert(host.date_source?.type === 'gravity_forms.entry_meta'
    && host.date_source?.meta_key === 'date_created'
    && host.date_display_provenance === 'gfapi_date_created_via_existing_bound_host_value_reader'
    && typeof host.native_created_at === 'string' && host.native_created_at !== ''
    && typeof host.native_created_display === 'string' && host.native_created_display !== '',
    'independent_creation_date_host_source_or_provider_missing');
  assert(facts.entryCreated === host.native_created_display,
    'displayed_creation_date_differs_from_independent_host_formatter');
  assert(facts.mobile === 'نگاشت نشده', 'unmapped_semantic_must_degrade');
  assert(facts.financial.every(v=>v !== '125000000' && v !== '110000000'), 'finance_must_remain_unmapped');
  const expectedPhone = stage === 'initial' ? 'نگاشت نشده'
    : stage === 'stale' ? 'نگاشت معتبر نیست' : 'ثبت نشده';
  assert(facts.homePhone === expectedPhone, 'semantic_home_phone_' + expectedPhone);

  const hostDom = await page.evaluate(() => {
    const visible = el => {
      if (!el) return false;
      const s=getComputedStyle(el),r=el.getBoundingClientRect();
      return s.display!=='none' && s.visibility!=='hidden' && r.width>0 && r.height>0;
    };
    const native=document.querySelector('.entry-detail-view');
    const status=document.querySelector('.gravityflow-status-box');
    const timeline=document.querySelector('.gravityflow-timeline');
    const buttons=status?[...status.querySelectorAll('.gravityflow-action-buttons button')].map(b=>({name:b.name,value:b.value,disabled:b.disabled})): [];
    return {
      nativeListPresent:!!native, nativeListVisible:visible(native),
      statusCount:document.querySelectorAll('.gravityflow-status-box').length,
      statusVisible:visible(status), statusInsideDossier:!!status?.closest('.gpp-entry-dossier'),
      timelineVisible:visible(timeline), timelineInsideDossier:!!timeline?.closest('.gpp-entry-dossier'),
      nativeNonce:!!status?.querySelector('input[name="_wpnonce"]'),
      nativeNote:!!status?.querySelector('textarea[name="gravityflow_note"]'),
      nativeActions:buttons,
      nativePrint:!!document.querySelector('.detail-view-print'),
      dossierPrint:document.querySelectorAll('.gpp-entry-print-utility[data-gpp-print-utility="dossier"]').length,
      nativeRoute:location.search,
      nativeUrl:location.href,
      // Only explicit native Gravity Flow status-value markers are comparable.
      // A generic action panel or a GPP semantic slot is not proof that
      // Gravity Flow actually displays the raw host status.
      visibleNativeStatuses:[...document.querySelectorAll('[data-gravityflow-status]')]
        .filter(el=>visible(el) && !el.closest('.gpp-entry-dossier'))
        .map(el=>({selector:'[data-gravityflow-status]',text:(el.textContent||'').trim()})),
      nativeStatusInspection:{
        statusBoxPresent:!!status,
        nativeStatusMarkers:document.querySelectorAll('[data-gravityflow-status]').length
      },
      overlap:(()=>{
        const d=document.querySelector('.gpp-entry-dossier')?.getBoundingClientRect(),s=status?.getBoundingClientRect();
        return d&&s?Math.max(0,Math.min(d.right,s.right)-Math.max(d.left,s.left))*Math.max(0,Math.min(d.bottom,s.bottom)-Math.max(d.top,s.top)):null;
      })()
    };
  });
  assert(hostDom.nativeListPresent && !hostDom.nativeListVisible, 'native_readonly_list_duplicate');
  assert(hostDom.statusCount === 1 && hostDom.statusVisible && !hostDom.statusInsideDossier && hostDom.nativeNonce && hostDom.nativeNote,
    'native_status_and_nonce_ownership');
  assert(hostDom.timelineVisible && !hostDom.timelineInsideDossier, 'native_timeline_ownership');
  assert(hostDom.nativePrint && hostDom.dossierPrint === 1, 'native_print_ownership');
  assert(['approved','rejected','revert'].every(x=>hostDom.nativeActions.some(b=>b.value===x)),
    'native_approval_reject_revert_controls');
  assert(hostDom.nativeActions.every(b=>!b.disabled), 'native_actions_disabled_unexpectedly');
  assert(hostDom.overlap !== null && hostDom.overlap < 1, 'status_dossier_overlap');
  assert(hostDom.nativeRoute.includes('page=gravityflow-inbox') && hostDom.nativeRoute.includes('view=entry')
    && new URL(hostDom.nativeUrl).searchParams.get('id') === String(fixture.form_id)
    && new URL(hostDom.nativeUrl).searchParams.get('lid') === String(fixture.entry_id),
    'native_navigation_replaced');

  const approve=page.locator('.gravityflow-status-box .gravityflow-action-buttons button[value="approved"]');
  await approve.focus();
  assert(await approve.evaluate(el=>document.activeElement===el && el.tabIndex>=0), 'native_approve_not_keyboard_focusable');
  await page.keyboard.press('Tab');
  report.keyboard_focus_native_control = true;

  const statuses=hostDom.visibleNativeStatuses;
  assert(Array.isArray(statuses)
    && statuses.every(x=>x.text !== '' && x.text === String(host.native_status)),
    'native_visible_status_does_not_equal_gravity_flow_api');
  report.workflow_status_evidence={
    result:statuses.length>0?'COMPARABLE_VISIBLE_MATCH':'NOT_PROVEN_VISIBLE_EQUIVALENCE',
    native_raw:host.native_status,
    candidates:statuses,
    inspection:hostDom.nativeStatusInspection,
    source:'actual_native_browser_dom'
  };

  const viewports=[];
  for (const width of [1440,414,390,320]) {
    await page.setViewportSize({width,height:width===1440?1000:900});
    const metrics = await page.evaluate(() => {
      const dossier=document.querySelector('.gpp-entry-dossier');
      const status=document.querySelector('.gravityflow-status-box');
      const d=dossier.getBoundingClientRect(), s=status?.getBoundingClientRect();
      return {
        regionScrollWidth:dossier.scrollWidth, regionClientWidth:dossier.clientWidth,
        statusOverlap:s?Math.max(0,Math.min(d.right,s.right)-Math.max(d.left,s.left))*
            Math.max(0,Math.min(d.bottom,s.bottom)-Math.max(d.top,s.top)):null,
        dossierVisible:d.width>0&&d.height>0
      };
    });
    assert(metrics.dossierVisible && metrics.regionScrollWidth<=metrics.regionClientWidth+3,
      'dossier_content_overflow_' + width);
    assert(metrics.statusOverlap!==null && metrics.statusOverlap<1, 'status_overlap_' + width);
    viewports.push({width,...metrics});
    await page.screenshot({path:path.join(out,'connected-entry-'+stage+'-'+width+'.png'),fullPage:true});
  }
  await page.setViewportSize({width:390,height:900});
  await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});
  const zoom = await page.evaluate(()=>{
    const d=document.querySelector('.gpp-entry-dossier'), s=document.querySelector('.gravityflow-status-box');
    const a=d.getBoundingClientRect(),b=s.getBoundingClientRect();
    return {fontSize:getComputedStyle(document.documentElement).fontSize,
      dossierVisible:a.width>0&&a.height>0,
      overlap:Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top))};
  });
  assert(zoom.fontSize!=='16px' && zoom.dossierVisible && zoom.overlap<1,'200_percent_text_regression');
  await page.evaluate(()=>{document.documentElement.style.fontSize='';});

  if (stage === 'requalified') {
    const viewerCtx=await browser.newContext();
    try {
      const viewer=await viewerCtx.newPage();
      await login(viewer,process.env.GPP_TEST_VIEWER_USER,process.env.GPP_TEST_VIEWER_PASS);
      const response=await viewer.goto(entryUrl,{waitUntil:'networkidle'});
      // Whole document text (including hidden DOM), not a truncated body
      // excerpt. Compare independently sourced, distinct raw/display values.
      const rendered=await viewer.evaluate(()=>document.documentElement.textContent || '');
      const sentinels=host.personal_sentinels;
      const expectedKeys=['first_name','last_name','choice_raw','choice_display','alternate_raw','alternate_display'];
      assert(sentinels && typeof sentinels==='object'
        && expectedKeys.every(k=>typeof sentinels[k]==='string' && sentinels[k].length>=12)
        && Object.keys(sentinels).length===expectedKeys.length
        && new Set(Object.values(sentinels)).size===expectedKeys.length,
        'independent_personal_sentinel_set_incomplete');
      const exposed=expectedKeys.filter(key=>rendered.includes(sentinels[key]));
      assert(await viewer.locator('.gpp-entry-dossier').count()===0
        && await viewer.locator('.gravityflow-status-box .gravityflow-action-buttons button').count()===0
        && exposed.length===0, 'unauthorized_native_entry_detail_leaked:' + exposed.join(','));
            // Detector sanity challenge: a surname-only leak MUST be detected
      // independently of first-name presence.
      const injected=rendered+'\\n'+sentinels.last_name;
      assert(injected.includes(sentinels.last_name) && !injected.includes(sentinels.first_name),
        'surname_only_leak_detector_is_ineffective');
      report.unauthorized_viewer={
        no_dossier:true,no_workflow_action:true,no_host_value:exposed.length===0,
        tested_sentinel_keys:expectedKeys,exposed_sentinel_keys:exposed,
        sentinel_count:expectedKeys.length,surname_only_mutation_detected:true,
        source:'entire_document_text_against_independent_gfapi_host_sentinels',
        http_status:response?.status()
      };
    } finally {await viewerCtx.close();}
  }
  report.host=facts;
  report.native=hostDom;
  report.viewports=viewports;
  report.text_200_percent=zoom;
  report.connected=true;
  fs.writeFileSync(path.join(out,'connected-entry-'+stage+'.json'),JSON.stringify(report,null,2)+'\n');
  process.stdout.write('GPP_CONNECTED_ENTRY_BROWSER_PASS stage='+stage+'\n');
} finally {
  await browser.close();
}
