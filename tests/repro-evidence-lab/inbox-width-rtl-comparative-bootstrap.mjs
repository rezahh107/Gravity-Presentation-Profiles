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

const baseRuntimePath = path.join(artifactDir, 'runtime.json');
if (!fs.existsSync(baseRuntimePath)) {
  throw new Error('Canonical WU21 runtime evidence is unavailable before comparative bootstrap.');
}
const baseRuntime = JSON.parse(fs.readFileSync(baseRuntimePath, 'utf8'));

wp(['theme', 'activate', 'twentytwentyfive']);
const template = wp(['option', 'get', 'template']);
const stylesheet = wp(['option', 'get', 'stylesheet']);
if (template !== 'twentytwentyfive' || stylesheet !== 'twentytwentyfive') {
  throw new Error('Twenty Twenty-Five did not become the deterministic comparative theme.');
}

const wordpressVersion = wp(['core', 'version']);
const gravityFormsVersion = wp(['plugin', 'get', 'gravityforms', '--field=version']);
const gravityFlowVersion = wp(['plugin', 'get', 'gravityflow', '--field=version']);
if (wordpressVersion !== baseRuntime.wordpress?.version) {
  throw new Error(`WordPress runtime changed during comparative bootstrap: ${wordpressVersion}`);
}
if (gravityFormsVersion !== baseRuntime.plugins?.gravity_forms?.runtime_version) {
  throw new Error(`Gravity Forms runtime changed during comparative bootstrap: ${gravityFormsVersion}`);
}
if (gravityFlowVersion !== baseRuntime.plugins?.gravity_flow?.runtime_version) {
  throw new Error(`Gravity Flow runtime changed during comparative bootstrap: ${gravityFlowVersion}`);
}

const comparativeRuntime = {
  captured_at_utc: new Date().toISOString(),
  repository: baseRuntime.repository,
  wordpress: {
    ...baseRuntime.wordpress,
    version: wordpressVersion,
    template,
    stylesheet,
  },
  theme: {
    template,
    stylesheet,
    version: wp(['theme', 'get', 'twentytwentyfive', '--field=version']),
  },
  php: baseRuntime.php,
  database: baseRuntime.database,
  plugins: baseRuntime.plugins,
  workflow: baseRuntime.workflow,
  configuration: baseRuntime.configuration,
};
fs.writeFileSync(
  path.join(artifactDir, 'inbox-width-rtl-runtime.json'),
  JSON.stringify(comparativeRuntime, null, 2) + '\n',
);

wp(['eval-file', 'tests/repro-evidence-lab/prepare-inbox-width-rtl-fixture.php']);

const publicFixture = path.join(artifactDir, 'pr4-inbox-width-rtl-fixture.json');
const runtimeFixture = path.join(artifactDir, 'inbox-width-rtl-fixture.json');
if (!fs.existsSync(publicFixture)) throw new Error('Comparative host fixture was not created.');
fs.copyFileSync(publicFixture, runtimeFixture);

const password = crypto.randomBytes(32).toString('hex');
wp(['user', 'update', 'bootstrap_admin', `--user_pass=${password}`]);
process.env.GPP_RP_BROWSER_USER = 'bootstrap_admin';
process.env.GPP_RP_BROWSER_PASSWORD = password;
