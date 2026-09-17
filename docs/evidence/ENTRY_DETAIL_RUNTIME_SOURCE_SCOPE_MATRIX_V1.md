# Entry Detail Runtime Source / Scope Matrix — Gravity Flow 3.1.0

Status: qualification evidence for PR #37. This document records host ownership and scope; it does not change visual or semantic authority.

Pinned host under inspection:

- Gravity Forms: `3.1.1.1`
- Gravity Flow: `3.1.0`
- Entry Detail post-permission seam: `gravityflow_entry_detail_content_before`
- Exact host source is inventoried by `tests/repro-evidence-lab/inspect-wu18-host-seams.php` in WU18.

The essential separation is:

1. **binding** — what host source a semantic names;
2. **source capability** — whether the pinned host exposes the admitted API/region/control seam;
3. **request presence** — whether this entry/step/request actually emits a value/region/control;
4. **request authorization** — whether Gravity Flow allows this user to see/use it.

A stable capability is never evidence that a request-local value or action exists.

| Semantic | Authoritative host source | Source type | Scope | Stable capability evidence | Request presence | Request authorization | Current package requiredness | Qualification status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `workflow.current_step` | `Gravity_Flow_API::get_current_step($entry)` | stable API/state | environment/version capability; value is entry/step | yes | every request must resolve its current entry value | Entry Detail host gate | required | PROVEN |
| `workflow.status` | `Gravity_Flow_API::get_status($entry)` | stable API/state | environment/version capability; value is entry | yes | every request must resolve its current entry value | Entry Detail host gate | required | PROVEN |
| `workflow.instructions` | native Entry Detail instruction rendering in `includes/pages/class-entry-detail.php` | native rendered region | environment/version capability; content is step/entry/request | yes | conditional on current step instructions being enabled/present | Entry Detail host gate | required | PROVEN capability; request presence remains request-local |
| `workflow.approve_action` | native Approval status-box action control; label filter `gravityflow_approve_label_workflow_detail` | native action/control | environment/version capability; presence is step/user/request | yes | conditional | current assignee / host action rules | required | CONTRACT_CONFLICT |
| `workflow.reject_action` | native Approval status-box action control; label filter `gravityflow_reject_label_workflow_detail` | native action/control | environment/version capability; presence is step/config/user/request | yes | conditional | current assignee / host action rules | required | CONTRACT_CONFLICT |
| `workflow.timeline` | native Gravity Flow timeline / `Gravity_Flow_API::get_timeline` | native rendered region + stable API | environment/version capability; content is entry/request | yes | request/entry-specific | Entry Detail host gate | required | PROVEN capability; request content remains request-local |
| `navigation.backlink` | native Entry Detail back-link context / `gravityflow_back_link_url_entry_detail` | request navigation context | environment/version capability; URL/context is request/embed-specific | yes when exact pinned source confirms the seam | request-specific | Entry Detail host gate | required | PROVEN host capability only; no URL is persisted or guessed |
| `documents.report_card` | bound Gravity Forms File Upload field, `GFAPI::get_field`, field `to_array()` and `get_download_url()` | existing GPP capability / field source | binding is form/environment; value/access is entry/request | existing GF field capability | request entry may contain zero/one/multiple files | Gravity Forms download path | required | PROVEN for one authoritative file; zero/multiple fail closed |
| `print.utility` | existing GPP Print vertical slice entered from the post-permission Entry Detail hook; Print request re-authorized by Gravity Flow | existing GPP capability | installation/form capability; invocation is request-specific | existing Print qualification | only meaningful where Print profile/binding path is available | Entry Detail gate + independent Print request authorization | required | existing capability; Entry Detail does not manufacture Print authorization |
| mapped student / education / school / review / finance facts | active `EnvironmentBindingSet` Gravity Forms field sources | stable bound field source | binding is installation/form (or explicit entry); value is entry | binding/evidence lifecycle | current entry value | Entry Detail host gate; field/file APIs retain host ownership | package-defined | reused; unresolved required sources fail closed |

## Requiredness conflict

The current Operations Package marks both `workflow.approve_action` and `workflow.reject_action` as required for `gravity_flow.entry_detail`.

Gravity Flow 3.1.0 legitimately renders workflow-detail action controls conditionally: action availability depends on the current step, its configuration, the current assignee/user, and the current request. Therefore a stable Approval seam cannot establish that both actions exist for every authorized Entry Detail request.

Status:

`ENTRY_ACTION_REQUIREDNESS_CONTRACT_CONFLICT`

This PR does **not** make either action optional, persist global action availability, reconstruct Gravity Flow permission logic, or create replacement actions. The shipped production Entry Detail path must remain fail-closed until product authority resolves the requiredness rule.

## vNext visual boundary

`tests/fixtures/wu09-visual-package.json` is a legacy WU18 qualification fixture whose Entry Detail requiredness differs from the current Operations Package and predates the vNext C/D visual authority.

`ENTRY_DETAIL_VISUAL_FIXTURE = STALE_FOR_vNEXT`

It is retained only as an existing regression fixture in this runtime batch and is not updated or represented as current vNext visual authority.
