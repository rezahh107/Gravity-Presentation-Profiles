import fs from 'node:fs';
import path from 'node:path';

// P06 is an asset-admission prerequisite for every frontend Inbox regression.
// Run it first so failures distinguish reachability/head-delivery defects from
// downstream Card Mode, palette, accessibility, or geometry regressions.
await import('./p06-inbox-asset-reachability-browser-test.mjs');
await import('./p06-inbox-cascade-diagnostic.mjs');
await import('./browser-tests-core.mjs');
await import('./wu17-inbox-accessibility-browser-test.mjs');
await import('./p05-inbox-palette-contract-browser-test.mjs');
await import('./pr33-visual-fidelity-browser-tests.mjs');
await import('./pr33-baseline-report.mjs');

const artifactDir = process.env.WU21_ARTIFACT_DIR;
if (artifactDir) {
  for (const file of ['pr4-inbox-sizing-measurements.json', 'wu17-browser-results.json', 'wu17-accessibility-browser-results.json', 'pr33-visual-baseline.json']) {
    const evidencePath = path.join(artifactDir, file);
    if (fs.existsSync(evidencePath)) {
      process.stdout.write(`PR4_EVIDENCE_${file.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}=${fs.readFileSync(evidencePath, 'utf8').trim()}\n`);
    }
  }
}

await import('./manual-inbox-refresh-browser-test.mjs');
globalThis.CSS = globalThis.CSS || { escape: value => String(value).replace(/([^A-Za-z0-9_-])/g, '\\$1') };
await import('./authoring-prompt-admin-browser-tests.mjs');
await import('./diagnostics-admin-row-browser-tests.mjs');
await import('./diagnostics-bundle-validate.mjs');
await import('./inbox-settings-admin-browser-tests.mjs');
await import('./inbox-human-display-browser-tests.mjs');

// GPP-RP-WU-00/01 extends the admitted WU21 browser/runtime flow only after
// all existing regression suites have completed. Its prototype CSS is injected
// in-browser and never mutates production assets.
await import('./inbox-width-rtl-comparative-bootstrap.mjs');
await import('./inbox-width-rtl-comparative-browser-tests.mjs');
await import('./inbox-width-rtl-comparative-finalize.mjs');
