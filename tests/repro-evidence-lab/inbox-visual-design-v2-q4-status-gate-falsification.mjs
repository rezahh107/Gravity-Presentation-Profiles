import { q4QualificationRequiresNonzeroExit } from './inbox-visual-design-v2-q4-status-gate.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(`Q4 status-gate falsification failed: ${message}`);
}

assert(q4QualificationRequiresNonzeroExit('PASS') === false, 'PASS must preserve zero exit');
assert(q4QualificationRequiresNonzeroExit('FAIL') === true, 'FAIL must force nonzero exit');
assert(q4QualificationRequiresNonzeroExit('NOT_PROVEN') === true, 'unexpected non-PASS status must fail closed');
assert(q4QualificationRequiresNonzeroExit(null) === true, 'missing status must fail closed');

console.log(JSON.stringify({
  status: 'PASS',
  pass_status: 'ZERO_EXIT',
  fail_status: 'NONZERO_EXIT',
  unexpected_status: 'NONZERO_EXIT',
  missing_status: 'NONZERO_EXIT',
}, null, 2));
