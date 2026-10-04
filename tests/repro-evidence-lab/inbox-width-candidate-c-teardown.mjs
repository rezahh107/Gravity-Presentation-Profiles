// Exact WU21 teardown for Candidate C's synthetic binding falsifier.
// The runtime test intentionally installs a temporary binding identity. Keep
// teardown separate and fail hard so later WU21 consumers can trust the shared
// binding lifecycle again instead of inheriting test-only state.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { artifactDir, wpCli, wpPath } from './inbox-visual-design-v2-browser-lib.mjs';

if (!artifactDir || !wpCli || !wpPath) throw new Error('Pinned WU21 lab required');
const fixture = JSON.parse(fs.readFileSync(path.join(artifactDir, 'fixture-manifest.json'), 'utf8'));
const alpha = fixture.forms.find(item => item.key === 'alpha');
if (!alpha?.form_id) throw new Error('Candidate C teardown alpha form missing');

const syntheticId = 'gpp.wu21.candidate-c.ambiguous';
const script = path.join(artifactDir, `candidate-c-binding-teardown-${process.pid}.php`);
const php = `<?php
$state = get_option('gpp_binding_set_lifecycle_v1');
if (!is_array($state) || !isset($state['installed'], $state['activations'])) {
    throw new RuntimeException('Candidate C teardown binding lifecycle unavailable.');
}
$synthetic_id = ${JSON.stringify(syntheticId)};
$form_id = ${Number(alpha.form_id)};
$synthetic_records = $state['installed'][$synthetic_id] ?? array();
foreach ($state['activations'] as $context_key => $identity) {
    if (($identity['binding_set_id'] ?? null) !== $synthetic_id) {
        continue;
    }
    $matches = array();
    foreach ($state['installed'] as $binding_set_id => $versions) {
        if ($binding_set_id === $synthetic_id || !is_array($versions)) {
            continue;
        }
        foreach ($versions as $version => $record) {
            if (($record['context_key'] ?? null) !== $context_key) {
                continue;
            }
            $artifact = $record['artifact'] ?? null;
            if (!is_array($artifact)
                || (int)($artifact['context']['form_source_ref']['form_id'] ?? 0) !== $form_id
                || !in_array('gravity_flow.inbox', $artifact['context']['surfaces'] ?? array(), true)) {
                continue;
            }
            $matches[] = array('binding_set_id' => $binding_set_id, 'binding_set_version' => $version);
        }
    }
    if (count($matches) !== 1) {
        throw new RuntimeException('Candidate C teardown could not identify exactly one original binding activation.');
    }
    $state['activations'][$context_key] = $matches[0];
}
unset($state['installed'][$synthetic_id]);
if (!update_option('gpp_binding_set_lifecycle_v1', $state, false)) {
    $readback = get_option('gpp_binding_set_lifecycle_v1');
    if ($readback !== $state) {
        throw new RuntimeException('Candidate C teardown binding restore did not persist.');
    }
}
$readback = get_option('gpp_binding_set_lifecycle_v1');
if (isset($readback['installed'][$synthetic_id])) {
    throw new RuntimeException('Candidate C synthetic binding remained installed after teardown.');
}
$active = array();
foreach ($readback['activations'] as $context_key => $identity) {
    $record = $readback['installed'][$identity['binding_set_id']][$identity['binding_set_version']] ?? null;
    $artifact = is_array($record) ? ($record['artifact'] ?? null) : null;
    if (!is_array($artifact)
        || (int)($artifact['context']['form_source_ref']['form_id'] ?? 0) !== $form_id
        || !in_array('gravity_flow.inbox', $artifact['context']['surfaces'] ?? array(), true)) {
        continue;
    }
    $active[] = array(
        'context_key' => $context_key,
        'binding_set_id' => $identity['binding_set_id'],
        'binding_set_version' => $identity['binding_set_version'],
    );
}
if (count($active) !== 1) {
    throw new RuntimeException('Candidate C teardown did not restore one authoritative alpha Inbox binding.');
}
echo wp_json_encode(array('status' => 'PASS', 'active' => $active[0]));
`;

fs.writeFileSync(script, php, 'utf8');
let command;
try {
  command = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval-file', script], {encoding: 'utf8'});
} finally {
  fs.rmSync(script, {force: true});
}
if (command?.error) throw command.error;
if (command?.status !== 0) {
  throw new Error(`Candidate C binding teardown failed status=${command?.status}\n${command?.stderr || ''}\n${command?.stdout || ''}`);
}
const readback = JSON.parse((command.stdout || '').trim());
assert.equal(readback.status, 'PASS');
assert.notEqual(readback.active.binding_set_id, syntheticId);
fs.writeFileSync(
  path.join(artifactDir, 'inbox-width-candidate-c-teardown.json'),
  JSON.stringify(readback, null, 2) + '\n'
);
console.log('CANDIDATE_C_BINDING_TEARDOWN_PASS');
