import {isDeepStrictEqual} from 'node:util';

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

export function retainedWhilePending(before,pending,responses,form) {
  return before?.state==='current'&&pending?.state==='syncing'&&pending.visibility==='visible'&&
    isIdentity(before.verifiedAt)&&pending.verifiedAt===before.verifiedAt&&pending.showsChecking===true&&
    pending.showsVerifiedTime===true&&isIdentity(before.query)&&before.query===pending.query&&
    before.page===pending.page&&isIdentity(before.focus)&&before.focus===pending.focus&&
    Array.isArray(before.visible)&&before.visible.length>0&&isDeepStrictEqual(before.visible,pending.visible)&&
    isDeepStrictEqual(before.entries,pending.entries)&&pending.insertedCards===0&&Number.isFinite(pending.observedAt)&&
    Array.isArray(responses)&&responses.some(response=>response.status===200&&response.form===form&&
      Number.isFinite(response.pausedAt)&&response.pausedAt<=pending.observedAt+1);
}

// The host sees the complete body even when the browser consumer rejects on headers.
// An exact fingerprint, unique observations on both sides and matching HTTP metadata
// are required. Fingerprints and any raw response bytes stay out of the report.
export function reconcileResponseWitnesses(rows, witnesses) {
  return rows.map(({witnessKey, ...row}) => {
    if (!witnessKey || row.direct || row.status === null ||
        rows.filter(candidate => candidate.witnessKey === witnessKey).length !== 1) return row;
    const matches = witnesses.filter(candidate => candidate.key === witnessKey);
    const httpMismatch = witness => row.status !== witness.status || row.noStore !== witness.noStore;
    const bodyMismatch = witness => (witness.privateData !== null && row.privateData !== witness.privateData) ||
      (witness.bodyObserved && (row.success !== witness.success || row.rejection !== witness.rejection));
    if (matches.length > 1 && row.bodyObserved &&
        matches.some(witness => httpMismatch(witness) || bodyMismatch(witness))) {
      return {...row, problem:'AMBIGUOUS_CONFLICTING_RESPONSE_WITNESSES'};
    }
    if (matches.length !== 1) return row;
    const witness = matches[0];
    if (httpMismatch(witness)) {
      return {...row, problem:'RESPONSE_WITNESS_HTTP_MISMATCH'};
    }
    if (row.bodyObserved) {
      if (bodyMismatch(witness)) {
        return {...row, privateData:row.privateData === true || witness.privateData === true ? true : null,
          problem:'RESPONSE_WITNESS_BODY_MISMATCH'};
      }
      return row;
    }
    if (row.problem && row.problem !== 'RESPONSE_BODY_UNAVAILABLE_OR_UNRECOGNIZED') return row;
    if (witness.bodyObserved !== true) {
      return witness.privateData === true ? {...row, privateData:true} : row;
    }
    return {...row, bodyObserved:true, complete:true, problem:null,
      privateData:row.privateData === true ? true : witness.privateData,
      success:witness.success, rejection:witness.rejection, bodySource:'host_boundary'};
  });
}

const securityCases = new Map([
  ['PRODUCT_VISIBLE_revocation', {}],
  ['PRODUCT_VISIBLE_cross_user', {crossUser:true}],
  ['PRODUCT_SECURE_FRESH_LOAD_revocation', {fresh:true}]
]);
const statusValues = new Set(['PASS','FAIL','NOT_PROVEN','NOT_REACHED']);
const isIdentity = value => typeof value === 'string' && value.length > 0;
const visibilityWitness = (witness, to) => witness?.qualified === true &&
  isIdentity(witness.doc) && witness.from === (to === 'hidden' ? 'visible' : 'hidden') &&
  witness.to === to && Array.isArray(witness.events) && witness.events.some(e => e.type === 'visibilitychange' &&
    e.trusted === true && e.state === to);
const persistedEvent = (e, type) => e.type === type && e.trusted === true && e.persisted === true;
function restored(witness) {
  if (witness?.qualified !== true || !isIdentity(witness.beforeDoc) ||
      witness.beforeDoc !== witness.afterDoc || !Array.isArray(witness.events)) return false;
  const hide = witness.events.findIndex(e => persistedEvent(e, 'pagehide'));
  return hide >= 0 && witness.events.slice(hide + 1).some(e => persistedEvent(e, 'pageshow'));
}

function historyGap(record, neutral) {
  const witness = record?.witness;
  if (record?.status !== 'NOT_PROVEN') return false;
  if (witness) {
    return witness.qualified === false && isIdentity(witness.beforeDoc) && isIdentity(witness.afterDoc) &&
      Array.isArray(witness.events) && witness.events.some(e => e.type === 'pageshow' && e.trusted === true) &&
      !(witness.beforeDoc === witness.afterDoc && witness.events.some(e => persistedEvent(e, 'pageshow'))) &&
      record.bfcacheDeferralReason === (neutral ? 'Neutral BFCache restoration was not observed'
        : 'Browser history return did not restore the original product document through BFCache');
  }
  return typeof record.reason === 'string' && record.reason.startsWith('HISTORY_RETURN_NOT_OBSERVED') &&
    record.bfcacheDeferralReason === (neutral ? 'Neutral BFCache history return was not observed'
      : 'Genuine product BFCache history return was not observed');
}

export function lifecycleCompletion(records, fixture) {
  // Impact is derived here. Producer-supplied flags cannot exempt any record.
  const result = records.map(({qualificationImpact, nonblockingReason, ...record}) => record);
  const blocking = [], deferred = new Map();
  let failed = result.some(record => record.status === 'FAIL');
  const ids = Object.values(fixture.element_ids_by_form);
  const block = (name, reason) => blocking.push({name,status:'NOT_PROVEN',reason});
  const matching = name => result.filter(record => record.name === name);
  const one = name => matching(name).length === 1 ? matching(name)[0] : null;
  const requirePass = (name, valid) => {
    const record = one(name);
    if (record?.status !== 'PASS' || !valid(record)) block(name,'Required successful evidence absent, ambiguous or inconsistent');
  };
  const exclude = name => {
    if (matching(name).length) block(name,'Result contradicts the observed lifecycle branch');
  };
  const defer = (gap, dependent) => {
    const record = one(dependent);
    if (record?.status !== 'NOT_REACHED' || record.witness) {
      block(dependent,'Expected a unique unreachable consumer result for the qualifying BFCache gap');
      return;
    }
    deferred.set(gap.name,gap.bfcacheDeferralReason);
    deferred.set(dependent,gap.bfcacheDeferralReason);
  };

  requirePass('INDEPENDENT_BROWSER_IDENTITY', r => isIdentity(r.executable) && isIdentity(r.version) &&
    Array.isArray(r.args) && r.args.includes('--remote-debugging-pipe'));
  requirePass('NEUTRAL_NATIVE_VISIBILITY', r => r.initial === 'visible' &&
    visibilityWitness(r.hidden,'hidden') && visibilityWitness(r.visible,'visible') && r.hidden.doc === r.visible.doc);
  for (const kind of ['membership','revocation','cross_user']) {
    requirePass('PRODUCT_HIDDEN_'+kind, r => {
      if (!visibilityWitness(r.witness,'hidden')||
          !rootsMatchMembership(r.roots,fixture.element_ids_by_form,fixture.forms,fixture.native_oracle.a,['current','syncing'])) return false;
      if(kind!=='membership')return true;
      return isDeepStrictEqual(r.hiddenRemount,{visibility:'hidden',state:'stale',cards:0,requests:0})&&
        r.hiddenView?.visibility==='hidden'&&Array.isArray(r.hiddenView.entries)&&
        isDeepStrictEqual([...r.hiddenView.entries].sort((a,b)=>a-b),fixture.native_oracle.a.a);
    });
  }
  const changedMembership = r => rootsMatchMembership(r.roots, fixture.element_ids_by_form,
    fixture.forms, {...fixture.native_oracle.a,a:fixture.native_oracle.a.a.slice(0,-1)});
  requirePass('PRODUCT_VISIBLE_membership', r => visibilityWitness(r.witness,'visible') &&
    r.witness.doc === one('PRODUCT_HIDDEN_membership')?.witness?.doc && changedMembership(r)&&
    retainedWhilePending(r.before,r.pending,r.responses,String(fixture.forms.a))&&
    r.responses.length===ids.length&&ids.every(id=>r.responses.some(response=>response.element===id&&response.status===200))&&
    r.after?.state==='current'&&r.after.query===r.before.query&&r.after.page===r.before.page&&r.after.focus===r.before.focus);
  for (const [name,options] of securityCases) {
    requirePass(name, r => {
      const verdict = securityVerdict(r,ids,{...options,forms:fixture.forms});
      if (verdict.status === 'FAIL') failed = true;
      return verdict.status === 'PASS' && r.case === name &&
        (options.fresh || r.witness.doc === one(name.replace('_VISIBLE_','_HIDDEN_'))?.witness?.doc);
    });
  }
  requirePass('PRODUCT_CROSS_USER_FRESH_B', r => {
    const {name, status, ...evidence} = r;
    const separate = one('PRODUCT_VISIBLE_cross_user')?.freshB;
    return separate && isDeepStrictEqual(evidence,separate) &&
      isDeepStrictEqual(r.oracle,fixture.native_oracle.b);
  });
  requirePass('ATOMIC_INFLIGHT_DETACH_REINSERT_GENUINE_RESPONSE', r => r.bootstrapRequests === 2);
  requirePass('SHORTCODE_AFTER_EXPLICIT_ELEMENTOR_DEACTIVATION',
    r => r.entries === fixture.native_oracle.a.a.length && r.entries > 0);

  const neutral = one('NEUTRAL_NATIVE_BFCACHE');
  if (historyGap(neutral,true)) {
    const product = one('PRODUCT_GENUINE_BFCACHE');
    if (product?.status === 'NOT_PROVEN' && !product.witness &&
        product.reason === 'Neutral genuine BFCache was not qualified' &&
        product.bfcacheDeferralReason === neutral.bfcacheDeferralReason) {
      defer(product,'PRODUCT_GENUINE_BFCACHE_CONSUMER');
      if (deferred.has(product.name)) deferred.set(neutral.name,neutral.bfcacheDeferralReason);
    } else block('PRODUCT_GENUINE_BFCACHE','Missing consequence of the neutral BFCache gap');
    for (const kind of ['membership','revocation']) {
      exclude('PRODUCT_BFCACHE_'+kind);
      exclude('PRODUCT_BFCACHE_CONSUMER_'+kind);
    }
    exclude('PRODUCT_SECURE_FRESH_LOAD_membership');
  } else {
    requirePass('NEUTRAL_NATIVE_BFCACHE', r => restored(r.witness));
    exclude('PRODUCT_GENUINE_BFCACHE');
    exclude('PRODUCT_GENUINE_BFCACHE_CONSUMER');
    for (const kind of ['membership','revocation']) {
      const name = 'PRODUCT_BFCACHE_'+kind, dependent = 'PRODUCT_BFCACHE_CONSUMER_'+kind;
      const product = one(name);
      if (historyGap(product,false)) {
        defer(product,dependent);
        if (kind === 'membership') requirePass('PRODUCT_SECURE_FRESH_LOAD_membership', r =>
          product.witness?.beforeDoc !== product.witness?.afterDoc && changedMembership(r));
      } else {
        exclude(dependent);
        if (kind === 'membership') exclude('PRODUCT_SECURE_FRESH_LOAD_membership');
        requirePass(name,r => {
          if (!restored(r.witness)) return false;
          try { requireInvalidated(r.witness.pagehideRoots,ids); } catch { return false; }
          if (kind === 'membership') return changedMembership(r);
          if (r.shells !== ids.length || !Array.isArray(r.denials) ||
              !r.denials.some(response => response.status === 403) ||
              !Array.isArray(r.roots)) return false;
          if (r.roots.length === 0) return true; // producer verified denial in both Atomic shells
          try { requireInvalidated(r.roots,ids); return true; } catch { return false; }
        });
      }
    }
  }
  for (const record of result) {
    if (!statusValues.has(record.status) || matching(record.name).length !== 1 ||
        (['NOT_PROVEN','NOT_REACHED'].includes(record.status) && !deferred.has(record.name))) {
      block(record.name,'Unknown status, ambiguous result or unresolved evidence');
    }
  }
  for (const record of records) {
    const reason = deferred.get(record.name);
    if (record.qualificationImpact !== undefined &&
        (!reason || record.qualificationImpact !== 'NONBLOCKING_WITH_REASON' || record.nonblockingReason !== reason)) {
      block(record.name,'Unsubstantiated qualification impact');
    }
  }
  return {records:result.map(record => deferred.has(record.name)
    ? {...record,qualificationImpact:'NONBLOCKING_WITH_REASON',nonblockingReason:deferred.get(record.name)}
    : record),blocking,failed};
}

const validEntries = entries => Array.isArray(entries) &&
  entries.every(id => Number.isSafeInteger(id) && id > 0) && new Set(entries).size === entries.length;
function rootsMatchMembership(roots, elementByForm, forms, oracle, states=['current']) {
  return Array.isArray(roots) && roots.length === 2 && ['a','b'].every(key => {
    const form = String(forms[key]);
    const matching = roots.filter(r => r?.form === form && r.element === elementByForm[form]);
    return matching.length === 1 && states.includes(matching[0].state) &&
      validEntries(oracle?.[key]) && isDeepStrictEqual(matching[0].entries,oracle[key]);
  });
}

function consistentDom(state) {
  if (!state || !Array.isArray(state.roots) || !Array.isArray(state.widgetStates) ||
      !validEntries(state.cardEvents) || !Number.isSafeInteger(state.documentCards) ||
      typeof state.privateMarker !== 'boolean') return false;
  const widgets = state.widgetStates;
  if (!widgets.every(w => isIdentity(w?.element) && Array.isArray(w.roots) &&
      w.roots.every(r => r?.element === w.element)) ||
      new Set(widgets.map(w=>w.element)).size !== widgets.length) return false;
  const widgetRoots = widgets.flatMap(w => w.roots);
  return widgetRoots.length === state.roots.length &&
    state.roots.every(r => isIdentity(r?.element) && validEntries(r.entries) &&
      state.roots.filter(other => other?.element === r.element).length === 1 &&
      widgetRoots.filter(other => isDeepStrictEqual(other,r)).length === 1) &&
    state.roots.reduce((total,r)=>total+r.entries.length,0) === state.documentCards;
}

// Classify independent observations, never an absent request as server denial.
// Test inputs contain only sanitized evidence and synthetic identities.
export function securityVerdict(e,ids,{crossUser=false,fresh=false,forms}={}){
  const problems=[],violations=[];
  const rows=e.network||[];
  const baselineRows=rows.filter(r=>r.phase==='baseline');
  const tab=baselineRows[0]?.tab;
  const attributed=r=>isIdentity(e.case)&&isIdentity(tab)&&r.case===e.case&&r.tab===tab;
  if(!baselineRows.length||!rows.every(attributed))problems.push('NETWORK_CASE_OR_TAB_ATTRIBUTION_UNPROVEN');
  const observed=rows.filter(r=>r.phase==='consumer'&&!r.direct&&attributed(r));
  const direct=rows.filter(r=>r.phase==='direct'&&r.direct&&attributed(r));
  const latestBaseline=Math.max(...baselineRows.map(r=>r.requestWallTime));
  const afterBaseline=r=>Number.isFinite(latestBaseline)&&Number.isFinite(r.requestWallTime)&&
    r.requestWallTime>latestBaseline;
  if(!Number.isFinite(latestBaseline)||[...observed,...direct].some(r=>!afterBaseline(r)))
    problems.push('NETWORK_PHASE_ORDER_UNPROVEN');
  const expectedActions=crossUser?['gpp_inbox2_read']:['gpp_inbox2_read','gpp_inbox2_atomic_bootstrap'];
  const rejected=r=>r.complete&&!r.problem&&r.status===403&&r.bodyObserved&&r.privateData===false&&
    r.success===false&&r.rejection==='authorization_required'&&r.noStore===true;
  const revoked=e.revocation?.remaining===0&&e.revocation?.commandExit===0;
  if(!revoked)problems.push('SESSION_REVOCATION_UNPROVEN');
  const elementByForm=Object.fromEntries(Object.entries(e.expectedWidgets||{}).map(([id,form])=>[form,id]));
  if(!e.baselineVerified||!consistentDom(e.baseline)||!forms||!e.baselineOracle?.a?.length||
    !rootsMatchMembership(e.baseline.roots,elementByForm,forms,e.baselineOracle))problems.push('A_POSITIVE_CONTROL_UNPROVEN');
  if(ids.length!==2||new Set(ids).size!==2||ids.some(id=>!e.expectedWidgets?.[id]))problems.push('EXPECTED_WIDGET_IDENTITIES_UNPROVEN');
  const state=e.finalDom;
  const documentsIdentified=isIdentity(e.baseline?.doc)&&isIdentity(state?.doc);
  const returnVerified=documentsIdentified&&(fresh
    ? e.freshNavigationVerified===true&&e.baseline.doc!==state.doc
    : e.transitionVerified===true&&visibilityWitness(e.witness,'visible')&&
      e.witness.doc===e.baseline.doc&&e.witness.doc===state.doc);
  if(!returnVerified)problems.push(fresh?'FRESH_NAVIGATION_UNPROVEN':'NATIVE_RETURN_UNPROVEN');
  const admission=e.documents?.filter(d=>d.phase==='consumer').at(-1);
  const admissionDenied=fresh&&e.admissionDenied===true&&admission&&
    (admission.login&&admission.status===200||admission.productPage&&[401,403].includes(admission.status));
  if(!fresh&&returnVerified&&revoked){
    const pending=e.pending?.dom, responses=e.pending?.responses;
    if(!consistentDom(pending)||pending.doc!==state.doc||pending.state!=='visible'||
        !Number.isFinite(pending.observedAt)||!Array.isArray(responses)||responses.length!==ids.length||
        !ids.every(id=>responses.filter(response=>response.element===id&&response.form===e.expectedWidgets?.[id]&&
          response.status===403&&Number.isFinite(response.pausedAt)&&response.pausedAt<=pending.observedAt+1).length===1)){
      problems.push('HELD_DENIAL_UNPROVEN');
    }else if(!forms||pending.cardEvents.length!==0||
        !rootsMatchMembership(pending.roots,elementByForm,forms,e.baselineOracle,['syncing'])){
      violations.push('VERIFIED_SNAPSHOT_CHANGED_DURING_HELD_DENIAL');
    }
    for(const element of ids){
      const receipts=Array.isArray(state.denials)?state.denials.filter(d=>d.element===element&&
        d.form===e.expectedWidgets?.[element]):[];
      const denials=observed.filter(r=>r.element===element&&r.action==='gpp_inbox2_read'&&
        r.form===e.expectedWidgets?.[element]&&rejected(r)&&afterBaseline(r));
      if(denials.length!==1||receipts.length!==1||!Number.isFinite(receipts[0].receivedAt)||
          !Number.isFinite(receipts[0].checkedAt)||receipts[0].receivedAt<denials[0].requestWallTime*1000-1||
          receipts[0].checkedAt<receipts[0].receivedAt){
        problems.push('DENIAL_CHECKPOINT_UNPROVEN_'+element);
        continue;
      }
      const check=receipts[0];
      if(check.cards>0)violations.push('PRIVATE_CARD_RETAINED_PAST_DENIAL_'+element);
      if(check.cards!==0||check.state!=='stale')problems.push('DENIAL_CHECKPOINT_INCOMPLETE_'+element);
    }
  }
  for(const element of ids){
    const action=fresh?'gpp_inbox2_atomic_bootstrap':'gpp_inbox2_read';
    if(!admissionDenied&&!observed.some(r=>r.element===element&&r.action===action&&
      (fresh||r.form===e.expectedWidgets?.[element])))problems.push('CONSUMER_REQUEST_UNPROVEN_'+element);
  }
  for(const element of ids)for(const action of expectedActions){
    const matches=direct.filter(r=>r.element===element&&r.action===action&&
      (action!=='gpp_inbox2_read'||r.form===e.expectedWidgets?.[element]));
    if(matches.length!==1||!matches.every(rejected))problems.push('DIRECT_REJECTION_UNPROVEN_'+element+'_'+action);
  }
  for(const r of [...observed,...direct]){
    if(revoked&&afterBaseline(r)&&r.privateData===true)violations.push('PRIVATE_RESPONSE_'+(r.element||'unknown'));
    if(revoked&&afterBaseline(r)&&r.success===true&&(r.status>=200&&r.status<300)&&
       (r.action==='gpp_inbox2_read'||!crossUser||r.direct))violations.push('UNAUTHORIZED_SUCCESS_'+(r.element||'unknown'));
    if(!ids.includes(r.element)||!rejected(r)||
      (r.action==='gpp_inbox2_read'&&r.form!==e.expectedWidgets?.[r.element]))
      problems.push('NETWORK_OBSERVATION_INCOMPLETE_'+(r.element||'unknown'));
  }
  if(rows.some(r=>r.phase==='direct'&&!r.direct||r.phase==='consumer'&&r.direct||r.phase==='unattributed'))
    problems.push('UNATTRIBUTED_NETWORK_REQUEST');
  if(!state)problems.push('FINAL_DOM_UNAVAILABLE');
  else{
    const domVerified=consistentDom(state);
    if(!domVerified)problems.push('DOM_OBSERVATIONS_INCONSISTENT_OR_INCOMPLETE');
    const consumerQualified=revoked&&returnVerified;
    if(consumerQualified&&((domVerified&&state.documentCards>0)||state.privateMarker===true||state.cardEvents?.length)){
      const aIds=new Set(Object.values(e.baselineOracle||{}).flat());
      const cards=[...(state.cardEvents||[]),...(domVerified?state.roots.flatMap(r=>r.entries):[])];
      if(!crossUser||cards.some(id=>aIds.has(id)))violations.push('PRIVATE_CARD_OBSERVED_AFTER_INVALIDATION');
      else problems.push('UNEXPECTED_OLD_DOCUMENT_CARD_IDENTITY');
    }
    const widgets=Array.isArray(state.widgetStates)?state.widgetStates:[];
    const identity=domVerified&&widgets.length===ids.length&&ids.every(id=>widgets.filter(w=>w.element===id).length===1);
    const terminal=identity&&widgets.every(w=>w.denied&&w.roots.length===0||
      w.roots.length===1&&w.roots[0].element===w.element&&w.roots[0].form===e.expectedWidgets?.[w.element]&&
      w.roots[0].state==='stale'&&w.roots[0].entries.length===0);
    // A missing shell alone does not establish admission denial.
    if(!(terminal||(admissionDenied&&domVerified&&widgets.length===0)))problems.push('TWO_WIDGET_TERMINAL_STATES_UNPROVEN');
  }
  if(e.observationProblems?.length)problems.push(...e.observationProblems);
  if(crossUser){
    const b=e.freshB;
    const freshDocument=b?.verified===true&&isIdentity(b.previousDocument)&&isIdentity(b.newDocument)&&
      b.previousDocument!==b.newDocument&&b.newDocument===b.dom?.doc&&
      b.previousDocument!==e.baseline?.doc&&b.newDocument!==state?.doc&&b.dom?.state==='visible';
    if(!freshDocument||!consistentDom(b?.dom)||!forms||!b.oracle?.b?.length||
      !rootsMatchMembership(b.dom.roots,elementByForm,forms,b.oracle))problems.push('FRESH_B_NATIVE_MEMBERSHIP_UNPROVEN');
    if(b?.membershipMismatch)violations.push('FRESH_B_NATIVE_MEMBERSHIP_MISMATCH');
  }
  return {status:violations.length?'FAIL':problems.length?'NOT_PROVEN':'PASS',
    problems:[...new Set(problems)],violations:[...new Set(violations)],
    consumerRequestObserved:observed.length>0,
    consumerRequestAbsenceReason:observed.length?null:'No matching same-origin bootstrap/read observed; direct endpoint controls are separate'};
}
