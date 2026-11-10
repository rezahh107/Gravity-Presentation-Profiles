# GPP Inbox 1 / G-014 — Historical Native Column-State Reconciliation and Priority Ledger

**Status:** `DOCUMENTATION_ONLY__NO_PRODUCTION_METHOD_SELECTED`  
**Review date:** 2026-11-08  
**Source baseline:** `main@a159e22c54f102ff2f73c365a97ade6beb90b63e`  
**Active comparative evidence:** GPP [#174](https://github.com/rezahh107/Gravity-Presentation-Profiles/pull/174) (`c8cf9fd7bb615075402b78eaa1f01dd33d855d28`), test-only [#176](https://github.com/rezahh107/Gravity-Presentation-Profiles/pull/176) (`61c2248d9644758ea95f43aa849e7c9d3b572293`), PersianGravity [#114](https://github.com/rezahh107/PersianGravity/pull/114) (`237e8006fae00be586d90a5b76666ceef7a025ca`). These are *reference* Heads, not proof of future freshness.

This ledger supplements the existing Owner Overrides and historical qualification documents. It does not supersede approved visual composition, silently reopen decisions, change GPP/Gravity Flow state ownership, approve `ag-rtl` for production, or certify the current PRs for Merge. Historical PR text is evidence of what was tested and decided *then*, not automatic contemporary runtime proof.

## 1. Mechanism, with the important mode distinction

Gravity Flow is the owner of Inbox Grid construction, task/row identity, native column state and persistence, and operations/navigation. GPP supplies a bounded native column definition/presentation. PersianGravity's G-014 candidate can enable native AG Grid `ag-rtl`, distinct from a Persian page whose AG Grid remains `ag-ltr`.

In the pinned Gravity Flow **3.1.0** source, native restore reads matching saved column identities, applies an `id`-first sorting rule, then calls `columnApi.applyColumnState({state,applyOrder:true})`. Native mutation callbacks can persist the resulting order. In the newer G-014 test, saved state in the experimental D layout is `[1,3,6,date_created,id]`; the host passes `[id,1,3,6,date_created]` to that API. Changing **only the test-only input** to the validated saved order prevented the RTL reload order failure. It does **not** authorize that interception as a product repair.

The historical **host-aligned** solution was designed for an **`ag-ltr` Grid inside an RTL page**, where native `id`-first order was compatible with the Owner-facing physical arrangement. That method and the new **native `ag-rtl`** direction are not interchangeable. The historical acceptance of `ag-ltr` must not be reinterpreted as acceptance of G-014 native RTL.

## 2. Historical decision/evidence ledger — reuse before proposing work

| Reference | Established observation or decision | Status / relevance now |
|---|---|---|
| [#104](https://github.com/rezahh107/Gravity-Presentation-Profiles/pull/104) | Native-First Inbox; Grid, operations, query, state and lifecycle stay host-owned | **MERGED**; architectural invariant, not reopened |
| [#110](https://github.com/rezahh107/Gravity-Presentation-Profiles/pull/110) | Five native visible column identities with `id` and hidden human-readable date companion | **MERGED**; identity/navigation invariant |
| [#111](https://github.com/rezahh107/Gravity-Presentation-Profiles/pull/111) | Reversed physical column definitions for Persian page in **`ag-ltr`**, without owning Grid state | **MERGED**; initial-order evidence in that mode, not persisted-state repair |
| [#112](https://github.com/rezahh107/Gravity-Presentation-Profiles/pull/112) | Same pinned 3.1.0 `id`-first persisted restore, internal `applyColumnState`; tested column hook, `suppressMovable`, `lockPosition`, `enableRtl`, and public post-restore exposure | **CLOSED / NOT MERGED**; `NO_SUPPORTED_REPAIR_SEAM`. Experimental repair withdrawn after runtime falsification. Mandatory stale-state assertion failed as expected; later dependent tests were not claimed |
| [#113](https://github.com/rezahh107/Gravity-Presentation-Profiles/pull/113)–[#117](https://github.com/rezahh107/Gravity-Presentation-Profiles/pull/117) | Four-visible-column/removal-of-`id` qualification, migration and navigation implications | **Evidence-only historical alternative**, stopped by subsequent Owner five-column decision; do not silently reactivate |
| [#118](https://github.com/rezahh107/Gravity-Presentation-Profiles/pull/118) | Host-aligned five-column contract: keep `id` first *internally in `ag-ltr`*, reverse only the informational columns, retain native persistence | **MERGED**; current baseline for the old mode, not a G-014 `ag-rtl` repair |
| [#126](https://github.com/rezahh107/Gravity-Presentation-Profiles/pull/126) | Four scoped `direction:ltr !important` protections correct scroll alignment for `ag-ltr` under RTL pages | **MERGED**; conditional presentation dependency; globally removing it was later falsified |
| [#130](https://github.com/rezahh107/Gravity-Presentation-Profiles/pull/130) | The first general `columnEverythingChanged(source=api)` cannot reliably identify true initial restore against unrelated API changes | **CLOSED / NOT MERGED**; `CANDIDATE_A_DISCRIMINATOR_FALSIFIED` for width/lifecycle; do not present as an RTL-order fix |
| [#131](https://github.com/rezahh107/Gravity-Presentation-Profiles/pull/131) | No proven public post-restore completion seam in pinned host; user callbacks are overwritten/insufficient | **CLOSED / NOT MERGED**; `CANDIDATE_D_PUBLIC_SEAM_NOT_PROVEN`; a proposed vendor completion hook is *not shipped* |
| [#132](https://github.com/rezahh107/Gravity-Presentation-Profiles/pull/132) | Proposed host-level initial width-policy extension not yet supported/qualified | **CLOSED / NOT MERGED**; `UPSTREAM_METHOD_SELECTION_NOT_PROVEN`, width-specific |
| [#133](https://github.com/rezahh107/Gravity-Presentation-Profiles/pull/133)–[#134](https://github.com/rezahh107/Gravity-Presentation-Profiles/pull/134) | One-shot `onGridSizeChanged` public sizing guard and fit-capability checks | **#134 MERGED**; **width-only**. Does not qualify native order interception |
| [#143](https://github.com/rezahh107/Gravity-Presentation-Profiles/pull/143) | Later width provenance/fitting recovery; indistinguishable old saved manual-vs-auto width combinations cannot safely auto-migrate | **MERGED**; width/legacy limit remains separate; does not repair RTL column order |
| [#168](https://github.com/rezahh107/Gravity-Presentation-Profiles/pull/168) | PGR G-014 true `ag-rtl` conflicts with old forced-LTR presentation and five-column order; CSS changes alone do not solve order | **CLOSED / NOT MERGED** test-only; establishes mode-specific new conflict |
| [#174](https://github.com/rezahh107/Gravity-Presentation-Profiles/pull/174) | Independent GPP LTR-axis switch and compatibility warnings; four-state acceptance retains failures and `NOT_PROVEN` | **OPEN / DRAFT** reference; switch is *not* RTL-order repair |
| [#176](https://github.com/rezahh107/Gravity-Presentation-Profiles/pull/176) | Independent A/B/C/D, native storage ablation, actual `onGridReady`/API-input trace, test-only corrected API input, licensed source AST of `id`-first comparator | **OPEN / DRAFT** test-only; **mechanism strengthened, no new supported extension seam proved** |

The 2026-11-08 #176 source/CI verification uses the pinned Gravity Flow 3.1.0 ZIP SHA-256 `ac0573b75831380417a21a455176e25eb746d718bbbd0bb70d6da6f48cba5404` and authentic G-014 test composition. Source/CI confirmation is bounded to that environment. Historical reports must retain their original results and limitations.

## 3. What changed since #112 — and what did not

**Genuine deltas:** G-014 can construct `ag-rtl`; this reverses physical interpretation of the five columns and interacts with the four old LTR scroll selectors. #176 independently validated the native API-input discrepancy, native-vs-GPP storage distinction and manual drag behavior under the new mode.

**Not a new method:** #176's early JavaScript interception and forced-input experiment are **diagnostic private API wrappers**, not a public supported production boundary. AST visibility into the private host comparator does not itself turn that comparator into an extension point. #112's no-supported-seam conclusion is **not overturned** by #176.

**Preserved boundaries:** Do not patch vendor bundles, replace Gravity Flow's state store, clear/rotate Grid IDs as an implicit migration, reorder rendered DOM, continuously force user column positions, or resurrect four-column removal without a separate Owner decision. Distinguish `PASS` test execution from RTL product acceptance; `NOT_PROVEN` is not evidence of a defect; a failed required case remains failed.

## 4. Reprioritized G-014 objectives (decision sequence, not invented Owner product policy)

| Priority | Goal | Required exit evidence / decision | State as of this ledger |
|---|---|---|---|
| **P0 — NOW** | Reconcile historical qualification and stop repeated investigation of already-settled `id`-first restore | #112/#118/#130/#131 and #168/#176 compared with explicit mode, state and scope boundaries; blocked/rejected method ledger | **DOCUMENTED HERE**; historical decision carried forward |
| **P1 — NEXT** | Determine **whether a genuinely supported, stable, scoped method exists** to reconcile native `ag-rtl` order without taking over native persistence | An actual current upstream/published hook or documented extension, demonstrated at the correct point after stored-state read and before/around restore, including lifecycle stability. Compare only materially new candidates; no repeat of #112 failures | **NOT_PROVEN**; no new seam established |
| **P2 — OWNER DECISION IF P1 BLOCKED** | Select a policy-compatible direction when no supported seam exists | Distinguish: (A) retain qualified `ag-ltr` host-aligned behavior and keep G-014 native RTL unadmitted; (B) request/qualify vendor-supported capability; (C) explicitly reconsider an Owner constraint/target with known trade-offs. No silent automatic selection | **OWNER DECISION NOT MADE**; preserve Draft/no merge |
| **P3 — AFTER METHOD DECISION** | Qualify persistence and behavior regression across both modes and transitions | Real manual order/width preservation, legacy/compatible/incomplete states, initial + successive reload, GPP/PGR on/off, shortcode/Block, Operations navigation/identity, Search, sort, pager, Live Refresh, accessibility/keyboard, desktop and mobile scroll, bounded overflow | **PARTIAL TEST EVIDENCE**; full acceptance `NOT_PROVEN` |
| **P4 — ONLY AFTER ADMISSION** | Implement minimal root-complete production repair and rereview its exact Head | Confirm root/enforcement boundary → defect-class closure → method → conformance lock → falsification/regression → separate code authorization; verify fresh Head and release gates | **NOT AUTHORIZED / NOT IMPLEMENTED** |
| **P5 — PARALLEL BUT DISTINCT** | Keep width-fit recovery, scroll/touch and full four-state acceptance as independently tracked gates | Use #126/#133/#134/#143/#168/#174 evidence; do not call a width/scroll success an RTL-order success | **PARTIAL / KNOWN FAILURES REMAIN** |

**Practical next action:** a *read-only delta qualification* of publicly supported integration methods that **were not already rejected in #112**, using the historical evidence as the negative-method baseline. If none is identified, move to P2 **without creating another open-ended experiment**. P3 tests are not a substitute for P1's method-admission proof. The currently recorded method set is not sufficient to produce a root-correct production implementation prompt.

## 5. Evidence quality and delivery guards

- This ledger is **documentation**, not an official review verdict for #174/#176/#114 and not a release decision. Recheck each PR's exact Head before any downstream review or action.
- Repository CI SUCCESS on #176 proves its test-only workflow executed, **not** that the underlying four-state acceptance matrix passed. Its wider regression still has documented failing and unproven scenarios.
- #112 `NO_SUPPORTED_REPAIR_SEAM` is a historical **qualified negative** on the exact pinned host and constraints. It can be superseded only by concrete changed host capabilities, new upstream contract, or an explicit Owner policy change—not by rephrasing the same private workaround.
- #118 `HOST_ALIGNED_FIVE_COLUMN_QUALIFIED` was adopted under **`ag-ltr`**; do not extend to genuine `ag-rtl`.
- No production source, runtime storage, PersianGravity code, PR-state, Merge, Tag, Release or Deployment is authorized by this ledger.
