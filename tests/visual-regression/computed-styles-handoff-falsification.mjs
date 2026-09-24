import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cssPixelNumber, physicalHorizontalGap } from './geometry-relations.mjs';

// Prove the original defect control really fails before exercising the repair.
const evaluate = (_callback, argument) => argument;
assert.throws(
  () => Function('evaluate', 'return evaluate(value => value, map);')(evaluate),
  error => error instanceof ReferenceError && /map is not defined/.test(error.message),
  'Original undefined host argument did not reproduce.',
);

// Import only the helper definition without starting the module's runtime setup.
const source = fs.readFileSync(new URL('./inbox-visual-diagnostics.mjs', import.meta.url), 'utf8');
const selectorsMatch = source.match(/const selectors = (\{[\s\S]*?\n\});\n\nasync function waitReady/);
const diagnosticsMatch = source.match(/export async function diagnostics\(page\) \{[\s\S]*?\n\}/);
const stylesMatch = source.match(/export async function styles\(page\) \{[\s\S]*?\n\}/);
assert.ok(selectorsMatch && diagnosticsMatch && stylesMatch, 'Parameterized evaluate boundaries were not extractable.');
const load = Function('physicalHorizontalGap', 'cssPixelNumber', `${selectorsMatch[0].replace(/\n\nasync function waitReady[\s\S]*/, '')}\n${diagnosticsMatch[0].replace('export ', '')}\n${stylesMatch[0].replace('export ', '')}\nreturn { selectors, diagnostics, styles };`);
const { selectors, diagnostics, styles } = load(physicalHorizontalGap, cssPixelNumber);

const previousDocument = globalThis.document;
const previousGetComputedStyle = globalThis.getComputedStyle;
const root = { getBoundingClientRect: () => ({ x:0,y:0,width:100,height:100,right:100,bottom:100 }), clientWidth:100,scrollWidth:100,clientHeight:100,scrollHeight:100 };
globalThis.document = { documentElement:root,querySelector:()=>null,querySelectorAll:()=>[] };
globalThis.getComputedStyle = () => ({ display:'block',visibility:'visible',overflow:'visible',direction:'ltr',gap:'normal',padding:'0px' });
const transfers=[];
try {
  const page = {
    evaluate(callback, argument) {
      transfers.push(argument);
      return callback(argument);
    },
  };
  const result = await styles(page);
  const geometry = await diagnostics(page);
  assert.strictEqual(transfers[0], selectors, 'styles() did not transfer the authoritative selector map.');
  assert.strictEqual(transfers[1], selectors, 'diagnostics() did not transfer the authoritative selector map.');
  assert.deepEqual(Object.keys(result), Object.keys(selectors), 'Browser callback did not receive the complete selector map.');
  assert.ok(Object.values(result).every(value => value === null), 'Null-element computed-style control was not deterministic.');
  assert.equal(geometry.relationships.horizontal_overflow, null, 'Geometry argument-transfer control was not deterministic.');
} finally {
  if (previousDocument === undefined) delete globalThis.document;
  else globalThis.document = previousDocument;
  if (previousGetComputedStyle === undefined) delete globalThis.getComputedStyle;
  else globalThis.getComputedStyle = previousGetComputedStyle;
}

console.log(`COMPUTED_STYLES_HANDOFF_PASS selectors=${Object.keys(selectors).length}`);
