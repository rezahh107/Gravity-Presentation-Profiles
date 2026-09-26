# SRWF Registration Operator Journey — Host Capability Qualification V1

```yaml
document_id: GPP-SRWF-OPERATOR-JOURNEY-HOST-QUALIFICATION-V1
status: QUALIFICATION_EXECUTED__OWNER_MERGE_DECISION_OPEN
project: GPP-SRWF-REGISTRATION-IMPLEMENTATION-V1
baseline_main: 68a8a3d903955cd187b303eb632f42f1ab4c307b
qualification_branch: qualify/srwf-operator-journey-host-capabilities
qualification_pr: 97
closing_runtime_evidence_head: ff6e40507ccb35ae900ebb8320f2547d73020b0f
closing_runtime_run: 36274079599
closing_runtime_artifact: srwf-journey-host-qualification-36274079599-1
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
| Review → Revert → User Input → Review correction topology | `QUALIFIED_NATIVE_CAPABILITY` | Executed end-to-end with native Revert, native User Input assignment/editability/submission and return to the same Review Approval where the original operator becomes eligible again. |
| Canonical return to Inbox page 1 | `QUALIFIED_WITH_CAPABILITY_ADAPTER_REQUIRED` | Admin Inbox route and frontend shortcode/registered-Block page permalinks are valid host/WordPress route authorities. Default frontend detail did not emit the optional native back-link, so production must resolve the host context rather than assume a visible native link. |

## 3. Action 1 — Native Approve / Reject confirmation

### What GPP needs

A host-owned confirmation lifecycle that can be enabled without GPP intercepting or replacing Approval mutation, authorization, nonce validation or workflow transition behavior.

### Exact host capability

The exact Gravity Flow `3.1.0` Approval settings schema exposes:

- `confirmation_prompt` — **Require Confirmation**;
- native action order `approved`, `rejected`, `revert`;
- hidden mutation carrier `gravityflow_approval_new_status_step_<step-id>`;
- nonce action `gravityflow_approvals_<step-id>`;
- native button handler `handleApprovalStepButtonClick(...)`.

The shipped `js/inbox.js` calls the browser `confirm(message)` primitive. When the user cancels, it returns before populating the hidden status carrier. When the user accepts, it writes the native action value and lets the host form submit normally.

The prompt messages are host-filterable through `gravityflow_approval_confirm_prompt_messages`.

### Executed runtime/browser proof

`SRWF-HOST-CONFIRM-001` executed a real Approval page with `confirmation_prompt=1`:

- native workflow box present;
- action order exactly Approve → Reject → Revert;
- all three buttons use the native handler;
- native nonce present;
- hidden status input present and initially empty;
- no `[role="dialog"]` or `<dialog>` DOM confirmation exists;
- Chromium/Playwright observed a real browser `confirm` dialog;
- cancel left the hidden status value empty;
- cancel left `workflow_final_status=pending`, API status `pending`, and the same Approval step current;
- after cancel, Chromium returned focus to the triggering Approve button.

Exact physical keyboard behavior such as Escape is not independently asserted; it is browser/UA-owned because the host uses `window.confirm()`, not host DOM markup.

### Safe GPP scope

GPP may:

- preserve and visually style the underlying native Approval controls;
- detect whether the host confirmation capability/configuration is present if a future presentation adapter needs that fact;
- leave the browser-owned confirmation lifecycle untouched.

GPP must not:

- replace the native action handler;
- pre-submit its own workflow mutation;
- create a second nonce/authorization path;
- create a parallel confirmation state machine;
- claim it can style the internals of `window.confirm()`.

### Failure/fallback

If the confirmation capability is absent or disabled, preserve the native host behavior. Do not fabricate a fallback GPP confirmation.

### Remaining unproven

- target-production confirmation setting/configuration;
- exact target browser/OS rendering and keyboard behavior;
- any newer Gravity Flow capability that might provide a supported stylable host DOM confirmation seam.

### Design consequence

The custom-looking confirmation candidate in PR #94 is **not directly implementable as a bounded GPP presentation-only DOM treatment** against the qualified 3.1.0 capability. The lifecycle is qualified, but the presentation primitive is not stylable host DOM. Owner/design reconciliation must either accept native browser confirmation or wait for a separately qualified host capability; GPP must not take over the lifecycle to reproduce the mockup.

## 4. Action 2 — Authoritative post-action result truth

### What GPP needs

Completed result UI must be based on authoritative host state after an attempted action. A click or accepted confirmation is never sufficient evidence.

### Strongest qualified host facts

Fresh post-action host read-back can use:

- `Gravity_Flow_API::get_current_step()`;
- `Gravity_Flow_API::get_status()`;
- Gravity Flow-owned `workflow_final_status` entry meta;
- native rendered status/notice/timeline as corroborating host output;
- current-step type/ID, native assignee and `Gravity_Flow_Entry_Detail::can_update()` for correction/User Input truth.

This is capability-based: a future adapter must prove equivalent current/final-state semantics rather than gate only on version `3.1.0`.

### Approved — qualified

`SRWF-HOST-RESULT-APPROVE-001` accepted the real native confirmation and executed Approval. Fresh host read-back showed:

- `workflow_final_status=approved`;
- `Gravity_Flow_API::get_status()=approved`;
- no current workflow step;
- native timeline: Review Approved;
- native rendered output included `Entry Approved` and `Status: Approved`.

A completed Approved presentation is eligible only after equivalent fresh host truth is established.

### Rejected — qualified

`SRWF-HOST-RESULT-REJECT-001` showed:

- `workflow_final_status=rejected`;
- API status `rejected`;
- no current step;
- native Rejected timeline/output.

This is a valid workflow result, distinct from technical failure.

### Correction / returned for input — qualified

After native Revert, `SRWF-HOST-CORRECTION-001` showed:

- workflow final status remained `pending`;
- current step became the configured `user_input` step;
- registration operator was no longer allowed to update it;
- configured User Input participant was allowed to update it;
- editable-field set was the host-owned field set;
- timeline recorded `Reverted to step - User Input`.

Therefore correction truth is the **fresh host topology/assignment state**, not the Revert click.

### Technical Error — bounded negative finding

A generic dedicated Technical Error result seam is **not proven**.

Two executed controls matter:

1. `SRWF-HOST-RESULT-NEGATIVE-VALIDATOR-001` demonstrated that `Gravity_Flow_Step_Approval::validate_status_update()` alone is not a safe error classifier/whitelist in this runtime; an arbitrary synthetic status did not return `WP_Error` and did not mutate workflow state.
2. `SRWF-HOST-RESULT-FAILURE-NONCE-001` deliberately invalidated the real Approval nonce. Gravity Flow/WordPress rendered the native failure surface `The link you followed has expired.` and fresh host read-back remained on the same pending Review step with no completed outcome.

This proves that explicit host-owned failure evidence can exist, but it does **not** yet qualify a general production seam that lets GPP translate every failed Approval attempt into the PR #94 Technical Error card without taking over host error handling.

Safe rule: preserve native failure output unless a separately qualified bounded failure signal is positively observed. Do not infer Technical Error merely from a click, a missing redirect, or `validate_status_update()`.

### Unknown — fail-closed rule

`SRWF-HOST-RESULT-AMBIGUOUS-001` accepted the native confirmation but aborted the outgoing Approval POST before the server response. The client action was therefore ambiguous. Before authoritative re-read, the only safe UI classification is Unknown/no completed result. A later direct host read-back showed the workflow still pending on Review.

Unknown is **not** a new persisted GPP workflow state. It is a fail-closed presentation condition: if authoritative post-action truth cannot yet be established, do not show Approved/Rejected/Correction/Technical Error as completed truth.

### Required capability adapter

A bounded production adapter may be designed later to map only fresh host facts:

```text
final status approved + no current step        -> Approved
final status rejected + no current step        -> Rejected
current host step is configured User Input     -> Correction / returned for input
explicit separately-qualified host failure     -> Technical Error (only within proven boundary)
anything ambiguous / unreadable / conflicting  -> Unknown or preserve native output
```

The adapter must be read-through/stateless. It must not create a parallel result store or treat click events as state.

## 5. Action 3 — Correction topology

### What GPP needs

The approved operational topology is:

```text
Review Approval
  -> native Revert
User Input
  -> native completion
Review Approval
```

Gravity Flow must remain authoritative for action availability, assignment, editability, validation and transition.

### Exact qualified host facts

The pinned Approval settings schema exposes `revert` as `checkbox_and_select`, labelled **Revert to User Input step**. The Approval implementation reads `revertEnable` / `revertValue`, resolves the configured User Input step, completes the current Approval and records a host timeline note. The exact source also exposes `gravityflow_approval_revert_step_id` for the host-owned target decision.

Generic Gravity Flow step sequencing resolves the next step through `get_next_step_id()` and the current workflow topology.

### Executed topology

The synthetic workflow used real Gravity Flow steps and real host assignment:

- User Input step assigned to synthetic participant, with one editable field;
- Review Approval assigned to synthetic operator;
- Review configured with native confirmation and native Revert target to User Input.

The User Input step is ordered immediately before Review in the synthetic workflow so its native default-next path returns to Review. Because that ordering makes User Input the first physical step, the public host API `Gravity_Flow_API::send_to_step()` was used **only to seed test entries at Review before the scenario began**. It is not a GPP transition implementation and is not part of the qualified production journey.

From Review onward, the exercised lifecycle was entirely host-native.

`SRWF-HOST-CORRECTION-001` proved Review → Revert → User Input and the assignment handoff.

`SRWF-HOST-CORRECTION-002` then logged in as the real User Input participant, edited the allowed Gravity Forms field, submitted through the real native User Input form, and proved:

- field value persisted through Gravity Forms;
- current step returned to the same Review Approval;
- participant no longer had Review update permission;
- original registration operator regained `can_update=true` on Review;
- workflow remained host-pending for the next review decision;
- native timeline recorded User Input completion.

### Safe GPP scope

GPP may:

- present/orient the operator around the host-owned Review and User Input states;
- render the PR #94 Correction result only after fresh host state proves User Input/correction topology;
- style admitted native surfaces without changing permissions or transition behavior.

GPP must not:

- implement a custom Request Correction endpoint;
- store a separate correction state;
- reassign users;
- choose editable fields;
- emulate User Input validation/submission;
- force the return transition.

### Remaining unproven/configuration-specific

The executed cycle proves the required host semantics, not the exact Owner production workflow configuration. Production choices still include concrete User Input assignee(s), editable fields, notifications, note policy, Save Progress behavior and success/rejection destinations. Those must be configured in Gravity Flow and read back as host truth.

## 6. Action 4 — Canonical return to Inbox page 1

### What GPP needs

A supported route from Entry Detail/result to the canonical Inbox root, without persisting prior search/pagination/scroll state and without hard-coding an environment Page ID as product identity.

### Admin route — qualified native authority

The qualification derived the admin Inbox route through WordPress `admin_url('admin.php?page=gravityflow-inbox')` and executed it successfully from a real admin Entry Detail context. The returned page rendered the native Inbox grid.

The admin Entry Detail correctly emitted no frontend `.back-link` because the exact host source suppresses that link in `is_admin()`.

### Frontend shortcode route — qualified with adapter

The real `[gravityflow page="inbox"]` page served Entry Detail at the same WordPress page permalink with `view/id/lid` query state. Under default fixture configuration, no native back-link was emitted because Gravity Flow's Entry Detail back-link is opt-in through host `back_link` args.

The qualification navigated to the WordPress permalink itself with the detail query removed and proved:

- canonical root URL resolved;
- native `[data-js="gflow-inbox"]` rendered;
- native `[data-js="gflow-inbox-search"]` rendered;
- Entry Detail and pagination query state was absent.

### Registered Inbox Block route — qualified with adapter

The pinned runtime registered `gravityflow/inbox`. A real Block page served Entry Detail on the same page, and its WordPress page permalink without detail query rendered the native Inbox grid/search as canonical page 1. Default fixture configuration again emitted no native back-link.

### Host source

`Gravity_Flow_Entry_Detail::maybe_display_back_link()` confirms:

- back-link output is controlled by host `back_link` configuration;
- admin suppresses the link;
- absent a custom host `back_link_url`, Gravity Flow derives the URL by removing detail query args;
- `gravityflow_back_link_url_entry_detail` can filter a host-emitted link.

### Required adapter boundary

A later bounded navigation adapter may resolve route authority from the actual host context:

- admin: WordPress/Gravity Flow admin Inbox URL;
- frontend shortcode/Block: the current canonical WordPress Inbox page permalink/current page route with Entry Detail query removed;
- host-emitted back-link URL may be reused when present and qualified.

The adapter must not hard-code a Page ID as product identity or maintain a second navigation state system.

## 7. Negative controls and fail-closed behavior

The qualification intentionally falsified several attractive but unsafe assumptions:

- a same-named Approval validator is not enough to classify Technical Error;
- accepting a browser confirmation is not completed-result evidence;
- a frontend Entry Detail does not automatically expose a native back-link;
- transport ambiguity is not success/rejection truth;
- host feed/settings must be read back after configuration rather than assumed from requested fixture input.

Where host truth is missing, changed or ambiguous, production must preserve native behavior or remain Unknown. No fallback workflow/result engine is authorized.

## 8. Interaction/non-regression boundary

The qualification branch changes only tests/workflow/evidence documentation. The real GPP plugin is activated in the pinned runtime, but no production GPP code is changed.

The qualification does not alter:

- approved Inbox layout/search/sort/pagination/Live Refresh/manual refresh;
- Entry Detail vNext presentation;
- Print;
- native Approval controls;
- native authorization/nonces;
- User Input;
- native workflow assignment/transitions;
- existing fail-closed behavior.

Repository CI and WU21 remain the broad regression gates that are path-triggered by the qualification test changes. WU18 Entry Detail Runtime, WU19 A4 Print Runtime and SRWF Registration Authentic Runtime are separate existing workflows whose path filters do not include the new `srwf-journey-host-*` qualification files; if they do not schedule on the final Head, that is a path-filter outcome, not evidence that those workflows ran.

## 9. Implementation consequences

### Eligible for bounded production implementation planning

- a capability-based, stateless host-result read adapter for Approved/Rejected/Correction using fresh Gravity Flow state;
- correction presentation/orientation around native Revert/User Input/Review;
- a context-aware canonical Inbox route adapter using WordPress/Gravity Flow route authority;
- existing native Approval controls/presentation styling that does not intercept behavior.

### Requires design reconciliation before implementation

- PR #94's custom-styled confirmation modal. The qualified host emits browser `window.confirm()` rather than stylable host DOM. Reproducing the mockup by a GPP-owned modal would cross the ownership boundary.

### Remains blocked / `NOT_PROVEN`

- a general dedicated Technical Error result-card seam for arbitrary Approval failures;
- any claim that Unknown is a persisted host workflow state;
- exact target-production workflow configuration/equivalence;
- exact cross-browser keyboard behavior of the native browser confirmation beyond the qualified `window.confirm()` primitive.

## 10. Evidence inventory

Closing executed qualification on Head `ff6e40507ccb35ae900ebb8320f2547d73020b0f`:

- SRWF Journey Host Qualification — run `36274079599` — **PASS**;
- evidence artifact `srwf-journey-host-qualification-36274079599-1` — digest `sha256:a9e3e321cad918df91af6601ede0184f1e9dec458a51ad90a777cb50b1f11947`;
- Repository CI — run `36274079633` — **PASS** on the same Head;
- WU21 Reproducible Evidence Lab — run `36274079604` was scheduled on the same Head; its final conclusion must be checked separately in the PR verification record.

The qualification artifact contains:

- exact source/settings probe;
- synthetic workflow manifest;
- browser/runtime results for confirmation cancel/confirm;
- Approved/Rejected completed truth;
- Revert/User Input/Review lifecycle;
- validator negative control;
- invalid-nonce failure control;
- aborted-transport ambiguity control;
- shortcode/Block/admin canonical Inbox route checks.

## 11. Production boundary

`PRODUCTION IMPACT: NONE — qualification-only`

Do not merge this qualification PR as production journey implementation. Do not begin production confirmation/result/correction/navigation implementation solely from this record without separate Owner direction.

## 12. Next boundary

`READY_FOR_OWNER_MERGE_DECISION`
