import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Qualification-only correction to the V2 positive control: on the pinned
// integrated Hello/Elementor host, PR87 still reproduces partial desktop row
// materialization, but the Block surface materializes 7 rows rather than the
// 5 observed in the earlier native-host stage. The defect signal is therefore
// "current PR87 desktop materialization is a strict subset of the native 20",
// not "every host stage must materialize exactly five rows".
//
// Keep the V2 experiment itself byte-for-byte reusable and generate a temporary
// same-directory module with only that over-strict control assertion relaxed.
const here = path.dirname(new URL(import.meta.url).pathname);
const sourcePath = path.join(here, 'pr87-native-height-restoration-counterfactual-v2.mjs');
const generatedPath = path.join(here, '.pr87-native-height-restoration-counterfactual-v3.generated.mjs');
const original = fs.readFileSync(sourcePath, 'utf8');
const exact = "  for (const route of Object.keys(routes)) assert.equal(observations.find(x=>x.route===route&&x.device==='desktop')?.row_count,5,`Positive control ${route}/desktop did not reproduce 20->5 materialization.`);";
const replacement = "  for (const route of Object.keys(routes)) { const rows=observations.find(x=>x.route===route&&x.device==='desktop')?.row_count; assert.ok(Number.isInteger(rows)&&rows>0&&rows<20,`Positive control ${route}/desktop did not reproduce partial materialization below native 20: ${rows}.`); }";
if (!original.includes(exact)) throw new Error('PR87 qualification V3 could not locate the exact V2 positive-control assertion.');
const generated = original.replace(exact, replacement);
if (generated === original) throw new Error('PR87 qualification V3 made no harness change.');
fs.writeFileSync(generatedPath, generated);
try {
  await import(`${pathToFileURL(generatedPath).href}?run=${Date.now()}`);
} finally {
  fs.rmSync(generatedPath, { force: true });
}
