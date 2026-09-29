export function requireMandatoryQ4Pass(q4) {
  if (q4?.execution_status !== 'CAPTURED') {
    throw new Error(`Mandatory Q4 qualification capture incomplete: ${q4?.execution_status ?? 'MISSING'}.`);
  }
  if (q4?.status !== 'PASS') {
    throw new Error(`Mandatory Q4 qualification failed closed: ${q4?.status ?? 'MISSING'}.`);
  }
}
