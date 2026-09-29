import path from 'node:path';
import { artifactDir, inboxUrl, waitForGrid, bounded } from './inbox-v2-qualification-shared.mjs';

async function snapshot(page,width){
  await page.setViewportSize({width,height:width<=360?900:1000});
  await page.goto(inboxUrl,{waitUntil:'networkidle'});
  await waitForGrid(page);
  const out=await page.evaluate(()=>{
    const root=document.querySelector('[data-js="gflow-inbox"] .ag-root-wrapper');
    const headers=[...document.querySelectorAll('[data-js="gflow-inbox"] .ag-header-cell')].filter(el=>el.getClientRects().length).map(el=>({col_id:el.getAttribute('col-id'),text:(el.textContent||'').trim().replace(/\s+/g,' ').slice(0,100),left:el.getBoundingClientRect().left})).sort((a,b)=>a.left-b.left);
    const cells=[...document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row:first-child .ag-cell')].filter(el=>el.getClientRects().length).map(el=>{const s=getComputedStyle(el);return{col_id:el.getAttribute('col-id'),text_align:s.textAlign,direction:s.direction,left:el.getBoundingClientRect().left};}).sort((a,b)=>a.left-b.left);
    const panel=document.querySelector('[data-js="gflow-inbox"] .ag-paging-panel');
    const controls=panel?[...panel.querySelectorAll('[ref]')].filter(el=>el.getClientRects().length).map(el=>({ref:el.getAttribute('ref'),left:el.getBoundingClientRect().left,text:(el.textContent||'').trim()})).sort((a,b)=>a.left-b.left):[];
    const viewport=document.querySelector('[data-js="gflow-inbox"] .ag-center-cols-viewport');
    return{ag_rtl_count:document.querySelectorAll('[data-js="gflow-inbox"] .ag-rtl').length,root_direction:root?getComputedStyle(root).direction:null,visual_header_order_left_to_right:headers,first_row_cell_alignment:cells,pager_direction:panel?getComputedStyle(panel).direction:null,pager_order_left_to_right:controls,horizontal_scroll:viewport?{client_width:viewport.clientWidth,scroll_width:viewport.scrollWidth,overflow:viewport.scrollWidth>viewport.clientWidth}:null};
  });
  const link=page.locator('[data-js="gflow-inbox"] .gflow-inbox__entry-cell-link').first();
  const href=await link.getAttribute('href');
  const cell=page.locator('[data-js="gflow-inbox"] .ag-cell:has(.gflow-inbox__entry-cell-link)').first();
  await cell.focus();
  out.focus=await cell.evaluate(el=>{const s=getComputedStyle(el);return{active:document.activeElement===el,cell_focus_class:el.classList.contains('ag-cell-focus'),outline:`${s.outlineStyle} ${s.outlineWidth}`,border:`${s.borderStyle} ${s.borderWidth}`};});
  const before=page.url();
  await cell.press('Enter');
  await page.waitForURL(/page=gravityflow-inbox.*view=entry/,{timeout:15000});
  out.native_open_href=href;
  out.enter_navigated=page.url()!==before;
  await page.goto(inboxUrl,{waitUntil:'networkidle'});
  await waitForGrid(page);
  await page.screenshot({path:path.join(artifactDir,`inbox-v2-q2-${width}.png`),fullPage:false});
  return out;
}

export async function runQ2(page,qualification){
  try {
    const desktop=await snapshot(page,1440);
    const mobile=await snapshot(page,360);
    qualification.q2.observations={desktop_1440:desktop,mobile_360:mobile,enable_rtl_forced:false};
    const usable=[desktop,mobile].every(s=>s.focus?.active&&s.enter_navigated&&s.native_open_href?.includes('view=entry')&&s.pager_order_left_to_right.length>0);
    qualification.q2.status=usable?'PASS':'FAIL';
  } catch(error){
    qualification.q2.status='FAIL';
    qualification.q2.error=bounded(error?.stack||error,12000);
  }
}
