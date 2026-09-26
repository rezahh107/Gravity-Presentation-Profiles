import fs from 'node:fs';
import path from 'node:path';

await import('./browser-tests-core.mjs');
await import('./wu11-ag-grid-host-contract.mjs');
await import('./wu17-inbox-accessibility-browser-test.mjs');
// PRI-FND-001 is an exact-runtime geometry gate: native filter state + keyboard focus.
await import('./pri-fnd-001-inbox-focus-clearance-browser-test.mjs');
await import('./p05-inbox-palette-contract-browser-test.mjs');
await import('./pr33-visual-fidelity-browser-tests.mjs');
await import('./pr33-baseline-report.mjs');

const artifactDir = process.env.WU21_ARTIFACT_DIR;
if (artifactDir) {
  for (const file of ['pr4-inbox-sizing-measurements.json', 'wu17-browser-results.json', 'wu17-accessibility-browser-results.json', 'pri-fnd-001-focus-clearance.json', 'pr33-visual-baseline.json', 'wu17-wu11-ag-grid-host-contract.json']) {
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

// Establish the one authoritative, idempotent P06 fixture before the first
// late-runtime consumer. The later P06 qualification reuses this same state.
await import('./p06-fixture-bootstrap.mjs');

// P06 exercises deliberate lifecycle mutation for its inactive-profile negative
// control. Keep it after the established browser regressions so the new
// qualification cannot alter the state observed by pre-existing suites.
if (process.env.GPP_DEFER_P06_QUALIFICATION !== '1') {
  await import('./p06-inbox-asset-reachability-browser-test.mjs');
}
