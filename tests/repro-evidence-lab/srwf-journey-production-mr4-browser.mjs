import { spawnSync } from 'node:child_process';

// Qualification-only wrapper. Preserve the canonical MR-4 browser program byte-for-byte
// in the sibling file, then capture additional Correction UX evidence in the same pinned
// Hello Elementor runtime. Production behavior is not changed.
await import('./srwf-journey-production-mr4-browser-canonical.mjs');

const wpCli = process.env.WU21_WP_CLI;
const wpPath = process.env.WU21_WP_PATH;
if (!wpCli || !wpPath) throw new Error('Pinned WP-CLI environment is unavailable for Correction UX source qualification.');
const sourceProbe = spawnSync(
  'php',
  [wpCli, `--path=${wpPath}`, 'eval-file', 'tests/repro-evidence-lab/srwf-correction-ux-source-probe.php'],
  { encoding: 'utf8', env: process.env }
);
if (sourceProbe.status !== 0) {
  throw new Error(`Correction UX source probe failed:\n${sourceProbe.stderr}\n${sourceProbe.stdout}`);
}

await import('./srwf-correction-ux-browser.mjs');
await import('./srwf-correction-ux-candidate-browser.mjs');
