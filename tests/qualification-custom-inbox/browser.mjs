import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';

const env=process.env, out=env.WU21_ARTIFACT_DIR, base=env.WU21_BASE_URL;
const f=JSON.parse(fs.readFileSync(path.join(out,'ciq-browser-fixture.json'),'utf8'));
const headless=JSON.parse(fs.readFileSync(path.join(out,'ciq-headless.json'),'utf8'));
assert.equal(headless.gate_b,'PASS_HEADLESS_TESTED_SCOPE');
const evidence={head:f.head,headless_gate:headless.gate_b,status:'RUNNING',checks:[],screenshots:[]};
const check=(name,details={})=>evidence.checks.push({name,status:'PASS',...details});
const save=()=>fs.writeFileSync(path.join(out,'ciq-browser.json'),JSON.stringify(evidence,null,2));
function wp(code){const r=spawnSync('php',[env.WU21_WP_CLI,'--path='+env.WU21_WP_PATH,'eval',code],{env,encoding:'utf8',timeout:60000});assert.equal(r.status,0,r.stderr);return r.stdout.trim();}
async function context(browser,uid,width=1280,expired=false){
  const c=await browser.newContext({viewport:{width,height:900}});
  if(uid){
    assert.ok(Number.isSafeInteger(uid));
    const cookies=JSON.parse(wp(`$u=get_user_by('id',${uid});$e=time()${expired?'-3600':'+1800'};echo wp_json_encode([['name'=>AUTH_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'auth')],['name'=>LOGGED_IN_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'logged_in')]]);`));
    await c.addCookies(cookies.map(x=>({...x,url:base})));
  }
  return c;
}
const ids=async p=>(await p.locator('[data-ciq-entry]').evaluateAll(xs=>xs.map(x=>Number(x.dataset.ciqEntry)))).sort((a,b)=>a-b);
const safe=s=>!s.includes('CIQ_WITHHELD_');
const browser=await chromium.launch({headless:true});
try {
  const c=await context(browser,f.officer),p=await c.newPage();
  const network=[], errors=[];p.on('pageerror',e=>errors.push(String(e)));
  p.on('response',r=>{if(r.url().startsWith(base)&&/(text\/html|application\/json)/.test(r.headers()['content-type']||'')){network.push(r.text().catch(()=>''));}});
  let response=await p.goto(f.custom_url,{waitUntil:'networkidle'});
  assert.equal(response.status(),200);
  const expected=headless.comparisons.officer_after_transition.candidate.map(x=>x.id).sort((a,b)=>a-b);
  assert.deepEqual(await ids(p),expected); assert.equal(expected.length,2);
  assert.equal(await p.locator('[data-ciq-field="2"]').count(),0);
  assert.equal(await p.locator('[data-ciq-field="1"]').count(),2);
  assert.ok(safe(await p.content()));
  assert.match(response.headers()['cache-control'],/private/);assert.match(response.headers()['cache-control'],/no-store/);
  assert.match(response.headers()['vary']||'',/cookie/i);
  assert.equal(await p.locator('.ciq-inbox').evaluate(x=>getComputedStyle(x).direction),'rtl');
  assert.equal(await p.locator('[data-js="gflow-inbox"]').count(),0);
  fs.writeFileSync(path.join(out,'custom-officer.html'),await response.text());
  assert.equal(await p.locator('#ciq-unescaped').count(),0);assert.ok((await p.content()).includes('&lt;b id=\"ciq-unescaped\"&gt;'));check('stored_text_escaped_as_text');
  check('officer_exact_membership_and_field_absence',{ids:expected});check('private_no_store_cookie_variation');check('server_rendered_rtl_no_second_grid');
  for(const width of [1280,390]){
    await p.setViewportSize({width,height:900});
    assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Document overflow at ${width}`);
    const file=`ciq-officer-${width}.png`;await p.screenshot({path:path.join(out,file),fullPage:true});evidence.screenshots.push(file);
    check('document_overflow_'+width);
  }
  // Actual Tab navigation, not programmatic focus, must reach every task link.
  const reached=new Set();
  for(let i=0;i<45&&reached.size<expected.length;i++){
    await p.keyboard.press('Tab');
    const state=await p.evaluate(()=>{const e=document.activeElement,li=e?.closest('[data-ciq-entry]');const s=e?getComputedStyle(e):null;return {id:li?Number(li.dataset.ciqEntry):null,link:e?.tagName==='A',focus:e?.matches(':focus-visible'),outline:s?.outlineStyle,width:s?.outlineWidth};});
    if(state.id&&state.link){assert.ok(state.focus);assert.notEqual(state.outline,'none');assert.ok(parseFloat(state.width)>=3);reached.add(state.id);}
  }
  assert.deepEqual([...reached].sort((a,b)=>a-b),expected);check('keyboard_tab_all_links_visible_focus');
  const link=await p.locator('[data-ciq-entry]').first().locator('a').getAttribute('href');
  const linkId=Number(new URL(link).searchParams.get('lid'));assert.ok(expected.includes(linkId));
  await p.goto(link,{waitUntil:'networkidle'});
  assert.equal(await p.locator('.gravityflow_workflow_detail').count(),1);assert.ok((await p.locator('body').innerText()).includes('دانش‌آموز'));
  assert.ok(safe(await p.content()));check('native_entry_navigation_current_assignee_and_withheld_field');

  const viewer=await context(browser,f.viewer),vp=await viewer.newPage();
  response=await vp.goto(f.custom_url,{waitUntil:'networkidle'});assert.equal(response.status(),200);assert.deepEqual(await ids(vp),[]);assert.equal(await vp.locator('.ciq-empty').count(),1);assert.ok(safe(await vp.content()));
  assert.ok(!(await vp.content()).includes('دانش‌آموز آزمایشی'));check('viewer_empty_no_personal_data');
  response=await vp.goto(link,{waitUntil:'networkidle'});assert.ok(!(await vp.locator('body').innerText()).includes('دانش‌آموز آزمایشی'));assert.ok(safe(await vp.content()));check('viewer_direct_native_entry_denied');
  for(const uid of [0,f.officer]){
    const denied=await context(browser,uid,390,Boolean(uid)),dp=await denied.newPage();const r=await dp.goto(f.custom_url,{waitUntil:'networkidle'});assert.equal(r.status(),403);assert.deepEqual(await ids(dp),[]);assert.ok(safe(await dp.content()));await denied.close();
  }
  check('anonymous_and_expired_session_denied');
  const noAdmin=await vp.goto(base+'/wp-admin/admin.php?page=gravityflow-inbox',{waitUntil:'networkidle'});assert.equal(noAdmin.status(),403);assert.ok(!(await vp.content()).includes('دانش‌آموز آزمایشی'));check('unprivileged_wp_admin_feature_denied_separate_from_frontend');
  const attack=new URL(f.custom_url);for(const [k,v] of Object.entries({user_id:f.officer,filter_key:'workflow_user_id_'+f.officer,form_id:f.form_id,step_id:f.step_id,id:f.form_id,lid:linkId,view:'entry',page:'gravityflow-inbox'}))attack.searchParams.set(k,String(v));
  await vp.goto(attack.href,{waitUntil:'networkidle'});assert.deepEqual(await ids(vp),[]);assert.ok(safe(await vp.content()));assert.ok(!(await vp.content()).includes('دانش‌آموز آزمایشی'));check('user_controlled_identifiers_cannot_broaden_query');

  // Use the host API in a separate administrator CLI invocation, never custom UI.
  wp(`wp_set_current_user(${f.admin});$e=GFAPI::get_entry(${linkId});$a=new Gravity_Flow_API($e['form_id']);$a->send_to_step($e,${f.next_step});echo 'NATIVE_TRANSITION';`);
  await p.goto(f.custom_url,{waitUntil:'networkidle'});const after=expected.filter(x=>x!==linkId);assert.deepEqual(await ids(p),after);check('custom_requery_removes_native_transitioned_task',{before:expected,after});
  await p.goto(link,{waitUntil:'networkidle'});assert.ok(!(await p.locator('body').innerText()).includes('دانش‌آموز آزمایشی'));assert.ok(safe(await p.content()));check('stale_officer_direct_entry_link_denied_after_transition');
  await p.goto(f.native_url,{waitUntil:'networkidle'});
  await p.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row[row-id]').first().waitFor();
  const nativeIds=(await p.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row[row-id]').evaluateAll(xs=>xs.map(x=>Number(x.getAttribute('row-id'))))).sort((a,b)=>a-b);
  assert.deepEqual(nativeIds,after);check('original_native_grid_intact_exact_officer_membership_after_transition',{ids:nativeIds});
  await p.screenshot({path:path.join(out,'native-officer-after-transition.png'),fullPage:true});evidence.screenshots.push('native-officer-after-transition.png');
  const admin=await context(browser,f.admin),ap=await admin.newPage();await ap.goto(f.custom_url,{waitUntil:'networkidle'});
  assert.deepEqual(await ids(ap),headless.comparisons.administrator.candidate.map(x=>x.id).sort((a,b)=>a-b));check('administrator_own_native_task_set_not_officer_set');
  assert.ok((await Promise.all(network)).every(safe));check('all_observed_officer_html_json_responses_withheld_value_absent');
  // Same absence predicate rejects a deliberately forged response, no host mutation.
  assert.equal(safe('<div hidden data-test="CIQ_WITHHELD_MUTANT"></div>'),false);check('same_disclosure_scanner_hidden_attribute_mutant_rejected');
  assert.equal(errors.length,0);check('no_observed_browser_pageerrors');
  await c.close();await viewer.close();await admin.close();
  evidence.status='PASS_TESTED_SCOPE';save();console.log('CIQ_BROWSER_PASS '+evidence.checks.length);
}catch(e){evidence.status='FAIL';evidence.error=String(e.stack||e);save();throw e;}finally{await browser.close();}
