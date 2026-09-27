# SRWF Registration Operator Journey — Host Capability Qualification V1

```yaml
document_id: GPP-SRWF-OPERATOR-JOURNEY-HOST-QUALIFICATION-V1
status: QUALIFICATION_EXECUTED__OWNER_MERGE_DECISION_OPEN
project: GPP-SRWF-REGISTRATION-IMPLEMENTATION-V1
baseline_main: 68a8a3d903955cd187b303eb632f42f1ab4c307b
qualification_branch: qualify/srwf-operator-journey-host-capabilities
qualification_pr: 97
same_operator_runtime_evidence_head: 97d9004daf241ce4058b79dca65c6986e2202e03
same_operator_runtime_run: 36300467070
same_operator_runtime_artifact: srwf-journey-host-qualification-36300467070-1
same_operator_runtime_artifact_digest: sha256:0dc42b869f5272b7bd4a1a9dcf0228e78e5fc5c8b26336ccc3ea2a6490b56670
evidence_class: PROVEN_IN_REPRODUCIBLE_SIMULATION
production_equivalence: NOT_PROVEN
production_impact: NONE__QUALIFICATION_ONLY
```

## 1. Scope and ceiling

This record qualifies the host/runtime capabilities required by the Owner-approved SRWF registration-operator journey after PR #94. It does **not** implement the journey.

The executed runtime pins:

- WordPress `7.1.1`;
- PHP `8.3.35`;
- Gravity Forms `3.1.1.1`;
- Gravity Flow `3.1.0`;
- MariaDB `11.4.8`;
- Node `22.19.0`;
- Playwright `1.55.0` / Chromium;
- synthetic non-PII forms, entries and users only.

Gravity Flow `3.1.0` is evidence for the behavioral capabilities below, not a permanent compatibility identity. A future implementation must detect/consume equivalent semantics and fail closed when those semantics are absent or ambiguous. Exact target-production plugin versions, workflow configuration, user/step/page IDs, browser details, theme/cache/CDN/server behavior and production-equivalence remain `NOT_PROVEN`.

No production PHP/CSS/JS, workflow behavior, authorization path, result-state engine, navigation router or state store is introduced by this qualification PR.

## 2. Disposition summary

| Journey area | Disposition | Qualification result |
| --- | --- | --- |
| Native Approve / Reject confirmation lifecycle | `QUALIFIED_NATIVE_CAPABILITY` | Gravity Flow can require confirmation and owns cancel/confirm/submission. In the pinned runtime the UI primitive is native browser `window.confirm()`, not a stylable DOM dialog. |
| PR #94 custom/stylable confirmation-dialog presentation | `HOST_CAPABILITY_NOT_AVAILABLE` | No host-owned DOM modal was emitted. GPP cannot reproduce the PR #94 modal geometry/ARIA contract merely by styling the native confirmation primitive without taking over confirmation behavior. |
| Authoritative post-action result truth | `QUALIFIED_WITH_CAPABILITY_ADAPTER_REQUIRED` | Approved, Rejected and correction/User-Input truth are strongly observable from fresh host state. Dedicated general Technical Error presentation is not proven; ambiguous attempts must fail closed to Unknown/native output until host truth is re-read. |
| Review → Revert → User Input → Review correction topology | `QUALIFIED_NATIVE_CAPABILITY` | Executed end-to-end with the **same synthetic registration operator** assigned to Review and User Input, native Revert, native User Input edit/submission, and return to Review with that same operator eligible. A second user remained an unauthorized negative control. |
| Canonical return to Inbox page 1 | `QUALIFIED_WITH_CAPABILITY_ADAPTER_REQUIRED` | Admin Inbox route and frontend shortcode/registered-Block page permalinks are valid host/WordPress route authorities. Default frontend detail did not emit the optional native back-link, so production must resolve the host context rather than assume a visible native link. |

## 3. Action 1 — Native Approve / Reject confirmation

### Exact host capability

The exact Gravity Flow `3.1.0` Approval settings/runtime exposes:

- `confirmation_prompt` — **Require Confirmation**;
- native action order `approved`, `rejected`, `revert`;
- hidden mutation carrier `gravityflow_approval_new_status_step_<step-id>`;
- nonce action `gravityflow_approvals_<step-id>`;
- native button handler `handleApprovalStepButtonClick(...)`;
- browser `confirm(message)` from shipped `js/inbox.js`.

### Executed proof

`SRWF-HOST-CONFIRM-001` exercised the real Approval page and proved the native nonce/status carrier, native button order/handler, real browser confirmation, cancel-without-mutation behavior, and no host DOM dialog. Chromium returned focus to the triggering Approve button after cancel.

Exact physical keyboard behavior such as Escape remains browser/UA-owned and is not independently proven by DOM evidence.

### Safe GPP scope

GPP may style/preserve the underlying native controls and consume the host capability as presentation context. It must not replace the native action handler, create a second nonce/authorization path, create a parallel confirmation state machine, or claim control over the internals of `window.confirm()`.

The PR #94 custom-looking confirmation candidate therefore remains **not directly implementable as bounded presentation-only DOM styling** against this qualified host shape.

## 4. Action 2 — Authoritative post-action result truth

Completed result UI must be based on fresh authoritative host state after an attempted action. A click or accepted confirmation is never sufficient evidence.

Strong qualified facts include:

- `Gravity_Flow_API::get_current_step()`;
- `Gravity_Flow_API::get_status()`;
- Gravity Flow-owned `workflow_final_status` entry meta;
- native rendered status/notice/timeline as corroboration;
- current-step type/ID, effective feed assignment and `Gravity_Flow_Entry_Detail::can_update()` for correction/User Input truth.

### Approved — qualified

`SRWF-HOST-RESULT-APPROVE-001` accepted the real native confirmation and proved `workflow_final_status=approved`, API status `approved`, no current step, and native Approved render truth.

### Rejected — qualified

`SRWF-HOST-RESULT-REJECT-001` proved `workflow_final_status=rejected`, API status `rejected`, no current step, and native Rejected output.

### Correction / returned for input — qualified for SAME operator

After native Revert, `SRWF-HOST-CORRECTION-001` proved:

- workflow final status remained `pending`;
- current step became the configured User Input step `7`;
- the same synthetic registration operator (`user_id|1`) had `can_update=true`;
- the negative-control user (`user_id|2`) had `can_update=false`;
- the operator-visible host-owned editable-field set contained field `1`;
- the timeline recorded the native Revert to User Input.

Correction truth is therefore the **fresh host topology/assignment state**, not the Revert click.

### Technical Error — bounded negative finding

A generic dedicated Technical Error result seam remains **`NOT_PROVEN`**.

- `SRWF-HOST-RESULT-NEGATIVE-VALIDATOR-001` still proves the Approval validator alone is not a safe Technical Error classifier.
- `SRWF-HOST-RESULT-FAILURE-NONCE-001` still proves a real invalid native Approval nonce fails closed, leaves workflow pending, and exposes native failure output.

Safe rule: preserve native failure output unless a separately qualified bounded failure signal is positively observed.

### Unknown — fail closed

`SRWF-HOST-RESULT-AMBIGUOUS-001` still proves that an accepted confirmation followed by aborted POST transport cannot justify a completed result before authoritative read-back. Unknown remains a presentation condition, not a persisted GPP workflow state.

## 5. Action 3 — SAME-OPERATOR correction topology

### Governing target

```text
Review Approval by registration operator
  -> native Revert
User Input correction by the SAME registration operator
  -> native completion
Review Approval by the SAME registration operator
```

Gravity Flow remains authoritative for action availability, assignment, editability, validation and transitions.

### Host-effective fixture configuration

The repaired synthetic fixture creates real Gravity Flow steps and then reads their effective feed metadata back from the host before publishing evidence.

Executed host-effective identities on run `36300467070`:

```text
synthetic registration operator ID: 1
negative-control user ID:           2
Review Approval assignee:           user_id|1
User Input correction assignee:     user_id|1
negative control in correction feed: false
Review step ID:                     8
User Input step ID:                 7
editable field:                     1
```

The fixture fails closed unless both Review and User Input are assigned **exclusively** to the same operator and the negative-control user is absent from the correction feed. This mechanically falsifies the original defect: changing User Input back to the second participant makes the host-effective assignment invariant fail before qualification evidence can be published.

### Executed native lifecycle

`SRWF-HOST-CORRECTION-CONFIG-001` proved the read-back assignment invariant before browser mutation.

`SRWF-HOST-CORRECTION-001` then executed native Review → Revert and proved:

- current step `7`, type `user_input`;
- same operator `can_update=true`;
- negative control `can_update=false`;
- editable field `1` present for the operator.

`SRWF-HOST-CORRECTION-002` authenticated the browser as that same operator, edited the real native User Input field, submitted through the native Gravity Forms/User Input path, and proved:

- persisted corrected value = `SYNTHETIC-CORRECTED-VALUE`;
- current step returned to Review `8`, type `approval`;
- same operator `can_update=true` on returned Review;
- negative control `can_update=false`;
- native timeline records `Entry updated and marked complete.` under the same operator.

The User Input step remains physically before Review so its native default-next path returns to Review. `Gravity_Flow_API::send_to_step()` is used only to seed synthetic entries at Review before the scenario begins; it is not a GPP production transition implementation.

### Safe GPP scope

GPP may orient/present the operator around host-owned Review and User Input states and style admitted native surfaces. It must not implement a correction endpoint, parallel state store, reassignment, editable-field ownership, User Input validation/submission, or forced return transition.

### Remaining unproven/configuration-specific

This proves the required host semantics in reproducible simulation, not exact target-production workflow configuration. Concrete production Step IDs, user IDs, editable fields, notifications, note policy, Save Progress behavior and destination configuration remain environment facts.

## 6. Action 4 — Canonical return to Inbox page 1

The unrelated route conclusion is preserved.

- Admin authority remains `admin_url('admin.php?page=gravityflow-inbox')` and renders native Inbox.
- Frontend shortcode and registered Inbox Block remain qualified through their canonical WordPress page permalinks with detail/paging query state removed.
- Default fixture Entry Detail still emits no native frontend back-link because that host feature is opt-in/configurable.
- A future bounded route adapter may consume supported WordPress/Gravity Flow route authority, but must not hard-code a Page ID as product identity or create parallel history/router state.

`SRWF-HOST-NAV-001`, `SRWF-HOST-NAV-002`, and `SRWF-HOST-NAV-003` all remained PASS in the repaired run.

## 7. Negative controls and fail-closed behavior

The repaired qualification now falsifies all of these unsafe assumptions:

- Review and User Input may be assigned to different actors while still claiming the Owner-approved SAME-OPERATOR journey — **false; qualification fails closed**;
- the negative-control user may gain correction edit authority — **false; browser/runtime assertion fails**;
- a same-named Approval validator is enough to classify Technical Error — false;
- accepting a browser confirmation is completed-result evidence — false;
- a frontend Entry Detail automatically exposes a native back-link — false;
- transport ambiguity is success/rejection truth — false;
- requested fixture settings can be trusted without host-effective read-back — false.

Where host truth is missing, changed or ambiguous, preserve native behavior or remain Unknown. No fallback workflow/result engine is authorized.

## 8. Interaction/non-regression boundary

The repair changes only qualification runtime/browser evidence and this evidence documentation. The real GPP plugin is activated in the pinned runtime, but no production GPP PHP/CSS/JS behavior is changed.

Unrelated qualification conclusions were re-exercised and preserved on the same repaired browser run:

- native browser `window.confirm()` ownership;
- Approved host truth;
- Rejected host truth;
- Technical Error `NOT_PROVEN` ceiling plus nonce/validator controls;
- Unknown fail-closed transport ambiguity;
- shortcode/Block/admin canonical Inbox route qualification.

The repair does not alter approved Inbox layout/search/sort/pagination/Live Refresh/manual refresh, Entry Detail vNext presentation, Print, native Approval controls, native authorization/nonces, User Input semantics, or host workflow assignment/transition behavior in production.

## 9. Implementation consequences

### Eligible for later bounded implementation planning

- capability-based, stateless host-result read adapter for Approved/Rejected/Correction using fresh Gravity Flow state;
- same-operator correction presentation/orientation around native Revert/User Input/Review;
- context-aware canonical Inbox route adapter using WordPress/Gravity Flow route authority;
- styling of existing native Approval controls without intercepting behavior.

### Requires design reconciliation

PR #94's custom-styled confirmation modal still conflicts with the qualified host primitive: Gravity Flow emits browser `window.confirm()` rather than stylable host DOM.

### Remains blocked / `NOT_PROVEN`

- general dedicated Technical Error result-card seam for arbitrary Approval failures;
- any claim that Unknown is a persisted host workflow state;
- exact target-production workflow configuration/equivalence;
- exact cross-browser keyboard behavior of native browser confirmation beyond the qualified primitive.

## 10. Evidence inventory

SAME-OPERATOR repair evidence on Head `97d9004daf241ce4058b79dca65c6986e2202e03`:

- SRWF Journey Host Qualification — run `36300467070` — **PASS**;
- artifact `srwf-journey-host-qualification-36300467070-1`;
- artifact ID `10925435609`;
- artifact digest `sha256:0dc42b869f5272b7bd4a1a9dcf0228e78e5fc5c8b26336ccc3ea2a6490b56670`;
- Repository CI — run `36300467074` — **PASS** on the same Head;
- WU21 Reproducible Evidence Lab — run `36300467068` scheduled on the same Head; final conclusion is recorded in the PR verification once complete.

The qualification artifact contains:

- exact source/settings probe;
- synthetic workflow manifest with host-effective SAME-OPERATOR feed metadata;
- 12 browser/runtime assertions, including the new configuration invariant;
- authentic native Review → Revert → User Input → Review execution by the same operator;
- persisted correction value evidence;
- negative-control authorization evidence;
- confirmation cancel/confirm evidence;
- Approved/Rejected truth;
- validator, invalid-nonce and aborted-transport controls;
- shortcode/Block/admin canonical Inbox route checks.

Because this documentation commit changes the PR Head, final exact-Head workflow IDs/conclusions belong in the PR verification record rather than being recursively embedded here.

## 11. Production boundary

`PRODUCTION IMPACT: NONE — qualification-only`

`production_equivalence = NOT_PROVEN`.

Do not merge this qualification PR as production journey implementation. Do not begin production confirmation/result/correction/navigation implementation solely from this record without separate Owner direction.

## 12. Next boundary

`READY_FOR_OWNER_MERGE_DECISION_AFTER_EXACT_HEAD_VERIFICATION`
