import { isDeepStrictEqual } from 'node:util';

/**
 * Qualification finalization is fail-closed: a passing browser scenario is
 * provisional until the mutated native feed is restored and independently
 * read back. The callbacks are host-owned API boundaries in the real lab;
 * injection permits isolated negative controls with no persistent mutation.
 */
export async function finalizeSaveProgressQualification({
  assertionsPassed,
  mutationMayHaveOccurred,
  originalMeta,
  restore,
  readback,
  clearRecovery,
}) {
  const restoration = {
    required: mutationMayHaveOccurred === true,
    attempted: false,
    verified: false,
    recovery_retained: true,
  };

  if (restoration.required) {
    restoration.attempted = true;
    try {
      if (!originalMeta || typeof originalMeta !== 'object' || Array.isArray(originalMeta)) {
        throw new Error('Original native feed metadata was unavailable: restoration cannot be proven.');
      }
      const result = await restore();
      restoration.native_return = result;
      if (result !== true) {
        throw new Error('Native GFAPI::update_feed restoration did not return success.');
      }

      const actualMeta = await readback();
      restoration.readback_matches_original = isDeepStrictEqual(actualMeta, originalMeta);
      if (!restoration.readback_matches_original) {
        restoration.expected_meta = originalMeta;
        restoration.observed_meta = actualMeta;
        throw new Error('Native GFAPI::get_feed readback does not match original metadata.');
      }
      restoration.verified = true;

      // Release the recovery copy ONLY after authentic native readback proves
      // the original feed has been restored. Failure leaves it recoverable.
      const cleared = await clearRecovery();
      restoration.recovery_cleared = cleared === true;
      restoration.recovery_retained = !restoration.recovery_cleared;
      if (!restoration.recovery_cleared) {
        throw new Error('Verified native restoration, but cleanup of recovery metadata failed.');
      }
    } catch (error) {
      restoration.error = String(error?.stack || error).slice(0, 16000);
    }
  } else if (assertionsPassed) {
    restoration.error = 'Assertions reported success without a native feed mutation to qualify.';
  }

  return {
    status: assertionsPassed === true
      && restoration.required
      && restoration.verified
      && restoration.recovery_cleared === true
      && !restoration.error
      ? 'VERIFIED'
      : 'NOT_PROVEN',
    restoration,
  };
}
