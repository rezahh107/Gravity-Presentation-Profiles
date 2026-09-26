# SRWF Registration Operator Journey — Gravity Flow Host Capability Qualification V1

Status: `READY_FOR_OWNER_MERGE_DECISION`

PR: `#95` — qualification/evidence only, `DO_NOT_MERGE` until Owner decision.

Baseline: `main@68a8a3d903955cd187b303eb632f42f1ab4c307b` (merged PR #94 baseline at qualification start).

## Scope and evidence ceiling

This document qualifies the host-owned capabilities required by the Owner-approved SRWF operator journey. It does **not** implement that journey.

Pinned reproducible fixture:

- WordPress `7.1.1`
- Gravity Forms `3.1.1.1`
- Gravity Forms package SHA-256 `542f56ae0747f3661d1474996527298027db3fb8ed3e6469a6391aaabf61069b`
- Gravity Flow `3.1.0`
- Gravity Flow package SHA-256 `ac0573b75831380417a21a455176e25eb746d718bbbd0bb70d6da6f48cba5404`
- Chromium via Playwright `1.55.0`

Maximum positive claim: `PROVEN_IN_REPRODUCIBLE_SIMULATION`.

This does **not** establish target-production equivalence. Gravity Flow `3.1.0` is the first pinned reproducible qualification fixture, not permanent compatibility identity. Future production admission must test the behavioral capability/contract actually consumed by GPP. Exact-version equality is not a substitute for semantic capability checks.

No production PHP/CSS/JS, Inbox behavior, Entry Detail vNext presentation, Print behavior, workflow configuration, authorization, action engine, confirmation engine, result-state store, or navigation state system is implemented by this PR.

## Planned vs actual

Planned: reuse the existing WU18/WU21 runtime laboratory and qualify four host capabilities with exact source, authentic runtime, and browser evidence.

Actual:

- Fresh `main` matched the expected baseline exactly; there was no start-of-task baseline deviation.
- The existing WU18/WU21 package fixtures, WordPress runtime pattern, authentic Gravity Flow steps, and Playwright approach were reused.
- A focused qualification-only workflow was added rather than broadening the semantic meaning of existing WU18/WU21 evidence.
- Source inspection established that Gravity Flow `Require Confirmation` is implemented by browser-native `confirm()`, not a host DOM modal.
- The first harness iterations exposed test-fixture assumptions rather than product defects: same-request feed-object caching, lazy loading of `Gravity_Flow_Entry_Detail`, current-user semantics of `get_editable_fields()`, unsupported Approval status returning `false` rather than necessarily `WP_Error`, and User Input exposing `gravityflow_status=complete` as a hidden field. Each harness issue was corrected without weakening the behavioral assertion or adding test-only workflow semantics.
- Final exact-Head browser qualification passed `8/8` cases.

## Capability summary

| Journey area | Disposition | Production consequence |
| --- | --- | --- |
| Native Approve / Reject confirmation lifecycle | `QUALIFIED_NATIVE_CAPABILITY` | Preserve the host/browser confirmation lifecycle. |
| PR #94 styled DOM confirmation presentation | `HOST_CAPABILITY_NOT_AVAILABLE` | Do not implement the designed modal as a presentation-only skin over 3.1.0; that would require owning/replacing confirmation behavior. |
| Authoritative post-action result truth | `QUALIFIED_WITH_CAPABILITY_ADAPTER_REQUIRED` | A bounded adapter may re-read host state after native processing; a click is never truth. Technical Error remains separately `NOT_PROVEN`. |
| Native correction topology: Approval → Revert → User Input → Approval | `QUALIFIED_NATIVE_CAPABILITY` | The approved correction journey can be implemented by presenting native Revert/User Input topology, not by creating a GPP transition. |
| Canonical return to Inbox page 1 | `QUALIFIED_BOUNDED_PRESENTATION_SEAM` | Use the host-resolved Inbox surface route/native back-link authority; do not hard-code Page ID or preserve transient grid state. |

---

# Capability 1 — Native Approve / Reject confirmation

Disposition: `QUALIFIED_NATIVE_CAPABILITY`

Presentation sub-disposition for the PR #94 styled modal: `HOST_CAPABILITY_NOT_AVAILABLE`.

### 1. Behavior GPP needs

A host-owned confirmation lifecycle for native Approval actions so GPP can preserve the authoritative action, nonce, validation, assignment, and mutation path while presenting the surrounding action controls.

### 2. Exact host fact / seam

Pinned Gravity Flow source and runtime prove:

- Approval `workflow_detail_status_box_actions()` renders native Approval action buttons and the native nonce.
- The effective `confirmation_prompt` setting wires Approve, Reject, and Revert through `handleApprovalStepButtonClick(...)`.
- `js/inbox.js` calls browser-native `confirm(confirmMessage)` before populating the hidden `gravityflow_approval_new_status_step_<step-id>` action field.
- If the browser confirmation is dismissed, the JS returns `false` before the hidden action status is written.
- Accepted actions continue through Gravity Flow's native form POST, nonce check, validation, assignee processing, step completion, and routing.

Source authorities in the pinned fixture include:

- `includes/steps/class-step-approval.php::workflow_detail_status_box_actions()` lines 882–1034
- `includes/steps/class-step-approval.php::maybe_process_status_update()` lines 538–584
- `includes/steps/class-step-approval.php::process_assignee_status()` lines 595–647
- `js/inbox.js` `handleApprovalStepButtonClick()` and its native `confirm()` call.

### 3. Why the semantics are sufficient

Authentic Chromium evidence proved both native actions emit a browser confirmation when `Require Confirmation` is enabled. A focused native Approve button activated with keyboard `Enter` produced a `confirm` dialog. Dismissing it left the hidden host action field empty and left the authoritative workflow state unchanged. Accepting it submitted the real host form and produced authoritative host state.

### 4. What GPP may safely do

- Style/present the native Approval action controls and surrounding presentation where already admitted.
- Preserve the native confirmation configuration and prompt semantics.
- Let the host/browser own Cancel versus Accept and the subsequent native form submission.

### 5. What GPP must not own

- Do not intercept the native action to insert a parallel modal.
- Do not replace the host nonce, validation, authorization, submit, or mutation path.
- Do not treat the PR #94 static DOM dialog as proof that Gravity Flow exposes a styleable DOM confirmation seam.

### 6. Failure / fallback behavior

If the required native confirmation capability is absent or semantically changed in another supported host runtime, preserve native/fail-closed behavior. Do not fabricate a GPP confirmation fallback.

### 7. Evidence

Final exact-Head browser cases:

- `SRWF-Q1-CONFIRM-CANCEL-APPROVE` — PASS
- `SRWF-Q1-CONFIRM-SUBMIT-APPROVE` — PASS
- `SRWF-Q1-CONFIRM-CANCEL-REJECT` — PASS

Observed native prompt messages were the real Gravity Flow prompts for Approve and Reject. Focus was on the focused native Approve button before keyboard activation and returned to that button after dialog dismissal in the tested Chromium runtime.

### 8. What remains unproven

- Browser-internal confirmation focus placement is not DOM-exposed and is `NOT_PROVEN_AND_NOT_DOM_EXPOSED`.
- Physical `Escape` mapping inside the browser-owned dialog remains user-agent-owned and was not separately proven.
- A styleable host DOM modal matching PR #94 does not exist in the pinned runtime. Implementing one would require separate Owner/architecture approval because it crosses the presentation-only ownership boundary.

---

# Capability 2 — Authoritative post-action result truth

Disposition: `QUALIFIED_WITH_CAPABILITY_ADAPTER_REQUIRED`.

Technical Error sub-disposition: `NOT_PROVEN` as a distinct host outcome taxonomy.

### 1. Behavior GPP needs

After an attempted native action, GPP needs a truthful, host-derived answer for whether the entry is Approved, Rejected, returned for Correction/User Input, or still not safely classifiable. The click itself must never be result evidence.

### 2. Exact host fact / seam

The strongest observed host facts are:

- terminal Approval step status and `workflow_final_status` after native processing;
- current workflow step identity/type/status after native Revert/routing;
- native feedback rendered after successful host processing;
- unchanged host state after a canceled or unsupported action attempt.

Executed results:

- Approved: Review step status `approved`; `workflow_final_status=approved`; current workflow step is terminal/null.
- Rejected: Review step status `rejected`; `workflow_final_status=rejected`; current workflow step is terminal/null.
- Correction requested: after native Revert, current step becomes the configured `user_input` step with pending status; the workflow remains pending rather than terminal.
- Unsupported Approval status with a valid native nonce: host returns boolean `false`; current step/status and workflow final status remain pending/unchanged.

### 3. Why the semantics are sufficient

These are authoritative host facts after server processing, not client intent. They distinguish successful terminal Approval outcomes from a non-mutating attempt and distinguish native correction routing from terminal Approval outcomes.

### 4. What GPP may safely do

A bounded, stateless capability adapter may re-read the authoritative Gravity Flow state **after** native processing and map only proven host facts to presentation:

- `Approved` only when the relevant native Approval step/result is authoritatively approved.
- `Rejected` only when the relevant native Approval step/result is authoritatively rejected.
- `Correction` only when the native Revert topology has authoritatively moved the entry into the configured User Input step/path.
- `Unknown` when the authoritative result cannot be safely established.

The adapter must consume host truth; it must not store or manufacture workflow truth.

### 5. What GPP must not own

- Do not infer outcome from which button was clicked.
- Do not create a parallel result-state database/meta store.
- Do not turn client-side submission success/failure alone into workflow truth.
- Do not classify a generic exception, timeout, or transport symptom as a proven mutation failure without authoritative host reconciliation.

### 6. Failure / fallback behavior

Fail closed. If the adapter cannot prove a completed outcome from authoritative host state, preserve native output or present only the bounded `Unknown`/unconfirmed semantics allowed by the approved design. Never show a completed Approved/Rejected/Correction result from intent alone.

`Technical Error` remains `NOT_PROVEN` as a distinct host result classification in this qualification. The pinned runtime did not expose a stable, separately qualified host taxonomy that means “technical execution failed and authoritative final truth is known to be unavailable.” A later bounded qualification may admit a specific technical failure signal. Until then, the designed Technical Error panel is not independently implementation-eligible as a host-truth result.

### 7. Evidence

- `SRWF-Q1-CONFIRM-SUBMIT-APPROVE` — PASS; `review_step_status=approved`, `workflow_final_status=approved`.
- `SRWF-Q2-REJECT-TRUTH` — PASS; `review_step_status=rejected`, `workflow_final_status=rejected`.
- `SRWF-Q3-REVERT-TO-USER-INPUT` — PASS; current step changes from native Approval to native User Input while workflow remains pending.
- Runtime negative control `unsupported_approval_status_with_valid_native_nonce` — host result `false`; authoritative state unchanged; `NO_COMPLETED_RESULT_TRUTH_FROM_ATTEMPT`.
- Cancel evidence for Approve/Reject — no mutation.

### 8. What remains unproven

- A distinct production-ready Technical Error signal.
- Browser/network response-loss ambiguity after a server mutation was not separately fault-injected in this qualification.
- Target-production error infrastructure and transport behavior.

Therefore Unknown remains the required fail-closed presentation when authoritative post-action truth cannot be safely established.

---

# Capability 3 — Correction topology

Disposition: `QUALIFIED_NATIVE_CAPABILITY`.

### 1. Behavior GPP needs

The Owner-approved correction lifecycle:

`Review/Approval → native Revert → User Input → Review/Approval`

with host-owned assignment, editability, validation, persistence, and routing.

### 2. Exact host fact / seam

Pinned configuration and source/runtime evidence establish:

- Approval `revertEnable=true` exposes native Revert.
- Approval `revertValue=<User Input step id>` selects the configured User Input target.
- `Gravity_Flow_Step_Approval::process_revert_status()` ends the Approval step and starts the configured target step.
- The User Input step is assigned to the correction participant and exposes only its configured editable field(s) through the authentic frontend form.
- User Input `destination_complete=<Review Approval step id>` routes completed input back to Review.
- Base Gravity Flow step routing and step completion remain authoritative.

Relevant pinned source authorities include:

- `includes/steps/class-step-approval.php::process_revert_status()` lines 654–695
- `includes/steps/class-step-user-input.php::maybe_process_status_update()` lines 319–325
- `includes/steps/class-step-user-input.php::process_assignee_status()` lines 373–412
- `includes/steps/class-step.php::get_next_step_id()` lines 563–578
- `includes/steps/class-step.php::end()` lines 2049–2085

### 3. Why the semantics are sufficient

Authentic browser execution demonstrated the complete round trip:

1. operator on native Approval uses native Revert;
2. host moves the entry to the configured User Input step;
3. correction participant logs in and sees the configured field as an editable native User Input control;
4. participant changes and submits the field through the real Gravity Forms/Gravity Flow form;
5. the corrected value persists;
6. host completes User Input and routes the entry back to the same Review Approval step;
7. the registration operator again receives the native Review actions.

### 4. What GPP may safely do

- Present the existing native Revert action as the approved correction-oriented operator affordance only where a capability adapter has proven the configured Revert→User Input topology.
- Present orientation/context around the native User Input path.
- Re-style the already-authorized presentation surfaces without changing host workflow semantics.

### 5. What GPP must not own

- Do not create a custom “Request Correction” mutation.
- Do not change assignment, editable fields, User Input validation, save semantics, or next-step routing.
- Do not assume every Approval step with a Revert button satisfies the SRWF correction semantics; the target User Input and return destination must be capability-checked.

### 6. Failure / fallback behavior

If Revert is absent, targets a different topology, User Input cannot be proven, or the return path is different, preserve native behavior and do not admit the SRWF correction presentation as if the approved topology existed.

### 7. Evidence

- `SRWF-Q3-REVERT-TO-USER-INPUT` — PASS.
  - before: current step `approval`, pending;
  - after: current step `user_input`, pending.
- `SRWF-Q3-USER-INPUT-RETURN` — PASS.
  - native participant field visible/editable;
  - native `gravityflow_status=complete` host form state;
  - corrected field persisted;
  - after: current step returns to the Review Approval step; User Input step status `complete`;
  - `operator_review_actions_restored=true`.

### 8. What remains unproven

- Target-production workflow configuration and user identities/roles.
- Any alternative Gravity Flow version/topology until its required semantic capabilities pass the same contract.

---

# Capability 4 — Canonical return to Inbox page 1

Disposition: `QUALIFIED_BOUNDED_PRESENTATION_SEAM`.

### 1. Behavior GPP needs

From Entry Detail or an additive result presentation on the same operator surface, return to the authoritative “My Tasks” Inbox at canonical page 1, without preserving transient search/pagination/scroll state and without treating a Page ID as product identity.

### 2. Exact host fact / seam

Pinned Gravity Flow `Gravity_Flow_Entry_Detail::maybe_display_back_link()` derives its frontend back-link URL from the current Inbox surface and removes Entry Detail/action state query args (`gworkflow_token`, `new_status`, `view`, `lid`, `id`) before applying the supported `gravityflow_back_link_url_entry_detail` filter.

Pinned source authority:

- `includes/pages/class-entry-detail.php::maybe_display_back_link()` lines 346–374.

### 3. Why the semantics are sufficient

Authentic browser execution proved the generated native back link on both supported frontend composition types used by the qualification:

- shortcode Inbox Entry Detail returned to the exact shortcode Inbox base URL;
- registered authentic `gravityflow/inbox` Block Entry Detail returned to the exact Block Inbox base URL.

Neither qualified route retained detail identifiers or `paged`, and the evidence deliberately did not use the fixture Page ID as product identity.

### 4. What GPP may safely do

- Preserve/use the native back-link authority on Entry Detail.
- For an additive result presentation that replaces the visible post-action body on that same request/surface, carry a bounded route capability derived from the resolved authoritative Inbox surface rather than a hard-coded environment Page ID.
- Return to canonical page 1; no prior-grid-state preservation is required.

### 5. What GPP must not own

- Do not create a second Inbox/router/navigation state system.
- Do not hard-code a Page ID as permanent product identity.
- Do not promise restoration of previous search, pagination, scroll, sort, or Live Refresh transient state.

### 6. Failure / fallback behavior

If the authoritative Inbox route cannot be safely resolved on a host composition, preserve the native back link/output rather than fabricating an environmental URL.

### 7. Evidence

- `SRWF-Q4-SHORTCODE-BACK` — PASS.
  - native href and landed URL both equal the canonical shortcode Inbox base route.
- `SRWF-Q4-BLOCK-BACK` — PASS.
  - `gravityflow/inbox` was actually registered in the pinned runtime;
  - native href and landed URL both equal the canonical Block Inbox base route.

### 8. What remains unproven

- Other non-qualified custom embedding/router compositions.
- Target-production permalink/environment configuration.

---

## Implementation consequences

### Eligible for bounded production implementation after Owner admission

- Capability adapter/probe for **native Approval confirmation availability/configuration**, while preserving browser/host confirmation ownership.
- Bounded post-action **host-truth re-read** for proven Approved, Rejected, Correction, and fail-closed Unknown presentation; no state store.
- Presentation of the **native Revert → User Input → Review** correction topology where the complete semantic capability is present.
- Canonical **Back to My Tasks / Inbox page 1** using authoritative surface-route capability for qualified shortcode/Block compositions.

### Requires design reconciliation

The PR #94 styled confirmation dialog cannot be implemented as a presentation-only skin over Gravity Flow 3.1.0. The host capability is browser-native `confirm()`, with no DOM modal for GPP to style or add the candidate ARIA structure to. Under the existing ownership boundary, production must preserve the native browser confirmation presentation unless the Owner separately authorizes a broader confirmation-lifecycle architecture change.

### Remains blocked / `NOT_PROVEN`

- A dedicated **Technical Error** result panel driven by a separately qualified host technical-failure taxonomy/signal.
- Browser-native dialog internals such as exact initial focus and physical Escape behavior.
- Any host/runtime version or topology whose semantics have not passed the capability contract.
- Target-production equivalence.

## Interaction and regression boundary

This qualification does not alter production Inbox, Entry Detail vNext, Print, native Approval controls, native authorization, User Input, native search/sort/pagination/Live Refresh, manual Inbox re-entry, or existing fail-closed behavior.

The PR's qualification-path changes schedule the existing Repository CI, WU18 Entry Detail Runtime, WU19 A4 Print Runtime, WU21 Reproducible Evidence Lab, and the focused SRWF host qualification workflow. Final exact-Head status is recorded in the PR before Owner decision.

## Reproducible evidence set

Final admitted browser artifact from exact Head `e8abce1b4c23e8f5382dd1f1ec64522ffa382f94`, workflow run `36273642691`:

- `wu18-srwf-journey-source-probe.json`
- `wu18-srwf-journey-fixture.json`
- `wu18-srwf-journey-runtime.json`
- `wu18-srwf-journey-browser.json`
- synthetic non-PII fixture only
- browser result: `8 passed / 0 failed`

Artifact digest: `sha256:1418a421ec8eb39a9aa3fd9730ddd244d5971ab4fee81287b30ec2400f79d013`.

## Production impact

`NONE — qualification/evidence only`

No merge, release, publish, deploy, Golden activation, or production journey implementation is authorized by this document.

## Next boundary

`READY_FOR_OWNER_MERGE_DECISION`
