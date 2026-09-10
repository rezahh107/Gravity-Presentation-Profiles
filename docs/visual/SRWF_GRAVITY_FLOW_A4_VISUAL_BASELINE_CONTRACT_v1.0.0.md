# SRWF Gravity Flow / A4 Final Visual Baseline Contract v1.0.0

```yaml
document_id: GPP-SRWF-GRAVITY-FLOW-A4-FINAL-VISUAL-BASELINE
document_version: 1.0.0
status: OWNER_LOCKED__ADMITTED_BY_WU15__RUNTIME_NOT_IMPLEMENTED
project_id: GPP-SRWF-REGISTRATION-IMPLEMENTATION-V1
work_unit_id: WU-GPP-GF-FINAL-VISUAL-BASELINE-15
run_id: RUN-GPP-GF-FINAL-VISUAL-BASELINE-15-001
repository_base: main@19b91748f22d32de45fbc9a7a8bd43147c475054
authority_handoff: HANDOFF-GPP-GF-FINAL-VISUAL-A4-20260910-02
```

## 1. Purpose and authority

This document is the canonical repository design/presentation contract admitted by WU15 for the owner-selected SRWF Gravity Flow operational baseline and its two-page A4 dossier output.

It admits **presentation authority only**. It does not implement or prove production selectors, hooks, APIs, permissions, field mappings, search/filter capabilities, workflow behavior, runtime lifecycle, browser-print code, or any later Work Unit.

The repository Mother Architecture remains authoritative for product architecture. This contract specializes the admitted SRWF Gravity Flow/A4 presentation outcome without changing the core ownership rule:

```text
Gravity Forms owns entry data, fields, validation, submission and native field lifecycle.
Gravity Flow owns workflow, assignment, Inbox, Entry Detail, Approval, actions, transitions and authorization.
Gravity Presentation Profiles owns only admitted deterministic presentation.
```

UI visibility or styling is never authorization. The operational host surfaces remain native Gravity Flow surfaces; this contract does not authorize a replacement queue, desk, workflow, record system, or permission model.

## 2. Immutable owner evidence bindings

The WU15 authority is bound to these exact artifacts and identities:

| Artifact | Bound identity | Role |
| --- | --- | --- |
| `GPP_PROJECT_HANDOFF_FINAL_GRAVITY_FLOW_A4_CORRECTED_V1.json` | `PROJECT_HANDOFF_V1` v1.1; handoff `HANDOFF-GPP-GF-FINAL-VISUAL-A4-20260910-02`; schema SHA-256 `ca6125740dc0dc7c7f01e4d11035888c6ec49442cb79a45623fe1042627fa71e`; canonical artifact SHA-256 `57e045457776187ee572b312e675fe4b7384b95391de4e7731407151a36a4aae` | Corrected owner handoff and decision authority for this admission |
| `PersianGravity-Visual-Reference-Final.html` | 115728 bytes; SHA-256 `666704ac25b019ae59406974a223d10cace3f90e96f9d55312730ae93af09c81` | Owner-locked visual/behavior reference only |
| `PersianGravity-Final-Print-Sample.pdf` | 321990 bytes; SHA-256 `34d9b4e137667ca103d5c6e7752f7148f0c92e36f0f1d182d7d87a890c55fec5`; exactly 2 A4 portrait pages, Front then Back | Owner-accepted print composition evidence |

The HTML and PDF are **visual/behavior evidence, not production WordPress architecture or runtime data**. Their immutable filename/hash/size bindings are sufficient for this admission; the raw artifacts do not need to be committed to this source repository.

The final HTML contains demo-only sample JSON, a six-surface navigation simulator, illustrative portraits, reconstructed document specimens, and demo action feedback. Those items are non-production scaffolding. Production must bind real host data, media, permissions, workflow state, and approved assets through later evidence-bound work.

## 3. Exact canonical surface set

There are exactly six canonical reference/product surfaces for this baseline, and no seventh surface:

1. Inbox Desktop
2. Inbox Mobile
3. Entry Detail Desktop
4. Entry Detail Mobile
5. Print Front
6. Print Back

Documentation, design notes, the separate Informatics Registration Form, print-preview chrome, and any future configuration UI are **not** additional product surfaces in this contract.

## 4. Locked digital visual language

### 4.1 Screen palette

The screen palette is fixed for V1:

| Token | Value |
| --- | --- |
| page | `#F6F8FB` |
| surface | `#FFFFFF` |
| primary | `#1D4ED8` |
| pressed | `#1E40AF` |
| primary text | `#172033` |
| secondary | `#475467` |
| muted | `#667085` |
| control border | `#8690A1` |
| divider | `#E4E7EC` |
| validation error | `#B42318` |
| success | `#18794E` |

The rejected indigo, teal, and navy+amber alternatives are not reopened by downstream implementation work.

### 4.2 Typography

The admitted family is the real `rezahh107/Vazir` family. Production presentation may use only the actual admitted weights `300`, `400`, `500`, `700`, and `900` for this baseline. Synthetic `600` is prohibited. This contract does not authorize a Vazirmatn migration or a public font-CDN dependency. Font delivery remains outside generic GPP core and follows the existing repository ownership boundary.

### 4.3 Composition direction

Digital presentation is conservative **Border-Led / Soft Card**: white surfaces, subtle borders, restrained radius/shadow, calm hierarchy, and no SaaS-style floating-card wall. Do not introduce dashboard-stat tiles, one-card-per-field layouts, heavy gradients/shadows, colorful borders/badges everywhere, floating action buttons, icon-only primary actions, giant controls, fake statuses, or horizontal mobile tables as the primary path.

Kadence/site-shell styling is not authority for these operational surfaces.

## 5. Native Gravity Flow Inbox contract

The native Gravity Flow Inbox remains the single operational Inbox. GPP may present native state; it may not create a parallel Officer Desk, queue, assignment model, workflow state, or authorization model.

Desktop composition is exactly **two case cards per row**. Narrow/mobile composition is exactly **one card per row**. Normal pagination remains the operational pattern rather than rendering all entries at once.

Each case card follows this hierarchy:

- a small **real student photo** thumbnail when authoritative media exists, otherwise a clear fallback;
- student name as the primary identity;
- national ID;
- current step;
- data-entry date;
- optional Due/overdue information only when a real, authoritative, material Due value exists;
- a clear open-dossier action that follows native navigation/authorization.

Illustrative portraits from the reference HTML are never the production photo source. Due emphasis is local to explicit text/marker/semantic warning treatment; the whole card must not become an alarm/red state.

Search remains visually primary/visible **only through native or independently evidence-supported host behavior**. Filters and sort are secondary/progressively disclosed. GPP must not build a replacement search engine. School filtering is shown only if authoritative supported runtime data exists. Due filtering/sorting is shown only if authoritative material Due data exists. If later runtime evidence cannot support the locked search target without replacing host search, the responsible later Work Unit must block/reconcile rather than silently invent parallel search or claim support.

Operator-facing dates use Persian/Jalali presentation and Persian numerals where appropriate, subject to later runtime evidence and host-safe implementation.

## 6. Entry Detail digital dossier contract

Entry Detail is one continuous digital dossier over the native Gravity Flow Entry Detail surface. It is not a paper facsimile, an alternate data store, or multiple product modes.

The semantic order is:

1. backlink/utility navigation;
2. identity;
3. current task;
4. primary dossier sections;
5. documents;
6. administrative/financial section only where real authoritative data/permission supports it;
7. secondary history near the end.

Identity includes a small photo/avatar, full name, national ID, grade/group, and school where authoritative data exists.

The current task appears immediately after identity and uses the exact title:

> کاری که الان باید انجام دهید

Its explanatory copy remains neutral and novice-readable and must not promise a next-step transition or edit permission that the host has not proven.

In the approved Approval context, only the host-owned actions `تأیید پرونده` and `رد پرونده` are designed. This contract does not invent Save Draft, Send Next, Return for Correction, mandatory Reject Reason, or another workflow lifecycle. Reject is a negative workflow decision and its styling must remain semantically distinct from validation-error styling.

Read-only values render as **label + value**, not disabled-input imitation. Edit controls appear only when authentic host permission/step evidence proves editability for the real user/context. Student phone remains read-only in the canonical specimen until such permission is proven.

Primary dossier sections are open. The secondary history section is collapsed by default and keeps this exact novice helper visible:

> اینجا می‌توانید ببینید پرونده در چه تاریخ‌هایی بررسی شده، چه نتیجه‌ای ثبت شده و اگر برای اصلاح برگشته، دلیل آن چه بوده است.

Image documents use performance-safe thumbnails and a same-page larger preview when presentation implementation owns that interaction. The preview closes by Escape or backdrop and restores focus/scroll context. PDF/non-image files use file identity plus an open affordance. Real uploaded media/file links remain host-owned; reconstructed demo documents are not production assets.

Desktop and mobile Entry Detail preserve the same semantic content and section order. Mobile is not a reduced-information mode.

## 7. Canonical direct-browser A4 print contract

Print is a **utility/output**, not a Gravity Flow workflow step, workflow action, transition, or alternate authorization path. Making print available must never broaden native Entry access or assignment.

The V1 output medium is plain white **A4 portrait** paper and exactly two canonical pages in this order:

1. Print Front
2. Print Back

The canonical operational path is direct browser **HTML/CSS print** at normal **100%** scale. A dedicated PDF generator, mandatory PDF download, or download-first flow is not required. Duplex is optional and not part of the contract. A browser's incidental “Save as PDF” capability does not create a dedicated-PDF requirement.

Print is designed directly for black/white/grayscale, toner-efficient office output; screen colors do not define print semantics. One deterministic page boundary separates Front and Back. Non-print app chrome, design notes, and an empty third page must never print. Do not use overflow clipping, global transform/zoom, or Fit-to-page dependence to force pagination.

A4 is locked. Exact printer-safe margins/printable area and browser header/footer settings remain later real-environment validation concerns and must not be claimed as proven by this document.

### 7.1 Print Front header

The header is locked to:

- **right:** approved Razavi Complex mark;
- **center text only:** `مجتمع فرهنگی آموزشی رضوی` + `نمایندگی بنیاد علمی آموزشی (قلم‌چی)`;
- **left:** approved Kanoon mark.

There is no center/foundation logo. Production must use approved logo assets; it must not fabricate or reinterpret missing artwork.

### 7.2 Historical anatomy and manual regions

The historical cardboard dossier is structural/familiarity evidence only; the production medium is plain white A4. Print Front remains a faithful modern presentation of the historical Front. The separate Informatics Registration Form is explicitly non-canonical: it must not become Page 3 and must not be merged into Print Front.

Historical field order, meaningful manual fields, handwriting areas, stamp areas, and signature areas remain represented even when no digital mapping exists. These manual regions are operationally useful and must not be shrunk into decorative boxes merely to recover space.

The accepted current A4 composition, including useful manual/stamp/signature areas and its remaining breathing space, is visually locked. No further aesthetic stretching/redesign cycle is authorized absent a demonstrated functional print defect from later real print QA.

The historical رشته/پایه and academic-year region remains visually continuous while preserving **independent underlying bindings**. A missing academic year remains blank and must never be inferred from grade.

### 7.3 Print Back financial structure

Print Back contains exactly:

- **five** receipt/deposit-slip rows; and
- **six** cheque/installment rows.

It then preserves the accepted totals, financial summary, sequential approval/signature areas, management/final approval, and manual notes anatomy represented by the owner-accepted composition.

### 7.4 Explicit binding-only rule

Every populated print value and every selected option requires an explicit authoritative digital source **and** an explicit print binding. If no authoritative binding exists, the historical field/option remains visible but blank for manual completion.

Production must not guess plausible defaults or reuse unrelated fields. In particular:

- Print Back financial date has its own explicit binding and must not be synthesized from Inbox/data-entry date;
- Phone 2 has its own explicit binding and must not choose father/mother by fallback;
- gender, registration type, registration timing, graduate status, registration location, and payment mode option groups require complete explicit mapping for supported authoritative values; unbound groups remain blank;
- no registration/payment/location choice or financial value may be auto-selected because it looks plausible.

Authoritative values that do exist must print legibly in the correct historical regions with appropriate RTL/LTR handling, stable national-ID/numeric rendering, bounded wrapping, and no collision with labels, borders, stamps, or signatures.

## 8. D-17 scoped supersession record

For **this V1 Gravity Flow/A4 print scope only**, the earlier `D-17` candidate baseline — **Gravity PDF Free + SRWF print layer** — is superseded by the direct-browser HTML/CSS A4 path defined in Section 7.

This is a scoped supersession, not historical erasure. Earlier decision/evidence records remain history and must not be rewritten as though D-17 never existed. WU15 changes the current print-renderer direction only; it does not rewrite closed WU1/WU2 history or prior canonical Result/evidence records.

## 9. Shared Defaults Per Surface + Reserved Extension Seam

V1 operational presentation resolution is **Shared Defaults Per Surface** only:

- one shared default Inbox profile;
- one shared default Entry Detail profile;
- one shared default Print profile.

There is no active per-form, per-user, or per-role operational surface-profile selection/override in V1, and no arbitrary theme-builder UI.

A **Reserved Extension Seam** may exist only as inert, versioned schema capacity or documented compatibility space for a future explicitly approved version. It must not participate in V1 resolution, activation, targeting, selection, or UI.

This corrected authority is the basis that later WU9/WU10 work must consume; those Work Units must not depend on an unadmitted candidate handoff or reactivate per-form/user/role Surface-profile semantics.

## 10. Decision preservation ledger — OD-001 through OD-034

The following ledger is normative for WU15 and preserves every owner decision from the corrected handoff without reopening it.

| Decision | Preserved rule |
| --- | --- |
| OD-001 | Use real Vazir from `rezahh107/Vazir`, weights 300/400/500/700/900; no synthetic 600 and no Vazirmatn migration. |
| OD-002 | Keep the Registration-family blue + neutral screen palette with primary `#1D4ED8`; reject alternate indigo/teal/navy+amber palettes for V1. |
| OD-003 | Digital direction is conservative Border-Led / Soft Card with white surfaces, subtle borders, restrained radius/shadow, and no floating SaaS-card wall. |
| OD-004 | Native Gravity Flow Inbox is the single operational Inbox; desktop is exactly two cards per row and narrow/mobile exactly one. |
| OD-005 | Inbox uses a small real student photo thumbnail when available and a clear fallback when absent. |
| OD-006 | Inbox hierarchy is name, national ID, current step, data-entry date, conditional real Due, then `باز کردن پرونده`; use normal pagination. |
| OD-007 | Search is visually primary only through native/evidence-supported behavior; Filter/Sort are secondary; School filtering is conditional on real runtime data. |
| OD-008 | Due/overdue presentation exists only for a real/material Due value and stays local rather than tinting the whole card. |
| OD-009 | Entry Detail is one clean electronic dossier surface, not literal paper UI and not alternate product modes. |
| OD-010 | Entry identity uses small photo/avatar, full name, national ID, grade/group, and school. |
| OD-011 | Current task immediately follows identity with exact title `کاری که الان باید انجام دهید` and neutral novice-facing instructions. |
| OD-012 | In the approved Approval context only `تأیید پرونده` and `رد پرونده` are designed and remain host-owned; do not design Return for Correction, Save Draft, or Send Next. |
| OD-013 | Reject is negative/red workflow styling but semantically distinct from validation error. |
| OD-014 | Read-only fields use label+value; edit controls require real permission evidence; student phone stays read-only in the canonical specimen until proven otherwise. |
| OD-015 | Image documents use lightweight real thumbnail + same-page larger preview with Escape/backdrop close and focus/scroll restoration; PDF/non-image uses identity/open affordance. |
| OD-016 | Primary dossier sections stay open; history is secondary, near the end, collapsed by default with the locked helper copy visible. |
| OD-017 | Desktop/mobile Entry Detail preserve the same semantic content and section order; mobile is not reduced information. |
| OD-018 | Print is a utility/output, not a Gravity Flow workflow step or action cluster. |
| OD-019 | Print medium is plain white A4 portrait, exactly two canonical pages; historical cardboard is visual/structural reference only. |
| OD-020 | Direct browser HTML printing is the primary V1 path; no dedicated PDF-generation/download workflow is required; earlier D-17 Gravity PDF Free + SRWF print-layer baseline is superseded for this scope. |
| OD-021 | Duplex is not mandatory; the contract remains two A4 portrait pages whether printed separately or duplex. |
| OD-022 | Print is designed directly black/white/grayscale for toner-efficient office output, not by desaturating a colorful print design. |
| OD-023 | Print Front modernizes the historical cardboard Front only; the Informatics Registration Form is separate/non-canonical and never joins the two-page dossier. |
| OD-024 | Front header uses only right Razavi mark, center text `مجتمع فرهنگی آموزشی رضوی / نمایندگی بنیاد علمی آموزشی (قلم‌چی)`, and left Kanoon mark; no center logo. |
| OD-025 | Every real historical field/manual area remains represented even if no digital mapping exists; unmapped fields stay blank for pen/stamp/signature completion. |
| OD-026 | Existing authoritative digital values print legibly in the correct historical locations; missing/unproven values are never guessed. |
| OD-027 | Print Back has exactly five receipt/deposit rows and six cheque/installment rows. |
| OD-028 | Back financial date has its own explicit binding and is never synthesized from Inbox/data-entry date; Phone 2 has its own binding and never uses father/mother fallback. |
| OD-029 | All Print Front option groups require complete explicit mapping when authoritative fields exist; nothing is auto-selected by default and unbound groups remain blank. |
| OD-030 | The accepted A4 composition, including useful handwriting/stamp/signature space and remaining breathing space, is final unless real print QA proves a functional defect. |
| OD-031 | The reference HTML is not production code; sample JSON, six-surface controller, illustrative portraits, reconstructed documents, and demo state/actions are reference scaffolding only. |
| OD-032 | V1 uses one shared default presentation profile per surface; per-form/user/role visual overrides and arbitrary theme-builder UI are deferred/non-goals. |
| OD-033 | No additional visual bake-off or redesign cycle is required; the selected final artifact is locked and remaining work is implementation/binding/validation. |
| OD-034 | Print Front keeps رشته/پایه and academic year in one visually continuous historical study region with independent bindings; missing year stays blank and is never inferred from grade. |

## 11. V1 non-goals and deferred work

This admission does **not** authorize:

- a seventh product surface;
- per-form/per-user/per-role operational surface-profile selection or overrides;
- an arbitrary theme builder or visual editor;
- a replacement Officer Desk, Inbox, queue, workflow, assignment model, authorization model, or Approval lifecycle;
- a custom/replacement search engine;
- a dedicated or mandatory PDF engine or download-first print workflow;
- a mandatory duplex assumption;
- a third dossier page or merging the Informatics Registration Form into Print Front;
- an additional visual bake-off, palette exploration, center-logo redesign, document-surface redesign, workflow-action redesign, or aesthetic A4 stretch cycle;
- production selector/hook/API/DOM/lifecycle/permission claims without later evidence-bound implementation work;
- fabricated Due, School, status, priority, logo, print value, print option, field permission, or workflow state;
- mechanically porting demo JSON, mockup navigation/controllers, illustrative media, reconstructed documents, or demo feedback into production state architecture;
- implementing WU9, WU10, WU16, WU17, WU18, WU19, or WU20 inside WU15.

Optional capabilities must fail closed or remain omitted/`NOT_PROVEN` until the responsible later Work Unit has authentic evidence. This document is not runtime proof, release readiness, or a permission/capability certification.

## 12. Downstream discovery and consumption

Executors for later work must read this file from the repository rather than relying on chat context or an unadmitted candidate handoff.

In particular:

- **WU9** consumes the Shared Defaults Per Surface package model and keeps the Reserved Extension Seam inert;
- **WU10** consumes the same shared-default activation/lifecycle boundary without active per-form/user/role Surface-profile targeting;
- **WU16** binds real Gravity Forms/Gravity Flow data/capabilities/selectors/hooks only from authentic evidence and must block/reconcile unsupported locked targets rather than invent behavior;
- later Inbox, Entry, Print, and final-acceptance Work Units consume the six-surface visual/composition contract but remain responsible for their own runtime/physical-print proof.

The canonical repository index for admitted visual contracts is the local [`README.md`](README.md). Historical WU1/WU2 architecture/results remain untouched.
