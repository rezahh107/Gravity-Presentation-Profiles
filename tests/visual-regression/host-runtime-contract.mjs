export function assertIntegratedHostIdentity(host, contract) {
  const fail = message => { throw new Error(`VISUAL_TEST_INFRASTRUCTURE_FAILURE: ${message}`); };
  if (!host || !contract) fail('integrated host identity contract is unavailable.');
  if (host.classification !== 'INTEGRATED_SRWF_VISUAL_HOST') fail('integrated host classification mismatch.');
  if (host.composition_authority !== 'VERSIONED_ELEMENTOR_HOST_FIXTURE') fail('integrated host bypassed the versioned Elementor fixture authority.');
  if (host.page_template !== contract.page_template) fail('Elementor page template identity mismatch.');
  if (host.elementor_recognized !== true) fail('Elementor did not recognize the reconstructed host page.');
  if (host.srwf_host_companion_active !== contract.srwf_host_companion_active) fail('SRWF-Host-Companion identity mismatch.');

  const fixture = host.host_fixture;
  const expectedFixture = contract.fixture;
  if (!fixture || !expectedFixture) fail('versioned Elementor host fixture identity is unavailable.');
  for (const field of ['path','fixture_id','classification','schema_version','import_mode']) {
    if (fixture[field] !== expectedFixture[field]) fail(`Elementor host fixture ${field} mismatch.`);
  }
  if (fixture.expected_sha256 !== expectedFixture.sha256 || fixture.actual_sha256 !== expectedFixture.sha256) fail('Elementor host fixture SHA-256 mismatch.');
  if (fixture.elementor_export_type !== 'page' || fixture.elementor_document_type !== 'wp-page') fail('Elementor host fixture export/document type mismatch.');
  if (!fixture.page_bindings || !Number.isInteger(fixture.page_bindings.frontend_shortcode) || !Number.isInteger(fixture.page_bindings.frontend_block)) fail('Elementor host fixture page bindings are incomplete.');

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
