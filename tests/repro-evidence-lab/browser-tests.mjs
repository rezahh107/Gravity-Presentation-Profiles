import fs from 'node:fs';
import path from 'node:path';

await import('./browser-tests-core.mjs');

const artifactDir = process.env.WU21_ARTIFACT_DIR;
if (artifactDir) {
  for (const file of ['pr4-inbox-sizing-measurements.json', 'wu17-browser-results.json']) {
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
