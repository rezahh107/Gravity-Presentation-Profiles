export async function applyScenarioAction(page, action, selectors) {
  const rowsSelector = `${selectors.centerRows} > .ag-row`;
  const cardsSelector = `${rowsSelector} .gpp-inbox-card`;
  const search = page.locator(selectors.searchInput);
  if (action === 'search_result' || action === 'search_empty') {
    const query = action === 'search_result' ? '00:24:00' : 'VISUAL-NO-RESULT-SYNTHETIC';
    const expectedRows = action === 'search_result' ? 1 : 0;
    await search.click();
    await search.pressSequentially(query);
    await page.waitForFunction(
      ({ selector, count }) => document.querySelectorAll(selector).length === count,
      { selector: rowsSelector, count: expectedRows },
      { timeout: 15000 },
    );
    const rows = page.locator(rowsSelector);
    const cards = page.locator(cardsSelector);
    if (await rows.count() !== expectedRows || await cards.count() !== expectedRows) throw new Error(`${action} did not reach its required native Grid/card count.`);
    let uniqueFixturePresent = false;
    if (action === 'search_result') {
      const text = await rows.first().innerText();
      uniqueFixturePresent = text.includes('WU21 Alpha Student 24') && text.includes('2026-01-01 00:24:00');
      if (!uniqueFixturePresent) throw new Error('search_result did not reach the unique WU21 quick-search fixture.');
    }
    if (action === 'search_empty' && await page.locator(selectors.gridRoot).count() !== 1) throw new Error('search_empty lost the authentic native Grid empty-state surface.');
    return { action, query, expected_rows:expectedRows,observed_rows:await rows.count(),observed_cards:await cards.count(),unique_fixture_present:uniqueFixturePresent,authentic_grid_surface_present:true,empty_state_kind:action==='search_empty'?'NATIVE_GRID_ZERO_ROWS':null };
  }
  if (action === 'pagination') {
    const rows = page.locator(rowsSelector);
    const initialRows = await rows.count();
    if (initialRows !== 20) throw new Error(`pagination requires the native first page with 20 rows, got ${initialRows}.`);
    const current = page.locator('[data-js="gflow-inbox"] [ref="lbCurrent"]');
    const total = page.locator('[data-js="gflow-inbox"] [ref="lbTotal"]');
    const next = page.locator('[data-js="gflow-inbox"] [ref="btNext"]');
    if (await current.count() !== 1 || await total.count() !== 1 || await next.count() !== 1) throw new Error('pagination native controls are unavailable.');
    const pageBefore = (await current.innerText()).trim();
    const totalPages = (await total.innerText()).trim();
    if (pageBefore !== '1' || Number(totalPages) < 2) throw new Error(`pagination requires native page 1 of at least 2, got ${pageBefore}/${totalPages}.`);
    const firstPageIds = await rows.evaluateAll(elements => elements.map(element => element.getAttribute('row-id')).filter(Boolean));
    if (firstPageIds.length !== initialRows) throw new Error(`pagination first page lost row identity: ${firstPageIds.length}/${initialRows}.`);
    const disabled = await next.evaluate(element => element.classList.contains('ag-disabled') || element.getAttribute('aria-disabled') === 'true');
    if (disabled) throw new Error('pagination next-page control is disabled.');
    await next.click();
    await page.waitForFunction(
      ({ currentSelector, rowSelector, previousIds }) => {
        if (document.querySelector(currentSelector)?.textContent?.trim() !== '2') return false;
        const ids=[...document.querySelectorAll(rowSelector)].map(element=>element.getAttribute('row-id')).filter(Boolean);
        return ids.length>=1 && ids.length<=20 && ids.every(id=>!previousIds.includes(id));
      },
      { currentSelector:'[data-js="gflow-inbox"] [ref="lbCurrent"]',rowSelector:rowsSelector,previousIds:firstPageIds },
      { timeout:15000 },
    );
    const observedRows = await rows.count();
    const pageAfter = (await current.innerText()).trim();
    const secondPageIds = await rows.evaluateAll(elements => elements.map(element => element.getAttribute('row-id')).filter(Boolean));
    const overlap = secondPageIds.filter(id => firstPageIds.includes(id));
    if (pageAfter!=='2' || observedRows<1 || observedRows>20 || secondPageIds.length!==observedRows || overlap.length) throw new Error(`pagination native transition invalid: page=${pageAfter}, rows=${observedRows}, ids=${secondPageIds.length}, overlap=${overlap.length}.`);
    return { action,activation:'click',page_before:pageBefore,total_pages:Number(totalPages),page_after:pageAfter,first_page_rows:initialRows,second_page_rows:observedRows,row_identity_changed:true,first_page_row_ids:firstPageIds,second_page_row_ids:secondPageIds,native_next_control:true };
  }
  if (action === 'focus') {
    await search.focus();
    const ownsFocus = await search.evaluate(element => document.activeElement === element);
    if (!ownsFocus) throw new Error('focus scenario search input did not own document focus.');
    return { action, search_input_owns_focus:true };
  }
  return { action:null,postcondition:'NOT_APPLICABLE' };
}
