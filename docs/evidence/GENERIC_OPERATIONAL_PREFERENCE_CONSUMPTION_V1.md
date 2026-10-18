# Generic operational schema 1.1 paint consumption — bounded admission

Status: **implemented candidate; real-browser verdict requires exact-Head WU18 CI evidence**.

## Authority and inventory (at baseline `main@eb331bfb95de1260f09c2f21a7e62bae7b3e70af`)

- `docs/architecture/MOTHER_ARCHITECTURE.md`, `PORTABLE_PROFILE_BINDING_SUBSTRATE_V1.md`, `PORTABLE_VISUAL_PROFILE_PACKAGE_V1_1.md`, `PACKAGE_LIFECYCLE_V1.md` retain presentation/host ownership and Shared Default per operational surface.
- The external Owner `GOAL_AUTHORITY` is **not in this repository** (see `docs/evidence/ENTRY_DETAIL_MAPPING_WORKFLOW_V1.md`). This change does not claim to have inspected it. Existing admitted SRWF contracts and repository references remain unmodified.
- Schema `1.0.0` (shipped SRWF Operations 1.0.1) carries typed `design_tokens` and `token_refs` but has no `presentation` block: *none of its tokens is treated as a generic operational paint instruction*. The current SRWF CSS is deliberately unchanged.
- Schema `1.1.0` validates controlled presentation preferences for all four selected surfaces, but pre-change only the generic Gravity Forms Form consumer projected them into runtime CSS. Flow Inbox/Entry Detail had lifecycle and binding resolution but no generic presentation preference projection.
- Inbox: `Bootstrap` → `InboxPresentationAdapter` → `VisualPackageLifecycle`/binding sets → native shortcode/block/admin Inbox + `srwf-gravity-flow-inbox*.css`. Native Gravity Flow owns AG Grid query, search, columns, horizontal geometry, physical LTR four-node exception, saved state, sorting, pagination and Live Refresh.
- Entry Detail: `Bootstrap` → `EntryDetailPresentationAdapter` → lifecycle/entry-scoped bindings → after-authorization `gravityflow_entry_detail_content_before` → GPP read-only dossier + `srwf-gravity-flow-entry-detail.css`. Gravity Flow owns actions, permissions, correction, navigation and result state.
- Print: isolated dossier renderer; no operational preference consumption added.

## Newly wired **candidate** preferences (both surfaces)

| Schema 1.1 preference | Inbox painted target | Entry Detail painted target |
| --- | --- | --- |
| `composition.surface_background` | `.gpp-inbox-surface` canvas custom property, consumed by `background-color` | `.gpp-entry-dossier` background color |
| `sections.heading_text` | GPP-owned Inbox title color | GPP-owned dossier headings |
| `labels.text` | Native Inbox AG Grid header-cell text paint only | GPP-owned dossier fact labels |

All targets are fixed in trusted code. Only **schema 1.1 explicitly declared** references to validated `design_tokens.colors` are consumed. These declarations are applied as scoped, post-stylesheet `wp_add_inline_style()` rules on already-qualified requests, after the existing SRWF presentation assets. No CSS selectors, code, new state, layout values, native state changes or font delivery come from a package. Absent preferences emit no CSS; schema 1.0 continues to rely on the exact original SRWF CSS.

### Remaining structurally valid but **not** operationally consumed

`composition.direction/max_inline_size/inline_padding/surface_radius/field_layout`, `typography.font_family`, `controls.*`, `labels.required_color/font_size/font_weight`, `descriptions.text`, `sections.divider/heading_font_size/heading_font_weight/description_text`, `primary_action.*`, and `validation.error_color`. These may be valid schema 1.1 properties, **not** promises of generic Gravity Flow capability. Generic arbitrary Entry Detail content semantics/variants, native Inbox Grid customization, and Print visual preferences remain outside admission.

## Bounded verification design

- Real JSON, non-SRWF package fixture: `tests/fixtures/generic-operational-paint-v11.json`. Synthetic profile identity and independently selected color tokens; no hard-coded Form ID, field ID, WordPress page ID, role ID or raw CSS.
- `tests/cases/operational-visual-preferences.php` exercises schema validation, inactive import, independent surface activation, immutable version, rollback byte equality, schema 1.0 SRWF fallback, fail-closed unknown CSS, token omission and Print isolation.
- Pinned WU18 Node/Chromium scenario: `generic-operational-v11-browser.mjs` runs on the existing WU18 synthetic WP/GF/Flow setup. The `generic-operational-v11-control.php` uses real WordPress `VisualPackageLifecycle` through WP-CLI. Baseline → import → each activation → `getComputedStyle` for native Inbox and GPP-owned Entry Detail → RTL/AG Grid axis at 1440/390/320 → independent Inbox rollback → previous activation restoration in `finally`. Evidence JSON and before/after screenshots are uploaded via WU18 workflow.
- WU18 uses its **already-created synthetic non-SRWF form IDs and entry data**, rather than importing a separate content model. This proves independent **profile/package** paint on a real host, not full generic Entry Detail semantic-content composition for arbitrary workflows.

## Evidence and non-claims

No CI outcome is recorded in this document. A green Repository CI is not browser proof. Browser evidence is valid only if `WU18 Entry Detail Runtime` on the exact PR Head finishes with its new computed-paint assertions and uploaded screenshots. Normal WU21/WU19/Blocksy/Hello tests remain independent; their prior results cannot be transplanted to the new Head. Live Owner-site theme parity, all native permission combinations, arbitrary generic workflow content, print-device output and full WCAG evaluation remain **NOT_PROVEN**.

Rollback the two operational surface activations to their previous immutable versions (or deactivate an originally inactive surface); no runtime migration or schema change is necessary. The existing SRWF 1.0 Operations package and production CSS remain untouched.


## PR #159 architectural repair — consumer ownership and route qualification

**Governing boundaries:** `AGENTS.md` §3/§5; `PORTABLE_VISUAL_PROFILE_PACKAGE_V1_1.md` (immutable schema 1.1 identity and explicit permission for empty semantic slots). This repair does **not** add new paint capabilities.

- `Core/Presentation/OperationalVisualPreferences::colors()` exclusively validates the **exact selected immutable profile** from the 1.1 package, applies the existing three-preference allowlist, checks `token_refs`, resolves safe six-digit `design_tokens.colors` values, and returns an ordered preference-to-color map. **No SRWF selectors, CSS declarations, or host DOM are permitted in Core.**
- `SRWF/GravityFlow/InboxOperationalPaint::css()` owns the exact three previous code-fixed Inbox selector/property pairs. `SRWF/GravityFlow/EntryDetailOperationalPaint::css()` owns the exact three dossier-only pairs. Both call the Core resolver and emit the same byte-for-byte CSS as the prior implementation. Adapters remain the sole enqueue/host reachability boundaries.
- No profile-authored selector, stylesheet, value parser, persistence change, schema migration, native Grid/action change, Print change, or runtime version gate has been introduced.

### Actual route-specific Inbox behavior (verified from source; browser paint coverage indicated separately)

| Route | Current reachability/DOM | Scoped consumption | Evidence limit |
| --- | --- | --- | --- |
| **Admin native Inbox list** (`wp-admin/admin.php?page=gravityflow-inbox`, no `view`) | `isNativeInboxListRequest()` enqueues. Gravity Flow owns the Grid. **No frontend `.gpp-inbox-surface` wrapper is constructed by this path.** | Existing native `.gflow-inbox... .ag-header-cell` `labels.text` rule; `composition.surface_background` and `sections.heading_text` target a GPP frontend-only wrapper and need not have a rendered Admin target. | **WU18 computed native header paint** at 1440/390/320. Admin wrapper background/title paint **not claimed**. |
| **Frontend `[gravityflow page="inbox"]` shortcode** | Singular post shortcode detection plus `gravityflow_shortcode_inbox` authentic-marker filter; it creates `.gpp-inbox-surface` and `.gpp-inbox-surface__title` around the unmodified host output. | All three rules have matching target selectors when native Grid is rendered and post-head styles print; canvas variable is consumed by pre-existing `background-color` CSS. | Paint mapping is code-supported. **Full schema-1.1 real-browser computed paint on a shortcode page is NOT_PROVEN** by the WU18 Admin route alone. |
| **Frontend registered `gravityflow/inbox` block** | Singular `has_block` reachability and exact registered native block `render_block` filter; uses the authentic native Grid and late style printing. **Does not create the shortcode-only GPP page wrapper/title.** | Native header `labels.text` selector can match. Wrapper canvas and heading rules cannot claim a rendered block target. | **Full schema-1.1 real-browser computed paint on a block page is NOT_PROVEN** by WU18 Admin route alone. |

This is an inventory of **existing code behavior**, not a decision to expand or unify route paint. The ownership contract does not authorize inventing an Admin or Block wrapper as a consequence of this architectural repair. Frontend shortcode/block paint admission, if required, needs separately exercised authentic pages and acceptance of exact target composition; no frontend proof is inferred from the Admin browser success.

### Empty semantic slots: schema-valid vs runtime-admitted

- Schema 1.1 specifically permits `semantic_slots: []` (including empty per-surface lists) for declarative paint-only packages. `VisualProfilePackageV11::validate()` admits it; the PHP contract test exercises the real validator, Core token interpretation, and both code-owned paint projections.
- **Existing operational runtime intentionally does not yet admit it:** `InboxPresentationAdapter::activeVisualPackage()` and `EntryDetailPresentationAdapter::activeVisualPackage()` both reject an empty `semantic_slots` list. `EntryDetailPresentationModel::presentationReadiness()` independently rejects an absent required semantic source probe with `structural_probe_semantic_unavailable`. Those production gates remain unchanged.
- Consequently, **paint-only / zero-slot operational Activation to visible Inbox or Entry Detail is NOT_PROVEN / currently unavailable**, even though the immutable package is schema-valid. Whether those Flow surfaces should be newly admitted without bindings requires a distinct Owner/contract decision, not a shortcut around structural readiness.
- The fixture used by WU18 retains its real declared semantic slot and binding; this architectural repair does **not** rewrite it into a zero-slot fixture merely to make the test pass.

### Regression and falsification strategy

The existing PHP test asserts the **exact prior CSS strings** (selector, property, token, ordering, newline), validates Core selector independence, invalid references and arbitrary CSS rejection, activation/immutable identity/independent surface rollback/Print isolation, and schema-valid/runtime-rejected zero slots. The existing pinned WU18 Chromium run must still exercise computed colors/RTL/native actions/Grid physical axis/widths 1440, 390, 320, anonymous/unrelated-page negative controls and exact captured screenshot route+ready-DOM+viewport provenance; a green test alone cannot establish not-executed frontend shortcode or block paint.
