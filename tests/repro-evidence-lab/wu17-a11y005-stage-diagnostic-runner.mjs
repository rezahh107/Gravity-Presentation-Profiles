import fs from 'node:fs';

const sourceUrl = new URL('./wu17-a11y005-a11y001-stage-diagnostic.mjs', import.meta.url);
const runtimeUrl = new URL('./.wu17-a11y005-a11y001-stage-diagnostic.runtime.mjs', import.meta.url);
const original = fs.readFileSync(sourceUrl, 'utf8');
const needle = 'document.querySelector(`${scope} .ag-tab-guard-top`)';
const replacement = 'document.querySelector(\'[data-gpp-inbox-surface="gravity_flow.inbox"] .ag-tab-guard-top\')';
if (!original.includes(needle)) throw new Error('Temporary A11Y stage diagnostic no longer has the expected selector handoff defect.');
fs.writeFileSync(runtimeUrl, original.replace(needle, replacement));
try {
  await import(`${runtimeUrl.href}?run=${Date.now()}`);
} finally {
  fs.rmSync(runtimeUrl, { force: true });
}
