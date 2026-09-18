# Entry Detail Runtime Source / Scope Matrix — Gravity Flow 3.1.0

Status: qualification evidence for PR #37. This document records host ownership and scope; it does not change visual or semantic authority.

Pinned host under inspection:

- Gravity Forms: `3.1.1.1`
- Gravity Flow: `3.1.0`
- Entry Detail post-permission seam: `gravityflow_entry_detail_content_before`
- Exact host source is inventoried by `tests/repro-evidence-lab/inspect-wu18-host-seams.php` in WU18.

The essential separation is:

1. **binding** — what stable host source a semantic names;
2. **source capability** — whether the pinned host exposes the admitted API/region/control seam;
3. **request presence** — whether this entry/step/request actually emits a value/region/control;
4. **request authorization** — whether Gravity Flow allows this user to see/use it.

A stable capability is never evidence that a request-local value, region, or action exists.

| Semantic | Authoritative host source | Source type | Scope | Stable capability evidence | Request presence | Request authorization | Current package requiredness | Qualification status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `workflow.current_step` | `Gravity_Flow_API::get_current_step($entry)` | stable API/state | environment/version capability; value is entry/step | yes | every request resolves its current entry value | Entry Detail host gate | required | PROVEN |
| `workflow.status` | `Gravity_Flow_API::get_status($entry)` | stable API/state | environment/version capability; value is entry | yes | every request resolves its current entry value | Entry Detail host gate | required | PROVEN |
| `workflow.instructions` | native Entry Detail instruction rendering in `includes/pages/class-entry-detail.php` | native rendered region | environment/version capability; content is step/entry/request | yes | conditional on current step instructions being enabled/present | Entry Detail host gate | required | PROVEN capability; request presence remains request-local and absence is never fabricated |
| `workflow.approve_action` | native Approval status-box action control; label filter `gravityflow_approve_label_workflow_detail` | native action/control | environment/version capability; presence is step/user/request | yes | required for enhanced GPP admission | native Approval current-assignee/update predicate | required | PROVEN for Owner-selected enhanced Approval-processing case; never persisted as user permission |
| `workflow.reject_action` | native Approval status-box action control; label filter `gravityflow_reject_label_workflow_detail` | native action/control | environment/version capability; presence is step/config/user/request | yes | required for enhanced GPP admission | native Approval current-assignee/update predicate | required | PROVEN for Owner-selected enhanced Approval-processing case; never persisted as user permission |
| `workflow.timeline` | native Gravity Flow timeline / `Gravity_Flow_API::get_timeline` | native rendered region + stable API | environment/version capability; content is entry/request | yes | request/entry-specific and legitimately conditional | Entry Detail host gate | required | PROVEN capability; request content remains request-local and absence is never fabricated |
| `navigation.backlink` | native Entry Detail back-link context / `gravityflow_back_link_url_entry_detail` | request navigation context | environment/version capability; URL/context is request/embed-specific | yes when exact pinned source confirms the seam | request-specific | Entry Detail host gate | required | PROVEN host capability only; no URL is persisted or guessed |
| `documents.report_card` | bound Gravity Forms File Upload field, `GFAPI::get_field`, field `to_array()` and `get_download_url()` | bound field source | binding is form/environment; value/access is entry/request | existing GF field capability | request entry may contain zero/one/multiple files | Gravity Forms download path | required | PROVEN for one authoritative file; zero/multiple fail closed |
| `print.utility` | existing GPP Print vertical slice entered from the post-permission Entry Detail hook; Print request re-authorized by Gravity Flow | existing GPP capability | installation/form capability; invocation is request-specific | existing Print model/context/assets qualification | only meaningful where Print capability is ready | Entry Detail gate + independent Print request authorization | required | evaluated through existing Print runtime; no host `source_ref` is fabricated |
| `student.full_name` | presentation composition of `student.first_name` + `student.last_name` | derived presentation value | component bindings are installation/form; value is entry | canonical component bindings | current entry component values | Entry Detail host gate | required | no direct full-name source admitted; either missing component fails closed |
| mapped student / education / school / review / finance facts | active `EnvironmentBindingSet` Gravity Forms field sources | stable bound field source | binding is installation/form (or explicit entry); value is entry | binding/evidence lifecycle | current entry value | Entry Detail host gate; field/file APIs retain host ownership | package-defined | reused; unresolved required sources fail closed |

## Owner-resolved action policy

The Operations Package continues to mark both `workflow.approve_action` and `workflow.reject_action` required for `gravity_flow.entry_detail`.

Owner policy resolves the former requiredness conflict by narrowing **enhanced GPP Entry Detail admission**, not by weakening the package contract:

- the current native step must exist and be type `approval`;
- the current user must satisfy Gravity Flow 3.1.0's own current-assignee/update predicate (`Gravity_Flow_Entry_Detail::can_update($current_step)`);
- the original native Approve and Reject controls remain Gravity Flow-owned and must both be present for client recomposition;
- a creator/full-access/otherwise authorized viewer who is not the current Approval assignee remains on native Gravity Flow Entry Detail;
- a non-Approval current step remains on native Gravity Flow Entry Detail;
- persisted `action_permission=PROVEN` evidence has no admission power.

No parallel permission model, synthetic actions, cached current-user authorization, or optional-action bypass is introduced.

## Stable-source qualification

Entry Detail adoption qualifies only the stable host mappings required to make the Operations contract reachable without guessing fields:

- `entry.created_at` → Gravity Forms `date_created` entry meta;
- `workflow.current_step` → `Gravity_Flow_API::get_current_step()`;
- `workflow.status` → `Gravity_Flow_API::get_status()`.

These source mappings are published through the existing immutable `EnvironmentBindingSet` lifecycle. Request-local regions, action presence, assignee eligibility, and user authorization are deliberately excluded from persisted environment truth.

## Current-production qualification boundary

WU18 current-production proof loads:

`profiles/srwf/operations/operations-package-v1.json`

and requires profile:

`srwf.operations.entry-detail.v1`

Synthetic data is limited to host forms, entries, workflow steps and environment bindings. The legacy `tests/fixtures/wu09-visual-package.json` is not an authority for current Operations Entry Detail readiness and cannot make current qualification pass.

## vNext visual boundary

The later Entry Detail vNext C/D visual-fidelity pass remains out of scope. Existing historical visual fixtures may still be used by explicitly legacy regression/Print qualification where named as such, but they are not evidence of current Entry Detail semantic/readiness authority.

`ENTRY_DETAIL_vNEXT_VISUAL_ACCEPTANCE = NOT_PROVEN`
