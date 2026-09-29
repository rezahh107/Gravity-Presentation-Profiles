import { inboxUrl, jsonControl, wpControl, waitForGrid, visibleRows, waitForPollingTransaction, bounded } from './inbox-v2-qualification-shared.mjs';

function setupQ1Fixture() { return jsonControl('q1_setup'); }
function cleanupQ1Fixture(extraEntryId = 0) { wpControl('q1_cleanup', { GPP_INBOX_V2_ENTRY_ID: String(extraEntryId || 0) }); }
function updateQ1Entry(entryId) { wpControl('q1_update', { GPP_INBOX_V2_ENTRY_ID: String(entryId) }); }
function addQ1Entry() { return Number(wpControl('q1_add')); }
function rawSnapshot(ids) { return jsonControl('q1_raw_snapshot', { GPP_INBOX_V2_ENTRY_IDS: JSON.stringify(ids) }); }

export async function runQ1(page, polling, qualification) {
  let extraEntry = 0;
  try {
    qualification.q1.observations.fixture = setupQ1Fixture();
    await page.goto(inboxUrl, { waitUntil: 'networkidle' }); await waitForGrid(page); await page.waitForSelector('[col-id="50"]', { timeout: 15000 });
    const q1Cells = page.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-cell[col-id="50"]');
    const richCount = await q1Cells.locator('[data-gpp-q1-rich="1"]').count();
    const svgCount = await q1Cells.locator('svg[data-gpp-q1-svg="1"] path').count();
    const escapedMarkup = await q1Cells.filter({ hasText: '<span' }).count();
    const unsafe = await page.evaluate(() => ({
      executed: Number(window.__gppQ1Unsafe || 0),
      script_nodes: document.querySelectorAll('[col-id="50"] script').length,
      event_handlers: document.querySelectorAll('[col-id="50"] [onerror], [col-id="50"] [onclick]').length,
      unsafe_img: document.querySelectorAll('[col-id="50"] img').length,
    }));

    const link = page.locator('[data-js="gflow-inbox"] .gflow-inbox__entry-cell-link').first();
    const href = await link.getAttribute('href');
    const cell = page.locator('[data-js="gflow-inbox"] .ag-cell:has(.gflow-inbox__entry-cell-link)').first();
    await cell.focus();
    const focus = await cell.evaluate(el => {
      const s=getComputedStyle(el);
      const outline=s.outlineStyle!=='none'&&parseFloat(s.outlineWidth||'0')>0;
      const border=['solid','double','dashed','dotted'].includes(s.borderStyle)&&parseFloat(s.borderWidth||'0')>0;
      const shadow=s.boxShadow&&s.boxShadow!=='none';
      return { active:document.activeElement===el, outline:`${s.outlineStyle} ${s.outlineWidth}`, border:`${s.borderStyle} ${s.borderWidth}`, box_shadow:s.boxShadow, cell_focus_class:el.classList.contains('ag-cell-focus'), visible_indicator:outline||border||shadow||el.classList.contains('ag-cell-focus') };
    });
    const beforeEnter=page.url();
    await cell.press('Enter');
    await page.waitForURL(/page=gravityflow-inbox.*view=entry/, { timeout: 15000 });
    const enterNavigated=page.url()!==beforeEnter;
    await page.goto(inboxUrl, { waitUntil: 'networkidle' }); await waitForGrid(page);

    const search=page.locator('[data-js="gflow-inbox-search"]');
    await search.fill('Q1-RAW-01'); await search.dispatchEvent('keyup'); await page.waitForTimeout(500); const rawSearchRows=await visibleRows(page);
    await search.fill('Q1-DISPLAY-98'); await search.dispatchEvent('keyup'); await page.waitForTimeout(500); const displaySearchRows=await visibleRows(page);
    await search.fill(''); await search.dispatchEvent('keyup'); await page.waitForTimeout(500);

    const header=page.locator('[data-js="gflow-inbox"] .ag-header-cell[col-id="50"]');
    await header.click(); await page.waitForTimeout(400);
    const firstSort=await header.getAttribute('aria-sort');
    const sortedRows=await visibleRows(page);
    const sortedIds=sortedRows.map(r=>Number(r.id)).filter(Number.isFinite);
    const rawById=rawSnapshot(sortedIds);
    const sortSample=sortedIds.slice(0,12).map(id=>({id,raw:rawById[String(id)],rendered:sortedRows.find(r=>Number(r.id)===id)?.text||''}));
    const rawNumeric=sortSample.map(x=>/^Q1-RAW-(\d{2})$/.exec(x.raw)).filter(Boolean).map(m=>Number(m[1]));
    const rawAscending=rawNumeric.length>=3&&rawNumeric.every((n,i,a)=>i===0||a[i-1]<=n);
    const rawDescending=rawNumeric.length>=3&&rawNumeric.every((n,i,a)=>i===0||a[i-1]>=n);
    const sortBasis=rawAscending?'RAW_ASCENDING':rawDescending?'RENDERED_DERIVED_OR_RAW_DESCENDING':'OTHER_OR_NOT_DETERMINED';

    await search.fill(''); await search.dispatchEvent('keyup'); await page.waitForTimeout(300);
    const firstRowId=Number((await visibleRows(page))[0].id);
    const updateStart=polling.length; updateQ1Entry(firstRowId);
    await page.waitForFunction(id=>{const row=document.querySelector(`[data-js="gflow-inbox"] .ag-row[row-id="${CSS.escape(String(id))}"]`);return row&&row.textContent.includes('Q1-DISPLAY-UPDATED');}, firstRowId, {timeout:45000});
    const updatePoll=await waitForPollingTransaction(page,polling,updateStart,'update',firstRowId);
    const addStart=polling.length; extraEntry=addQ1Entry();
    await page.waitForFunction(id=>{const row=document.querySelector(`[data-js="gflow-inbox"] .ag-row[row-id="${CSS.escape(String(id))}"]`);return row&&row.textContent.includes('Q1-DISPLAY-ADDED');}, extraEntry, {timeout:45000});
    const addPoll=await waitForPollingTransaction(page,polling,addStart,'add',extraEntry);

    const oneGrid=await page.locator('[data-js="gflow-inbox"] .ag-root-wrapper').count();
    const onePager=await page.locator('[data-js="gflow-inbox"] .ag-paging-panel').count();
    const authoritativeRaw=Object.values(rawById).some(v=>/^Q1-RAW-/.test(String(v)))&&Object.values(rawById).every(v=>!String(v).includes('<span'));
    const rawSemantics={authoritative_raw_preserved:authoritativeRaw,search_not_rendered_dependent:displaySearchRows.length===0,sort_not_rendered_dependent:sortBasis==='RAW_ASCENDING'};
    qualification.q1.observations={...qualification.q1.observations,rich_markup_nodes:richCount,svg_path_nodes:svgCount,escaped_markup_text_matches:escapedMarkup,unsafe,native_open:{href,enter_navigated:enterNavigated},focus,search_semantics:{raw_query_rows:rawSearchRows.length,display_query_rows:displaySearchRows.length},sort_semantics:{aria_sort:firstSort,sample:sortSample,observed_basis:sortBasis},raw_semantics:rawSemantics,live_refresh_update:{entry_id:firstRowId,transaction_observed:Boolean(updatePoll)},live_refresh_add:{entry_id:extraEntry,transaction_observed:Boolean(addPoll)},native_topology:{grid_count:oneGrid,pager_count:onePager}};
    const safeRich=richCount>0&&svgCount>0&&escapedMarkup===0&&unsafe.executed===0&&unsafe.script_nodes===0&&unsafe.event_handlers===0;
    const interaction=Boolean(href&&href.includes('view=entry')&&enterNavigated&&focus.active&&focus.visible_indicator);
    const rawOk=Object.values(rawSemantics).every(Boolean);
    const refresh=Boolean(updatePoll&&addPoll&&oneGrid===1&&onePager===1);
    qualification.q1.status=safeRich&&interaction&&rawOk&&refresh?'PASS':'FAIL';
    qualification.live_refresh.q1=refresh?'PASS':'FAIL';
  } catch(error) {
    qualification.q1.status='FAIL';
    qualification.q1.error=bounded(error?.stack||error,12000);
  } finally {
    cleanupQ1Fixture(extraEntry);
    await page.goto(inboxUrl,{waitUntil:'networkidle'}).catch(()=>{});
  }
}
