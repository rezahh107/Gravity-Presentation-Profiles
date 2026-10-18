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
