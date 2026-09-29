import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { artifactDir, repoRoot, wpCli, wpPath } from './inbox-visual-design-v2-browser-lib.mjs';

if (!artifactDir || !repoRoot || !wpCli || !wpPath) {
  throw new Error('WU21 Inbox V2 qualification environment is incomplete.');
}

function wpCliRun(args, options = {}) {
  const result = spawnSync('php', [wpCli, `--path=${wpPath}`, ...args], { encoding: 'utf8', env: process.env, ...options });
  if (result.status !== 0) throw new Error(`WP-CLI failed: ${result.stderr}\n${result.stdout}`);
  return result.stdout.trim();
}

const toolboxPath = path.join(repoRoot, 'docs/design/GPP_INBOX_DESIGN_TOOLBOX_V1.1.md');
const toolboxSha256 = crypto.createHash('sha256').update(fs.readFileSync(toolboxPath)).digest('hex');
if (toolboxSha256 !== 'd2b50b51b111455a54090de0497fe68b1904897183eeb08dfa07aac6671ee17b') {
  throw new Error(`Toolbox mirror SHA-256 mismatch: ${toolboxSha256}`);
}

// Reuse the existing WU21 runtime instead of creating a second lab. The probe is
// copied only into this disposable WordPress instance and is inert until the
// bounded Q1 setup option is enabled.
const muDir = path.join(wpPath, 'wp-content/mu-plugins');
fs.mkdirSync(muDir, { recursive: true });
fs.copyFileSync(
  path.join(repoRoot, 'tests/repro-evidence-lab/inbox-visual-design-v2-qualification-mu.php'),
  path.join(muDir, 'inbox-visual-design-v2-qualification-mu.php'),
);

wpCliRun(['eval-file', path.join(repoRoot, 'tests/repro-evidence-lab/inbox-visual-design-v2-qualification-setup.php')]);
if (!fs.existsSync(path.join(artifactDir, 'inbox-visual-design-v2-qualification-setup.json'))) {
  throw new Error('Inbox V2 qualification setup artifact was not produced.');
}

// Use an ephemeral browser principal so this qualification does not duplicate a
// fixed credential in repository source. It exists only in the disposable lab.
const qualifierUser = `ivd2_qualifier_${process.pid}`;
const qualifierPassword = crypto.randomBytes(24).toString('hex');
wpCliRun(['user', 'create', qualifierUser, `${qualifierUser}@example.invalid`, '--role=administrator', `--user_pass=${qualifierPassword}`]);
process.env.IVD2_ADMIN_USER = qualifierUser;
process.env.IVD2_ADMIN_PASSWORD = qualifierPassword;

try {
  // Contract order is fixed: Q1 -> Q2 -> Q4. Q1 disables its qualification-only
  // Flow filters before Q2/Q4 observe the ordinary native Inbox.
  await import('./inbox-visual-design-v2-q1-browser.mjs');
  await import('./inbox-visual-design-v2-q2-browser.mjs');
  await import('./inbox-visual-design-v2-q4-browser.mjs');
  await import('./inbox-visual-design-v2-build-evidence.mjs');

  const evidencePath = path.join(artifactDir, 'inbox-visual-design-v2-qualification-evidence.json');
  if (!fs.existsSync(evidencePath)) throw new Error('Inbox V2 compact qualification evidence was not produced.');
  const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  for (const qualification of [evidence.qualifications?.q1, evidence.qualifications?.q2, evidence.qualifications?.q4]) {
    if (qualification?.execution_status !== 'CAPTURED') throw new Error('Inbox V2 qualification capture did not complete.');
  }
} finally {
  spawnSync('php', [wpCli, `--path=${wpPath}`, 'user', 'delete', qualifierUser, '--yes'], { encoding: 'utf8', env: process.env });
}
