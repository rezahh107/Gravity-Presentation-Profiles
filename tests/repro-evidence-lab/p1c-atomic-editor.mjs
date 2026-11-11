/**
 * Real Elementor 4.4.0 editor UI: palette -> two Atomic inserts -> two native
 * PropValue control edits -> save_builder response -> reload and safe Twing preview.
 * Never inject _elementor_data or editor DOM fixtures.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';

const env=process.env, origin=env.WU21_BASE_URL, dir=env.WU21_ARTIFACT_DIR;
const fixture=JSON.parse(fs.readFileSync(path.join(dir,'p1c-atomic-fixture.json'),'utf8'));
const checks=[];
function wp(code) {
  const r=spawnSync('php',[env.WU21_WP_CLI,'--path='+env.WU21_WP_PATH,'eval',code],
    {encoding:'utf8',env,timeout:60000});
  assert.equal(r.status,0,r.stderr||r.stdout);
  return r.stdout.trim();
}
function cookies(id) {
  const s="$u=get_user_by('id',"+Number(id)+");$e=time()+3600;echo wp_json_encode([['name'=>AUTH_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'auth')],['name'=>LOGGED_IN_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'logged_in')]]);";
  return JSON.parse(wp(s)).map(x=>({...x,url:origin}));
}
function saveResponse(resp) {
  if (!resp.url().includes('admin-ajax.php') || resp.request().method()!=='POST') return false;
  let body=resp.request().postData()||'';
  return body.includes('save_builder');
}
async function assertSaved(response) {
  const json=await response.json();
  const values=Object.values(json?.data?.responses||{});
  assert.ok(response.ok() && values.some(x=>x?.success===true),
    'Real Elementor save_builder response was not successful');
}
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
let page, context, failed=null;
try {
  context=await browser.newContext({viewport:{width:1280,height:900}});
  page=await context.newPage();
  await page.goto(origin+'/wp-login.php',{waitUntil:'domcontentloaded',timeout:45000});
  await page.locator('#user_login').fill(env.P1C_ADMIN_USERNAME);
  await page.locator('#user_pass').fill(env.P1C_ADMIN_PASSWORD);
  await Promise.all([
    page.waitForURL(/\/wp-admin\//,{timeout:45000}),
    page.locator('#wp-submit').click()
  ]);
  checks.push('WORDPRESS_REAL_UI_LOGIN_AND_ADMIN_SESSION');
  let forbiddenAjax=0;
  page.on('request',req=>{
    if (req.postData()?.includes('gpp_inbox2_atomic_bootstrap') ||
        req.postData()?.includes('gpp_inbox2_read')) forbiddenAjax++;
  });
  const editorUrl=origin+'/wp-admin/post.php?post='+fixture.post_id+'&action=elementor';
  const navigation=await page.goto(editorUrl,{waitUntil:'domcontentloaded',timeout:90000});
  assert.ok(navigation?.ok() && page.url().includes('/wp-admin/post.php') &&
    new URL(page.url()).searchParams.get('action')==='elementor',
    'Authentic Elementor editor was not served: '+page.url()+' (HTTP '+navigation?.status()+')');
  await page.locator('#elementor-preview-iframe').waitFor({state:'visible',timeout:90000});
  await page.locator('#elementor-loading').waitFor({state:'hidden',timeout:90000});
  const top=page.locator('#elementor-editor-wrapper-v2');
  const frame=page.frameLocator('#elementor-preview-iframe');
  const values=[fixture.forms.a,fixture.forms.b];
  for (let i=0;i<values.length;i++) {
    await top.locator('button[aria-label="Add Element"]').click();
    const palette=page.locator('#elementor-panel-category-v4-elements [data-library-element-type="e-gpp-inbox-2"]');
    await palette.waitFor({state:'visible',timeout:30000});
    await palette.click();
    await frame.locator('[data-widget_type="e-gpp-inbox-2.default"]').nth(i).waitFor({state:'visible',timeout:45000});
    const placeholder=frame.locator('[data-gpp-atomic-inbox2="pending"]').nth(i);
    await placeholder.waitFor({state:'visible',timeout:30000});
    assert.match(await placeholder.innerText(), /فهرست کارها/);
    assert.doesNotMatch(await placeholder.innerHTML(), /data-ciq2-nonce|SYN-P1C-/);
    checks.push('REAL_V4_ATOMIC_INSERTION_AND_STATIC_TWING_PREVIEW_'+(i+1));
    const field=label=>page.locator('[data-type="settings-field"]')
      .filter({has:page.locator('label').filter({hasText:new RegExp('^'+label+'$')})}).getByRole('textbox');
    const form=field('Gravity Forms form ID');
    const native=field('Published Native Gravity Flow Inbox page ID');
    // The real Elementor 4.4 control Section starts collapsed in the
    // screenshot captured on run 43014597612. Expand it through the editor
    // UI rather than treating its hidden fields as a runtime failure.
    const heading=page.getByText('Inbox source',{exact:true}).first();
    await heading.waitFor({state:'visible',timeout:30000});
    if (!(await form.isVisible())) await heading.click();
    await form.waitFor({state:'visible',timeout:30000});
    await form.fill(String(values[i])); await form.blur();
    if (!(await native.isVisible())) await heading.click();
    await native.waitFor({state:'visible',timeout:30000});
    await native.fill(String(fixture.native_page_id)); await native.blur();
    assert.equal(await frame.locator('[data-gpp-atomic-inbox2="pending"]').count(),i+1);
  }
  assert.equal(forbiddenAjax,0,'Editor preview attempted private task bootstrap');
  checks.push('REAL_V4_PALETTE_INSERT_AND_TWO_ATOMIC_CONTROL_EDITS','DATA_FREE_TWING_PREVIEW');
  const [saved]=await Promise.all([
    page.waitForResponse(saveResponse,{timeout:60000}),
    top.getByRole('button',{name:'Publish',exact:true}).click()
  ]);
  await assertSaved(saved);
  checks.push('REAL_EDITOR_SAVE_BUILDER_ACCEPTED');
  await page.reload({waitUntil:'domcontentloaded',timeout:90000});
  await page.locator('#elementor-loading').waitFor({state:'hidden',timeout:90000});
  assert.equal(await frame.locator('[data-gpp-atomic-inbox2="pending"]').count(),2);
  assert.equal(forbiddenAjax,0);
  checks.push('REAL_EDITOR_RELOAD_SAFE_TWO_WIDGET_PREVIEW');
  await page.screenshot({path:path.join(dir,'p1c-editor-reload.png'),fullPage:true});
} catch(e) {
  failed=String(e?.stack||e)+'\nEDITOR_LAST_URL='+String(page?.url()||'NO_PAGE');
  process.stderr.write(failed.slice(0,1600)+'\n');
  if(page) await page.screenshot({path:path.join(dir,'p1c-editor-failure.png'),fullPage:true}).catch(()=>{});
} finally {
  fs.writeFileSync(path.join(dir,'p1c-atomic-editor.json'),JSON.stringify({
    head:env.GPP_WU21_REPOSITORY_SHA||null,elementor:'4.4.0',
    checks,failed
  },null,2));
  await browser.close();
}
if(failed)process.exit(1);
console.log('P1C_AUTHENTIC_ELEMENTOR_EDITOR_PASS');
