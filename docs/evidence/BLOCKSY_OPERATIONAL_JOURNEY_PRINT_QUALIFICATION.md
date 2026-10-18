# Blocksy Free — operational journey and isolated Print qualification

```yaml
project: GPP-SRWF-REGISTRATION-IMPLEMENTATION-V1
base_main: fae4aafa6b5fc9ef72107d9fcec38e20ced7a3ae
scope: TEST_CI_ONLY
target_theme: Blocksy Free 2.1.59
production_adapter: NONE
status: EXECUTION_REQUIRED__NOT_PROVEN_UNTIL_EXACT_HEAD_CI
owner_site_equivalence: NOT_PROVEN
```

## Source-traced route inventory

| Route / context | Native authority | Theme influence and qualification decision |
| --- | --- | --- |
| Frontend Inbox row → `?page=gravityflow-inbox&view=entry&id=<form>&lid=<entry>` on canonical shortcode page | Gravity Flow grid link, entry/assignment authorization | **Theme-influenced:** Blocksy provides frontend page shell/CSS; GPP presentation composes native Detail. Test matching real row/ID and rendered protected synthetic national-ID witness; independent unassigned real user denial |
| Review → Revert → User Input → Review on same frontend entry URL | Gravity Flow Approval, native `confirm()`, Revert and User Input; GF validation/persistence | **Theme-influenced:** run the unchanged MR-6 host operations with native invalid-then-valid correction and fresh read-back of step and entry fields; test keyboard, direction, responsive geometry |
| Review → Approved / Rejected Result → canonical Inbox | Gravity Flow final state, GPP admitted Result-only representation and bounded return link | **Theme-influenced:** compare fresh API/final entry metadata to Result presentation; ensure no stale Approval controls, desktop/mobile flow and canonical page-one query removal |
| wp-admin Entry Detail and operator management/recovery | Gravity Flow admin routing/capabilities | **Not a Blocksy frontend page:** preserve native authorization; historical journey and WU19 tests cover bounded admin seams. No claim that Blocksy controls wp-admin geometry |
| Entry Detail Print utility → `/wp-admin/admin-ajax.php?action=gravityflow_print_entries&lid=<entry>&gpp_presentation=dossier` | Gravity Flow Print permission recheck/document, GPP after-permission dossier renderer | **Isolated document:** not served via Blocksy frontend page template. WU19 under Blocksy asserts absence of Blocksy theme CSS/JS on the native Print response and preserves normal (no intent) Print |
| Unrelated WordPress page | WordPress/Blocksy | **Theme-influenced negative control:** GPP operational surface/assets must remain absent |

## Execution topology and invariant bounds

- **Historical Hello journey remains unchanged:** pinned WordPress 7.1.1 / PHP 8.3.35 / GF 3.1.1.1 / Flow 3.1.0; MR-6 still uses Hello Elementor 3.5.1, original three viewports and original artifact path. The new Blocksy run executes later in the *same pinned journey environment*, under the independently installed official Blocksy Free 2.1.59 parent, without Elementor or Blocksy Companion active. GTB Registration is activated as a pinned coexistence dependency, but the existing native journey requires its CSS to be absent from operational Detail. Page-title suppression uses Blocksy's independently qualified native page setting.
- **New Blocksy MR-6 mode:** ten real approve/reject scenario chains at 1440/414/390/360/320 CSS px plus native cancel, real unassigned operator and unrelated-page controls (13 outcomes). Reuses native Review/Revert/User Input/Result/return behavior, synthetically seeded GF records and host-effective assignments. Expected `blocksy-operator-journey.json`, desktop/mobile browser captures, and negative-access screenshot; all outcomes fail closed in CI.
- **Historical WU19 remains unchanged:** pinned WordPress 6.8.3 / PHP 8.2.34 / GF 3.1.1.1 / Flow 3.1.0, original visual Owner reference HTML/PDF and canonical WU19 output directory. After the normal WU19 qualification gates, independent Blocksy parent activation reruns its *native* Print tests into `blocksy/` output, including A4 PDF pagination, no clipped overlong content, fresh Print permission denial, unchanged non-dossier native Print and unsupported bulk denial. GPP does not implement alternate printing.
- The **existing Blocksy Inbox 26-case** qualification and its completeness/falsification controls are intentionally untouched, not copied or reduced. Different WordPress/PHP fixtures are not directly interchangeable. Existing Hello/WU21 and WU19 results apply to the exact PR Head only when their respective workflows actually complete.
- Screenshots and Chromium-generated PDFs show browser behavior, not physical printer output, actual Owner-site permissions/theme settings, or release readiness.

## Evidence/decision discipline

Read the exact-Head `SRWF Journey Host Qualification`, `WU19 A4 Print Runtime`, `Blocksy Free authentic Inbox smoke`, `WU21 Reproducible Evidence Lab`, and `Repository CI` runs. Record each actual status independently; an absent or failed run is **NOT_PROVEN**, not PASS. A green run shows only exercised scenarios. The workflow artifacts, not this planning document, are the runtime observations.

Residual destination gaps unless separately proven: exact Owner production page/template config, other Blocksy releases/add-ons, physical printer fidelity, full screen-reader accessibility, all workflow configurations, and complete authorization matrix beyond the synthetic user/entry test.
