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


// Classify independent observations, never an absent request as server denial.
// Test inputs contain only sanitized evidence and synthetic identities.
export function securityVerdict(e,ids,{crossUser=false,fresh=false}={}){
  const problems=[],violations=[];
  const rows=e.network||[];
  const observed=rows.filter(r=>['consumer','direct'].includes(r.phase)&&!r.direct);
  const direct=rows.filter(r=>r.phase==='direct'&&r.direct);
  const expectedActions=crossUser?['gpp_inbox2_read']:['gpp_inbox2_read','gpp_inbox2_atomic_bootstrap'];
  const rejected=r=>r.complete&&!r.problem&&r.status===403&&r.bodyObserved&&r.privateData===false&&
    r.success===false&&r.rejection==='authorization_required'&&r.noStore===true;
  const revoked=e.revocation?.remaining===0&&e.revocation?.commandExit===0;
  if(!revoked)problems.push('SESSION_REVOCATION_UNPROVEN');
  if(!e.baselineVerified||!Object.values(e.baselineOracle||{}).some(v=>Array.isArray(v)&&v.length>0))problems.push('A_POSITIVE_CONTROL_UNPROVEN');
  if(ids.length!==2||new Set(ids).size!==2||ids.some(id=>!e.expectedWidgets?.[id]))problems.push('EXPECTED_WIDGET_IDENTITIES_UNPROVEN');
  if(!fresh&&!e.transitionVerified)problems.push('NATIVE_RETURN_UNPROVEN');
  if(fresh&&!e.freshNavigationVerified)problems.push('FRESH_NAVIGATION_UNPROVEN');
  for(const element of ids)for(const action of expectedActions){
    const matches=direct.filter(r=>r.element===element&&r.action===action&&
      (action!=='gpp_inbox2_read'||r.form===e.expectedWidgets?.[element]));
    if(matches.length!==1||!matches.every(rejected))problems.push('DIRECT_REJECTION_UNPROVEN_'+element+'_'+action);
  }
  for(const r of [...observed,...direct]){
    if(revoked&&r.privateData===true)violations.push('PRIVATE_RESPONSE_'+(r.element||'unknown'));
    if(revoked&&r.success===true&&(r.status>=200&&r.status<300)&&
       (r.action==='gpp_inbox2_read'||!crossUser||r.direct))violations.push('UNAUTHORIZED_SUCCESS_'+(r.element||'unknown'));
    if(!ids.includes(r.element)||!rejected(r))problems.push('NETWORK_OBSERVATION_INCOMPLETE_'+(r.element||'unknown'));
  }
  if(rows.some(r=>r.phase==='direct'&&!r.direct&&!r.action||r.phase==='unattributed'))problems.push('UNATTRIBUTED_NETWORK_REQUEST');
  const state=e.finalDom;
  if(!state)problems.push('FINAL_DOM_UNAVAILABLE');
  else{
    if(!Number.isSafeInteger(state.documentCards)||typeof state.privateMarker!=='boolean'||!Array.isArray(state.cardEvents)||
       !Array.isArray(state.widgetStates)||!Array.isArray(state.roots))problems.push('DOM_OBSERVATION_INCOMPLETE');
    const consumerQualified=revoked&&(fresh?e.freshNavigationVerified:e.transitionVerified);
    if(consumerQualified&&(state.documentCards>0||state.privateMarker||state.cardEvents?.length)){
      const aIds=new Set(Object.values(e.baselineOracle||{}).flat());
      const cards=[...(state.cardEvents||[]),...(state.roots||[]).flatMap(r=>r.entries||[])];
      if(!crossUser||cards.some(id=>aIds.has(id)))violations.push('PRIVATE_CARD_OBSERVED_AFTER_INVALIDATION');
      else problems.push('UNEXPECTED_OLD_DOCUMENT_CARD_IDENTITY');
    }
    const widgets=state.widgetStates||[];
    const identity=widgets.length===ids.length&&ids.every(id=>widgets.filter(w=>w.element===id).length===1);
    const terminal=identity&&widgets.every(w=>w.denied&&w.roots.length===0||
      w.roots.length===1&&w.roots[0].element===w.element&&w.roots[0].form===e.expectedWidgets?.[w.element]&&
      w.roots[0].state==='stale'&&w.roots[0].entries.length===0);
    // A missing shell alone does not establish admission denial.
    if(!(terminal||(fresh&&e.admissionDenied===true&&widgets.length===0)))problems.push('TWO_WIDGET_TERMINAL_STATES_UNPROVEN');
  }
  if(e.observationProblems?.length)problems.push(...e.observationProblems);
  if(crossUser&&!e.freshB?.verified)problems.push('FRESH_B_NATIVE_MEMBERSHIP_UNPROVEN');
  if(crossUser&&e.freshB?.membershipMismatch)violations.push('FRESH_B_NATIVE_MEMBERSHIP_MISMATCH');
  return {status:violations.length?'FAIL':problems.length?'NOT_PROVEN':'PASS',
    problems:[...new Set(problems)],violations:[...new Set(violations)],
    consumerRequestObserved:observed.length>0,
    consumerRequestAbsenceReason:observed.length?null:'No matching same-origin bootstrap/read observed; direct endpoint controls are separate'};
}
