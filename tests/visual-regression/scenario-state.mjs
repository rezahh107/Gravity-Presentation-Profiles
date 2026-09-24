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
    const next = page.locator('[data-js="gflow-inbox"] [ref="btNext"]');
    if (await next.count() !== 1) throw new Error('pagination next-page control is unavailable.');
    const disabled = await next.evaluate(element => element.classList.contains('ag-disabled') || element.getAttribute('aria-disabled') === 'true');
    if (disabled) throw new Error('pagination next-page control is disabled.');
    await next.click();
    await page.waitForFunction(selector => document.querySelectorAll(selector).length === 5, rowsSelector, { timeout: 15000 });
    const observedRows = await rows.count();
    if (observedRows !== 5) throw new Error(`pagination did not reach the native second page, got ${observedRows} rows.`);
    return { action, initial_rows:initialRows,observed_rows:observedRows,native_next_control:true };
  }
  if (action === 'focus') {
    await search.focus();
    const ownsFocus = await search.evaluate(element => document.activeElement === element);
    if (!ownsFocus) throw new Error('focus scenario search input did not own document focus.');
    return { action, search_input_owns_focus:true };
  }
  return { action:null,postcondition:'NOT_APPLICABLE' };
}
