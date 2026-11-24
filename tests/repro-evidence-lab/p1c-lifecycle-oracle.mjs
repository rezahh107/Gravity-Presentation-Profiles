// Test-only result classifier: evidence of a real transition is a prerequisite,
// not a substitute for the product contract.
export async function qualifyThenCheck(record, name, qualify, validate) {
  let witness;
  try {
    witness = await qualify();
    if (witness?.qualified !== true) throw Error('AUTHENTIC_TRANSITION_NOT_ESTABLISHED');
  } catch (error) {
    record(name, 'NOT_PROVEN', {phase:'environment', reason:String(error.message || error)});
    record(name+'_CONSUMER', 'NOT_REACHED');
    return false;
  }
  try {
    const details = await validate(witness);
    record(name, 'PASS', {phase:'consumer', witness, ...details});
    return true;
  } catch (error) {
    record(name, 'FAIL', {phase:'consumer', witness, reason:String(error.message || error)});
    return false;
  }
}
export function requireInvalidated(roots, expectedIds) {
  if (!Array.isArray(roots) || expectedIds.length !== 2 || roots.length !== expectedIds.length ||
      new Set(expectedIds).size !== expectedIds.length ||
      roots.some(root => root.state !== 'stale' || root.entries.length !== 0) ||
      JSON.stringify(roots.map(root=>root.element).sort()) !== JSON.stringify([...expectedIds].sort())) {
    throw Error('PRIVATE_CARD_INVALIDATION_CONTRACT_FAILED');
  }
}
