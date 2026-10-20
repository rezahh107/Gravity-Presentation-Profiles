# Goal 5 — Connected Entry Detail Production Reachability

Status: **Connected G5 witness hardening implemented and exercised in a pinned synthetic installed-ZIP runtime; Owner-site acceptance NOT_PROVEN.** The precise current commit's status is authoritative in [PR #163 Checks](https://github.com/rezahh107/Gravity-Presentation-Profiles/pull/163/checks), not a static historical claim in this document. Independent external rereview is not implied by green CI.

- Baseline PR #163 Head `c2f3073b919444838b2d66e9a4b26bed961eb252`: [Repository CI run 39394371057](https://github.com/rezahh107/Gravity-Presentation-Profiles/actions/runs/39394371057) and [Release dry-run 39394371043](https://github.com/rezahh107/Gravity-Presentation-Profiles/actions/runs/39394371043).
- Repaired PR #163 Head `25bf47f117da18393cfab597a9fe95f7719c5bfe`: [Repository CI run 39405647315](https://github.com/rezahh107/Gravity-Presentation-Profiles/actions/runs/39405647315) **SUCCESS**, [Release dry-run 39405647238](https://github.com/rezahh107/Gravity-Presentation-Profiles/actions/runs/39405647238) **SUCCESS**. Real ZIP Print tests, four real native Entry Detail browser stages and all eleven negative evidence mutations passed for *that exact Head*. A subsequent documentation-only Head must have its own checks observed before claiming exact-Head success.

This is pinned synthetic WP/GF/Flow runtime evidence only (WordPress 6.8.3, Gravity Forms 3.1.1.1, Gravity Flow 3.1.0). Publication, Owner site and independent PR rereview are not proven.

## Scope and governing boundaries

This qualification extends the installed-ZIP release smoke established for connected native Print (#161). It does not redesign Entry Detail, change the approved vNext HTML, or grant Gravity Flow permission. The Owner's external GOAL_AUTHORITY was not materialized in this repository; the explicit Goal 5 task is the Owner constraint for this batch. Existing WU18 and WU02 runtime qualification remains independently valid for the host/runtime it actually exercised.

Architecture: `docs/architecture/ENTRY_DETAIL_REVIEW_CORRECTION_TARGET_V1.md` and `docs/visual/ENTRY_DETAIL_VNEXT_AUTHORITY_MIGRATION_V1.md`.

## PRI-FND-001 — bounded host-witness completeness

The connected Entry Detail date claim now combines a separately fetched GFAPI `date_created` raw value, the **existing** GPP `BoundHostValueReader::readDisplay` date provider, and the actual browser's rendered `entry.created_at` text. No independent Jalali conversion or timezone assumption has been introduced. Stage changes cannot silently substitute a different host-source mapping: the independent validator compares stage-specific binding identity, semantic state and source refs with product-created immutable snapshots.

`workflow.status` has independent API truth through `Gravity_Flow_API::get_status()`. The actual pinned installed-ZIP screenshot (artifact `connected-entry-requalified-1440.png`, Release run 39405647238) shows the **native** Gravity Flow Workflow panel explicitly displaying `Status: Pending`, even though it has no `[data-gravityflow-status]` attribute. The hardened browser gate now inspects **visible `innerText` of the existing `.gravityflow-status-box`** and extracts the actual `Status: ...` line. When the pinned native API reports `pending`, the exact case-insensitive `Pending` presentation is required; absence or mismatch fails closed in every stage. No status label is fabricated by GPP. Other localized/translated host status labels and the Owner site remain **NOT_PROVEN**, not inferred from English display normalization.

Print's raw-identity negative explicitly requires the two radio fields to persist the same raw token. That duplicate raw token is scanned once (which covers either field), while the alternate radio label is deliberately different. The denied subscriber is checked against five distinct, synthetic host personal sentinels: both names, the shared radio raw identity, and each radio field's separate **displayed** value, independently read through GFAPI. PRI-FND-001 scanned full document text rather than a truncated excerpt; PRI-FND-002 extends it to attributes and live controls, enforces HTTP 403 and checks all admitted locations with browser-native negative probes. A new negative gate copies the authentic positive JSON evidence and mutates date, status, authorization, binding, controls, stage and routing claims; every corruption must fail the validator. No test-owned GPP lifecycle or permission-model replacement is introduced.

## PRI-FND-002 — native denied-response and complete DOM value evidence

The native negative authorization fixture remains a **separate authenticated subscriber**, resolved through Gravity Flow's real Entry Detail URL. The existing test now requires the **actual browser navigation response to be HTTP 403**; zero dossier, zero native workflow actions and no personal values alone are insufficient. A different HTTP status is not deemed equivalent by inference.

The complete denied-document scan uses all five **independently obtained GFAPI personal sentinels** and covers three admitted DOM location classes: the full `document.documentElement.textContent`, every element's **attribute values**, and live `input`, `textarea` and `select` control values (including selected values of multi-select controls). The test deliberately injects and then removes separate *browser-local DOM* challenge elements for attribute-only, input-value-only, textarea-value-only and surname-only leaks. The **same scanner** must detect each in its intended location, and the denied document must remain clean before and after the challenges. No additional endpoint, listener or network instrumentation is added.

The independent PHP acceptance validator requires exact HTTP 403, the declared coverage keyset, empty observed exposures and the four challenge-result witnesses. Corrupted/missing HTTP status, spoofed denial provenance, missing coverage, or a non-text leak cannot yield unconditional `GPP_CONNECTED_ENTRY_ACCEPTANCE_PASS`. The real-evidence falsification runner retains all **11 original** negative challenges and adds **7 new** negative mutations for HTTP 200, missing HTTP status, attribute-only leak, input-value-only leak, forged source, missing scan and falsified browser challenge. Success remains bound to authentic installed-ZIP browser execution; JSON metadata alone cannot independently establish genuine network/DOM provenance.

**Status of this successor:** these assertions must be validated by a **new, exact-Head** repository CI and release dry-run, separately from prior PRI-FND-001 evidence. The Owner site's custom denial behavior, translated status UI and other WordPress/Gravity Flow combinations remain NOT_PROVEN.

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
- The negative authorization test logs in as a separate native subscriber, requires HTTP 403, checks zero dossier/workflow actions, and scans all five independently sourced personal sentinels through text, DOM attributes and live form-control values.
- Missing evidence, version/source mismatch, duplicate dossier, visible native read-only list, empty native action box, or unauthorized data fails the gate.
- Screenshot files are diagnostic artifacts; assertions use DOM, computed style and separate host witnesses. They do not establish the actual Owner site.

## Explicitly unchanged

No production PHP/CSS/JavaScript, Gravity Forms/Gravity Flow core, deployment, schema, shared authorization or financial functionality changes. Review/correction/User Input/terminal recovery/Print stay under their previously admitted host boundaries. #154 remains blocked and #160 remains verification-only.

## Remaining claims

This gate is specific to a clean pinned release runtime and a synthetic Approval Review. Target Owner-site visual, workflow, installed-host compatibility, real data semantics, permission matrix, frontend shortcode/native Block variants, and all field-type coverage remain **NOT_PROVEN by this gate**. WU18/WU02/WU21/operator journey/WU19/Inbox and theme tests each retain their own separate evidence scopes; independently green runs are not a combined end-to-end success.

For target-site acceptance (separate Owner authorization required): install the **exact qualified ZIP** in an approved nonproduction replica; use Form 11, explicitly select Print/Inbox/Entry Detail and map real host field IDs; inspect current-step/status, name derivation, native-only actions/visibility, permitted/denied operator accounts, User Input/terminal recovery, dossier/Print at 1440/414/390/320 and 200% text, RTL/BiDi, and real documents, without enabling current-phase financial fields. No Owner-site mutation is authorized here.
