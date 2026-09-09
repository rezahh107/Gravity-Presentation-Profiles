# WU3 Revised Validation Model

Work Unit: `WU-GPP-RUNTIME-INTEGRATION-03`

This record implements the corrected validation strategy for the SRWF Registration profile without reopening WU1 or WU2.

## Supersession

The historical canonical WU3 acceptance set remains preserved as historical criteria:

`AC-WU3-001` through `AC-WU3-007`.

The active replacement set for WU3 closure is:

`AC-WU3R-001` through `AC-WU3R-010`.

This is a set-level supersession. No one-to-one numbering equivalence is asserted. The machine-readable source is `docs/validation/wu3-validation-coverage.json`.

## Two evidence classes

`CI_BLOCKING` means a repository-controlled property that can be deterministically reproduced without owner-operated staging, private Gravity packages, licenses, or secrets. These checks run against synthetic/control fixtures and production GPP assets.

`RUNTIME_EVIDENCE` means a property that requires authentic Gravity ecosystem runtime or qualifying first-party exact-contract evidence. Absence of that evidence remains `NOT_PROVEN`; it is not converted to PASS and does not block ordinary WU3 closure under the revised model.

**Claim-scope rule:** CI fixture PASS is not runtime PASS.

The controlled fixtures are not Gravity Forms, GP Advanced Select, GP File Upload Pro, or PersianGravity emulators. They only provide deterministic DOM, focus, layout, ARIA, and color-composition surfaces against which GPP-owned presentation assets can be measured.

## Blocking browser lane

`tests/wu3/fixtures/synthetic-registration.html` contains:

- one selected `gpp-enabled gpp-profile-srwf-registration` form;
- one disabled/unselected form on the same page;
- ordinary synthetic controls and validation/help states;
- predeclared label/ARIA relationships;
- outside-form sentinels.

The fixture loads the production GPP Base and SRWF Registration CSS. A small fixture-owned consumer stylesheet maps production CSS custom properties onto controlled elements. It introduces no production rule and is not authority for Gravity Forms behavior. Its focus outline geometry exists only to make preservation/removal mechanically observable; it is not a canonical GPP focus-ring value.

`tests/wu3/run-browser-validation.mjs` verifies at 320 CSS px:

- no ordinary-content horizontal overflow;
- required controls stay inside the viewport;
- selected-form horizontal padding computes to 16px from production CSS;
- keyboard Tab traversal reaches each intentional interactive element with an observable focus cue;
- predeclared controlled-fixture labels and ARIA relations remain intact;
- enumerated canonical fixture color pairs meet their applicable contrast threshold;
- selected-profile properties do not leak to the disabled form or outside sentinel.

The browser harness uses Node built-ins plus an installed Chromium/Chrome binary, with no npm runtime dependency and no external network request.

## Runtime subjects deliberately NOT_PROVEN

Unless separately upgraded by qualifying evidence, the ledger keeps these subjects `NOT_PROVEN`:

- authentic Gravity Forms markup/component lifecycle;
- host-generated ARIA relationships and screen-reader behavior;
- authentic Gravity Forms help/error/validation-summary relationships;
- authentic host focus management and reading order;
- authentic submission lifecycle;
- GP Advanced Select behavior/configuration/search/keyboard lifecycle;
- GP File Upload Pro behavior/configuration/upload/crop lifecycle;
- PersianGravity Jalali/date-widget UI and lifecycle;
- fully host/theme/plugin-composed contrast beyond the controlled fixture;
- fully host/theme/plugin-composed reflow beyond the controlled fixture.

A green fixture test does not change those states.

## Adapter admission gate

`docs/validation/runtime-adapter-evidence.json` is default-deny. Component-specific production adapter code must live in a guarded runtime-adapter location and carry `GPP_RUNTIME_ADAPTER_ID:<adapter_id>`. The matching registry entry must identify component, version/configuration scope, exact selector/hook/API contract, source path, evidence type/reference, and provenance.

Qualifying admission authority is limited to current first-party documentation that explicitly defines the relied-upon exact contract, or sanitized authentic runtime evidence with component/plugin version, relevant configuration/state, exact observed contract, and provenance. Every admitted evidence record must also bind to a repository-controlled sanitized evidence artifact under `docs/validation/evidence/` by exact SHA-256; URL-only or metadata-only admission is rejected. Lifecycle-sensitive adapters additionally require evidence covering the relied-upon lifecycle/timing semantics.

Synthetic fixtures and mocks can regression-test an already admitted adapter; they cannot admit one.

The guard validates the actual repository and includes falsification tests proving that an unregistered adapter file and an adapter supported only by synthetic evidence are rejected.

## Closure boundary

WU3 closure from this lane means only that the revised blocking `AC-WU3R-*` repository-controlled claims pass. It does **not** claim:

- Canonical Gallery approval;
- full WCAG conformance;
- authentic Gravity ecosystem runtime validation;
- authentic host screen-reader/submission behavior;
- public-release readiness.

Those remain separate downstream or runtime-evidence gates.
