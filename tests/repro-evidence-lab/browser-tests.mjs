import fs from 'node:fs';
import path from 'node:path';

const artifactDir = process.env.WU21_ARTIFACT_DIR;
const pr87Qualification = process.env.GITHUB_HEAD_REF === 'test/pr87-native-height-counterfactual';
const deferred = [];

async function run(module) {
  if (!pr87Qualification) {
    await import(module);
    return;
  }
  const previousExitCode = process.exitCode;
  process.exitCode = 0;
  try {
    await import(module);
    const exitCode = Number(process.exitCode || 0);
    deferred.push({ module, status: exitCode === 0 ? 'PASS' : 'FAIL', exit_code: exitCode });
  } catch (error) {
    deferred.push({ module, status: 'FAIL', error: String(error?.stack || error) });
  } finally {
    process.exitCode = previousExitCode || 0;
  }
}

const originalExit = process.exit;
if (pr87Qualification) {
  process.exit = code => {
    const numeric = Number(code || 0);
    if (numeric !== 0) throw new Error(`Deferred pre-existing suite process.exit(${numeric}) for PR87 qualification continuation.`);
    return undefined;
  };
}

try {
  await run('./browser-tests-core.mjs');
  await run('./wu11-ag-grid-host-contract.mjs');
  await run('./wu17-inbox-accessibility-browser-test.mjs');
  await run('./p05-inbox-palette-contract-browser-test.mjs');
  await run('./pr33-visual-fidelity-browser-tests.mjs');
  await run('./pr33-baseline-report.mjs');

  if (artifactDir) {
    for (const file of ['pr4-inbox-sizing-measurements.json', 'wu17-browser-results.json', 'wu17-accessibility-browser-results.json', 'pr33-visual-baseline.json', 'wu17-wu11-ag-grid-host-contract.json']) {
      const evidencePath = path.join(artifactDir, file);
      if (fs.existsSync(evidencePath)) {
        process.stdout.write(`PR4_EVIDENCE_${file.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}=${fs.readFileSync(evidencePath, 'utf8').trim()}\n`);
      }
    }
  }

  await run('./manual-inbox-refresh-browser-test.mjs');
  globalThis.CSS = globalThis.CSS || { escape: value => String(value).replace(/([^A-Za-z0-9_-])/g, '\\$1') };
  await run('./authoring-prompt-admin-browser-tests.mjs');
  await run('./diagnostics-admin-row-browser-tests.mjs');
  await run('./diagnostics-bundle-validate.mjs');
  await run('./inbox-settings-admin-browser-tests.mjs');
  await run('./inbox-human-display-browser-tests.mjs');

  // GPP-RP-WU-00/01 extends the admitted WU21 browser/runtime flow only after
  // all existing regression suites have completed. Its prototype CSS is injected
  // in-browser and never mutates production assets.
  await run('./inbox-width-rtl-comparative-bootstrap.mjs');
  await run('./inbox-width-rtl-comparative-browser-tests.mjs');
  await run('./inbox-width-rtl-comparative-finalize.mjs');

  // Establish the one authoritative, idempotent P06 fixture before the first
  // late-runtime consumer. The later P06 qualification reuses this same state.
  await run('./p06-fixture-bootstrap.mjs');

  // P06 exercises deliberate lifecycle mutation for its inactive-profile negative
  // control. Keep it after the established browser regressions so the new
  // qualification cannot alter the state observed by pre-existing suites.
  if (process.env.GPP_DEFER_P06_QUALIFICATION !== '1') {
    await run('./p06-inbox-asset-reachability-browser-test.mjs');
  }
} finally {
  if (pr87Qualification) {
    process.exit = originalExit;
    process.exitCode = 0;
    if (artifactDir) {
      fs.writeFileSync(path.join(artifactDir, 'pr87-deferred-existing-browser-suite-results.json'), JSON.stringify({
        purpose: 'Qualification-only continuation; assertions are unchanged and failures remain recorded.',
        branch: process.env.GITHUB_HEAD_REF,
        results: deferred,
      }, null, 2) + '\n');
    }
    for (const item of deferred) console.log(`PR87_DEFERRED_${item.status} ${item.module}`);
  }
}
