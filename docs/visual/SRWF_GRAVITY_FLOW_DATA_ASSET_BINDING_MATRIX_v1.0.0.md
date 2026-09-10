# SRWF Gravity Flow / Data / Asset Binding Evidence Matrix v1.0.0

```yaml
document_id: GPP-SRWF-GRAVITY-FLOW-DATA-ASSET-BINDING-MATRIX
document_version: 1.0.0
status: WU16_EVIDENCE_CAPTURED__BLOCKED_AC002_AC007
project_id: GPP-SRWF-REGISTRATION-IMPLEMENTATION-V1
work_unit_id: WU-GPP-GF-BINDING-MATRIX-16
run_id: RUN-GPP-GF-BINDING-MATRIX-16-001
repository_base: main@a4e50d6fde38bf29462fcd14a3a2e31612829ccd
evidence_cutoff: 2026-09-10
runtime_implementation: NONE
successor_work: NOT_AUTHORIZED_BY_THIS_DOCUMENT
```

## 1. Purpose and boundary

This WU16 artifact records the evidence-backed seams, field/print bindings, assets, and unresolved target-runtime gaps required by the owner-locked SRWF Gravity Flow/A4 baseline. It is an **evidence contract only**. It does not implement Inbox, Entry Detail, direct-print runtime, profile-package lifecycle, workflow behavior, authorization, a replacement search path, or a new data model.

The controlling ownership rule remains: Gravity Forms owns Entry data and field lifecycle; Gravity Flow owns workflow/assignment/Inbox/Entry Detail/actions/authorization; Gravity Presentation Profiles owns admitted deterministic presentation only. The bundled HTML/PDF are appearance/behavior evidence, not production WordPress source, runtime IDs, permissions, or assets.

### Evidence-state vocabulary

- **`PROVEN`**: the exact bounded claim is established by admitted authority/evidence identified here.
- **`UNBOUND`**: an authoritative semantic concept/source exists, but its exact target-runtime identity/binding is absent; production must remain blank/inactive for that binding.
- **`NOT_PROVEN`**: available evidence does not establish the runtime capability, permission, lifecycle, target configuration, asset identity, or semantic equivalence required for safe production use.
- A screen runtime classification of **`available` / `read-only` / `editable` / `absent`** is used only when authentic target evidence supports that classification. Otherwise the matrix says `NOT_PROVEN`; visual mockup behavior never establishes editability.

## 2. Evidence registry

| ID | Source class | Identity | Provenance | State |
| --- | --- | --- | --- | --- |
| EV-GPP-BASE | Repository authority | GPP `main@a4e50d6fde38bf29462fcd14a3a2e31612829ccd`: `AGENTS.md`, Mother Architecture, WU15 visual baseline, visual index | Exact repository ref | PROVEN |
| EV-PROJECT | Owner project contract | Bundled `PROJECT_CONTRACT.json` revision 2; raw SHA-256 `388ca98511cb22b4242d29098bb88ffcec716072a0c13855edf59f5418e992b3` | Owner-supplied byte-exact bundle | PROVEN |
| EV-HANDOFF | Corrected owner handoff | `HANDOFF-GPP-GF-FINAL-VISUAL-A4-20260910-02`; canonical artifact SHA-256 `57e045457776187ee572b312e675fe4b7384b95391de4e7731407151a36a4aae` | Owner-supplied admitted handoff | PROVEN |
| EV-HTML | Locked visual reference | `PersianGravity-Visual-Reference-Final.html`; 115728 bytes; SHA-256 `666704ac25b019ae59406974a223d10cace3f90e96f9d55312730ae93af09c81` | Owner-supplied visual/behavior evidence only | PROVEN_AS_REFERENCE |
| EV-PDF | Locked print reference | `PersianGravity-Final-Print-Sample.pdf`; 321990 bytes; SHA-256 `34d9b4e137667ca103d5c6e7752f7148f0c92e36f0f1d182d7d87a890c55fec5`; 2 A4 portrait pages | Owner-supplied print composition evidence only | PROVEN_AS_REFERENCE |
| EV-SRWF-SFC | SRWF semantic field authority | `rezahh107/SRWF@755cab5a0743df1ded2f237c5f76a46eaa6fb758:docs/contracts/SEMANTIC_FIELD_CONTRACT.yaml` | Exact supporting repository ref | PROVEN_SEMANTICS; runtime IDs UNBOUND |
| EV-SRWF-ENV | Target environment inventory | Same SRWF ref: `docs/contracts/ENVIRONMENT_MANIFEST.md` | Exact supporting repository ref | PARTIAL; exact GF/Flow versions NOT_PROVEN |
| EV-SRWF-MAP | Target implementation mapping | Same SRWF ref: `docs/contracts/IMPLEMENTATION_MAPPING.yaml` | Exact supporting repository ref | UNBOUND |
| EV-SRWF-WF | Workflow ownership | Same SRWF ref: `docs/contracts/WORKFLOW_CONTRACT.md` | Exact supporting repository ref | PROVEN project contract; target step IDs UNBOUND |
| EV-SRWF-ACL | Access-control intent | Same SRWF ref: `docs/contracts/ACCESS_CONTROL_CONTRACT.md` | Exact supporting repository ref | PROVEN project contract; runtime permission read-back NOT_PROVEN |
| EV-VAZIR | Vazir source authority | `rezahh107/Vazir@ad8feae35a4e1c27fb13d646fa18abf05bb4e7b1`: `vazir-font-wp.php`, `includes/class-vazirfont-loader.php`, bundled WOFF2 files | Exact supporting repository ref | PROVEN source/delivery implementation |
| EV-GF-ENTRY | Gravity Forms Entry Object | https://docs.gravityforms.com/entry-object/ | Current first-party documentation; not target-version proof | GENERAL_CURRENT_FIRST_PARTY |
| EV-GF-API | Gravity Forms GFAPI entry retrieval | https://docs.gravityforms.com/searching-and-getting-entries-with-the-gfapi/ | Current first-party documentation; not target-version proof | GENERAL_CURRENT_FIRST_PARTY |
| EV-FLOW-INBOX | Gravity Flow Inbox | https://docs.gravityflow.io/the-inbox-page/ | Current first-party documentation; states Inbox features as of Flow 2.8; target version unknown | GENERAL_CURRENT_FIRST_PARTY |
| EV-FLOW-ENTRY | Gravity Flow Entry Details | https://docs.gravityflow.io/the-entry-details-page/ | Current first-party documentation; target configuration unknown | GENERAL_CURRENT_FIRST_PARTY |
| EV-FLOW-SEARCH | Gravity Flow Inbox search criteria hook | https://docs.gravityflow.io/gravityflow_inbox_search_criteria/ | Current first-party developer documentation; target version unknown | GENERAL_CURRENT_FIRST_PARTY |
| EV-FLOW-DETAIL-HOOK | Gravity Flow entry-detail action | https://docs.gravityflow.io/gravityflow_entry_detail/ | Current first-party developer documentation; target version unknown | GENERAL_CURRENT_FIRST_PARTY |

Current first-party documentation is intentionally classified as **general current capability evidence**, not exact target-installation proof. The SRWF target environment and implementation mapping explicitly leave exact Gravity Forms/Gravity Flow versions, form/field IDs, workflow step IDs and route/page IDs unbound.

## 3. Locked host semantic regions — no DOM/selector contract

The owner-locked design needs the following host-owned semantic regions. WU16 does not assign CSS selectors to them.

### Native Inbox semantics needed by WU17

1. assignee-visible pending work list / item collection;
2. field/value columns or equivalent host-provided data exposed to the Inbox;
3. native visible search when target-supported;
4. optional host-provided filters/sort only when their authoritative values are exposed;
5. host paging;
6. host live refresh where target-supported/configured;
7. native navigation from an authorized Inbox item to that Entry's details.

### Native Entry Detail semantics needed by WU18/WU19

1. backlink / native utility navigation;
2. step Instructions/current-task region;
3. Entry Field/Values region;
4. Workflow Status/current-step region and host-owned interactive actions;
5. Timeline/history region where configured/authorized;
6. Admin Actions only when native permission exposes them — never as a GPP authorization path;
7. a target-safe presentation insertion seam for the print utility, if later proven, that preserves the same Entry authorization boundary.

Current first-party Gravity Flow documentation supports these concepts generally, but display depends on user/role, current step and block/shortcode/admin configuration. Consequently **no exact target DOM relationship or production CSS selector is established by WU16**.

## 4. Target environment and Gravity Flow adapter evidence ledger

| Area | Claim | Evidence found | Refs | Evidence state | Downstream impact |
| --- | --- | --- | --- | --- | --- |
| Gravity Forms | Exact installed version | No exact version in admitted target evidence; SRWF environment manifest requires it to be read back. | EV-SRWF-ENV, EV-SRWF-MAP | NOT_PROVEN | Any production adapter that depends on version-specific behavior remains blocked. |
| Gravity Flow | Exact installed version | No exact version in admitted target evidence. | EV-SRWF-ENV, EV-SRWF-MAP | NOT_PROVEN | Selectors/hooks/DOM/configuration cannot be promoted to target-safe use. |
| Gravity Flow Inbox | Operational ownership | Native Gravity Flow Inbox is the only allowed operational Inbox. | EV-GPP-BASE, EV-SRWF-WF | PROVEN_PROJECT_CONTRACT | WU17 may style only native/evidenced state; no parallel queue/Desk. |
| Inbox context | Front-end/admin route, block/shortcode/page | SRWF mapping has `route_or_page_id: null`; exact embed/configuration is not bound. Current docs describe admin and front-end block/shortcode paths generally. | EV-SRWF-MAP, EV-FLOW-INBOX | NOT_PROVEN_FOR_TARGET | WU17 route-specific markup/selector work is blocked pending target evidence. |
| Inbox assignment | Assignee-visible pending work | Project contract requires native assignment authorization; current first-party docs describe Inbox as assigned entries. No sanitized target session/read-back is present. | EV-SRWF-WF, EV-SRWF-ACL, EV-FLOW-INBOX | PROJECT_RULE_PROVEN__TARGET_NOT_PROVEN | Do not infer visibility beyond native authorization. |
| Inbox refresh | Live refresh | SRWF contract selects native Gravity Flow Live Refresh; current first-party docs describe Live Data Refresh as an Inbox capability. Exact target version/configuration is unknown. | EV-SRWF-WF, EV-FLOW-INBOX, EV-SRWF-ENV | GENERAL_CAPABILITY_PROVEN__TARGET_NOT_PROVEN | No custom polling/WebSocket. WU17 must validate target lifecycle before binding refresh-sensitive presentation. |
| Inbox navigation | Open assigned item -> Entry Details | Current first-party docs describe clicking an Inbox row to reach Entry Details; exact target route and markup are unbound. | EV-FLOW-INBOX, EV-SRWF-MAP | GENERAL_CAPABILITY_PROVEN__TARGET_NOT_PROVEN | Use native navigation only after target path is captured; no custom authorization bypass. |
| Inbox search | Global Inbox Search | Current first-party Inbox docs identify Global Inbox Search as a native capability as of 2.8. Target Flow version/configuration is unknown. | EV-FLOW-INBOX, EV-SRWF-ENV | GENERAL_CAPABILITY_PROVEN__TARGET_NOT_PROVEN | Locked search target has a native candidate, but WU17 search implementation is locally blocked until target support is confirmed. |
| Inbox search extension | `gravityflow_inbox_search_criteria` | Documented current first-party filter modifies Inbox search criteria. It is not proof that the target version/configuration is compatible or that GPP needs this hook. | EV-FLOW-SEARCH | REFERENCE_ONLY__TARGET_NOT_PROVEN | Do not use in production WU17 without target-version evidence and a demonstrated need. |
| Inbox School field/filter | School value exposure | SRWF has authoritative `SCHOOL_NAME`/`SCHOOL_CODE` semantics, but target form IDs/field IDs and Inbox column exposure are unbound. | EV-SRWF-SFC, EV-SRWF-MAP | NOT_PROVEN | WU17 must omit School filter; no replacement data path. |
| Inbox Due | Due/due-date state | No authoritative SRWF Due field or target Gravity Flow due configuration is bound. Generic Flow documentation does not create a project Due value. | EV-SRWF-SFC, EV-SRWF-MAP, EV-FLOW-INBOX | ABSENT_FROM_ADMITTED_PROJECT_DATA__TARGET_NOT_PROVEN | WU17 renders no Due/overdue marker/filter/sort. This is not a design defect. |
| Entry Details | Operational ownership | Native Gravity Flow Entry Details remains the host surface. | EV-GPP-BASE, EV-SRWF-WF | PROVEN_PROJECT_CONTRACT | WU18 may present native regions only. |
| Entry context | Front-end/admin route | SRWF `entry_details.route_or_page_id` is null. Current docs describe front-end block/shortcode and admin paths generally. | EV-SRWF-MAP, EV-FLOW-ENTRY | NOT_PROVEN_FOR_TARGET | Route-specific adapter/markup remains blocked. |
| Entry semantic regions | Instructions; Entry Field/Values; Timeline; Workflow Status; Admin Actions; Backlink | These regions are described by current first-party Gravity Flow docs; whether each appears on the target page depends on user/role, step and embed settings. | EV-FLOW-ENTRY | GENERAL_CAPABILITY_PROVEN__TARGET_NOT_PROVEN | May guide evidence capture; not a target DOM/selector contract. |
| Entry extension point | `gravityflow_entry_detail` action | Current first-party docs define an action below the field grid with form/entry/step parameters. Target applicability is not proven and no WU16 production hook is authorized. | EV-FLOW-DETAIL-HOOK | REFERENCE_ONLY__TARGET_NOT_PROVEN | Do not bind WU18/WU19 to this hook without target proof. |
| Entry step type | Registration Officer Approval | Project workflow chooses native Registration Officer Approval/Entry Details; exact step ID is null. | EV-SRWF-WF, EV-SRWF-MAP | SEMANTIC_STEP_PROVEN__ID_UNBOUND | Action/editability claims must wait for target step read-back. |
| Entry editability | Displayed/editable fields | Current Flow docs say Approval/User Input can configure displayed/editable fields, but actual target field lists and user permissions are not captured. | EV-FLOW-ENTRY, EV-SRWF-MAP, EV-SRWF-ACL | NOT_PROVEN_FOR_TARGET | AC-WU16-002 cannot receive positive per-field runtime classifications from current evidence. |
| Exact selectors / DOM | Production selectors | No sanitized authentic target DOM/source snapshot tied to exact target versions/configuration is admitted. | EV-SRWF-ENV, EV-SRWF-MAP | NOT_PROVEN | No selectors are declared production-usable in this artifact. |

### Production seam rule

The named first-party hooks `gravityflow_inbox_search_criteria` and `gravityflow_entry_detail` are recorded only because current official documentation proves they exist as general extension points. **Neither is approved here as the production adapter seam for the target installation.** Exact target Flow version/configuration and a demonstrated need must exist before a successor may bind to either hook. No production selector is declared at all.

## 5. Native Inbox search / School / Due decision

**Search:** The locked visible search has a legitimate native-host candidate: Gravity Flow's current first-party Inbox documentation describes **Global Inbox Search** as a native feature as of Gravity Flow 2.8. That establishes a general host mechanism, not target support. Because the target Gravity Flow version/configuration is absent from admitted evidence, WU17's search binding is `NOT_PROVEN_FOR_TARGET` and locally blocked until read-back confirms the native mechanism. WU17 must not build a replacement search engine and must not silently drop the locked search target as though the requirement disappeared.

**School:** `SCHOOL_NAME`/`SCHOOL_CODE` are authoritative SRWF semantics, but their actual form/field IDs and exposure as Inbox data are unbound. Therefore School filtering is **omitted** in successor production work until target Inbox evidence proves supported exposure. No parallel data path is authorized.

**Due:** No authoritative material Due field/configuration is bound for SRWF. Generic host capability does not create a Due value. Therefore there is **no Due/overdue presentation, filter, or sort** for successor work unless later authentic target evidence establishes one. This absence is expected fail-closed behavior, not a visual defect.

## 6. Screen field availability / editability matrix

The `Semantic source` column names admitted SRWF concepts when they exist; it does **not** pretend those names are target Gravity Forms field IDs. The `Exact target binding` column makes that distinction explicit.

| ID | Surface/category | Presentation item | Semantic/data owner | Exact target binding | Target runtime classification | Evidence | Downstream consequence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| IN-01 | Inbox identity | Student photo / fallback | Gravity Forms Entry via SRWF `STUDENT_PHOTO` (`student_photo`); media behavior owned by GP File Upload Pro | Runtime field ID and target upload-plugin/config read-back UNBOUND | NOT_PROVEN | EV-SRWF-SFC, EV-GPP-BASE | WU17/WU18 may not bind real media until target field/file URL/access path is proven; fallback may be presentation-only and non-fabricated. |
| IN-02 | Inbox identity | Full name | SRWF `STUDENT_FIRST_NAME` + `STUDENT_LAST_NAME` | Runtime field IDs UNBOUND | NOT_PROVEN | EV-SRWF-SFC, EV-SRWF-MAP | Name composition is intended, but target extraction remains blocked. |
| IN-03 | Inbox identity | National ID | SRWF `STUDENT_NATIONAL_ID` (`national_id`) | Runtime field ID UNBOUND | NOT_PROVEN | EV-SRWF-SFC, EV-SRWF-MAP | No target column/key binding yet. |
| IN-04 | Inbox state | Current step | Gravity Flow current workflow step | Exact step/runtime API binding unbound | NOT_PROVEN | EV-SRWF-WF, EV-SRWF-MAP, EV-FLOW-ENTRY | WU17 must use host state only after target-safe extraction is proven. |
| IN-05 | Inbox state | Data-entry date | Gravity Forms Entry Object general key `date_created` | General first-party key is documented; target adapter + Jalali presentation path not captured | NOT_PROVEN | EV-GF-ENTRY, EV-SRWF-ENV | Do not confuse with financial Back date. |
| IN-06 | Inbox state | Due / overdue | Gravity Flow Due only if authoritative/material | No SRWF Due source/config bound | absent | EV-GPP-BASE, EV-SRWF-SFC, EV-SRWF-MAP | Omit Due state/filter/sort. |
| IN-07 | Inbox filter support | School value | SRWF `SCHOOL_NAME` / `SCHOOL_CODE` | Runtime IDs and Inbox exposure unbound | NOT_PROVEN | EV-SRWF-SFC, EV-SRWF-MAP | Omit School filter in successor until target Inbox exposure is proven. |
| ED-01 | Entry identity | Student photo / avatar | SRWF `STUDENT_PHOTO` | Runtime field/media URL/access path UNBOUND | NOT_PROVEN | EV-SRWF-SFC, EV-SRWF-ACL | No illustrative reference portrait may be used as production media. |
| ED-02 | Entry identity | Full name | SRWF `STUDENT_FIRST_NAME` + `STUDENT_LAST_NAME` | Runtime field IDs UNBOUND | NOT_PROVEN | EV-SRWF-SFC | Target read-only/editable state not proven. |
| ED-03 | Entry identity | National ID | SRWF `STUDENT_NATIONAL_ID` | Runtime field ID UNBOUND | NOT_PROVEN | EV-SRWF-SFC | Target read-only/editable state not proven. |
| ED-04 | Entry identity / education | Grade/group | SRWF `GRADE_GROUP_SELECTION`; `GROUP_CODE` is system-only code | Runtime field IDs UNBOUND | NOT_PROVEN | EV-SRWF-SFC | Use human-readable value only after target binding. |
| ED-05 | Entry identity / school | School | SRWF `SCHOOL_NAME` derived label; `SCHOOL_CODE` source choice | Runtime field IDs UNBOUND | NOT_PROVEN | EV-SRWF-SFC | Target availability/editability not proven. |
| ED-06 | Primary dossier / education | Education level | SRWF `EDUCATION_LEVEL` | Runtime field ID UNBOUND | NOT_PROVEN | EV-SRWF-SFC | Target availability/editability not proven. |
| ED-07 | Primary dossier / person | First name | SRWF `STUDENT_FIRST_NAME` | Runtime field ID UNBOUND | NOT_PROVEN | EV-SRWF-SFC | Target availability/editability not proven. |
| ED-08 | Primary dossier / person | Last name | SRWF `STUDENT_LAST_NAME` | Runtime field ID UNBOUND | NOT_PROVEN | EV-SRWF-SFC | Target availability/editability not proven. |
| ED-09 | Primary dossier / person | Father name | SRWF `STUDENT_FATHER_NAME` | Runtime field ID UNBOUND | NOT_PROVEN | EV-SRWF-SFC | Target availability/editability not proven. |
| ED-10 | Primary dossier / person | Date of birth | SRWF `DATE_OF_BIRTH_JALALI` | Runtime field ID and stored-value target read-back UNBOUND | NOT_PROVEN | EV-SRWF-SFC | Do not infer format beyond admitted semantic contract. |
| ED-11 | Primary dossier / person | Gender | SRWF `STUDENT_GENDER` (`0`=daughter/woman; `1`=son/man) | Runtime field ID UNBOUND | NOT_PROVEN | EV-SRWF-SFC | Target availability/editability not proven. |
| ED-12 | Primary dossier / contacts | Student mobile | SRWF `STUDENT_MOBILE` | Runtime field ID UNBOUND | NOT_PROVEN | EV-SRWF-SFC, EV-GPP-BASE | Canonical specimen is visually read-only, but target runtime classification still needs host evidence. |
| ED-13 | Primary dossier / contacts | Home phone | SRWF `HOME_PHONE` | Runtime field ID UNBOUND | NOT_PROVEN | EV-SRWF-SFC | Target availability/editability not proven. |
| ED-14 | Primary dossier / contacts | Father mobile | SRWF `CONTACT1_MOBILE`; relationship field fixed to father | Runtime field ID UNBOUND | NOT_PROVEN | EV-SRWF-SFC | Safe semantic role exists; target binding/editability not proven. |
| ED-15 | Primary dossier / contacts | Mother mobile | SRWF `CONTACT2_MOBILE`; relationship field fixed to mother | Runtime field ID UNBOUND | NOT_PROVEN | EV-SRWF-SFC | Safe semantic role exists; target binding/editability not proven. |
| ED-16 | Documents | Report-card upload | SRWF `REPORT_CARD_FILE` | Runtime field ID/file URL/access lifecycle UNBOUND | NOT_PROVEN | EV-SRWF-SFC, EV-SRWF-ACL | WU18 document adapter blocked until authentic file representation/access evidence. |
| ED-17 | Documents | Student photo document/media | SRWF `STUDENT_PHOTO` | Runtime representation UNBOUND | NOT_PROVEN | EV-SRWF-SFC, EV-SRWF-ACL | Image preview behavior can be styled only after real host media path is proven. |
| ED-18 | Admin/finance | Data-entry date | Gravity Forms Entry `date_created` general key | Target adapter not captured | NOT_PROVEN | EV-GF-ENTRY | May later be shown as operator Jalali date; not the print financial date. |
| ED-19 | Admin/finance | Review status | SRWF `REVIEW_STATUS` | Runtime field ID UNBOUND | NOT_PROVEN | EV-SRWF-SFC | Project semantics say Entry overlay, not Flow state; target display/editability unproven. |
| ED-20 | Admin/finance | Review reason | SRWF `REVIEW_REASON` | Runtime field ID UNBOUND | NOT_PROVEN | EV-SRWF-SFC | Conditional semantics known; target display/editability unproven. |
| ED-21 | Admin/finance | Finance status | SRWF `FINANCE_STATUS` | Runtime field ID UNBOUND | NOT_PROVEN | EV-SRWF-SFC, EV-SRWF-ACL | Do not broaden to Accountant; target current-user visibility unproven. |
| ED-22 | Admin/finance | Tuition amount | SRWF `TUITION_AMOUNT` | Runtime field ID UNBOUND | NOT_PROVEN | EV-SRWF-SFC | Target visibility/editability unproven. |
| ED-23 | Admin/finance | Discount amount | SRWF `DISCOUNT_AMOUNT` | Runtime field ID UNBOUND | NOT_PROVEN | EV-SRWF-SFC | Target visibility/editability unproven. |
| ED-24 | Admin/finance | Discount title | SRWF `DISCOUNT_TITLE` | Runtime field ID UNBOUND | NOT_PROVEN | EV-SRWF-SFC | Target visibility/editability unproven. |
| ED-25 | Admin/finance | Net payable | SRWF `NET_PAYABLE_AMOUNT` derived semantic value | Runtime field ID UNBOUND | NOT_PROVEN | EV-SRWF-SFC | Do not recompute in GPP; present authoritative stored/host value only after binding. |
| ED-26 | Current task | Instructions / exact task heading | Gravity Flow step Instructions region; visual title locked by WU15 | Target step configuration and region markup unbound | NOT_PROVEN | EV-FLOW-ENTRY, EV-GPP-BASE | WU18 can preserve title/composition only when native region mapping is proven. |
| ED-27 | Current task action | Approve | Gravity Flow Approval action | Exact target step/action availability unbound | NOT_PROVEN | EV-FLOW-ENTRY, EV-SRWF-WF | Never synthesize an action; WU18 blocks action styling/binding until target proof. |
| ED-28 | Current task action | Reject | Gravity Flow Approval negative action in locked visual context | Exact target step/action availability unbound; older SRWF workflow text does not prove current target availability | NOT_PROVEN | EV-GPP-BASE, EV-FLOW-ENTRY, EV-SRWF-MAP | Do not infer from mockup; WU18 must verify actual host action before rendering/styling it. |
| ED-29 | Secondary history | Timeline/history events | Gravity Flow Timeline region | Target timeline visibility/configuration unbound | NOT_PROVEN | EV-FLOW-ENTRY, EV-SRWF-MAP | WU18 history section locally blocked until target timeline evidence. |
| ED-30 | Status material | Workflow status/current step metadata | Gravity Flow Workflow Status region | Target status-box settings/step context unbound | NOT_PROVEN | EV-FLOW-ENTRY | No fake status labels. |
| ED-31 | Utility navigation | Backlink | Gravity Flow Backlink region | Target front-end embed/backlink settings unbound | NOT_PROVEN | EV-FLOW-ENTRY, EV-SRWF-MAP | Use native navigation only; no custom bypass. |
| ED-32 | Print utility | Print affordance | GPP presentation utility over already-authorized Entry Detail | No target-safe insertion point/timing proof | NOT_PROVEN | EV-GPP-BASE, EV-SRWF-ACL, EV-FLOW-ENTRY | WU19 may not expose print until target insertion/access timing is proven. |

### AC-WU16-002 consequence

The matrix is complete for the locked screen design, but it cannot truthfully assign the required positive runtime classifications to every Entry item. `IMPLEMENTATION_MAPPING.yaml` has no bound form/field/step/route IDs and there is no sanitized authentic target screen/source capture tied to exact versions/configuration. Project-level `officer_visibility` / `officer_editability` intent in the SRWF semantic contract is **not substituted for actual host runtime proof**. AC-WU16-002 therefore remains blocking and unsatisfied in this Run.

## 7. Print Front binding matrix

The following keys are taken from the locked HTML reference and cross-checked against the locked two-page print composition. A dynamic region with `UNBOUND`/`NOT_PROVEN` remains physically present but digitally blank for manual completion.

| ID / region | Print key/label | Owner | Authoritative digital source | Transform rule | Evidence | State | Blank/manual behavior |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PF-01 | `counter` / شمارنده | Gravity Forms/SRWF | SRWF `REGISTRATION_COUNTER` semantic field; actual runtime field ID unbound | No transform authorized beyond presentation of authoritative value | EV-HTML, EV-SRWF-SFC | UNBOUND | Keep region visible and digitally blank; manual completion allowed. |
| PF-02 | `nid` / کد ملی | Gravity Forms/SRWF | SRWF `STUDENT_NATIONAL_ID`; runtime ID unbound | Canonical storage is ASCII 10 digits preserving leading zero; print RTL/LTR treatment still implementation work | EV-HTML, EV-SRWF-SFC | UNBOUND | Blank until target field binding is read back. |
| PF-03 | `name` / نام و نام خانوادگی | Gravity Forms/SRWF | Candidate composition from `STUDENT_FIRST_NAME` + `STUDENT_LAST_NAME`; runtime IDs unbound | Concatenation order for print must be confirmed in implementation binding; no demo JSON authority | EV-HTML, EV-SRWF-SFC | UNBOUND | Blank until target field IDs and composition are bound. |
| PF-04 | `father` / نام پدر | Gravity Forms/SRWF | SRWF `STUDENT_FATHER_NAME`; runtime ID unbound | Direct display only after binding | EV-HTML, EV-SRWF-SFC | UNBOUND | Blank. |
| PF-05 | `grade` / رشته و پایهٔ تحصیلی | Gravity Forms/SRWF | Candidate human-readable `GRADE_GROUP_SELECTION`; `GROUP_CODE` is not display text; runtime IDs unbound | No academic-year inference from grade | EV-HTML, EV-SRWF-SFC, EV-GPP-BASE | UNBOUND | Blank until exact target binding. |
| PF-06 | `year_start` / سال تحصیلی شروع | Unknown | No authoritative academic-year field found in admitted SRWF semantic contract | None | EV-HTML, EV-SRWF-SFC, EV-GPP-BASE | UNBOUND | Remain digitally blank/manual. |
| PF-07 | `year_end` / سال تحصیلی پایان | Unknown | No authoritative academic-year field found | None; never infer from grade | EV-HTML, EV-SRWF-SFC, EV-GPP-BASE | UNBOUND | Remain digitally blank/manual. |
| PF-08 | `school` / نام مدرسه جاری | Gravity Forms/SRWF | Candidate SRWF `SCHOOL_NAME` derived authoritative label; runtime ID unbound | Use authoritative full label only after binding | EV-HTML, EV-SRWF-SFC | UNBOUND | Blank until target field binding. |
| PF-09 | `sub_office` / دفاتر اقماری؛ شهرستان | Unknown | No authoritative source found in admitted SRWF semantic contract | None | EV-HTML, EV-SRWF-SFC | UNBOUND | Remain digitally blank/manual. |
| PF-10 | `first_exam` / تاریخ اولین آزمون | Unknown | No authoritative source found | None | EV-HTML, EV-SRWF-SFC | UNBOUND | Remain digitally blank/manual. |
| PF-11 | `phone` / تلفن همراه ۱ | Gravity Forms/SRWF | Candidate `STUDENT_MOBILE`; runtime ID unbound | Direct presentation only after binding | EV-HTML, EV-SRWF-SFC | UNBOUND | Blank until target binding. |
| PF-12 | `parent_phone` / تلفن همراه ۲ | Unknown dedicated print source | SRWF has separate father/mother contact mobiles, but no dedicated historical Phone 2 binding | Explicitly forbid choosing father or mother as fallback | EV-HTML, EV-SRWF-SFC, EV-GPP-BASE | UNBOUND | Must remain digitally blank/manual until a dedicated authoritative binding is approved. |
| PF-13 | Gender option group: `female`, `male` | Gravity Forms/SRWF candidate | SRWF `STUDENT_GENDER` has semantic values `0`=دختر/زن and `1`=پسر/مرد; runtime field ID unbound | No production check mapping is activated by this document; no default selection | EV-HTML, EV-SRWF-SFC | UNBOUND | Both boxes remain blank until exact target field + explicit print option mapping are bound. |
| PF-14 | Registration type: `reg_normal`, `reg_school`, `reg_shaheed`, `reg_komite`, `reg_behzisti`, `reg_maskan` | Unknown | No authoritative registration-type field with this option vocabulary is present. `FINANCE_STATUS` must not be repurposed. | No semantic substitution/default | EV-HTML, EV-SRWF-SFC | UNBOUND | All six options remain blank/manual. |
| PF-15 | Registration timing: `time_early`, `time_continue` | Unknown | No authoritative registration-timing source found | No default | EV-HTML, EV-SRWF-SFC | UNBOUND | Both options remain blank/manual. |
| PF-16 | Graduate status: `graduated` | Gravity Forms/SRWF candidate | SRWF `GRADUATION_STATUS` has `0`=فارغ‌التحصیل and `1`=دانش‌آموز; runtime field ID unbound | Candidate semantics exist, but no production checkbox mapping is activated until target binding; no default | EV-HTML, EV-SRWF-SFC | UNBOUND | Checkbox remains blank until exact binding/mapping. |
| PF-17 | Registration location: `loc_central`, `loc_golestan`, `loc_sadra` | Gravity Forms/SRWF candidate | SRWF `REGISTRATION_CENTER` has values `0`=مرکز, `1`=گلستان, `2`=صدرا, but equivalence to the historical print group is not independently proven and runtime ID is unbound | Do not infer `مرکز` == historical `دفتر مرکزی` without explicit binding | EV-HTML, EV-SRWF-SFC | NOT_PROVEN | All location options remain blank/manual. |
| PF-18 | Payment mode: `pay_cash`, `pay_installment` | Unknown | No authoritative payment-mode field found in admitted SRWF contract | No default based on finance values or cheque presence | EV-HTML, EV-SRWF-SFC | UNBOUND | Both options remain blank/manual. |

## 8. Print Back binding matrix

| ID / region | Print key/label | Owner | Authoritative digital source | Transform rule | Evidence | State | Blank/manual behavior |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PB-01 | `date` / تاریخ مالی | Unknown dedicated financial source | No dedicated authoritative financial-date binding found | Explicitly forbidden to derive from Inbox/GF entry `date_created` | EV-HTML, EV-GPP-BASE, EV-SRWF-SFC | UNBOUND | Remain digitally blank/manual. |
| PB-02 | `name` / نام و نام خانوادگی | Gravity Forms/SRWF | Same candidate first+last semantic sources as Front; runtime IDs unbound | No demo-data binding | EV-HTML, EV-SRWF-SFC | UNBOUND | Blank until target binding. |
| PB-03 | `father` / نام پدر | Gravity Forms/SRWF | `STUDENT_FATHER_NAME`; runtime ID unbound | Direct only after binding | EV-HTML, EV-SRWF-SFC | UNBOUND | Blank. |
| PB-04 | `grade` / رشته و پایه | Gravity Forms/SRWF | Candidate `GRADE_GROUP_SELECTION`; runtime ID unbound | No year inference | EV-HTML, EV-SRWF-SFC | UNBOUND | Blank. |
| PB-05 | `academic_year` / سال تحصیلی | Unknown | No authoritative academic-year field found | Must remain independent from grade | EV-HTML, EV-GPP-BASE, EV-SRWF-SFC | UNBOUND | Blank/manual. |
| PB-06 | Five receipt/deposit rows: serial, date, account, bank/branch, amount | Unknown | No admitted SRWF receipt-row data model/bindings found | No synthesized rows/totals | EV-PDF, EV-HTML, EV-SRWF-SFC | UNBOUND | All five canonical rows remain manual/digitally blank. |
| PB-07 | Six cheque/installment rows: serial, date, account, bank/branch, amount | Gravity Forms child-form candidate, not target-proven | Cheque child form host selected as GP Nested Forms POC but host is `SELECTED_POC_NOT_PROVEN`; manual field inventory incomplete; only CHEQUE_AMOUNT/CHEQUE_DUE_DATE are known semantic fields | Do not partially bind date/amount while row identity/account/bank model is incomplete | EV-PDF, EV-HTML, EV-SRWF-SFC | NOT_PROVEN | All six rows remain manual/digitally blank until child-form host + complete row mapping are proven. |
| PB-08 | مبلغ دریافت‌شده به حروف | Unknown | No authoritative source/approved number-to-words derivation found | Do not derive from unbound receipt/cheque rows | EV-PDF, EV-HTML, EV-SRWF-SFC | UNBOUND | Blank/manual. |
| PB-09 | مبلغ دریافت‌شده به عدد | Unknown | No authoritative total source found | Do not compute an unapproved total | EV-PDF, EV-HTML, EV-SRWF-SFC | UNBOUND | Blank/manual. |
| PB-10 | `tuition` / مبلغ شهریه | Gravity Forms/SRWF | `TUITION_AMOUNT`; runtime ID unbound | Canonical storage nonnegative integer Rial; GPP must not invent financial semantics | EV-HTML, EV-SRWF-SFC | UNBOUND | Blank until target field binding. |
| PB-11 | `discount` / مبلغ تخفیف | Gravity Forms/SRWF | `DISCOUNT_AMOUNT`; runtime ID unbound | Direct authoritative value only | EV-HTML, EV-SRWF-SFC | UNBOUND | Blank until target binding. |
| PB-12 | `payable` / خالص قابل پرداخت | Gravity Forms/SRWF | `NET_PAYABLE_AMOUNT`; runtime ID unbound | Use authoritative system-derived value; do not recompute in presentation layer | EV-HTML, EV-SRWF-SFC | UNBOUND | Blank until target binding. |
| PB-13 | `discount_title` / عنوان تخفیف | Gravity Forms/SRWF | `DISCOUNT_TITLE`; runtime ID unbound | Direct only after binding | EV-HTML, EV-SRWF-SFC | UNBOUND | Blank until target binding. |
| PB-14 | معرف / ارجاع‌دهنده | Unknown | No authoritative source found | None | EV-PDF, EV-HTML, EV-SRWF-SFC | UNBOUND | Blank/manual. |
| PB-15 | وضعیت سابق کانونی/غیرکانونی | Unknown | No authoritative source found | No default | EV-PDF, EV-HTML, EV-SRWF-SFC | UNBOUND | Both options blank/manual. |
| PB-16 | تعداد آزمون | Unknown | No authoritative source found | No derivation from registration counter | EV-PDF, EV-HTML, EV-SRWF-SFC | UNBOUND | Blank/manual. |
| PB-17 | تاریخ اولین آزمون | Unknown | No authoritative source found | No fallback to entry-created or financial date | EV-PDF, EV-HTML, EV-SRWF-SFC | UNBOUND | Blank/manual. |

### Canonical manual-only Back/Front structure

Stamp/signature areas, sequential approval/signature regions, management/final approval, manual notes, and other historical handwriting space remain structurally present. No admitted evidence authorizes GPP to invent digital signatures, approval names, stamps, or synthetic values for these regions. The Front and Back remain exactly two A4 portrait pages; these manual regions are not space-recovery targets.

## 9. Asset binding inventory

| ID | Asset | Evidence | Provenance | State | Consequence |
| --- | --- | --- | --- | --- | --- |
| AS-01 | Approved Razavi Complex mark | WU15 requires an approved mark. Bundle contains no standalone approved logo file; reference HTML/PDF uses a labeled placeholder and explicitly is not production artwork. No matching asset was found in exact GPP or supporting SRWF ref. | EV-GPP-BASE, EV-HTML, EV-PDF; exact GPP/SRWF tree inspection | NOT_PROVEN | Blocks WU19 header asset binding and makes AC-WU16-007 unsatisfied. Do not fabricate. |
| AS-02 | Approved Kanoon mark | Same condition: required by WU15, but no admitted production asset identity/bytes were found; reference uses placeholder. | EV-GPP-BASE, EV-HTML, EV-PDF; exact GPP/SRWF tree inspection | NOT_PROVEN | Blocks WU19 header asset binding and makes AC-WU16-007 unsatisfied. Do not fabricate. |
| AS-03 | Student photo/media | SRWF semantic source is `STUDENT_PHOTO`; accepted file semantics are known. Actual target runtime field ID, file representation/access URL and GP File Upload Pro exact target version/settings are unbound. | EV-SRWF-SFC, EV-SRWF-ENV, EV-SRWF-ACL | UNBOUND | WU17/WU18 media binding blocked; use only a neutral presentation fallback when no authoritative photo exists. |
| AS-04 | Vazir delivery source | Project Contract designates `rezahh107/Vazir@ad8feae35a4e1c27fb13d646fa18abf05bb4e7b1` as target font-delivery authority. At that ref plugin `Vazir Font for WordPress` is v1.3.0; loader generates self-hosted `@font-face` for family `Vazir` from bundled `vazir-{300,400,500,700,900}.woff2`. | EV-PROJECT, EV-VAZIR | PROVEN_SOURCE_AUTHORITY | Use existing self-hosted Vazir delivery; no synthetic 600, Vazirmatn substitution, copied font files into GPP, or public CDN. Exact target option read-back remains runtime validation work. |

The final reference's labeled logo placeholders are useful only to confirm **placement**. They are not approved production artwork. The absence of the two approved logo byte identities is a positive WU16 finding and must not be papered over by tracing, recreation, web download, or another logo variant.

## 10. Print utility access/timing evidence

The print affordance is a presentation utility/output, never a Gravity Flow step, action, transition, assignment mechanism, or authorization path. Project access policy requires every Entry URL/action to remain under authenticated WordPress + native Gravity Flow assignment/capability checks.

What is proven:

- print must be reachable only from an already-authorized native Entry Detail context;
- invoking print must not broaden Entry visibility or mutate workflow state;
- browser HTML/CSS print is the locked V1 output path; no mandatory PDF engine is introduced.

What is `NOT_PROVEN` for the target:

- the exact front-end/admin Entry route used in production;
- the safe native insertion point for a print affordance;
- whether the print affordance should be visible on every authorized step or only a subset;
- exact target lifecycle behavior during refresh/navigation/action submission.

**Localized blocker:** WU19 may implement print document composition independently, but it may not expose the production print trigger on a real Entry until target route/authorization/insertion timing has authentic evidence. A print URL must not become a parallel Entry-reader endpoint.

## 11. Downstream evidence impact summary

### WU17 — Inbox

Safe design facts: native Inbox ownership; two cards desktop / one mobile; locked card hierarchy; no fake Due; no School filter without target exposure; native search is the only acceptable search direction. Locally blocked: exact route/markup/selectors, target field extraction, photo binding, current-step extraction, and visible search activation until target Gravity Flow version/configuration proves native search.

### WU18 — Entry Detail

Safe design facts: one continuous dossier; locked section order; read-only label/value visual treatment; exact task heading; host-owned actions; secondary history placement. Locally blocked: every positive per-field runtime availability/editability classification, exact target region/selector mapping, media/file representation, action availability, timeline visibility, and target route/configuration.

### WU19 — Direct A4 print

Safe design facts: direct browser print; exactly two A4 portrait pages; Front/Back anatomy; 5 receipt + 6 cheque rows; blank-on-unbound; no inferred Back date/Phone 2/options. Locally blocked: approved Razavi and Kanoon production asset identities; most dynamic print field IDs; cheque child-form row model; print-trigger insertion/access timing. WU19 must not fabricate the missing logos or populate unbound regions.

This section is a routing aid only and does not authorize successor implementation.

## 12. Acceptance-criterion evaluation

| Acceptance criterion | Outcome | Reason | Evidence |
| --- | --- | --- | --- |
| AC-WU16-001 | PASS | No selector/DOM/hook/lifecycle is promoted to target production use. Current first-party hooks are explicitly reference-only until exact target version/config evidence exists. | Adapter ledger §§4–5; EV-SRWF-ENV/MAP, EV-FLOW-* |
| AC-WU16-002 | UNSATISFIED / BLOCKING | All canonical screen items are enumerated, but authentic target form/field IDs, step configuration and per-user field display/editability evidence are absent. Therefore the required positive available/read-only/editable/absent classification cannot be established for every canonical Entry item. | Screen matrix §6; EV-SRWF-MAP is UNBOUND; EV-SRWF-ENV exact GF/Flow versions absent |
| AC-WU16-003 | PASS | School exposure through target Inbox is not proven; successor must omit School filter and may not create replacement data/search path. | IN-07; adapter ledger School row |
| AC-WU16-004 | PASS | No authoritative material Due binding exists; Due/overdue UI/filter/sort is disabled/omitted without treating absence as a defect. | IN-06; adapter ledger Due row |
| AC-WU16-005 | PASS | All six locked option groups are explicitly covered; every unbound/not-proven group stays blank and no defaults/fallbacks are allowed. | PF-13..PF-18 |
| AC-WU16-006 | PASS | Back financial date has no dedicated source and is locked blank; Phone 2 has no dedicated source and is locked blank. Entry-created date and father/mother fallback are explicitly prohibited. | PB-01; PF-12 |
| AC-WU16-007 | UNSATISFIED / BLOCKING | Vazir source is positively identified, but neither approved Razavi nor approved Kanoon production asset bytes/identity are present in the admitted evidence. Placeholder artwork cannot satisfy the requirement. | Asset inventory AS-01..AS-04 |
| AC-WU16-008 | PASS | Every unresolved host seam is marked NOT_PROVEN/UNBOUND with a local downstream consequence; no guess is promoted. | §§4–10 |
| AC-WU16-009 | PASS WITH LOCALIZED SUCCESSOR BLOCKER | Current first-party Gravity Flow evidence identifies native Global Inbox Search as a host mechanism (documented as of Flow 2.8), but target Flow version/config is unknown. WU17 search binding is therefore locally blocked until target support is confirmed; replacement search and silent removal are forbidden. | Adapter ledger Inbox search rows; EV-FLOW-INBOX, EV-SRWF-ENV |

### WU16 disposition from blocking criteria

Two blocking criteria require positive evidence that is not present in the admitted corpus:

1. **AC-WU16-002** — authentic target evidence is insufficient to classify every canonical Entry field/item as available/read-only/editable/absent.
2. **AC-WU16-007** — approved Razavi and Kanoon production logo assets cannot be identified; only placement placeholders exist. Vazir delivery authority/source is identified correctly.

Therefore the truthful WU16 execution disposition is **`BLOCKED`**, without widening scope or inventing target state. Other `UNBOUND`/`NOT_PROVEN` rows are localized successor constraints and do not independently convert the Run to failure.

## 13. Minimum outside evidence needed to clear the blockers

This is not successor planning; it is the bounded evidence required to satisfy the two unsatisfied WU16 criteria:

- a sanitized authentic target capture/read-back tied to exact Gravity Forms + Gravity Flow versions/configuration that binds the actual form, field IDs, Registration Officer step, displayed/editable field configuration, relevant Entry Detail regions/actions, and route/embed context sufficiently to classify each canonical Entry item; and
- approved Razavi Complex and Kanoon logo asset identities/bytes from an owner-authorized source, with durable provenance suitable for WU19 binding.

No repository runtime change, new field, alternate logo, alternate search engine, or new authorization mechanism is an acceptable substitute.

## 14. Scope and privacy audit

- No production PHP/CSS/JS/runtime implementation is added by WU16.
- No Gravity Forms/Gravity Flow behavior, workflow, search, validation, navigation, assignment, authorization, or upload semantics are changed.
- No SRWF or Vazir repository is modified.
- No real student/customer/payment PII, credentials, tokens, private runtime HTML, or uploaded documents are retained here.
- Shared Defaults Per Surface remains unchanged; the reserved extension seam remains inert.
- No merge or release readiness is claimed.
