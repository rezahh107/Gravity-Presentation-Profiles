import { requireMandatoryQ4Pass } from './mandatory-qualification-gates.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(`Mandatory qualification gate falsification failed: ${message}`);
}

function rejected(sample, expectedMessage) {
  try {
    requireMandatoryQ4Pass(sample);
  } catch (error) {
    const message = String(error?.message || error);
    assert(message.includes(expectedMessage), `unexpected rejection message: ${message}`);
    return true;
  }
  return false;
}

requireMandatoryQ4Pass({ execution_status: 'CAPTURED', status: 'PASS' });
assert(rejected({ execution_status: 'CAPTURED', status: 'FAIL' }, 'failed closed: FAIL'), 'Q4 FAIL must be rejected.');
assert(rejected({ execution_status: 'CAPTURED', status: 'NOT_PROVEN' }, 'failed closed: NOT_PROVEN'), 'Q4 NOT_PROVEN must be rejected.');
assert(rejected({ execution_status: 'ERROR', status: 'PASS' }, 'capture incomplete: ERROR'), 'Incomplete Q4 capture must be rejected.');
assert(rejected({}, 'capture incomplete: MISSING'), 'Missing Q4 evidence must be rejected.');

console.log(JSON.stringify({
  status: 'PASS',
  captured_pass: 'ACCEPTED',
  captured_fail: 'REJECTED',
  captured_not_proven: 'REJECTED',
  capture_error: 'REJECTED',
  missing_evidence: 'REJECTED',
}, null, 2));
