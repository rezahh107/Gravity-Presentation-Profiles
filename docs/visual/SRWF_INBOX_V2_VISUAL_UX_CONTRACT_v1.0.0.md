# SRWF Inbox V2 Visual/UX Contract v1.0.0

```yaml
document_id: GPP-SRWF-INBOX-V2-VISUAL-UX-CONTRACT
document_version: 1.0.0
status: OWNER_LOCKED__ADMITTED_IN_PR_HEAD
scope: GRAVITY_FLOW_INBOX_ONLY
supersedes: WU15_INBOX_PORTION_ONLY
reference_repository_path: docs/design/references/GPP_INBOX_VISUAL_DESIGN_V2_OWNER_APPROVED_1440.png
reference_drive_id: 1mGOydyezwOWV5KypzfUJGT5uc7KFftaN
reference_size_bytes: 1271343
reference_sha256: f89d689f9b04f7e8558814239ed71512cd29d7ac417f8d3f09e5d25c5eda00b0
runtime_golden: NOT_ACTIVATED
approved_visual_contract: NOT_ACTIVATED
target_production_pixel_fidelity: NOT_PROVEN
```

## Admission and precedence

The Owner's Inbox Visual Design V2 direction and exact 1440 reference are admitted here as the current **Inbox-only** presentation authority in this PR Head. This contract is the profile-specific Visual/UX Contract under the Mother Architecture and is indexed by [`README.md`](README.md). The repository image is a byte-identical convenience mirror of the Owner-approved reference; its inspected size and SHA-256 above identify the bytes, while canonical Owner authority remains external to the mirror. The image illustrates the contract and cannot authorize an unqualified runtime mechanism or fabricate a data binding.

This contract supersedes only the Inbox-specific composition in [`SRWF_GRAVITY_FLOW_A4_VISUAL_BASELINE_CONTRACT_v1.0.0.md`](SRWF_GRAVITY_FLOW_A4_VISUAL_BASELINE_CONTRACT_v1.0.0.md): §4.3's Inbox-specific mobile-table prohibition where it conflicts with the native Grid, §5, and the Inbox decisions OD-004 through OD-008 in §10. Those WU15 statements remain historical evidence, not current Inbox implementation instructions. WU15's Entry Detail, A4 print, six-surface accounting, typography/font constraints, and other non-Inbox decisions are not superseded. No seventh surface or new operational profile is created.

The Toolbox v1.1 and current Owner overrides in `docs/design/` are design and qualification context, not this admitted production visual authority. PR #108 supplied Q1/Q2/Q4 qualification, not implementation approval. This successor admission is the Owner-directed resolution of that authority gap in PR #109; it does not retrospectively turn PR #108 into an approval or make a PR Head merged `main` authority before Owner merge.

## Locked destination and ownership

- Desktop at **1440 CSS px** is the visual authority: a moderate-density, modern native-table work desk with clear primary/secondary text hierarchy, quiet institutional surfaces, restrained neutral separators, readable Persian typography, Entry-Detail-aligned blue interaction/focus, visible native Open/View, and refined native pagination presentation. Fast operator scanning is the goal, not literal screenshot DOM imitation.
- The actual Gravity Flow Inbox and AG Grid row/cell structure remain operational. Gravity Flow / AG Grid own query, assignment, authorization, workflow, Grid and row identity, Search, Sort, Filter, column state, pagination and page size, Live Refresh, focus/keyboard lifecycle, and Open navigation. GPP owns only deterministic presentation.
- The admitted production seam for this destination is **bounded, Inbox-scoped CSS paint over native rows, existing cells, native Open and native pager**: color, existing-font hierarchy, subtle background/border/hover/focus treatment, and structurally safe radius. No row, Grid, pager, column-width, overflow, or page-container geometry takeover is admitted by this contract. Q3 geometry remains on demand and was not needed for the current paint implementation.
- Student identity/name is the desired primary concept and school/grade-group the desired secondary concept, but only actually bound native columns may display them. Hierarchy may span separate real columns. The historical student photo is closed for Inbox V2; a semantic identity cue is conceptual only until its authoritative source and safe seam are proven. No compound identity value, replacement renderer, or second binding system is admitted.
- A compact status treatment requires an authoritative native status source, preserved textual meaning, and an independently admitted safe seam. Otherwise ordinary native text remains. No month-name chip is required. The already-qualified optional canonical `entry.created_at` / `date_created` Jalali presentation belongs to PersianGravity; GPP does not convert dates or double-convert already-Jalali fields.
- Native Open/View retains its authentic Gravity Flow URL and keyboard navigation. Native pagination uses **GPP-INBOX-NATIVE-PAGINATION-PRESENTATION-V1 METHOD B**: GPP paints the original pager; Gravity Flow / AG Grid own its page, total, page size and lifecycle. No custom pager, duplicate count, listener, private Grid access or pagination controller is admitted.
- The full-width Elementor V4 host provides the width. No GPP fixed replacement width or viewport breakout is admitted. At 390 and 320 CSS px, prevent GPP-caused document overflow and keep native Open, Search, Settings, Fullscreen, pager, focus and Live Refresh usable. Final mobile visual redesign is deferred to W4.
- Page heading, duplicate «کارهای من», Manual Refresh presentation, Search presentation, Settings, Fullscreen, outer Elementor composition, Sort controls and Filter controls are phase-frozen here. Preserve their native behavior; do not redesign them in this scope.

## Typography and bounded visual choices

Inherit the existing site-delivered Vazir/Vazirmatn family. Do not bundle, load or switch fonts in GPP. The WU15 admitted real Vazir weights are `300`, `400`, `500`, `700`, `900`; synthetic `600` is not authorized. A primary native column may use admitted `700`; the secondary workflow-step column has **no Owner-locked exact weight** and inherits native weight rather than inventing one. Existing Entry Detail blue/neutral tokens provide the interaction family. The exact paint shades in the current implementation are bounded CSS choices tested in WU21, not new Owner-locked numeric Golden values.

## Evidence limits and fail-closed rules

| Item | Current disposition for this admission |
| --- | --- |
| `Q1_HTML_CELL_VALUE_PATH` | `FAIL`; rich compound HTML and semantic SVG through that path are **NOT_ADMITTED**. No renderer takeover or recurring DOM mutation fallback. |
| `Q2_RTL_NATIVE_BEHAVIOR` | `NOT_PROVEN` for Persian Grid-cell readability in the available synthetic fixture; do not force `enableRtl` or infer target readability. |
| `Q4_PAGE2_POLL_FOCUS` | Mandatory exact-Head regression: native page 2, polling UPDATE/ADD/REMOVE, coherent pager/Grid/Search/row identity, focus and Enter/Open from post-poll page 2. |
| Student name, school, grade group target bindings | `UNBOUND` where identified in the WU16 binding matrix; do not infer field IDs from the reference. |
| Identity semantic source, workflow status source | `NOT_PROVEN`; no invented icon meaning, status chip or workflow state. |
| Target-production pixel fidelity, Persian-cell readability | `NOT_PROVEN`; reproducible synthetic-host screenshots are evidence of the exercised host only. |

No Card Mode, `gpp_case_card`, replacement Grid, rich-cell Q1 route, forced RTL, DOM recomposition/mutation loop, cloned/moved controls, synthetic binding, or custom pagination state is admitted. The historical visual diagnostic configuration is not a runtime Golden. `runtime_golden` and `approved_visual_contract` remain `NOT_ACTIVATED` pending separate Owner authority. Exact-Head Repository CI and WU21 evidence qualify the implementation that consumes this contract; a green workflow alone does not upgrade an individual failed or unevaluated Q contract.
