import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { finalizeSaveProgressQualification } from './srwf-journey-save-progress-finalization.mjs';

const cases = {
  'simulated_restore_failure': { result: false },
  'native_returns_false': { result: false },
  'native_throws': { error: 'SIMULATED_NATIVE_RESTORE_EXCEPTION' },
  'readback_mismatch': { result: true, mismatch: true },
  'restoration_success': { result: true },
  'qualification_fails_after_mutation': { result: true, assertionsPassed: false },
  'missing_original_metadata': { result: true, missingOriginal: true },
  'cleanup_fails': { result: true, cleanupFails: true },
  'mutation_not_attempted': { result: true, mutationMayHaveOccurred: false },
};

async function runCase(name) {
  const control = cases[name];
  if (!control) throw new Error('Unknown deterministic control: ' + name);

  // Ephemeral, in-memory doubles. Never touch any WP feed or persistent option.
  const original = {
    default_status: 'hidden',
    assignees: ['user_id|7'],
    conditional_logic: { enabled: '1', fields: [{ id: 1, mode: 'dynamic' }] },
  };
  let nativeFeed = { ...original, default_status: 'submit_buttons' };
  let recovery = structuredClone(original);
  let attempts = 0, reads = 0, clears = 0;
  const result = await finalizeSaveProgressQualification({
    assertionsPassed: control.assertionsPassed !== false,
    mutationMayHaveOccurred: control.mutationMayHaveOccurred !== false,
    originalMeta: control.missingOriginal ? undefined : original,
    restore: () => {
      attempts++;
      if (control.error) throw new Error(control.error);
      if (control.result === false) return false;
      nativeFeed = structuredClone(original);
      if (control.mismatch) nativeFeed.default_status = 'in_progress';
      return true;
    },
    readback: () => {
      reads++;
      if (!control.mismatch) {
        // Object-key order is not a meaningful WordPress feed change.
        return { conditional_logic: structuredClone(nativeFeed.conditional_logic),
          assignees: structuredClone(nativeFeed.assignees),
          default_status: nativeFeed.default_status };
      }
      return structuredClone(nativeFeed);
    },
    clearRecovery: () => {
      clears++;
      if (control.cleanupFails) return false;
      recovery = undefined;
      return true;
    },
  });
  return {
    case: name, ...result, exitStatus: result.status === 'VERIFIED' ? 0 : 1,
    attempts, reads, clears,
    recoveryRetained: recovery !== undefined,
    feedDefaultStatus: nativeFeed.default_status,
    legacyWouldHaveVerified: control.assertionsPassed !== false,
  };
}

if (process.argv[2] === '--case') {
  const result = await runCase(process.argv[3]);
  console.log(JSON.stringify(result));
  process.exit(result.exitStatus);
}

const errors = [];
const results = [];
for (const [name, config] of Object.entries(cases)) {
  const executed = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--case', name], {
    encoding: 'utf8', timeout: 15000,
  });
  let result;
  try {
    result = JSON.parse(executed.stdout.trim());
  } catch {
    errors.push(name + ': invalid child JSON ' + executed.stdout + ' ' + executed.stderr);
    continue;
  }
  results.push(result);
  const success = name === 'restoration_success';
  if (executed.status !== (success ? 0 : 1)
      || result.status !== (success ? 'VERIFIED' : 'NOT_PROVEN')
      || result.restoration?.verified !== (success || name === 'qualification_fails_after_mutation' || name === 'cleanup_fails')
      || result.recoveryRetained !== !(success || name === 'qualification_fails_after_mutation')
      || result.attempts !== (name === 'mutation_not_attempted' || name === 'missing_original_metadata' ? 0 : 1)
      || result.reads !== ((success || name === 'qualification_fails_after_mutation'
        || name === 'cleanup_fails' || name === 'readback_mismatch') ? 1 : 0)
      || result.clears !== ((success || name === 'qualification_fails_after_mutation'
        || name === 'cleanup_fails') ? 1 : 0)) {
    errors.push(name + ': unexpected outcome ' + JSON.stringify(result) + ' exit=' + executed.status);
  }
  if (name === 'simulated_restore_failure'
      && !(result.legacyWouldHaveVerified && result.status === 'NOT_PROVEN')) {
    errors.push('Legacy fail-open case is not falsified.');
  }
  if (name === 'native_throws' && !result.restoration.error?.includes('SIMULATED_NATIVE_RESTORE_EXCEPTION')) {
    errors.push('Restore exception diagnostics missing.');
  }
  if (name === 'readback_mismatch' && !result.restoration.error?.includes('readback')
    || name === 'readback_mismatch' && !result.restoration.observed_meta) {
    errors.push('Readback mismatch diagnostics missing.');
  }
}

const script = readFileSync(new URL('./srwf-journey-save-progress-browser.mjs', import.meta.url), 'utf8');
const assertionSites = (script.match(/\bassert\(/g) || []).length;
// Baseline has 17 assertion call sites; responsive assertion runs for 3 sizes = 19 results.
if (assertionSites !== 17 || !script.includes('for (const width of [1440, 390, 320])')) {
  errors.push('Baseline browser assertions or responsive loop changed.');
}
if (errors.length) {
  console.error('SAVE_PROGRESS_FINALIZATION_FALSIFICATION_FAIL', JSON.stringify({ errors, results }, null, 2));
  process.exit(1);
}
console.log('SAVE_PROGRESS_FINALIZATION_FALSIFICATION_PASS', JSON.stringify({
  count: results.length,
  scenarios: results.map(r => ({ case: r.case, status: r.status, exitStatus: r.exitStatus,
    attempts: r.attempts, reads: r.reads, clears: r.clears, recoveryRetained: r.recoveryRetained })),
}));
