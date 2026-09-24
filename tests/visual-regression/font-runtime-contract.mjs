const infra = message => { throw new Error(`VISUAL_TEST_INFRASTRUCTURE_FAILURE: ${message}`); };

const primaryFamily = value => String(value || '').split(',')[0].trim().replace(/^['"]|['"]$/g, '');

export function assertVazirAuthorityIdentity(authority, contract) {
  if (!contract || contract.repository !== 'rezahh107/Vazir' || !/^[a-f0-9]{40}$/.test(contract.commit || '') || contract.family !== 'Vazir') {
    infra('Vazir font authority contract is missing or malformed.');
  }
  if (!authority) infra('Vazir source/package authority is missing.');
  for (const field of ['repository','commit','plugin_version','plugin_file','family']) {
    if (authority[field] !== contract[field]) infra(`Vazir authority ${field} mismatch.`);
  }
  if (contract.require_system_font_absent !== true || authority.system_vazir_absent !== true) infra('Vazir system-font exclusion proof is missing.');
  if (authority.plugin_active !== true || authority.frontend_enabled !== true) infra('Vazir plugin/frontend delivery is not active.');
  const expectedWeights=Object.keys(contract.weights || {});
  if (!expectedWeights.length || JSON.stringify(authority.selected_weights) !== JSON.stringify(expectedWeights)) infra('Vazir selected weight identity mismatch.');
  for (const weight of expectedWeights) {
    const expected=contract.weights[weight], actual=authority.weights?.[weight];
    if (!actual) infra(`Vazir weight ${weight} source identity is missing.`);
    if (actual.source_path !== expected.source_path || actual.design_alias !== expected.design_alias) infra(`Vazir weight ${weight} source/alias mismatch.`);
    if (actual.expected_blob_sha !== expected.blob_sha || actual.actual_blob_sha !== expected.blob_sha || actual.staged_blob_sha !== expected.blob_sha) infra(`Vazir weight ${weight} font identity mismatch.`);
  }
  return true;
}

export function assertVazirFontLoadEvidence(evidence, contract, side) {
  if (!evidence || evidence.side !== side || evidence.family !== contract.family) infra(`${side} Vazir browser evidence is missing or malformed.`);
  for (const weight of Object.keys(contract.weights || {})) {
    const item=evidence.weights?.[weight];
    if (!item || item.font_check !== true || item.load_count < 1 || item.registered_count < 1 || item.loaded_face_count < 1 || item.probe_primary_family !== contract.family || String(item.probe_font_weight) !== weight) {
      infra(`${side} Vazir weight ${weight} was not proven loaded.`);
    }
  }
  for (const semantic of ['title','search']) {
    const item=evidence.semantic?.[semantic];
    if (!item?.present || item.primary_family !== contract.family || !String(item.font_weight || '')) infra(`${side} Vazir semantic font evidence is invalid for ${semantic}.`);
  }
  return true;
}

export function assertArtifactVazirProvenance(environment, contract) {
  assertVazirAuthorityIdentity(environment?.font_authority, contract);
  if (JSON.stringify(environment?.font_authority) !== JSON.stringify(environment?.integrated_visual_host?.vazir_font)) infra('diagnostic artifact Vazir authority does not match integrated-host identity.');
  if (!environment?.design_authority?.sha256 || environment.font_authority.owner_design_authority_sha256 !== environment.design_authority.sha256) infra('staged Vazir design authority SHA-256 provenance is inconsistent.');
  assertVazirFontLoadEvidence(environment?.font_load_evidence?.runtime, contract, 'runtime');
  assertVazirFontLoadEvidence(environment?.font_load_evidence?.design_authority, contract, 'design_authority');
  return true;
}

export async function proveVazirFontsLoaded(page, contract, semanticSelectors, side) {
  const evidence=await page.evaluate(async ({family,weights,semanticSelectors,side}) => {
    const primary=value=>String(value||'').split(',')[0].trim().replace(/^['"]|['"]$/g,'');
    const probeRoot=document.createElement('div');
    probeRoot.setAttribute('data-gpp-vazir-probe','');
    probeRoot.style.cssText='position:fixed;left:-10000px;top:-10000px;visibility:hidden;pointer-events:none;';
    const probes={};
    for(const weight of weights){
      const span=document.createElement('span');
      span.textContent='آزمون قلم وزیر ۱۲۳';
      span.style.fontFamily=`"${family}"`;
      span.style.fontWeight=weight;
      span.style.fontSize='20px';
      probeRoot.append(span);
      probes[weight]=span;
    }
    document.body.append(probeRoot);
    await document.fonts.ready;
    const loadedWeights={};
    for(const weight of weights){
      const descriptor=`${weight} 20px "${family}"`;
      const loaded=await document.fonts.load(descriptor,'آزمون قلم وزیر ۱۲۳');
      const registered=[...document.fonts].filter(face=>primary(face.family)===family && (String(face.weight).trim()===weight || String(face.weight).includes(weight)));
      const style=getComputedStyle(probes[weight]);
      loadedWeights[weight]={
        font_check:document.fonts.check(descriptor,'آزمون قلم وزیر ۱۲۳'),
        load_count:loaded.length,
        registered_count:registered.length,
        loaded_face_count:registered.filter(face=>face.status==='loaded').length,
        registered_statuses:registered.map(face=>face.status),
        probe_primary_family:primary(style.fontFamily),
        probe_font_weight:style.fontWeight,
      };
    }
    const semantic={};
    for(const [name,selector] of Object.entries(semanticSelectors)){
      const element=document.querySelector(selector);
      if(!element){semantic[name]={present:false,primary_family:null,font_weight:null};continue;}
      const style=getComputedStyle(element);
      semantic[name]={present:true,primary_family:primary(style.fontFamily),font_family:style.fontFamily,font_weight:style.fontWeight};
    }
    probeRoot.remove();
    return {side,family,weights:loadedWeights,semantic};
  },{family:contract.family,weights:Object.keys(contract.weights||{}),semanticSelectors,side});
  assertVazirFontLoadEvidence(evidence,contract,side);
  return evidence;
}

export { primaryFamily };
