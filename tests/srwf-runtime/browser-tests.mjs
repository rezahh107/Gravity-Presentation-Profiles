import { execFileSync } from 'node:child_process';

const wpCli = process.env.SRWF_WP_CLI;
const wpPath = process.env.SRWF_WP_PATH;
if (!wpCli || !wpPath) {
  throw new Error('SRWF_WP_CLI and SRWF_WP_PATH are required for sparse authentic fixtures.');
}

execFileSync(
  'php',
  [wpCli, `--path=${wpPath}`, 'eval-file', 'tests/srwf-runtime/setup-sparse-fixtures.php'],
  { stdio: 'inherit', env: process.env }
);

await import('./legacy-browser-tests.mjs');
await import('./declarative-browser-tests.mjs');
await import('./sparse-declarative-browser-tests.mjs');

execFileSync(
  'php',
  [wpCli, `--path=${wpPath}`, 'eval-file', 'tests/srwf-runtime/diagnostics-runtime-assert.php'],
  { stdio: 'inherit', env: process.env }
);
