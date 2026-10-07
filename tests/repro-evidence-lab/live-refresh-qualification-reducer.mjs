export function reduceQualificationState({
  unresolved = [],
  nativeHostLimitations = [],
  gppIncompatibilities = [],
  acceptanceSemanticsComplete = true,
} = {}) {
  let finalDisposition = 'NATIVE_LIVE_REFRESH_SUFFICIENT';

  if (nativeHostLimitations.length > 0 || !acceptanceSemanticsComplete) {
    finalDisposition = 'HOST_LIMITATION_REQUIRES_OWNER_DECISION';
  } else if (gppIncompatibilities.length > 0) {
    finalDisposition = 'BOUNDED_GPP_HARDENING_JUSTIFIED';
  } else if (unresolved.length > 0) {
    finalDisposition = 'QUALIFICATION_INCOMPLETE';
  }

  return {
    final_disposition: finalDisposition,
    native_host_limitations: [...nativeHostLimitations],
    gpp_incompatibilities: [...gppIncompatibilities],
    unresolved: [...unresolved],
    acceptance_semantics_complete: acceptanceSemanticsComplete,
  };
}

export function runReducerFalsification() {
  const cases = [
    {
      id: 'A_ALL_PROVEN_NO_LIMITATION',
      input: {},
      expected: 'NATIVE_LIVE_REFRESH_SUFFICIENT',
    },
    {
      id: 'B_BACKGROUND_NOT_PROVEN_ONLY',
      input: { unresolved: ['LRQ-BACKGROUND'] },
      expected: 'QUALIFICATION_INCOMPLETE',
    },
    {
      id: 'C_BACKGROUND_UNKNOWN_PLUS_HOST_LIMITATION',
      input: {
        unresolved: ['LRQ-BACKGROUND'],
        nativeHostLimitations: ['CONFIRMED_NATIVE_HOST_LIMITATION'],
        acceptanceSemanticsComplete: false,
      },
      expected: 'HOST_LIMITATION_REQUIRES_OWNER_DECISION',
    },
    {
      id: 'D_GPP_INCOMPATIBILITY_PLUS_UNKNOWN',
      input: {
        unresolved: ['LRQ-BACKGROUND'],
        gppIncompatibilities: ['CONFIRMED_GPP_INCOMPATIBILITY'],
      },
      expected: 'BOUNDED_GPP_HARDENING_JUSTIFIED',
    },
    {
      id: 'E_STALE_REVERSION_THEN_RECONVERGENCE',
      input: {
        nativeHostLimitations: ['OUT_OF_ORDER_STALE_REVERSION_REQUIRES_OWNER_TOLERANCE'],
        acceptanceSemanticsComplete: false,
      },
      expected: 'HOST_LIMITATION_REQUIRES_OWNER_DECISION',
    },
  ];

  const results = cases.map((testCase) => {
    const actual = reduceQualificationState(testCase.input).final_disposition;
    return {
      id: testCase.id,
      expected: testCase.expected,
      actual,
      pass: actual === testCase.expected,
    };
  });

  return { ok: results.every((result) => result.pass), results };
}
