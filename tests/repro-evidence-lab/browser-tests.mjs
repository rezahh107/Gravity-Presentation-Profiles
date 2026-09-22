import { spawnSync } from 'node:child_process';
import path from 'node:path';

const repoRoot = process.env.GITHUB_WORKSPACE;
if (!repoRoot) throw new Error('GITHUB_WORKSPACE is required.');

const scripts = [
  'p06-inbox-asset-reachability-browser-test.mjs',
  'browser-native-tests.mjs',
  'p05-inbox-palette-browser-test.mjs',
  'pr33-visual-baseline-browser-test.mjs',
  'wu17-browser-tests.mjs',
  'wu17-accessibility-browser-tests.mjs',
  'inbox-width-rtl-comparative-browser-tests.mjs',
];

for (const script of scripts) {
  const result = spawnSync('node', [path.join(repoRoot, 'tests/repro-evidence-lab', script)], {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
