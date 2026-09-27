# Capability-First Compatibility Target Architecture V1

```yaml
document_id: GPP-CAPABILITY-FIRST-COMPATIBILITY-TARGET-V1
document_version: 1.0.0
status: OWNER_APPROVED_TARGET__IMPLEMENTATION_OPEN
product: Gravity Presentation Profiles
project: GPP-SRWF-REGISTRATION-IMPLEMENTATION-V1
repository: rezahh107/Gravity-Presentation-Profiles
baseline_main: e45d1bd82b5a0564dd907bd1d2dbb4e791e850dd
owner_decision_date: 2026-09-28
governing_parent: GPP-MOTHER-ARCHITECTURE
scope: product-wide external-plugin/runtime compatibility and validation strategy
```

## 1. Purpose

This document records the Owner-approved migration target for Gravity Presentation Profiles compatibility with external plugins, host surfaces, themes, and optional companion capabilities.

The target is **capability-first compatibility**:

```text
Compatibility is decided by the required public/runtime capability and its contract,
not by a plugin version number alone.
```

This applies product-wide, including but not limited to Gravity Forms, Gravity Flow, Gravity Perks products, PersianGravity, Elementor/Hello Elementor, and later supported integrations.

This document is a target architecture. It does not claim that current runtime code already conforms. Existing exact-version gates, pinned qualification fixtures, and historical evidence remain truthful descriptions of the implementation/evidence that produced them until separately migrated and revalidated.

## 2. Core compatibility model

The intended runtime decision model is:

```text
External product detected
        ↓
Required public/runtime capability exists?
        ↓ yes
Required capability contract is compatible?
        ↓ yes
Use the capability

otherwise
        ↓
Preserve native host behavior + bounded diagnostic
```

Plugin version may be recorded as diagnostic/provenance context, but it is not compatibility authority by itself.

The anti-pattern to remove is:

```text
plugin version == one exact known version
        ↓
assume compatible

plugin version != that exact version
        ↓
reject an otherwise compatible capability
```

## 3. Goal 1 — Capability-first compatibility

GPP must not enable or disable an integration solely because `plugin version === X` or `plugin version !== X`.

For every integration, GPP should identify the smallest capability actually required and qualify that capability directly.

Examples include:

- a public facade/class and callable method;
- a documented hook/filter;
- a host API operation;
- an authentic runtime DOM relationship;
- a supported control/flyout topology;
- a public state/behavior contract.

For PersianGravity Jalali presentation, the relevant consumer question is whether the admitted public Jalali facade/callable contract is available and compatible, not whether `PGR_VERSION` equals one historical release number.

## 4. Goal 2 — Version is diagnostic context, not runtime authority

Version numbers may remain useful for:

- diagnostics;
- provenance;
- test-matrix labeling;
- release evidence;
- reproducing a known defect;
- identifying a mechanically proven incompatible release.

A version mismatch alone must not produce `provider_incompatible` or equivalent runtime rejection when the required capability contract is still valid.

Version information may help explain *which environment was observed*; it must not substitute for proving *which capability exists*.

## 5. Goal 3 — Feature detection plus contract verification

Simple feature presence is necessary but not always sufficient.

GPP should distinguish:

```text
capability exists
!=
capability satisfies the contract GPP needs
```

Where risk warrants it, qualification must verify the required contract characteristics, for example:

- expected callable/public seam exists;
- accepted input type/shape remains compatible;
- output/fallback semantics remain compatible;
- required host identity/state is preserved;
- native event/lifecycle ownership remains intact;
- required presentation relationship remains valid.

Do not expand this into private/internal implementation coupling.

## 6. Goal 4 — Forward compatibility by default

A newer external-plugin release must not automatically disable a still-compatible integration.

Unknown/new version number is not itself evidence of incompatibility.

GPP should fail closed only when the required capability is absent, ambiguous, incompatible, or cannot be safely proven at the required boundary.

This target is intended to prevent compatible provider upgrades from silently degrading GPP presentation merely because the version string changed.

## 7. Goal 5 — No dependency on private/internal implementation

Capability-first compatibility must not be implemented by coupling GPP to private classes, copied source, undocumented internals, or foreign implementation details.

Prefer, in order:

1. public/documented API or facade;
2. public/documented hook/filter;
3. runtime capability independently qualified at a bounded host seam;
4. native fallback when no safe public/bounded seam exists.

GPP must not copy PersianGravity conversion internals or reimplement a host-owned workflow/component merely to avoid a version gate.

## 8. Goal 6 — Graceful degradation

If an optional enhancement cannot be safely consumed:

```text
enhancement unavailable or incompatible
→ preserve native host presentation/behavior
→ record bounded diagnostic
```

Do not convert an optional integration failure into:

- fatal runtime failure;
- broken Inbox/Entry Detail/page rendering;
- synthetic duplicate state;
- silent mutation of host data/workflow semantics.

## 9. Goal 7 — Host capability over host version

The same capability-first rule applies to host products such as Gravity Flow, Gravity Forms, and Gravity Perks products.

For example, an Inbox integration should ask whether the required authentic host contracts exist, such as:

- the native Inbox surface identity;
- the native Search seam;
- the native pagination contract;
- Settings trigger/flyout relationship;
- keyboard/focus boundary;
- native entry-navigation contract.

A host update that preserves those contracts should not fail only because its version increased.

A host update that changes those contracts must fail safely or trigger bounded requalification of the affected capability.

## 10. Goal 8 — DOM-shape capability detection

For markup-sensitive integrations, DOM shape and element relationships are themselves part of the runtime capability contract.

Finding a selector is not enough.

Before moving/recomposing a native node, GPP must consider relationships such as:

- trigger ↔ popup/flyout;
- control ↔ delegated-event ancestor;
- input ↔ icon/clear affordance;
- grid ↔ tab guard/focus manager;
- ARIA owner/target relationships;
- positioning/containing block;
- clipping ancestors;
- host-owned sibling/parent identity.

Unknown or replaced host shape must fail safely rather than applying a guessed composition.

## 11. Goal 9 — Preserve native ownership

When a native capability exists, GPP must keep that native capability authoritative.

Examples:

- native Search remains the Search implementation;
- native pager remains pagination truth;
- native Push Settings remains preference/permission behavior;
- native entry links remain navigation truth;
- native workflow state remains workflow truth.

GPP may compose/style an already-correct native capability, but must not create a parallel implementation or duplicated state merely for visual fidelity.

## 12. Goal 10 — Presentation composition must be relationship-aware

A control is not necessarily an isolated element.

Any production reparenting/recomposition must qualify the complete presentation relationship required by that control.

A repair is incomplete if the trigger still clicks but its popup/flyout is clipped, positioned incorrectly, loses keyboard reachability, or breaks another native relationship.

Functional persistence alone is not sufficient proof of presentation conformance.

## 13. Goal 11 — Theme/page-shell independence

GPP must not become coupled to one theme name as a runtime prerequisite.

Hello Elementor is a current target environment, not product identity.

Host/page-shell adaptations should use the narrowest explicit page/template/capability boundary available rather than global theme-name checks or broad selectors.

### Current SRWF owner-locked heading authority

For the SRWF Inbox target page:

```text
Visible semantic heading authority: GPP internal H1 "کارهای من"
Host/theme page title: suppressed for this target page/template
```

The suppression belongs at the bounded host page/template boundary. Do not solve it with a broad GPP rule that guesses and hides arbitrary theme headings globally.

Validation must prove that the final target page exposes one intended visible "کارهای من" heading without creating a duplicate title outside the GPP surface.

## 14. Goal 12 — Real-host acceptance is part of qualification

Fixture/runtime qualification is necessary but is not sufficient for final acceptance of composition-sensitive UI.

When a change materially alters real page composition, qualification must include evidence from a representative full host page and, where required, the actual target site/environment.

Surface-only screenshots/crops must not be used to claim absence of page-shell integration defects that are outside the crop.

Human Owner acceptance remains distinct from automated evidence when the governing contract requires it.

## 15. Goal 13 — Cross-plugin integration tests must exercise the real capability

When GPP claims an integration with another plugin, CI should exercise the actual public capability it consumes.

For an active/current provider integration, tests should prove:

- provider capability is active;
- GPP detects the capability by contract;
- the expected presentation is produced;
- raw/host semantics remain unchanged;
- provider absence/incompatibility falls back safely.

A legacy pinned provider or mock may remain as one matrix row, but it must not be the only evidence for compatibility with the current production provider.

## 16. Goal 14 — Compatibility matrix without runtime pinning

Separate runtime compatibility from test provenance.

```text
Runtime compatibility
→ capability/contract based

Test matrix
→ may intentionally exercise exact versions/releases
```

Exact versions are appropriate in CI for reproducibility and regression history.

Those exact test versions must not automatically become production runtime gates.

## 17. Goal 15 — Evidence-backed known-incompatible exceptions only

A specific release/version may be treated as incompatible only when a material incompatibility is mechanically demonstrated at the required capability boundary.

If such an exception is necessary, it must record:

- affected product/release;
- affected capability;
- reproduced causal mechanism;
- safe fallback;
- removal/requalification condition.

Do not maintain speculative allowlists or denylists merely because a version has not previously been seen.

## 18. Goal 16 — Visual geometry is part of capability conformance

For presentation-sensitive native controls, functional behavior alone is not sufficient.

Qualification must include the relevant visible/runtime contract, such as:

- popup/flyout remains within its valid viewport/host allocation;
- no clipping by unintended ancestors;
- Search icon/text/clear affordance have valid clearance;
- focus indicator is visible and unclipped;
- RTL/BiDi presentation is correct at the proper boundary;
- natural keyboard path remains valid;
- mobile/narrow layout remains usable;
- 200% text or equivalent admitted scaling remains usable;
- native behavior/state remains intact.

## 19. Goal 17 — No "CI-green by narrow contract"

Every material defect found during real Owner acceptance must be reconciled into the validation model when it represents a repeatable defect class.

For the current Inbox closure, the validation model must eventually cover at minimum:

- Jalali presentation with the current admitted PersianGravity capability, without version-number runtime gating;
- Search icon/text clearance after toolbar composition;
- native Settings flyout geometry/containment in the composed toolbar flow;
- one intended visible "کارهای من" heading across the full target page;
- existing pagination, keyboard, native state, mobile, and text-scaling invariants.

Passing a narrower existing test is not evidence that an untested full-page relationship is correct.

## 20. Migration / transition rule

This target does **not** authorize a blind removal of all current safety checks.

Migration must proceed capability-by-capability:

```text
identify current version gate
        ↓
identify the actual required capability contract
        ↓
prove the public/runtime seam
        ↓
replace version-as-authority with capability/contract detection
        ↓
retain native fallback
        ↓
add falsification/regression coverage
        ↓
validate current + representative older/newer matrix rows
```

Until a consumer seam is migrated and validated, historical exact-version qualification documents remain evidence of the old/current implementation state and must not be rewritten to pretend capability-first migration has already occurred.

## 21. Repair-design implications

Future repair work under this target must avoid manifestation-only patches.

Examples:

- Do not change a PersianGravity hard pin from `4.6.0` to `4.8.0` and call the architecture fixed.
- Do not set a huge `z-index` to hide an unqualified Settings topology problem.
- Do not add arbitrary padding to Search without proving the icon/text geometry contract.
- Do not globally hide headings by theme selector when the target-page authority can be expressed at a bounded page/template boundary.

Repairs must close the same-root-cause defect class and preserve host/provider ownership.

## 22. Acceptance criteria for this architecture target

This target can be considered implemented only when all applicable migrated integrations demonstrate:

1. no plugin-version equality/allowlist gate is used as compatibility authority;
2. required capability/contract detection exists at the correct boundary;
3. absence/incompatibility preserves native behavior;
4. private foreign internals are not copied/owned by GPP;
5. cross-plugin integration evidence uses actual public capabilities;
6. test matrices may remain version-pinned for reproducibility without creating runtime version pins;
7. known incompatible exceptions, if any, are evidence-backed and bounded;
8. representative current-provider/host validation passes;
9. full-page/real-host acceptance covers relationships that surface-only tests cannot see;
10. regression tests close defect classes discovered during Owner acceptance.

## 23. Non-goals

This target does not authorize:

- claiming universal compatibility with every future plugin release without contract evidence;
- bypassing safe fallback when a capability cannot be proven;
- copying private provider/host internals;
- replacing native host behavior with GPP-owned behavior;
- weakening exact-version CI provenance where it is useful for reproducibility;
- treating a version number as useless metadata;
- hiding genuine host semantic/workflow defects behind presentation code;
- merging PR #100 or any other implementation solely because this target document exists.

## 24. Current implementation debt explicitly recognized

The following are recognized migration items, not automatically repaired by this document:

- GPP PersianGravity Jalali consumer currently uses an exact qualified-provider version gate;
- existing GPP evidence still includes exact-provider fixtures appropriate to their historical qualification;
- PR #100 real-site Owner acceptance exposed Search clearance and native Settings flyout presentation gaps not fully represented by the existing automated contract;
- full-page heading authority must be validated beyond the cropped GPP surface.

Each item requires separate implementation/review evidence before it can be marked closed.
