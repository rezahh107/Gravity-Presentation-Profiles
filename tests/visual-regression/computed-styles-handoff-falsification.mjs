import assert from 'node:assert/strict';
import fs from 'node:fs';

// Preserve the historical falsification control: relying on an outer variable
// inside a serialized browser callback fails when that value is not explicitly
// transferred across the evaluate boundary.
const evaluate = (_callback, argument) => argument;
assert.throws(
  () => Function('evaluate', 'return evaluate(value => value, map);')(evaluate),
  error => error instanceof ReferenceError && /map is not defined/.test(error.message),
  'Original undefined host argument did not reproduce.',
);

// Native-First diagnostics removed the Card Mode computed-style handoff
// altogether. The current structural probe intentionally uses a self-contained
// page.evaluate callback with literal native selectors, so there is no selector
// map to serialize or silently lose at this boundary.
const source = fs.readFileSync(new URL('./inbox-visual-diagnostics.mjs', import.meta.url), 'utf8');
assert.match(source, /const state = await page\.evaluate\(\(\) => \{/,
  'Native-First structural diagnostic no longer exposes a self-contained evaluate boundary.');
assert.doesNotMatch(source, /export async function (?:diagnostics|styles)\(/,
  'Superseded Card Mode computed-style helper is still exported.');
assert.doesNotMatch(source, /page\.evaluate\([^;]*,\s*selectors\s*\)/s,
  'Native-First diagnostic unexpectedly reintroduced selector-map argument handoff.');
assert.match(source, /document\.querySelectorAll\('\[data-js="gflow-inbox"\] \.ag-root-wrapper'\)/,
  'Native-First structural callback does not inspect the authoritative native Grid target.');
assert.match(source, /card_column_count:\s*document\.querySelectorAll\('\[col-id="gpp_case_card"\]'\)\.length/,
  'Native-First structural callback does not falsify the retired Card Mode column.');

console.log('COMPUTED_STYLES_HANDOFF_RETIRED_PASS architecture=NATIVE_FIRST boundary=self-contained');
