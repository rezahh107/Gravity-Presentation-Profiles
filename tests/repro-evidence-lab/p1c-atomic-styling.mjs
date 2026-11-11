/** Real Elementor V4 native Classes/Variables/responsive UI proof for the P1-C Atomic widget. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';

const env=process.env, origin=env.WU21_BASE_URL, dir=env.WU21_ARTIFACT_DIR;
const fixture=JSON.parse(fs.readFileSync(path.join(dir,'p1c-atomic-fixture.json'),'utf8'));
const widget='[data-gpp-atomic-inbox2]';
const className='p1c-native-atomic-style';
const variableName='p1c-atomic-text-color';
const expectedColor='rgb(29, 78, 216)';
const viewports=[{device:'desktop',width:1280,fontSize:'31px'},
  {device:'mobile',width:390,fontSize:'19px'}];
const checks=[];
function wp(code) {
  const r=spawnSync('php',[env.WU21_WP_CLI,'--path='+env.WU21_WP_PATH,'eval',code],
    {env,encoding:'utf8',timeout:60000});
  assert.equal(r.status,0,r.stderr||r.stdout);
  return r.stdout.trim();
}
function cookies(id) {
  const code="$u=get_user_by('id',"+Number(id)+");$e=time()+3600;echo wp_json_encode([['name'=>AUTH_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'auth')],['name'=>LOGGED_IN_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'logged_in')]]);";
  return JSON.parse(wp(code)).map(c=>({...c,url:origin}));
}
function saveResponse(response){
  return response.url().includes('admin-ajax.php') &&
    response.request().method()==='POST' &&
    (response.request().postData()||'').includes('save_builder');
}
async function save(page){
  const [response]=await Promise.all([
    page.waitForResponse(saveResponse,{timeout:60000}),
    page.locator('#elementor-editor-wrapper-v2')
      .getByRole('button',{name:/^(Publish|Update)$/}).first().click()
  ]);
  const json=await response.json();
  const values=Object.values(json?.data?.responses||{});
  assert.ok(response.ok() && values.length>0 && values.every(x=>x?.success===true),
    'Style save_builder must acknowledge every save action');
}
async function waitEditor(page){
  await page.locator('#elementor-preview-iframe').waitFor({state:'visible',timeout:90000});
  await page.locator('#elementor-loading').waitFor({state:'hidden',timeout:90000});
}
async function openStyle(page){
  const promo=page.getByRole('dialog').filter({hasText:'Ask Angie to build you full pages'});
  if(await promo.isVisible()) {
    await promo.getByRole('button',{name:'Close',exact:true}).click();
    await promo.waitFor({state:'hidden'});
  }
  await page.frameLocator('#elementor-preview-iframe').locator(widget).first().click();
  const panel=page.locator('#elementor-panel');
  await panel.getByRole('heading',{name:'Edit GPP — Inbox 2',exact:true}).waitFor();
  await panel.getByRole('tab',{name:'Style',exact:true}).click();
  return panel;
}
async function selectedClass(page,chip){
  await chip.locator('[aria-label="Open CSS Class Menu"]').click();
  await page.locator('li[role="menuitem"]').filter({hasText:/\bNormal\b/i}).click();
}
async function typography(panel){
  const area=panel.locator('[aria-label="Typography section content"]');
  if(!await area.isVisible()) await panel.locator('.MuiButtonBase-root').filter({hasText:/^Typography$/i}).click();
  return area;
}
async function setFont(section,page,fontSize){
  const field=section.locator('label').filter({hasText:/^Font size$/i}).locator('../../..');
  const input=field.locator('input');
  const unit=field.locator('input ~ .MuiInputAdornment-positionEnd button[aria-haspopup="true"]:not([aria-label])');
  if((await unit.textContent()).toLowerCase()!=='px'){
    await unit.click();
    await page.getByRole('menuitem',{name:'PX',exact:true}).click();
  }
  await input.fill(fontSize.replace('px',''));
  await input.blur();
}
async function checkComputed(page,fontSize,color=null,editor=false){
  const j=await page.waitForFunction(({widget,className,fontSize,color,editor})=>{
    const doc=editor?document.querySelector('#elementor-preview-iframe')?.contentDocument:document;
    const element=doc?.querySelector(widget);
    if(!element)return false;
    const token=[...element.classList].find(x=>x.includes(className));
    const css=doc.defaultView.getComputedStyle(element);
    if(!token||css.fontSize!==fontSize||(color&&css.color!==color))return false;
    return {class_token:token,font_size:css.fontSize,color:css.color};
  },{widget,className,fontSize,color,editor},{timeout:20000});
  const out=await j.jsonValue();await j.dispose();return out;
}
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
let fail=null;let page;
try {
  const ctx=await browser.newContext({viewport:{width:1280,height:900}});
  await ctx.addCookies(cookies(1));
  page=await ctx.newPage();
  await page.goto(origin+'/wp-admin/post.php?post='+fixture.post_id+'&action=elementor',
    {waitUntil:'domcontentloaded',timeout:90000});
  await waitEditor(page);
  const panel=await openStyle(page);
  const classes=panel.locator('label').filter({hasText:/^Classes$/}).locator('../..');
  await classes.locator('input').fill(className);
  await classes.locator('input').press('Enter');
  const chip=classes.locator('[aria-label="Edit '+className+'"]');
  await selectedClass(page,chip);
  checks.push('REAL_NATIVE_EDITOR_CLASS_CREATED');
  for(const {device,fontSize} of viewports){
    await page.locator('[aria-label="Switch Device"]').getByTestId('switch-device-to-'+device).click();
    await setFont(await typography(panel),page,fontSize);
    await checkComputed(page,fontSize,null,true);
  }
  await page.locator('[aria-label="Switch Device"]').getByTestId('switch-device-to-desktop').click();
  await save(page);
  await page.reload({waitUntil:'domcontentloaded'});
  await waitEditor(page);
  await openStyle(page);
  await chip.waitFor({state:'visible'});
  const anon=await browser.newContext();
  const front=await anon.newPage();
  const checkFrontend=async(color,prefix)=>{
    const observed=[];
    for(const {device,width,fontSize} of viewports){
      await front.setViewportSize({width,height:900});
      const result=await front.goto(origin+'/?page_id='+fixture.post_id,
        {waitUntil:'domcontentloaded',timeout:60000});
      assert.ok(result?.ok(),'Native styled frontend did not render');
      observed.push({device,...await checkComputed(front,fontSize,color)});
      await front.screenshot({path:path.join(dir,'p1c-atomic-'+prefix+'-'+device+'.png'),fullPage:true});
    }
    return observed;
  };
  checks.push({name:'NATIVE_CLASSES_AND_RESPONSIVE_FRONTEND_PERSISTENCE',
    observed:await checkFrontend(null,'class-responsive')});
  await selectedClass(page,chip);
  const color=(await typography(panel)).locator('[aria-label="Text color control"]');
  await color.locator('input').hover();
  await page.getByRole('button',{name:'Variables',exact:true}).click();
  await page.getByRole('button',{name:'Create variable',exact:true}).click();
  await page.locator('#variable-label').fill(variableName);
  await page.locator('#color-variable-field').getByRole('textbox').fill('#1D4ED8');
  await page.getByRole('button',{name:'Create',exact:true}).click();
  await color.getByText(variableName,{exact:true}).waitFor();
  await checkComputed(page,viewports[0].fontSize,expectedColor,true);
  await save(page);
  await page.reload({waitUntil:'domcontentloaded'});
  await waitEditor(page);
  await openStyle(page);
  await selectedClass(page,chip);
  await (await typography(panel)).getByText(variableName,{exact:true}).waitFor();
  checks.push({name:'NATIVE_VARIABLES_FRONTEND_PERSISTENCE',
    observed:await checkFrontend(expectedColor,'variable')});
  await anon.close();await ctx.close();
} catch(e) {
  fail=String(e?.stack||e);
  process.stderr.write(fail.slice(0,1600)+'\n');
  if(page)await page.screenshot({path:path.join(dir,'p1c-atomic-styling-error.png'),fullPage:true}).catch(()=>{});
} finally {
  fs.writeFileSync(path.join(dir,'p1c-atomic-styling.json'),JSON.stringify({
    head:env.GPP_WU21_REPOSITORY_SHA||null,checks,failure:fail
  },null,2));
  await browser.close();
}
if(fail)process.exit(1);
console.log('P1C_AUTHENTIC_ATOMIC_CLASSES_VARIABLES_RESPONSIVE_PASS');
