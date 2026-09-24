export function assertIntegratedHostIdentity(host, contract) {
  const fail = message => { throw new Error(`VISUAL_TEST_INFRASTRUCTURE_FAILURE: ${message}`); };
  if (!host || !contract) fail('integrated host identity contract is unavailable.');
  if (host.classification !== 'INTEGRATED_SRWF_VISUAL_HOST') fail('integrated host classification mismatch.');
  if (host.page_template !== contract.page_template) fail('Elementor page template identity mismatch.');
  if (host.elementor_recognized !== true) fail('Elementor did not recognize the deterministic host page.');
  if (host.srwf_host_companion_active !== contract.srwf_host_companion_active) fail('SRWF-Host-Companion identity mismatch.');

  const assertPackage = (label, actual, expected, extras = {}) => {
    if (actual?.version !== expected?.version) fail(`${label} version mismatch.`);
    if (actual?.expected_package_sha256 !== expected?.sha256 || actual?.actual_package_sha256 !== expected?.sha256) fail(`${label} SHA-256 mismatch.`);
    for (const [key, value] of Object.entries(extras)) if (actual?.[key] !== value) fail(`${label} ${key} mismatch.`);
  };

  assertPackage('Hello Elementor', host.hello_elementor, contract.hello_elementor, { commit: contract.hello_elementor.commit });
  assertPackage('Elementor', host.elementor, contract.elementor);
  assertPackage('Elementor Pro', host.elementor_pro, contract.elementor_pro, { classification: contract.elementor_pro.classification });
  return true;
}
