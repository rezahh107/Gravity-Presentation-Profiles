import { inboxUrl, wpControl, waitForGrid, visibleRows, pagerState, activeElement, gridScrollState, waitForPollingTransaction, bounded } from './inbox-v2-qualification-shared.mjs';

function updateDate(id){wpControl('q4_update',{GPP_INBOX_V2_ENTRY_ID:String(id)});}
function addEntry(){return Number(wpControl('q4_add'));}
function deleteEntry(id){wpControl('delete_entry',{GPP_INBOX_V2_ENTRY_ID:String(id)});}

export async function runQ4(page,polling,qualification){
  let added=0;
  try{
    await page.setViewportSize({width:1440,height:1000});
    await page.goto(inboxUrl,{waitUntil:'networkidle'});
    await waitForGrid(page);
    await page.locator('[data-js="gflow-inbox"] [ref="btNext"]').click();
    await page.waitForFunction(()=>document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').length>0);
    const previous=page.locator('[data-js="gflow-inbox"] [ref="btPrevious"]');
    await previous.focus();
    const beforeRows=await visibleRows(page);
    const before={pager:await pagerState(page),rows:beforeRows,focus:await activeElement(page),scroll:await gridScrollState(page)};
    if(String(before.pager.current)!=='2')throw new Error(`Expected native page 2, got ${JSON.stringify(before.pager)}`);

    const updateId=Number(beforeRows[0].id);
    const updateStart=polling.length;
    updateDate(updateId);
    const updatePoll=await waitForPollingTransaction(page,polling,updateStart,'update',updateId);

    const addStart=polling.length;
    added=addEntry();
    const addPoll=await waitForPollingTransaction(page,polling,addStart,'add',added);

    const removeStart=polling.length;
    deleteEntry(added);
    const removePoll=await waitForPollingTransaction(page,polling,removeStart,'remove',added);
    added=0;

    const after={pager:await pagerState(page),rows:await visibleRows(page),focus:await activeElement(page),scroll:await gridScrollState(page)};
    const openHref=await page.locator('[data-js="gflow-inbox"] .gflow-inbox__entry-cell-link').first().getAttribute('href');
    const topology={grid_count:await page.locator('[data-js="gflow-inbox"] .ag-root-wrapper').count(),pager_count:await page.locator('[data-js="gflow-inbox"] .ag-paging-panel').count(),replacement_count:await page.locator('[data-gpp-replacement-inbox], .gpp-custom-inbox-app, .gpp-inbox-card').count()};
    const focusPreserved=before.focus&&after.focus&&before.focus.ref===after.focus.ref&&before.focus.tag===after.focus.tag;
    qualification.q4.observations={before,after,transactions:{update:Boolean(updatePoll),add:Boolean(addPoll),remove:Boolean(removePoll)},focus_disposition:focusPreserved?'PRESERVED':'BOUNDED_NATIVE_FOCUS_CHANGE_OBSERVED',native_open_href:openHref,topology};
    const coherent=String(after.pager.current)==='2'&&after.pager.count===1&&topology.grid_count===1&&topology.pager_count===1&&topology.replacement_count===0&&openHref?.includes('view=entry');
    const transactions=Boolean(updatePoll&&addPoll&&removePoll);
    qualification.q4.status=coherent&&transactions?'PASS':'FAIL';
    qualification.live_refresh.q4=transactions&&coherent?'PASS':'FAIL';
  }catch(error){
    qualification.q4.status='FAIL';
    qualification.q4.error=bounded(error?.stack||error,12000);
  }finally{
    if(added)deleteEntry(added);
  }
}
