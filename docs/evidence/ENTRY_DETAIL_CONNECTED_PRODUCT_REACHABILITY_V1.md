# Goal 5 — Connected Entry Detail Production Reachability

Status: **Connected CI acceptance added; exact-Head execution pending CI evidence.**

## Scope and governing boundaries

This qualification extends the installed-ZIP release smoke established for connected native Print (#161). It does not redesign Entry Detail, change the approved vNext HTML, or grant Gravity Flow permission. The Owner's external GOAL_AUTHORITY was not materialized in this repository; the explicit Goal 5 task is the Owner constraint for this batch. Existing WU18 and WU02 runtime qualification remains independently valid for the host/runtime it actually exercised.

Architecture: `docs/architecture/ENTRY_DETAIL_REVIEW_CORRECTION_TARGET_V1.md` and `docs/visual/ENTRY_DETAIL_VNEXT_AUTHORITY_MIGRATION_V1.md`.

## Existing proof vs the missing connection

| Boundary | Before this change | Connected successor |
| --- | --- | --- |
| Canonical production-shaped ZIP installed as non-symlink WP plugin | Already covered by release smoke / connected Print | Reuse the exact same verified plugin files |
| Real Gravity Forms Add-On Settings and Print/Inbox setup | Already connected through GF nonce-protected settings POST | Preserve existing tests |
| Entry Detail setup / host-stable mapping | WU18 pinned acceptance, partly prepared by test-owned GPP lifecycle mutations | Invoke real `entry_detail_setup_action` in Add-On Settings after Print/Inbox, verify immutable version/activation and rerun |
| Real field-backed mapping, blanks, stale source and requalification | WU18, unit/source scope tests and current mapping UI tested independently | Execute real Mapping & Binding Health POST and retire/replace only synthetic host field with GFAPI |
| Native Entry Detail authorization and rendered dossier | WU18 pinned native browser and WU02 visibility/formatter differential, but not connected to installed release ZIP and administrator-created binding | Browser requests actual native Entry Detail route after GPP settings operations; assert values, placeholders, suppression, host controls, permission, responsive views |

## Connected gate sequence

`scripts/release/smoke-zip.sh` installs the exact production-shaped GPP ZIP into a pinned disposable WordPress with pinned Gravity Forms and Gravity Flow packages. `tests/release/run-behavioral-production-reachability.sh` retains the connected Print acceptance and then invokes `tests/release/run-connected-entry-detail.sh` in **that same installed runtime**.

1. Snapshot unadopted Entry Detail; use the original synthetic host form, entry, native Approval step and assignee.
2. POST Entry Detail form selection through real GF Add-On Settings and fresh settings nonce. Assert native host source qualification and distinct Entry Detail activation with Print/Inbox preserved.
3. Navigate to native Gravity Flow Entry Detail as the assigned admin. Compare rendered first/last/full name, choice display value and current step to separately read GFAPI and Gravity Flow API host values. Confirm unmapped facts do not invent values.
4. Re-POST Entry Detail setup unchanged. Verify no binding version or activation churn.
5. Map an actually blank synthetic GF text field using the real Mapping & Binding Health row POST. Verify one immutable successor and a displayed mapped-empty state.
6. Delete that synthetic GF field with GFAPI while preserving the replacement candidate. Verify the GPP binding is unchanged and browser shows stale-source degradation, without guessing the replacement.
7. Rebind the replacement GF field through real mapping POST; requalify Entry Detail using real Add-On Settings; verify source identity, immutable history and now-valid mapped-empty display.
8. Check native status box, nonce, Approve/Reject/Revert, Timeline, Print, duplicate native read-only table suppression, keyboard focus, layout at desktop 1440 and mobile 414/390/320, representative 200% text, and lack of dossier/actions/host personal values for an authenticated unauthorized subscriber.

The read-only observer `behavioral-entry-host-state.php` reads native source and binding evidence only. It does not mutate GPP lifecycle state. Changes to host synthetic test data use GFAPI/Gravity Flow; changes to GPP configuration use product-supported administrator submissions only. The anti-bypass guardrail covers the new test helpers. No real student data is used.

## Evidence and falsification

- The positive verdict is emitted **only after** `validate-connected-entry-detail.php` cross-checks actual ZIP identity, immutable binding history, native host witnesses and stage-by-stage browser JSON.
- The negative source test removes the field while retaining its active binding to expose stale-source behavior.
- The negative authorization test logs in as a separate native subscriber and checks both absence of the dossier/workflow actions and absence of host student name.
- Missing evidence, version/source mismatch, duplicate dossier, visible native read-only list, empty native action box, or unauthorized data fails the gate.
- Screenshot files are diagnostic artifacts; assertions use DOM, computed style and separate host witnesses. They do not establish the actual Owner site.

## Explicitly unchanged

No production PHP/CSS/JavaScript, Gravity Forms/Gravity Flow core, deployment, schema, shared authorization or financial functionality changes. Review/correction/User Input/terminal recovery/Print stay under their previously admitted host boundaries. #154 remains blocked and #160 remains verification-only.

## Remaining claims

This gate is specific to a clean pinned release runtime and a synthetic Approval Review. Target Owner-site visual, workflow, installed-host compatibility, real data semantics, permission matrix, frontend shortcode/native Block variants, and all field-type coverage remain **NOT_PROVEN by this gate**. WU18/WU02/WU21/operator journey/WU19/Inbox and theme tests each retain their own separate evidence scopes; independently green runs are not a combined end-to-end success.

For target-site acceptance (separate Owner authorization required): install the **exact qualified ZIP** in an approved nonproduction replica; use Form 11, explicitly select Print/Inbox/Entry Detail and map real host field IDs; inspect current-step/status, name derivation, native-only actions/visibility, permitted/denied operator accounts, User Input/terminal recovery, dossier/Print at 1440/414/390/320 and 200% text, RTL/BiDi, and real documents, without enabling current-phase financial fields. No Owner-site mutation is authorized here.
