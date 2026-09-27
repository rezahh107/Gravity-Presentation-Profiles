import assert from 'node:assert/strict';

// Shared by PR #99's evidence capture and WU21. Intersect *every* clipping
// ancestor, separately per axis, including the element's own scroll box.
export async function assertInboxComposition(page) {
  await page.waitForSelector('.gpp-inbox-surface [data-gpp-inbox-toolbar]');
  const result = await page.evaluate(() => {
    const root = document.querySelector('.gpp-inbox-surface [data-js="gflow-inbox"]');
    const toolbar = root.querySelector('[data-gpp-inbox-toolbar]');
    const gridRoot = root.querySelector('.ag-root-wrapper');
    const visible = n => { const r=n.getBoundingClientRect(), s=getComputedStyle(n); return r.width>0 && r.height>0 && s.visibility!=='hidden' && s.display!=='none'; };
    const box = n => { const r=n.getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}; };
    const issues=[];
    const selectors=['[data-js="gflow-inbox-search"]','[data-gpp-inbox-manual-refresh]','[data-js="inbox-settings"]'];
    const controls=selectors.map(s=>root.querySelector(s));
    for (let i=0;i<controls.length;i++) {
      const n=controls[i];
      if(root.querySelectorAll(selectors[i]).length!==1 || !n || !toolbar.contains(n) || !visible(n)) issues.push('control topology/visibility: '+selectors[i]);
      if(n && (n.scrollWidth>n.clientWidth+1 || n.scrollHeight>n.clientHeight+1)) issues.push('control text overflow: '+selectors[i]);
    }
    const rects=controls.map(box);
    for(let i=0;i<rects.length;i++) for(let j=i+1;j<rects.length;j++) {
      const a=rects[i], b=rects[j];
      if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1) issues.push('overlapping controls');
    }
    if(innerWidth<=782 && rects[0].bottom>Math.min(rects[1].top,rects[2].top)+1) issues.push('search must occupy first row');
    if(innerWidth>782 && Math.max(...rects.map(r=>r.top))-Math.min(...rects.map(r=>r.top))>1) issues.push('desktop alignment');
    if([...root.querySelectorAll('.gflow-grid__button--fullscreen,.gflow-grid__button--clear-filters')].some(visible)) issues.push('unadmitted utility visible');
    if(controls[2].textContent.trim()!=='تنظیمات اعلان‌ها') issues.push('settings label');
    if(document.documentElement.scrollWidth>innerWidth+1) issues.push('document horizontal overflow');
    const toolbarDirection=getComputedStyle(toolbar).direction;
    const gridDirection=gridRoot ? getComputedStyle(gridRoot).direction : null;
    if(toolbarDirection!=='rtl') issues.push('RTL lost');
    if(!gridRoot || gridDirection!=='ltr') issues.push('native AG Grid direction changed');
    if(root.querySelectorAll('.ag-paging-panel').length!==1) issues.push('pager count');
    const pager=root.querySelector('.ag-paging-panel');
    const clipping=[];
    for(const n of [pager,...pager.querySelectorAll('*')].filter(visible)) {
      const r=box(n); let clip={left:0,right:innerWidth,top:-Infinity,bottom:Infinity}; const chain=[];
      for(let p=n.parentElement;p;p=p.parentElement) {
        const s=getComputedStyle(p), b=box(p);
        chain.push({node:p.className,overflowX:s.overflowX,overflowY:s.overflowY,clientHeight:p.clientHeight,scrollHeight:p.scrollHeight,rect:b});
        if(/hidden|clip|auto|scroll/.test(s.overflowX)){clip.left=Math.max(clip.left,b.left+p.clientLeft);clip.right=Math.min(clip.right,b.left+p.clientLeft+p.clientWidth);}
        if(/hidden|clip|auto|scroll/.test(s.overflowY)){clip.top=Math.max(clip.top,b.top+p.clientTop);clip.bottom=Math.min(clip.bottom,b.top+p.clientTop+p.clientHeight);}
      }
      if(r.left<clip.left-1 || r.right>clip.right+1 || r.top<clip.top-1 || r.bottom>clip.bottom+1) issues.push('pager clipped: '+(n.getAttribute('ref')||n.className));
      if(n.clientHeight && n.scrollHeight>n.clientHeight+1) issues.push('pager scrollHeight: '+n.className);
      clipping.push({node:n.getAttribute('ref')||n.className,rect:r,clip,chain});
    }
    return {issues,rects,clipping,pagerVisible:visible(pager),directions:{toolbar:toolbarDirection,grid:gridDirection},width:innerWidth};
  });
  assert.deepEqual(result.issues, [], JSON.stringify(result));
  const search=page.locator('.gpp-inbox-surface [data-js="gflow-inbox-search"]');
  await search.focus();
  for(const selector of ['[data-gpp-inbox-manual-refresh]','[data-js="inbox-settings"]']) {
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(s=>document.activeElement.matches(s),selector),true,'native keyboard order');
    const focus=await page.evaluate(()=>({width:parseFloat(getComputedStyle(document.activeElement).outlineWidth),style:getComputedStyle(document.activeElement).outlineStyle}));
    assert.ok(focus.width>=2 && focus.style!=='none','visible keyboard focus');
  }
  return result;
}

export async function exerciseInboxComposition(page, url) {
  const results=[];
  for(const width of [1440,390,320]) {
    for(const scale of [1,2]) {
      await page.setViewportSize({width,height:1000});
      await page.goto(url,{waitUntil:'networkidle'});
      await page.evaluate(scale=>document.documentElement.style.fontSize=`${16*scale}px`,scale);
      results.push({scale,...await assertInboxComposition(page)});
      await page.screenshot({path:`${process.env.WU21_ARTIFACT_DIR}/inbox-composition-${width}-${scale}.png`,fullPage:true});
    }
  }
  await page.evaluate(()=>document.documentElement.style.fontSize='');
  return results;
}

export async function exerciseNativeInboxActions(page, url) {
  await page.setViewportSize({width:390,height:1000});
  await page.goto(url,{waitUntil:'networkidle'});
  const root=page.locator('.gpp-inbox-surface [data-js="gflow-inbox"]');
  const search=root.locator('[data-js="gflow-inbox-search"]');
  const rows=root.locator('.ag-center-cols-container > .ag-row');
  const before=await rows.count();
  assert.ok(before>0,'populated native fixture required');
  await search.fill('GPP-NO-MATCH-SYNTHETIC-TEST');
  await search.press('End'); // Flow owns keyup search, not a GPP filter API.
  await page.waitForFunction(()=>document.querySelectorAll('.gpp-inbox-surface .ag-center-cols-container > .ag-row').length===0);
  assert.equal(await root.locator('.ag-paging-panel').isVisible(),false,'native single/empty page adds no noise');
  await search.fill(''); await search.press('Backspace');
  await page.waitForFunction(n=>document.querySelectorAll('.gpp-inbox-surface .ag-center-cols-container > .ag-row').length===n,before);
  await assertInboxComposition(page);
  const next=root.locator('[ref="btNext"]'),previous=root.locator('[ref="btPrevious"]'),current=root.locator('[ref="lbCurrent"]');
  assert.equal(await next.evaluate(n=>n.classList.contains('ag-disabled')),false,'multipage fixture required');
  const start=await current.innerText();
  await next.focus(); await page.keyboard.press('Enter');
  await page.waitForFunction(value=>document.querySelector('.gpp-inbox-surface [ref="lbCurrent"]').textContent!==value,start);
  await assertInboxComposition(page);
  await previous.focus(); await page.keyboard.press('Enter');
  await page.waitForFunction(value=>document.querySelector('.gpp-inbox-surface [ref="lbCurrent"]').textContent===value,start);
  await assertInboxComposition(page);

  let busy=null;
  await page.exposeFunction('gppCaptureRefreshBusy',state=>{busy=state;});
  await page.evaluate(()=>document.addEventListener('click',e=>{
    const n=e.target.closest('[data-gpp-inbox-manual-refresh]');
    if(n) window.gppCaptureRefreshBusy({disabled:n.disabled,busy:n.getAttribute('aria-busy'),label:n.textContent});
  }));
  await Promise.all([page.waitForNavigation({waitUntil:'networkidle'}),root.locator('[data-gpp-inbox-manual-refresh]').click()]);
  assert.deepEqual(busy,{disabled:true,busy:'true',label:'در حال به‌روزرسانی…'});
  assert.equal(await page.evaluate(()=>performance.getEntriesByType('navigation')[0].type),'reload');
  assert.equal(await root.locator('[data-gpp-inbox-manual-refresh]').isEnabled(),true);
  await assertInboxComposition(page);
  return {search:'native keyup and empty/restored rows',pager:'keyboard next/previous after rerender',refresh:busy};
}

export async function exerciseNativePushPreference(page,url) {
  const toggleSelector='input[name="inbox-setting--push-enabled"]';
  await page.context().grantPermissions(['notifications'],{origin:new URL(url).origin});
  await page.goto(url,{waitUntil:'networkidle'});
  await page.locator('[data-js="inbox-settings"]').click();
  const toggle=page.locator(toggleSelector);
  assert.equal(await toggle.count(),1);
  const original=await toggle.isChecked();
  async function change(value) {
    const response=page.waitForResponse(r=>r.url().includes('/inbox/preferences') && r.request().method()==='PUT');
    // Native toggle inputs are visually hidden; activate their authentic label.
    const id=await toggle.getAttribute('id');
    await page.locator(`label[for="${id}"]`).click();
    const r=await response;
    assert.ok(r.ok());
    const payload=r.request().postDataJSON();
    assert.equal(payload.key,'push_enabled'); assert.equal(payload.value,value);
    await page.reload({waitUntil:'networkidle'});
    await page.locator('[data-js="inbox-settings"]').click();
    assert.equal(await toggle.isChecked(),value,'native persisted preference readback');
    return payload;
  }
  const changed=await change(!original);
  const restored=await change(original);
  await page.keyboard.press('Escape');
  return {changed,restored,permission:await page.evaluate(()=>Notification.permission)};
}
