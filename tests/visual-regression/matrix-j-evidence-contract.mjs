import assert from 'node:assert/strict';
export const MATRIX_J_QUALIFICATION_ID = 'GPP-INBOX-MATRIX-J-BROWSER-ZOOM-V1';

export const MATRIX_J_CASES = Object.freeze({
  desktop_effective: Object.freeze({
    window_width: 2000,
    window_height: 1200,
    expected_narrow_media: false,
    expected_cards_per_visual_row: 2,
  }),
  narrow_effective: Object.freeze({
    window_width: 1400,
    window_height: 1200,
    expected_narrow_media: true,
    expected_cards_per_visual_row: 1,
  }),
});

export const MATRIX_J_ROUTES = Object.freeze(['shortcode', 'block']);

const approx = (actual, expected, tolerance) => Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance;

export function assertMatrixJObservationSemantics(observation) {
  const spec = MATRIX_J_CASES[observation?.case];
  assert.ok(spec, `Matrix J observation has unsupported case ${observation?.case || 'MISSING'}.`);
  assert.ok(MATRIX_J_ROUTES.includes(observation?.route), `Matrix J observation has unsupported route ${observation?.route || 'MISSING'}.`);
  assert.equal(observation.requested_window?.width, spec.window_width, `${observation.case}/${observation.route}: requested width does not match the declared Matrix J case.`);
  assert.equal(observation.requested_window?.height, spec.window_height, `${observation.case}/${observation.route}: requested height does not match the declared Matrix J case.`);
  assert.equal(observation.zoom_api?.requested, 2, `${observation.case}/${observation.route}: browser zoom request is not 200%.`);
  assert.ok(approx(observation.zoom_api?.actual, 2, 0.001), `${observation.case}/${observation.route}: chrome.tabs.getZoom did not confirm factor 2.`);

  const beforeWidth = observation.before?.inner_width;
  const afterWidth = observation.after?.inner_width;
  assert.ok(Number.isFinite(beforeWidth) && beforeWidth > 0 && Number.isFinite(afterWidth) && afterWidth > 0, `${observation.case}/${observation.route}: effective layout width evidence is missing.`);
  const recomputedRatio = beforeWidth / afterWidth;
  assert.ok(approx(recomputedRatio, observation.layout_width_ratio, 0.01), `${observation.case}/${observation.route}: serialized layout-width ratio does not match observed widths.`);
  assert.ok(recomputedRatio >= 1.8 && recomputedRatio <= 2.2, `${observation.case}/${observation.route}: genuine 200% browser zoom did not yield approximately 2x effective-width contraction.`);

  assert.equal(observation.after?.narrow_media_matches, spec.expected_narrow_media, `${observation.case}/${observation.route}: responsive media branch does not match the declared Matrix J case.`);
  assert.equal(observation.after?.cards_per_visual_row, spec.expected_cards_per_visual_row, `${observation.case}/${observation.route}: Card Mode composition does not match the declared Matrix J case.`);
  assert.equal(observation.after?.document_horizontal_overflow, 0, `${observation.case}/${observation.route}: 200% browser zoom created document horizontal overflow.`);
  assert.equal(observation.after?.surface_count, 1, `${observation.case}/${observation.route}: intended GPP surface count changed.`);
  assert.equal(observation.after?.grid_count, 1, `${observation.case}/${observation.route}: native Grid count changed.`);
  assert.equal(observation.after?.replacement_grid_count, 0, `${observation.case}/${observation.route}: replacement Grid appeared.`);
  assert.equal(observation.after?.pager_count, 1, `${observation.case}/${observation.route}: native pager count changed.`);
  assert.equal(observation.after?.search_count, 1, `${observation.case}/${observation.route}: native search count changed.`);
  assert.equal(observation.after?.manual_refresh_count, 1, `${observation.case}/${observation.route}: manual refresh count changed.`);
  assert.equal(observation.after?.search_reachable, true, `${observation.case}/${observation.route}: native search is not reachable.`);
  assert.equal(observation.after?.pager_reachable, true, `${observation.case}/${observation.route}: native pager is not reachable.`);
  assert.equal(observation.after?.manual_refresh_reachable, true, `${observation.case}/${observation.route}: manual refresh is not reachable.`);
  assert.equal(observation.after?.grid_visible, true, `${observation.case}/${observation.route}: native Grid is not visible.`);
  assert.equal(observation.after?.card_details_within_card, true, `${observation.case}/${observation.route}: critical card content clips outside the card.`);
  assert.equal(observation.after?.last_card_pager_overlap, false, `${observation.case}/${observation.route}: Card Mode overlaps the native pager.`);

  assert.equal(observation.pagination?.page_after, '2', `${observation.case}/${observation.route}: native pagination was not operational at 200% zoom.`);
  assert.ok(Number.isInteger(observation.pagination?.second_page_rows) && observation.pagination.second_page_rows > 0, `${observation.case}/${observation.route}: page-2 row evidence is invalid.`);
  assert.equal(observation.search?.observed_rows, 1, `${observation.case}/${observation.route}: native quick search was not operational at 200% zoom.`);
  assert.equal(observation.search?.unique_fixture_present, true, `${observation.case}/${observation.route}: native quick-search fixture identity is missing.`);
  assert.equal(observation.restored?.last_card_pager_overlap, false, `${observation.case}/${observation.route}: restored Card Mode overlaps the native pager.`);
  assert.equal(observation.restored?.cards_per_visual_row, spec.expected_cards_per_visual_row, `${observation.case}/${observation.route}: restored Card Mode composition does not match the declared Matrix J case.`);
  return true;
}

export function assertSerializedMatrixJProvenEvidence(evidence) {
  assert.equal(evidence?.qualification_id, MATRIX_J_QUALIFICATION_ID, 'Matrix J qualification identity mismatch.');
  assert.equal(evidence?.matrix, 'J', 'Matrix J evidence matrix identity mismatch.');
  assert.equal(evidence?.requested_zoom_factor, 2, 'Matrix J requested zoom factor must remain 2.');
  assert.equal(evidence?.status, 'PROVEN', 'Matrix J proven-evidence validator requires PROVEN status.');
  assert.equal(evidence?.conclusion, 'GENUINE_BROWSER_ZOOM_200_EXECUTED_AND_QUALIFIED', 'Matrix J PROVEN conclusion mismatch.');
  assert.equal(evidence?.mechanism?.kind, 'CHROMIUM_EXTENSION_TABS_SET_ZOOM', 'Matrix J browser-zoom mechanism changed.');
  assert.equal(evidence?.mechanism?.api, 'chrome.tabs.setZoom(tabId, 2)', 'Matrix J browser-zoom API changed.');
  assert.equal(evidence?.mechanism?.verification_api, 'chrome.tabs.getZoom(tabId)', 'Matrix J zoom verification API changed.');

  const observations = evidence?.observations;
  assert.ok(Array.isArray(observations), 'Matrix J observations are missing.');
  const expectedKeys = Object.keys(MATRIX_J_CASES).flatMap(caseName => MATRIX_J_ROUTES.map(route => `${caseName}/${route}`)).sort();
  const actualKeys = observations.map(item => `${item?.case}/${item?.route}`).sort();
  assert.deepEqual(actualKeys, expectedKeys, 'Matrix J must contain exactly one observation for every declared case/route pair.');
  for (const observation of observations) assertMatrixJObservationSemantics(observation);

  const parity = evidence?.block_shortcode_parity;
  assert.ok(Array.isArray(parity) && parity.length === Object.keys(MATRIX_J_CASES).length, 'Matrix J Block/shortcode parity evidence is incomplete.');
  const parityCases = parity.map(item => item?.case).sort();
  assert.deepEqual(parityCases, Object.keys(MATRIX_J_CASES).sort(), 'Matrix J parity evidence does not cover every declared case exactly once.');
  for (const item of parity) {
    const spec = MATRIX_J_CASES[item.case];
    assert.ok(Math.abs(item.shortcode_effective_width - item.block_effective_width) <= 2, `${item.case}: Block/shortcode effective widths diverged at 200% zoom.`);
    assert.equal(item.shortcode_cards_per_row, item.block_cards_per_row, `${item.case}: Block/shortcode Card Mode columns diverged at 200% zoom.`);
    assert.equal(item.shortcode_cards_per_row, spec.expected_cards_per_visual_row, `${item.case}: parity evidence does not satisfy the declared Card Mode composition.`);
    assert.equal(item.shortcode_narrow, item.block_narrow, `${item.case}: Block/shortcode responsive branches diverged at 200% zoom.`);
    assert.equal(item.shortcode_narrow, spec.expected_narrow_media, `${item.case}: parity evidence does not satisfy the declared responsive branch.`);
  }
  return true;
}
