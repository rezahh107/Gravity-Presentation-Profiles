/**
 * Historical WU17 Card Mode browser harness.
 *
 * The Owner-approved Native-First Inbox reset retires Card Mode itself, so the
 * old WU17 card/readiness/geometry assertions are no longer valid merge gates.
 * Current runtime evidence is produced by browser-tests-core.mjs, manual refresh,
 * settings, diagnostics and P06 reachability tests. Returning an empty result set
 * here avoids manufacturing a synthetic PASS while keeping the historical module
 * import-compatible for the WU21 runner during this bounded reset.
 */
export async function runWu17BrowserTests() {
  return [];
}
