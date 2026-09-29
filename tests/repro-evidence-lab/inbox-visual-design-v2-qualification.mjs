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

const muDir = path.join(wpPath, 'wp-content/mu-plugins');
const muPath = path.join(muDir, 'inbox-visual-design-v2-qualification-mu.php');
fs.mkdirSync(muDir, { recursive: true });
fs.copyFileSync(
  path.join(repoRoot, 'tests/repro-evidence-lab/inbox-visual-design-v2-qualification-mu.php'),
  muPath,
);

wpCliRun(['eval-file', path.join(repoRoot, 'tests/repro-evidence-lab/inbox-visual-design-v2-qualification-setup.php')]);
if (!fs.existsSync(path.join(artifactDir, 'inbox-visual-design-v2-qualification-setup.json'))) {
  throw new Error('Inbox V2 qualification setup artifact was not produced.');
}

// Reuse the authentic WU21 operator identity. The synthetic tasks are assigned
// to this user, so creating a separate administrator would change the native
// assignment/query semantics the qualification is required to preserve.
const fixtureManifest = JSON.parse(fs.readFileSync(path.join(artifactDir, 'fixture-manifest.json'), 'utf8'));
const qualifierUser = fixtureManifest.operator?.login;
const qualifierUserId = Number(fixtureManifest.operator?.id);
if (!qualifierUser || !Number.isInteger(qualifierUserId) || qualifierUserId <= 0) {
  throw new Error('WU21 operator identity is unavailable for Inbox V2 qualification.');
}
const resolvedQualifierUserId = Number(wpCliRun(['user', 'get', qualifierUser, '--field=ID']));
if (resolvedQualifierUserId !== qualifierUserId) {
  throw new Error(`WU21 operator identity mismatch: expected ${qualifierUserId}, got ${resolvedQualifierUserId}`);
}
process.env.IVD2_ADMIN_USER = qualifierUser;
process.env.IVD2_ADMIN_PASSWORD = 'wu21-bootstrap-pass-2026';

try {
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

  // Keep the canonical WU21 browser result ID set untouched. The uploaded
  // browser-results.json gains one bounded adjunct so the qualification evidence
  // survives successful artifact packaging without changing WU21 acceptance.
  const browserResultsPath = path.join(artifactDir, 'browser-results.json');
  const browserResults = JSON.parse(fs.readFileSync(browserResultsPath, 'utf8'));
  browserResults.inbox_visual_design_v2_qualification = evidence;
  fs.writeFileSync(browserResultsPath, JSON.stringify(browserResults, null, 2) + '\n');
} finally {
  const cleanup = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', `
    $config = get_option('gpp_inbox_visual_design_v2_qualification');
    $manifest = get_option('gpp_wu21_fixture_manifest');
    foreach (array('gpp_ivd2_q1_added_entry','gpp_ivd2_q4_added_entry') as $option) {
      $entry_id = (int) get_option($option);
      if ($entry_id) GFAPI::delete_entry($entry_id);
      delete_option($option);
    }
    $original = get_option('gpp_ivd2_q4_original_field');
    if (is_array($original) && !empty($original['entry_id']) && !empty($original['field_id'])) {
      GFAPI::update_entry_field((int)$original['entry_id'], (int)$original['field_id'], (string)$original['value']);
    }
    delete_option('gpp_ivd2_q4_original_field');
    if (is_array($config) && !empty($config['form_id']) && !empty($config['probe_field_id'])) {
      $probe = (int)$config['probe_field_id'];
      if (is_array($manifest) && !empty($manifest['entry_records'])) {
        foreach ($manifest['entry_records'] as $record) {
          if ((int)$record['form_id'] === (int)$config['form_id']) GFAPI::update_entry_field((int)$record['entry_id'], $probe, '');
        }
      }
      $form = GFAPI::get_form((int)$config['form_id']);
      if (is_array($form)) {
        $form['fields'] = array_values(array_filter($form['fields'], static function($field) use ($probe) { return (int)$field->id !== $probe; }));
        GFAPI::update_form($form);
      }
    }
    delete_option('gpp_inbox_visual_design_v2_qualification');
  `], { encoding: 'utf8', env: process.env });
  fs.rmSync(muPath, { force: true });
  if (cleanup.status !== 0) {
    throw new Error(`Inbox V2 qualification cleanup failed: ${cleanup.stderr}\n${cleanup.stdout}`);
  }
}
