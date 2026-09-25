import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const { WU21_WP_CLI: wpCli, WU21_WP_PATH: wpPath, GITHUB_WORKSPACE: repoRoot, WU21_ARTIFACT_DIR: artifactDir } = process.env;
if (!wpCli || !wpPath || !repoRoot || !artifactDir) throw new Error('P06 fixture lifecycle falsification requires WU21.');
const run = (script, env = process.env) => spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval-file', path.join(repoRoot, script)], { encoding: 'utf8', env });
const evalWp = code => {
  const result = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], { encoding: 'utf8', env: process.env });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
};

assert.equal(evalWp("echo false === get_option('gpp_p06_fixture_manifest', false) ? 'PRISTINE' : 'DIRTY';"), 'PRISTINE', 'P06 fixture state was not pristine.');
const premature = run('tests/repro-evidence-lab/p06-inbox-late-runtime.php', { ...process.env, P06_LATE_SURFACE: 'shortcode' });
assert.notEqual(premature.status, 0, 'Late P06 consumer fabricated success before authoritative initialization.');

const producer = 'tests/repro-evidence-lab/p06-inbox-asset-reachability-runtime.php';
const initialized = run(producer);
if (initialized.status !== 0) throw new Error(`Initial P06 fixture production failed:\n${initialized.stdout}\n${initialized.stderr}`);
const first = evalWp("echo wp_json_encode(get_option('gpp_p06_fixture_manifest'), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);");
const reused = run(producer);
if (reused.status !== 0) throw new Error(`Repeated P06 fixture ensure failed:\n${reused.stdout}\n${reused.stderr}`);
const second = evalWp("echo wp_json_encode(get_option('gpp_p06_fixture_manifest'), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);");
assert.equal(second, first, 'Repeated authoritative initialization changed P06 fixture identity.');
assert.match(reused.stdout, /fixture=REUSED/, 'Repeated initialization did not report authoritative reuse.');

const late = run('tests/repro-evidence-lab/p06-inbox-late-runtime.php', { ...process.env, P06_LATE_SURFACE: 'shortcode' });
if (late.status !== 0) throw new Error(`Initialized late P06 consumer failed:\n${late.stdout}\n${late.stderr}`);
const fixture = JSON.parse(first);
const evidence = {
  status: 'PASS',
  pristine_late_consumer_failed_closed: true,
  initialized_late_consumer_passed: true,
  repeated_initialization_reused: true,
  fixture_schema_version: fixture.schema_version,
  page_ids: ['authentic_block_page','commented_shortcode_page','cdata_shortcode_page','lookalike_page','unrelated_page'].map(key => fixture[key].page_id),
};
fs.writeFileSync(path.join(artifactDir, 'p06-fixture-lifecycle-falsification.json'), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(`P06_FIXTURE_LIFECYCLE_FALSIFICATION_PASS=${JSON.stringify(evidence)}`);
