import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
if (!artifactDir || !wpPath || !wpCli) throw new Error('Pinned journey environment is incomplete.');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env: process.env,
    timeout: 120000,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed (${result.status})\n${result.stderr || ''}\n${result.stdout || ''}`);
  }
  return result;
}

function wpEval(code) {
  return run('php', [wpCli, `--path=${wpPath}`, 'eval', code]).stdout.trim();
}

// Preserve PR #135's exact eight-test runner as an immutable core. MR-4 is a
// successor acceptance phase, not a rewrite of MR-2 evidence.
const mr2 = spawnSync(process.execPath, ['tests/repro-evidence-lab/srwf-journey-production-mr2-action-state-core.mjs'], {
  stdio: 'inherit',
  env: process.env,
  timeout: 120000,
});
if (mr2.error) throw mr2.error;
if (mr2.status !== 0) process.exit(mr2.status || 1);

const priorTheme = wpEval('echo get_stylesheet();');
let mr4Status = 1;
try {
  const helloCommit = 'e86d30a7d64b2ab59373422a14933bba3621ee04';
  const helloSha256 = 'd5b36b9d33187bf8b9cd5ad324489aab7ad8c3a21b5f2e5df82c18964a026ce5';
  const helloVersion = '3.5.1';
  const bootstrap = `
    set -euo pipefail
    rm -rf /tmp/srwf-mr4-hello-theme "${wpPath}/wp-content/themes/hello-elementor"
    curl -L --fail --retry 3 -o /tmp/srwf-mr4-hello-elementor.tar.gz "https://github.com/elementor/hello-theme/archive/${helloCommit}.tar.gz"
    test "$(sha256sum /tmp/srwf-mr4-hello-elementor.tar.gz | cut -d' ' -f1)" = "${helloSha256}"
    mkdir -p /tmp/srwf-mr4-hello-theme
    tar -xzf /tmp/srwf-mr4-hello-elementor.tar.gz -C /tmp/srwf-mr4-hello-theme --strip-components=1
    mv /tmp/srwf-mr4-hello-theme "${wpPath}/wp-content/themes/hello-elementor"
    test "$(php "${wpCli}" theme get hello-elementor --field=version --path="${wpPath}")" = "${helloVersion}"
    php "${wpCli}" theme activate hello-elementor --path="${wpPath}"
    test "$(php "${wpCli}" option get stylesheet --path="${wpPath}")" = "hello-elementor"
  `;
  run('bash', ['-lc', bootstrap]);

  const mr4 = spawnSync(process.execPath, ['tests/repro-evidence-lab/srwf-journey-production-mr4-browser.mjs'], {
    stdio: 'inherit',
    env: process.env,
    timeout: 120000,
  });
  if (mr4.error) throw mr4.error;
  mr4Status = mr4.status ?? 1;

  if (mr4Status === 0) {
    const evidencePath = `${artifactDir}/srwf-journey-production-mr4-browser.json`;
    const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
    if (!Array.isArray(evidence.results) || evidence.results.length !== 6 || evidence.results.some(result => result.status !== 'PASS')) {
      throw new Error(`MR-4 evidence contract failed: ${JSON.stringify(evidence)}`);
    }
  }
} finally {
  if (priorTheme && priorTheme !== 'hello-elementor') {
    const restore = spawnSync('php', [wpCli, `--path=${wpPath}`, 'theme', 'activate', priorTheme], {
      encoding: 'utf8',
      env: process.env,
      timeout: 30000,
    });
    if (restore.status !== 0) {
      console.error(`Unable to restore pre-MR4 theme ${priorTheme}: ${restore.stderr || restore.stdout}`);
      mr4Status = 1;
    }
  }
}

if (mr4Status !== 0) process.exit(mr4Status || 1);
console.log('SRWF_JOURNEY_PRODUCTION_MR4_SUCCESSOR_PASS 6');