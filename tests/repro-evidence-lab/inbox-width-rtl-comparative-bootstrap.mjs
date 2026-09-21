import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const wpCli = process.env.WU21_WP_CLI;
const wpPath = process.env.WU21_WP_PATH;
const repoRoot = process.env.GITHUB_WORKSPACE;
const artifactDir = process.env.WU21_ARTIFACT_DIR;
if (!wpCli || !wpPath || !repoRoot || !artifactDir) {
  throw new Error('WU21 comparative bootstrap environment is incomplete.');
}

function wp(args) {
  const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, ...args], {
    cwd: repoRoot,
    env: process.env,
    encoding: 'utf8',
  });
  if (cp.status !== 0) throw new Error(cp.stderr || cp.stdout || `WP-CLI failed: ${args.join(' ')}`);
  return cp.stdout.trim();
}

wp(['theme', 'activate', 'twentytwentyfive']);
if (wp(['option', 'get', 'template']) !== 'twentytwentyfive' || wp(['option', 'get', 'stylesheet']) !== 'twentytwentyfive') {
  throw new Error('Twenty Twenty-Five did not become the deterministic comparative theme.');
}

wp(['eval-file', 'tests/repro-evidence-lab/capture-runtime.php']);
wp(['eval-file', 'tests/repro-evidence-lab/prepare-inbox-width-rtl-fixture.php']);

const publicFixture = path.join(artifactDir, 'pr4-inbox-width-rtl-fixture.json');
const runtimeFixture = path.join(artifactDir, 'inbox-width-rtl-fixture.json');
if (!fs.existsSync(publicFixture)) throw new Error('Comparative host fixture was not created.');
fs.copyFileSync(publicFixture, runtimeFixture);

const password = crypto.randomBytes(32).toString('hex');
wp(['user', 'update', 'bootstrap_admin', `--user_pass=${password}`]);
process.env.GPP_RP_BROWSER_USER = 'bootstrap_admin';
process.env.GPP_RP_BROWSER_PASSWORD = password;
