# SRWF Gravity Flow / Data / Asset Binding Evidence Matrix v1.0.0

```yaml
document_id: GPP-SRWF-GRAVITY-FLOW-DATA-ASSET-BINDING-MATRIX
document_version: 1.0.0
status: WU16_CURRENT_DEFINITION_RECONCILED__AC001_011_PASS
project_id: GPP-SRWF-REGISTRATION-IMPLEMENTATION-V1
work_unit_id: WU-GPP-GF-BINDING-MATRIX-16
run_id: RUN-GPP-GF-BINDING-MATRIX-16-002
repository_base: main@a4e50d6fde38bf29462fcd14a3a2e31612829ccd
repair_start_head: 056ea304acda609d8b8cd0548b659c864d61563e
evidence_cutoff: 2026-09-11
runtime_implementation: NONE
successor_work: NOT_AUTHORIZED_BY_THIS_DOCUMENT
```

## 1. Purpose, authority, and reconciliation boundary

This WU16 artifact is the evidence/binding contract for the owner-locked SRWF Gravity Flow Inbox, Entry Detail, and two-page A4 dossier baseline. It records portable semantic slots, a target-environment binding ledger, runtime-evidence dimensions, host-capability evidence, print mappings, approved asset identities, and localized successor blockers. It does **not** implement WU9, WU10, WU17, WU18, WU19, or WU20 and does not alter Gravity Forms/Gravity Flow behavior, workflow, assignment, authorization, actions, validation, search, data storage, upload behavior, or print rendering.

Run001 remains historical evidence. Run002 repairs only the current WU16 acceptance interpretation after admission of `HANDOFF-GPP-SEMANTIC-BINDING-ARCHITECTURE-20260911-01`. In particular, missing installation-specific Form/Field/Step/Page/route identifiers are no longer treated as a generic architecture defect. They remain environment binding evidence and may truthfully be `UNBOUND` or `NOT_PROVEN` while the portable semantic-binding contract itself passes.

The controlling ownership rule is unchanged:

```text
Gravity Forms owns entry data and field lifecycle.
Gravity Flow owns workflow, assignment, Inbox, Entry Detail, actions, and authorization.
Gravity Presentation Profiles owns only admitted deterministic presentation.
```

### Canonical binding-state vocabulary

Every target binding row in this document uses exactly one state:

- `PROVEN` — evidence establishes the exact bounded target claim represented by that row.
- `UNBOUND` — a stable semantic concept/source family is known, but the concrete target environment binding is not yet supplied.
- `NOT_PROVEN` — evidence is insufficient to claim the target capability, runtime source path, availability, editability, authorization, lifecycle, or adapter seam.
- `NOT_APPLICABLE` — the concept intentionally has no digital source binding in this contract, for example a manual paper signature/stamp region.

`PROVEN` source binding is never permission. Semantic source binding, runtime availability, editability, authorization, workflow-action availability, and visual-profile resolution are separate dimensions.

## 2. Evidence registry

| ID | Evidence | Exact identity / provenance | Use in WU16 |
| --- | --- | --- | --- |
| EV-GPP-BASE | GPP repository authority | `rezahh107/Gravity-Presentation-Profiles main@a4e50d6fde38bf29462fcd14a3a2e31612829ccd`; `AGENTS.md`, Mother Architecture, WU15 visual baseline | Repository/process + presentation ownership |
| EV-PROJECT-R3 | Current Project Contract | revision `3`; raw SHA-256 `0735002d658841c37141d206b4245ad044199341cc5ddded81740417fb030949` | Current execution/design constraints |
| EV-SEMANTIC-HANDOFF | Current semantic-binding authority | `HANDOFF-GPP-SEMANTIC-BINDING-ARCHITECTURE-20260911-01`; canonical artifact SHA-256 `eb46c6828183fe91424520085e3d5d0c95912d4c40f90325eedbbc0da6a69e1a` | Supersedes Run001 acceptance interpretation |
| EV-VISUAL-HANDOFF | Locked visual/print authority | `HANDOFF-GPP-GF-FINAL-VISUAL-A4-20260910-02`; canonical artifact SHA-256 `57e045457776187ee572b312e675fe4b7384b95391de4e7731407151a36a4aae` | Six-surface/A4 outcome remains locked |
| EV-HTML | Locked HTML visual reference identity | 115728 bytes; SHA-256 `666704ac25b019ae59406974a223d10cace3f90e96f9d55312730ae93af09c81` | Appearance/behavior reference only |
| EV-PDF | Locked print reference identity | 321990 bytes; SHA-256 `34d9b4e137667ca103d5c6e7752f7148f0c92e36f0f1d182d7d87a890c55fec5`; exactly two A4 portrait pages | Print composition reference only |
| EV-SRWF-SFC | SRWF semantic field authority | `rezahh107/SRWF@755cab5a0743df1ded2f237c5f76a46eaa6fb758:docs/contracts/SEMANTIC_FIELD_CONTRACT.yaml` | Stable project semantics; concrete runtime IDs remain unbound |
| EV-SRWF-ENV | SRWF environment state | same ref: `docs/contracts/ENVIRONMENT_MANIFEST.md` | Exact GF/Flow target versions remain not proven |
| EV-SRWF-MAP | SRWF implementation mapping | same ref: `docs/contracts/IMPLEMENTATION_MAPPING.yaml` | Form/field/step/route IDs remain unbound |
| EV-SRWF-WF | SRWF workflow authority | same ref: `docs/contracts/WORKFLOW_CONTRACT.md` | Native Flow ownership; exact target step identity unbound |
| EV-SRWF-ACL | SRWF access-control authority | same ref: `docs/contracts/ACCESS_CONTROL_CONTRACT.md` | Authorization intent; runtime permission read-back still separate |
| EV-VAZIR | Vazir source authority | `rezahh107/Vazir@ad8feae35a4e1c27fb13d646fa18abf05bb4e7b1` | Self-hosted family `Vazir`, admitted weights `300/400/500/700/900` |
| EV-RAZAVI-ASSET | Approved Razavi Complex production mark | Drive file ID `1XYd7aCxgA0-XZvhNB1XCYt9l8V3Yofqm`; `image/png`; 963759 bytes; 1446×1088; SHA-256 `9f7f09caf805e370ece47cb881fa3e2b5b196af59445691ef371d9335c242e45`; bundled bytes independently hash/dimension verified in Run002 | Exact production asset identity |
| EV-KANOON-ASSET | Approved Kanoon production mark | Drive file ID `1GueFdF007kmkhOao35Ukehspwzf48vSh`; `image/vnd.adobe.photoshop`; PSD v1, 8-bit CMYK; 800582 bytes; 624×926; SHA-256 `cda4c4114631c4d9229edb1e5392a0e401126d8a6ae6651966c2c0d946a33c6f`; bundled bytes independently hash/metadata verified in Run002 | Exact production asset identity |
| EV-FLOW-INBOX | Current Gravity Flow Inbox documentation | `https://docs.gravityflow.io/the-inbox-page/`; current first-party documentation describes Global Inbox Search, filters, sorting, paging, live refresh, and native Entry Details navigation; target version/configuration still separate | General native-host capability evidence |
| EV-FLOW-ENTRY | Current Gravity Flow Entry Details documentation | `https://docs.gravityflow.io/the-entry-details-page/`; current first-party documentation describes Instructions, Entry Field/Values, Timeline, Workflow Status, Admin Actions, Backlink and configured editability | General native-host capability evidence |
| EV-FLOW-SEARCH-HOOK | Current first-party developer documentation | `https://docs.gravityflow.io/gravityflow_inbox_search_criteria/` | Reference-only extension-point evidence; not target production approval |

General current first-party documentation may prove that a host capability exists in current Gravity Flow, but it does not by itself prove the exact installed target version/configuration or make a production selector/hook/API safe for the target.

## 3. Architecture lock: two independent resolution axes

### Visual-profile resolution — V1 surface-only

The active visual profile is resolved **only by admitted surface**:

```text
gravity_flow.inbox        -> one shared default Inbox visual profile
gravity_flow.entry_detail -> one shared default Entry Detail visual profile
print.dossier             -> one shared default Print visual profile
```

Visual-profile identity does not contain or derive from `form_id`, `field_id`, `step_id`, `page_id`, route/embed identity, user identity, or role identity. Environment binding IDs do not participate in profile selection.

### Semantic-binding resolution — environment/context-specific

A stable semantic slot used by the shared profile is resolved through a separately identified/versioned environment binding set selected from **host-reported installation/form/entry context**. A binding set may contain concrete host identifiers once authentic environment evidence exists, but those identifiers remain environment configuration/evidence only.

Conceptually:

```yaml
binding_set:
  identity: <versioned environment binding-set id>
  context:
    installation: <host-reported environment identity>
    originating_form: <host-reported form identity>
  bindings:
    <stable semantic slot>:
      source_type: <typed host-owned source family>
      source_identity: <environment identifier or null>
      state: PROVEN|UNBOUND|NOT_PROVEN|NOT_APPLICABLE
      evidence_refs: []
```

This is declarative evidence/configuration, not executable configuration and not a second visual-profile system.

## 4. Canonical semantic-slot inventory and target SRWF binding-set ledger

The `slot_key` values below are portable identifiers. None is a form-specific visual profile. `Target source descriptor` may identify a known SRWF semantic authority while still leaving the concrete target runtime identifier unbound.

| slot_key | Used by | Generic meaning | Owner / source class | Target source descriptor | Target binding state | Evidence / rule |
| --- | --- | --- | --- | --- | --- | --- |
| `student.photo` | Inbox, Entry Detail | authoritative student image/media | Gravity Forms field/media lifecycle; GP File Upload Pro behavior | SRWF `STUDENT_PHOTO`; concrete field/media representation not bound | `UNBOUND` | EV-SRWF-SFC/ENV/ACL |
| `student.first_name` | Entry Detail, Print | student given name | Gravity Forms field | SRWF `STUDENT_FIRST_NAME`; concrete field ID unbound | `UNBOUND` | EV-SRWF-SFC/MAP |
| `student.last_name` | Entry Detail, Print | student family name | Gravity Forms field | SRWF `STUDENT_LAST_NAME`; concrete field ID unbound | `UNBOUND` | EV-SRWF-SFC/MAP |
| `student.full_name` | Inbox, Entry Detail, Print | presentation composition of authoritative first + last name | presentation derivation from two canonical slots | `student.first_name` + `student.last_name`; components unbound | `UNBOUND` | no demo/sample JSON authority |
| `student.father_name` | Entry Detail, Print | father name | Gravity Forms field | SRWF `STUDENT_FATHER_NAME`; concrete field ID unbound | `UNBOUND` | EV-SRWF-SFC |
| `student.national_id` | Inbox, Entry Detail, Print | canonical national ID | Gravity Forms field | SRWF `STUDENT_NATIONAL_ID`; concrete field ID unbound | `UNBOUND` | preserve leading zero; no alternate source |
| `student.birth_date_jalali` | Entry Detail | canonical Jalali date of birth | Gravity Forms/PersianGravity-rendered field | SRWF `DATE_OF_BIRTH_JALALI`; concrete target read-back unbound | `UNBOUND` | EV-SRWF-SFC |
| `student.gender` | Entry Detail, Print option | canonical gender value | Gravity Forms field | SRWF `STUDENT_GENDER`; concrete field ID unbound | `UNBOUND` | option values known semantically; target source ID unbound |
| `student.mobile` | Entry Detail, Print | student mobile | Gravity Forms field | SRWF `STUDENT_MOBILE`; concrete field ID unbound | `UNBOUND` | EV-SRWF-SFC |
| `student.home_phone` | Entry Detail | home phone | Gravity Forms field | SRWF `HOME_PHONE`; concrete field ID unbound | `UNBOUND` | EV-SRWF-SFC |
| `student.father_mobile` | Entry Detail | father/contact-1 mobile | Gravity Forms field | SRWF `CONTACT1_MOBILE` + fixed relationship `CONTACT1_RELATIONSHIP=پدر`; concrete IDs unbound | `UNBOUND` | no use as historical Phone 2 fallback |
| `student.mother_mobile` | Entry Detail | mother/contact-2 mobile | Gravity Forms field | SRWF `CONTACT2_MOBILE` + fixed relationship `CONTACT2_RELATIONSHIP=مادر`; concrete IDs unbound | `UNBOUND` | no use as historical Phone 2 fallback |
| `education.level` | Entry Detail | human-readable education level | Gravity Forms field | SRWF `EDUCATION_LEVEL`; concrete field ID unbound | `UNBOUND` | EV-SRWF-SFC |
| `education.grade_group` | Inbox, Entry Detail, Print | human-readable grade/group selection | Gravity Forms field | SRWF `GRADE_GROUP_SELECTION`; `GROUP_CODE` is not display text; concrete field ID unbound | `UNBOUND` | EV-SRWF-SFC |
| `education.graduation_status` | Entry Detail, Print option | student vs graduate status | Gravity Forms field | SRWF `GRADUATION_STATUS`; concrete field ID unbound | `UNBOUND` | explicit option mapping only after binding |
| `school.name` | Inbox, Entry Detail, Print | authoritative school display name | Gravity Forms derived/source fields | SRWF `SCHOOL_NAME` derived from `SCHOOL_CODE`/Other path; concrete IDs and Inbox exposure unbound | `UNBOUND` | School filter remains disabled until target Inbox path is PROVEN |
| `registration.center` | Entry Detail/Print option | registration center/location | Gravity Forms field | SRWF `REGISTRATION_CENTER`; concrete field ID unbound | `UNBOUND` | semantic values 0/1/2 known; no missing-value default |
| `registration.counter` | Print | registration counter | Gravity Forms field written by governed import path | SRWF `REGISTRATION_COUNTER`; concrete field ID unbound | `UNBOUND` | no derivation from other counters |
| `entry.created_at` | Inbox, Entry Detail | canonical Entry creation timestamp | Gravity Forms Entry metadata | current first-party key `date_created`; exact target adapter/version evidence not captured | `NOT_PROVEN` | do not reuse as Back financial date |
| `workflow.current_step` | Inbox, Entry Detail | current host workflow step/state label | Gravity Flow workflow state | host-owned current step; exact target step/runtime extraction seam not proven | `NOT_PROVEN` | EV-SRWF-WF/MAP |
| `workflow.due_at` | Inbox | optional authoritative material Due value | Gravity Flow/project Due source only if real | no admitted SRWF Due binding/configuration | `UNBOUND` | no Due UI/filter/sort while unresolved |
| `workflow.instructions` | Entry Detail | current-task instructions region | Gravity Flow step Instructions | target step/config/region binding not proven | `NOT_PROVEN` | visual title does not create host instructions |
| `workflow.approve_action` | Entry Detail | native Approval action availability | Gravity Flow action | exact target step/action availability not proven | `NOT_PROVEN` | source binding never grants action permission |
| `workflow.reject_action` | Entry Detail | native Reject action availability where configured | Gravity Flow action | exact target step/action availability not proven | `NOT_PROVEN` | do not infer from mockup |
| `workflow.timeline` | Entry Detail | chronological workflow history | Gravity Flow Timeline | target visibility/configuration not proven | `NOT_PROVEN` | EV-FLOW-ENTRY |
| `workflow.status` | Entry Detail | workflow status/current-step metadata | Gravity Flow Workflow Status | target display/configuration not proven | `NOT_PROVEN` | no fake status |
| `navigation.backlink` | Entry Detail | native return navigation | Gravity Flow Backlink | target route/embed/backlink configuration not proven | `NOT_PROVEN` | no custom authorization bypass |
| `documents.report_card` | Entry Detail | authoritative report-card file | Gravity Forms file field | SRWF `REPORT_CARD_FILE`; concrete field/file URL/access path unbound | `UNBOUND` | EV-SRWF-SFC/ACL |
| `review.status` | Entry Detail | entry review overlay status, not Flow state | Gravity Forms field | SRWF `REVIEW_STATUS`; concrete field ID unbound | `UNBOUND` | do not convert into workflow state |
| `review.reason` | Entry Detail | review overlay reason | Gravity Forms field | SRWF `REVIEW_REASON`; concrete field ID unbound | `UNBOUND` | conditional semantic known; runtime display/editability separate |
| `finance.status` | Entry Detail | finance-status field | Gravity Forms field | SRWF `FINANCE_STATUS`; concrete field ID unbound | `UNBOUND` | does not broaden Accountant visibility |
| `finance.tuition_amount` | Entry Detail, Print | tuition amount in Rial | Gravity Forms field | SRWF `TUITION_AMOUNT`; concrete field ID unbound | `UNBOUND` | presentation layer does not invent amount |
| `finance.discount_amount` | Entry Detail, Print | discount amount in Rial | Gravity Forms field | SRWF `DISCOUNT_AMOUNT`; concrete field ID unbound | `UNBOUND` | EV-SRWF-SFC |
| `finance.discount_title` | Entry Detail, Print | discount title | Gravity Forms field | SRWF `DISCOUNT_TITLE`; concrete field ID unbound | `UNBOUND` | EV-SRWF-SFC |
| `finance.net_payable_amount` | Entry Detail, Print | authoritative system-derived net payable | Gravity Forms field/system derivation | SRWF `NET_PAYABLE_AMOUNT`; concrete field ID unbound | `UNBOUND` | GPP must not recompute business value |
| `print.academic_year_start` | Print Front | historical academic-year start | distinct historical print semantic | no authoritative target source admitted | `UNBOUND` | independent from grade |
| `print.academic_year_end` | Print Front | historical academic-year end | distinct historical print semantic | no authoritative target source admitted | `UNBOUND` | independent from grade |
| `print.sub_office` | Print Front | historical satellite-office/city field | distinct historical print semantic | no authoritative target source admitted | `UNBOUND` | blank/manual |
| `print.first_exam_date` | Print Front/Back | historical first-exam date | distinct historical print semantic | no authoritative target source admitted | `UNBOUND` | never fallback to Entry creation/financial date |
| `print.phone_2` | Print Front | historical Phone 2 field | distinct historical print semantic | no dedicated target binding; father/mother fallback forbidden | `UNBOUND` | AC-WU16-006 fail-closed |
| `print.registration_type` | Print Front option | historical registration-type group | distinct historical print semantic | no authoritative matching SRWF source | `UNBOUND` | all options blank |
| `print.registration_timing` | Print Front option | historical early/continue timing group | distinct historical print semantic | no authoritative matching SRWF source | `UNBOUND` | all options blank |
| `print.payment_mode` | Print Front option | historical cash/installment group | distinct historical print semantic | no authoritative matching SRWF source | `UNBOUND` | do not infer from finance/cheque presence |
| `print.financial_date` | Print Back | dedicated financial Back date | distinct historical financial semantic | no authoritative target source admitted | `UNBOUND` | never derive from `entry.created_at` |
| `print.receipt_rows` | Print Back | exactly five receipt/deposit rows | historical financial row set | no admitted digital receipt-row model/binding | `UNBOUND` | all five remain blank/manual |
| `print.cheque_rows` | Print Back | exactly six cheque/installment rows | child-form/financial source only if complete | GP Nested Forms child-form candidate remains selected POC not proven; manual field inventory incomplete | `NOT_PROVEN` | do not partially bind amount/date while row model incomplete |
| `print.received_amount_words` | Print Back | received amount in words | distinct historical financial semantic | no authoritative source/approved conversion binding | `UNBOUND` | do not derive from unbound rows |
| `print.received_amount_number` | Print Back | received amount numeric total | distinct historical financial semantic | no authoritative total source | `UNBOUND` | do not compute an unapproved total |
| `print.referrer` | Print Back | referrer/introduction field | distinct historical print semantic | no authoritative source | `UNBOUND` | blank/manual |
| `print.former_kanoon_status` | Print Back | historical Kanoon/non-Kanoon status | distinct historical print semantic | no authoritative source | `UNBOUND` | both options blank/manual |
| `print.exam_count` | Print Back | exam count | distinct historical print semantic | no authoritative source | `UNBOUND` | no derivation from registration counter |
| `print.manual_approval_signature_stamp_notes` | Print Front/Back | handwriting, stamp, signature, sequential approvals, final approval, manual notes | intentional physical/manual region | no digital source is required by WU16 | `NOT_APPLICABLE` | remain physically usable; do not synthesize names/signatures/stamps |
| `print.utility` | Entry Detail -> Print | presentation affordance to invoke authorized browser print | GPP presentation utility over native authorized Entry Detail | exact target insertion point/timing/route integration not proven | `NOT_PROVEN` | no parallel Entry reader or authorization path |

### Binding-state summary

The target SRWF binding set is intentionally incomplete at the environment-ID level. That is valid under the current architecture: semantic definitions are portable, unresolved target source identities remain explicit, and only dependent successor behavior is blocked. No row above uses a concrete target identifier as a visual-profile identity.

## 5. Binding-set selection and multi-form Inbox fixture

### Deterministic selection rule

1. Resolve the visual profile from the admitted surface only.
2. Ask the host for the current installation/entry/originating-form context.
3. Select the environment binding set matching that host-reported context.
4. Resolve each requested semantic slot from that binding set.
5. If the binding set or slot is missing/`UNBOUND`/`NOT_PROVEN`, fail closed for **that dependent slot/behavior only**.
6. Never switch, synthesize, or select another visual profile because a binding is missing.

### Synthetic non-PII multi-form fixture

The identifiers below are synthetic fixture labels, not target runtime IDs.

| Inbox row | Host-reported originating context | Selected binding set | `student.full_name` | `school.name` | Visual profile |
| --- | --- | --- | --- | --- | --- |
| `fixture-entry-A` | `fixture-installation / fixture-form-A` | `fixture-bindings-A-v1` | resolves from A-specific first/last source descriptors | resolves from A-specific school source descriptor | shared default for `gravity_flow.inbox` |
| `fixture-entry-B` | `fixture-installation / fixture-form-B` | `fixture-bindings-B-v1` | resolves from B-specific first/last source descriptors | `UNBOUND` -> School-dependent filter/presentation omitted for this row/context | shared default for `gravity_flow.inbox` |
| `fixture-entry-C` | `fixture-installation / fixture-form-C` | no matching binding set | unresolved -> only admitted local fallback/omission is allowed | unresolved | shared default for `gravity_flow.inbox` |

All three rows keep identical Inbox hierarchy/composition rules. Binding-set selection is data-source resolution only; it never changes the visual profile.

## 6. Runtime availability / editability / authorization matrix

This matrix intentionally does **not** duplicate binding state. It answers separate host-runtime questions. No visual appearance or semantic binding is treated as permission evidence.

| Runtime subject | Source binding dimension | Available in target surface? | Editable in target? | Authorized for current user/step? | Evidence consequence |
| --- | --- | --- | --- | --- | --- |
| `student.*`, `education.*`, `school.name` Entry values | mostly `UNBOUND` target field identities | `NOT_PROVEN` | `NOT_PROVEN` | `NOT_PROVEN` | requires authentic target form/step/display configuration before WU18 positive claims |
| `documents.report_card`, `student.photo` media | `UNBOUND` target field/media identities | `NOT_PROVEN` | `NOT_PROVEN` | `NOT_PROVEN` | file/media access path and current-user access require target evidence |
| `review.*` | `UNBOUND` target fields | `NOT_PROVEN` | `NOT_PROVEN` | `NOT_PROVEN` | project semantics do not prove current host exposure/editability |
| `finance.*` | `UNBOUND` target fields | `NOT_PROVEN` | `NOT_PROVEN` | `NOT_PROVEN` | do not broaden Registration Officer/Accountant visibility from presentation |
| `workflow.instructions` | Flow region `NOT_PROVEN` for target | `NOT_PROVEN` | `NOT_APPLICABLE` | `NOT_PROVEN` | visual current-task card waits for native region evidence |
| `workflow.approve_action` | Flow action `NOT_PROVEN` for target | `NOT_PROVEN` | `NOT_APPLICABLE` | `NOT_PROVEN` | never synthesize or grant Approve |
| `workflow.reject_action` | Flow action `NOT_PROVEN` for target | `NOT_PROVEN` | `NOT_APPLICABLE` | `NOT_PROVEN` | locked visual treatment does not prove configured Reject |
| `workflow.timeline` | Flow region `NOT_PROVEN` for target | `NOT_PROVEN` | `NOT_APPLICABLE` | `NOT_PROVEN` | timeline section waits for authentic visibility/configuration evidence |
| `workflow.status` | Flow region `NOT_PROVEN` for target | `NOT_PROVEN` | `NOT_APPLICABLE` | `NOT_PROVEN` | no fake status labels |
| `navigation.backlink` | Flow region `NOT_PROVEN` for target | `NOT_PROVEN` | `NOT_APPLICABLE` | `NOT_PROVEN` | native navigation only |
| `print.utility` | GPP utility `NOT_PROVEN` insertion/timing | `NOT_PROVEN` | `NOT_APPLICABLE` | inherits native Entry authorization; exact target exposure remains `NOT_PROVEN` | must never create a parallel entry-reader path |

Project-level SRWF `officer_visibility` / `officer_editability` intent is useful semantic policy evidence but is not substituted for authentic target runtime display/editability/authorization read-back.

## 7. Gravity Forms / Gravity Flow adapter, version, and configuration evidence

| Area | Evidence | Target state | Production consequence |
| --- | --- | --- | --- |
| Exact Gravity Forms version | SRWF environment manifest still requires read-back | `NOT_PROVEN` | no version-sensitive adapter claim |
| Exact Gravity Flow version | SRWF environment manifest still requires read-back | `NOT_PROVEN` | no target DOM/hook/lifecycle promotion |
| Registration form ID / field IDs | SRWF implementation mapping is unbound | `UNBOUND` | allowed as future environment binding identifiers only; not profile identity |
| Registration Officer step ID | SRWF implementation mapping is unbound | `UNBOUND` | action/editability claims remain target-runtime work |
| Inbox route/page/embed identity | SRWF implementation mapping is unbound | `UNBOUND` | route-specific selectors/integration remain successor-local blockers |
| Entry Detail route/page/embed identity | SRWF implementation mapping is unbound | `UNBOUND` | same |
| Native Inbox ownership | locked project/workflow authority | `PROVEN` | no replacement queue/Desk |
| Native Entry Detail ownership | locked project/workflow authority | `PROVEN` | no replacement dossier data/application |
| Global Inbox Search capability | current first-party Gravity Flow Inbox documentation | `PROVEN` as an admitted **general native mechanism**; exact target activation/config still `NOT_PROVEN` | WU17 may only bind search after target confirmation; no replacement engine |
| Inbox paging/filter/sort/live-refresh capability | current first-party Gravity Flow Inbox documentation | `PROVEN` as general current capability; exact target configuration `NOT_PROVEN` | no custom polling/search/filter system |
| `gravityflow_inbox_search_criteria` | current first-party developer documentation | `NOT_PROVEN` for target production use | reference-only; do not use until exact target need/version/config is evidenced |
| Entry Instructions/Field Values/Timeline/Status/Backlink regions | current first-party Entry Details documentation | `PROVEN` as general current host concepts; exact target presence/config `NOT_PROVEN` | may guide evidence capture, not target selectors |
| Exact production CSS selectors / DOM relationships | no sanitized target DOM tied to exact target version/config | `NOT_PROVEN` | none are declared production-usable by WU16 |

No production Gravity Flow selector/hook/API/lifecycle point is approved merely because it is named in documentation. The generic semantic-binding contract does not require a specific DOM seam.

## 8. School, Due, and native Inbox Search decisions

### School

`school.name` is a stable semantic slot and the SRWF semantic source family is known, but the target field identity and its exposure through the target Inbox are `UNBOUND`/`NOT_PROVEN`. Therefore successor Inbox work **omits the School filter** until an admitted `PROVEN` host data path exposes the authoritative School value. No replacement data path, duplicate store, or visual-profile switch is authorized.

### Due

`workflow.due_at` is stable but currently `UNBOUND`; no authoritative material SRWF Due binding is admitted. Therefore there is no Due/overdue marker, filter, or sort. This is fail-closed target behavior and is not a visual-profile defect.

### Inbox Search

The locked visible search has an admitted native mechanism: current first-party Gravity Flow Inbox documentation describes **Global Inbox Search**. That satisfies the generic host-mechanism requirement without introducing a replacement search engine. Exact target Gravity Flow version/configuration and activation remain `NOT_PROVEN`, so WU17 has a **localized target-integration blocker** before it may positively bind/render production search. The locked search requirement is not deleted.

## 9. Print binding matrix — Front

Print reuses canonical semantic slots when meaning is the same. Distinct historical meanings use `print.*` slots. `UNBOUND`/`NOT_PROVEN` values remain digitally blank for manual completion.

| Region / key | Canonical slot | Explicit mapping / transform | Target state | Fail-closed rule |
| --- | --- | --- | --- | --- |
| counter | `registration.counter` | authoritative value only | `UNBOUND` | blank/manual |
| national ID | `student.national_id` | preserve canonical digits/leading zero; presentation may apply safe RTL/LTR handling | `UNBOUND` | blank/manual |
| full name | `student.full_name` | reuse canonical first+last composition | `UNBOUND` | blank/manual |
| father name | `student.father_name` | direct authoritative value | `UNBOUND` | blank/manual |
| grade/group | `education.grade_group` | human-readable value only; never `GROUP_CODE` as display text | `UNBOUND` | blank/manual |
| academic year start | `print.academic_year_start` | distinct historical semantic | `UNBOUND` | blank; never infer from grade |
| academic year end | `print.academic_year_end` | distinct historical semantic | `UNBOUND` | blank; never infer from grade |
| school | `school.name` | authoritative school display name only | `UNBOUND` | blank/manual |
| sub-office/city | `print.sub_office` | distinct historical semantic | `UNBOUND` | blank/manual |
| first exam date | `print.first_exam_date` | distinct historical semantic | `UNBOUND` | blank/manual |
| Phone 1 | `student.mobile` | canonical student mobile only after binding | `UNBOUND` | blank/manual |
| Phone 2 | `print.phone_2` | dedicated historical semantic only | `UNBOUND` | blank; **never father/mother fallback** |
| Gender `female` / `male` | `student.gender` | authoritative `0 -> female`, `1 -> male`; missing/unbound -> neither | `UNBOUND` | no default selection |
| Registration type `reg_normal/reg_school/reg_shaheed/reg_komite/reg_behzisti/reg_maskan` | `print.registration_type` | no authoritative matching target source | `UNBOUND` | all six blank |
| Registration timing `time_early/time_continue` | `print.registration_timing` | no authoritative matching target source | `UNBOUND` | both blank |
| Graduate status `graduated` | `education.graduation_status` | authoritative `0 -> checked`, `1 -> unchecked`; missing/unbound -> blank | `UNBOUND` | no default |
| Registration location `loc_central/loc_golestan/loc_sadra` | `registration.center` | authoritative `0 -> central`, `1 -> golestan`, `2 -> sadra`; missing/unbound -> none | `UNBOUND` | never default missing value to central |
| Payment mode `pay_cash/pay_installment` | `print.payment_mode` | no authoritative matching target source | `UNBOUND` | both blank; do not infer from finance/cheques |

## 10. Print binding matrix — Back

| Region / key | Canonical slot | Explicit mapping / transform | Target state | Fail-closed rule |
| --- | --- | --- | --- | --- |
| financial date | `print.financial_date` | dedicated authoritative semantic only | `UNBOUND` | blank; **never derive from `entry.created_at`** |
| full name | `student.full_name` | reuse same canonical slot/source as Entry Detail/Front | `UNBOUND` | blank/manual |
| father name | `student.father_name` | reuse canonical slot | `UNBOUND` | blank/manual |
| grade/group | `education.grade_group` | reuse canonical human-readable slot | `UNBOUND` | blank/manual |
| academic year | `print.academic_year_start` + `print.academic_year_end` | same distinct historical academic-year bindings used by Front | `UNBOUND` | blank; no grade inference |
| five receipt/deposit rows | `print.receipt_rows` | exactly five canonical rows; no synthetic rows/totals | `UNBOUND` | all five blank/manual |
| six cheque/installment rows | `print.cheque_rows` | exactly six canonical rows; complete row identity/account/bank model required before digital population | `NOT_PROVEN` | all six blank/manual; no partial amount/date binding |
| received amount in words | `print.received_amount_words` | no approved derivation/source | `UNBOUND` | blank/manual |
| received amount numeric | `print.received_amount_number` | no authoritative total source | `UNBOUND` | blank/manual |
| tuition | `finance.tuition_amount` | reuse canonical authoritative value only | `UNBOUND` | blank/manual |
| discount | `finance.discount_amount` | reuse canonical authoritative value only | `UNBOUND` | blank/manual |
| net payable | `finance.net_payable_amount` | reuse host/system-derived value; GPP does not recompute | `UNBOUND` | blank/manual |
| discount title | `finance.discount_title` | reuse canonical slot | `UNBOUND` | blank/manual |
| referrer | `print.referrer` | distinct historical semantic | `UNBOUND` | blank/manual |
| former Kanoon/non-Kanoon status | `print.former_kanoon_status` | distinct historical semantic | `UNBOUND` | all options blank |
| exam count | `print.exam_count` | distinct historical semantic | `UNBOUND` | blank; no counter fallback |
| first exam date | `print.first_exam_date` | reuse same distinct historical slot as Front | `UNBOUND` | blank; no date fallback |
| approvals/signatures/stamps/manual notes | `print.manual_approval_signature_stamp_notes` | intentionally manual physical regions | `NOT_APPLICABLE` | preserve usable paper space; never synthesize names/signatures/stamps |

The accepted A4 composition remains exactly two A4 portrait pages with one deterministic Front/Back boundary. This WU does not alter dimensions, visual anatomy, manual-region size, or browser-print strategy.

## 11. Asset binding inventory

| Asset | Exact approved source identity | Binding state | WU16 consequence |
| --- | --- | --- | --- |
| Razavi Complex production logo | Drive `1XYd7aCxgA0-XZvhNB1XCYt9l8V3Yofqm`; `image/png`; 963759 bytes; 1446×1088; SHA-256 `9f7f09caf805e370ece47cb881fa3e2b5b196af59445691ef371d9335c242e45` | `PROVEN` | successor Print may bind this exact approved identity; derivative/placement handling remains implementation work |
| Kanoon production logo | Drive `1GueFdF007kmkhOao35Ukehspwzf48vSh`; `image/vnd.adobe.photoshop`; PSD v1, 8-bit CMYK; 800582 bytes; 624×926; SHA-256 `cda4c4114631c4d9229edb1e5392a0e401126d8a6ae6651966c2c0d946a33c6f` | `PROVEN` | successor Print may bind this exact approved identity; WU16 does not convert the PSD or create derivatives |
| Student photo/media | SRWF `STUDENT_PHOTO`; concrete target field/file representation/access path unbound | `UNBOUND` | WU17/WU18 real-media binding remains locally blocked; illustrative portraits remain forbidden |
| Vazir delivery | `rezahh107/Vazir@ad8feae35a4e1c27fb13d646fa18abf05bb4e7b1`; self-hosted family `Vazir`, admitted weights `300/400/500/700/900` | `PROVEN` | no copied font bundle in GPP, no synthetic 600, no Vazirmatn substitution, no public CDN |

The approved logo bytes are evidence inputs; they are **not committed** by WU16. The old Run001 statement that only logo placeholders were available is historical and superseded for current WU16 truth by the exact approved identities above.

## 12. Print utility access/timing evidence

`print.utility` is presentation/output only. It is not a Flow step, action, transition, assignment mechanism, or authorization path.

Proven architecture rules:

- print is available only from an already-authorized native Entry Detail context;
- print must not broaden Entry visibility, assignment, action permission, or workflow state;
- output path remains direct browser HTML/CSS print, not a mandatory PDF engine.

Target properties still `NOT_PROVEN`:

- exact production Entry route/embed identity;
- safe target insertion point for the print affordance;
- exact lifecycle timing across navigation/live refresh/action submission;
- which authorized step/context should expose the affordance.

These are localized WU19 integration blockers only. They do not block the generic WU16 binding contract.

## 13. Localized successor impact summary

### WU17 — Inbox

Safe under current WU16 contract:
- one shared `gravity_flow.inbox` visual profile;
- per-entry binding-set selection from host-reported originating context;
- native Inbox ownership, paging and native search direction;
- no fake Due and no School filter without a proven target host path.

Locally blocked/omitted:
- exact target field extraction/media/current-step adapter paths remain `UNBOUND`/`NOT_PROVEN`;
- School filter is omitted until a `PROVEN` target Inbox School path exists;
- Due marker/filter/sort is omitted while `workflow.due_at` is unresolved;
- visible search production binding waits for exact target Gravity Flow version/config confirmation of the admitted native mechanism.

### WU18 — Entry Detail

Safe under current WU16 contract:
- one shared `gravity_flow.entry_detail` visual profile;
- stable semantic slots and locked section hierarchy;
- semantic binding never grants editability or authorization.

Locally blocked:
- positive runtime availability/editability/authorization for fields/actions;
- target region/selector mapping;
- media/file access representation;
- actual Approve/Reject action availability and Timeline/Status visibility.

### WU19 — Direct A4 print

Safe under current WU16 contract:
- one shared `print.dossier` visual profile;
- exact approved Razavi/Kanoon asset identities;
- exact two-page A4 anatomy;
- canonical slot reuse from Entry Detail where meanings match;
- blank-on-unbound/no-fallback rules including financial Back date and Phone 2.

Locally blocked:
- unresolved dynamic target field bindings;
- incomplete cheque child-form row model;
- exact print-trigger insertion/access timing;
- successor-owned derivative/placement handling for approved logo sources.

None of these localized successor blockers authorizes another visual profile or makes WU16 itself incomplete under the current acceptance definition.

## 14. Acceptance-criterion evaluation — current WU16 definition

| Acceptance criterion | Outcome | Evidence / reason |
| --- | --- | --- |
| `AC-WU16-001` | `PASS` | No production selector/hook/API/lifecycle point is marked target-usable without target evidence. General first-party host capabilities are separated from target production seams. |
| `AC-WU16-002` | `PASS` | Every canonical slot in §4 has a stable ID-independent definition and exactly one canonical target binding state; runtime availability/editability/authorization are separately evaluated in §6. Missing concrete IDs remain environment `UNBOUND`/`NOT_PROVEN`, not architecture failure. |
| `AC-WU16-003` | `PASS` | `school.name` exists as a semantic slot but target Inbox exposure is not proven; School filtering is explicitly omitted without replacement data path/profile switching. |
| `AC-WU16-004` | `PASS` | `workflow.due_at` is `UNBOUND`; no Due/overdue marker/filter/sort is enabled and the absence is not called a visual defect. |
| `AC-WU16-005` | `PASS` | §9 covers gender, registration type, registration timing, graduate status, registration location and payment mode with explicit mappings where semantic values exist and blank-on-unbound/no-default behavior otherwise. |
| `AC-WU16-006` | `PASS` | `print.financial_date` and `print.phone_2` are distinct `UNBOUND` slots; Entry day and father/mother fallback are explicitly forbidden. |
| `AC-WU16-007` | `PASS` | §11 records exact approved Razavi/Kanoon file identities, hashes, bytes and provenance plus exact Vazir source authority; no replacement artwork/CDN/font substitution is introduced. |
| `AC-WU16-008` | `PASS` | All unresolved target bindings/seams remain explicit `UNBOUND`/`NOT_PROVEN` and are localized in §13; no form-specific visual profile or guesswork is created. |
| `AC-WU16-009` | `PASS` | Current first-party Gravity Flow evidence provides the admitted native Global Inbox Search mechanism; exact target binding remains a localized WU17 blocker until target version/config is confirmed. No replacement search engine or silent removal is authorized. |
| `AC-WU16-010` | `PASS` | §5 synthetic multi-form fixture demonstrates per-entry binding-set selection by originating host context while every row uses the same shared `gravity_flow.inbox` visual profile; missing bindings fail closed locally. |
| `AC-WU16-011` | `PASS` | §§4, 9 and 10 reuse canonical slots across Entry Detail/Print for same-meaning data and use distinct `print.*` slots only for materially distinct historical semantics; runtime permission/editability remains separate. |

**Current-definition WU16 acceptance evaluation: `PASS` for AC-WU16-001..011.** This statement does not claim successor readiness, deployment, release readiness, target runtime validation, or project/WU orchestration closure. Repository CI/exact-Head validation remains a separate execution gate for the Run Result.

## 15. Scope, privacy, and history audit

- Run001/PR history is preserved; only its superseded current-authority interpretation is repaired.
- No production PHP/CSS/JS or successor runtime implementation is added.
- No SRWF or Vazir repository is modified.
- No logo binary, PSD conversion, font binary, real student/customer/payment PII, credentials, tokens, or unsanitized runtime evidence is committed.
- Shared Defaults Per Surface remains the only active V1 visual-profile resolution model; the reserved extension seam remains inert.
- Environment semantic binding may vary by form/context but never selects or overrides a visual profile.
- No merge, deployment, release readiness, or successor completion is claimed.
