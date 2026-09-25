import path from 'node:path';
import { spawnSync } from 'node:child_process';

const wpCli = process.env.WU21_WP_CLI;
const wpPath = process.env.WU21_WP_PATH;
const repoRoot = process.env.GITHUB_WORKSPACE;
if (!wpCli || !wpPath || !repoRoot) {
  throw new Error('P06 fixture bootstrap requires the admitted WU21 runtime environment.');
}

const producer = path.join(repoRoot, 'tests/repro-evidence-lab/p06-inbox-asset-reachability-runtime.php');
const result = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval-file', producer], {
  encoding: 'utf8',
  env: process.env,
});
if (result.status !== 0) {
  throw new Error(`Authoritative P06 fixture initialization failed:\n${result.stdout}\n${result.stderr}`);
}
process.stdout.write(result.stdout);
