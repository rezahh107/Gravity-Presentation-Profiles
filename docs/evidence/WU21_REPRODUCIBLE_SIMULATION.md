# WU21 Reproducible Simulation Evidence Lab

This repository contains a bounded GitHub Actions Evidence Lab for `WU-GPP-GF-REPRO-EVIDENCE-LAB-21`. Its maximum positive claim is **`PROVEN_IN_REPRODUCIBLE_SIMULATION`**. It is not a production-equivalence certificate and performs no target-production read-back.

## Pinned simulation environment

The machine-readable configuration is `tests/repro-evidence-lab/lab-config.json`. The lab pins WordPress 6.8.3, PHP 8.2.33, MariaDB 11.4.8 (including the declared image digest), WP-CLI 2.12.0 with SHA-256 verification, Node 22.19.0, Playwright 1.55.0/Chromium, Gravity Forms 3.1.1.1 and Gravity Flow 3.1.0. The two proprietary plugin ZIPs are fetched from the owner-approved public Drive file IDs and are rejected before extraction unless their exact byte size and SHA-256 match the configuration.

The lab also pins WordPress to the non-empty `/%postname%/` permalink structure. This is a simulation-host prerequisite derived from the exact Gravity Flow 3.1.0 implementation: its internal Inbox endpoint advertises a `/<rest-prefix>/gravityflow/internal/...` path via `rest_get_url_prefix()` rather than WordPress's plain-permalink `?rest_route=` form. WU21 therefore requires the ephemeral host to route `/wp-json/...` through WordPress and proves that route over HTTP before browser assertions run. This does **not** assert that the target production host uses the same permalink, web-server, theme, cache or CDN configuration; those facts remain `NOT_PROVEN`.

The evidence artifact records the checked-out repository commit, workflow path and workflow-definition SHA-256, GitHub run identity, configuration SHA-256, runtime versions, observed WordPress permalink/REST-prefix/theme values, and observed package hashes/sizes.

## Exact Gravity Flow seams under test

The lab uses only seams evidenced in the exact Gravity Flow 3.1.0 package: `gravityflow_columns_inbox_table`, `gravityflow_inbox_field_value`, `Gravity_Flow_API::get_current_step()`, `Gravity_Flow_API::get_inbox_entries()`, `get_inbox_search_criteria()`, `get_inbox_paging()`, `get_inbox_sorting()`, `Gravity_Flow_Inbox::display()`, the native `inbox/changes` refresh endpoint and its internal REST base-route construction, and the bundled native Inbox grid behavior (`gflow-inbox-search`, `setQuickFilter`, `applyTransaction`, AG Grid sorting/pagination and Entry Details links). The host remains authoritative for assignment, authorization, workflow, queue/search/index, refresh, pagination and navigation.

The WU21 adapter is a test-only MU plugin. It adds four presentation columns through the two source-backed Inbox filters and reads host state through **test-local synthetic binding records and a test-local fail-closed resolver**. That resolver exists only to preserve the evidence-lab mechanics after removal of the unreachable WU09/WU10 production prototypes. It is not a production portable-substrate implementation, does not make any `src/` file reachable, and creates no custom workflow, queue, search engine, authorization system, scheduler, REST application or parallel state store.

## Synthetic fixture boundary

CI creates two Gravity Forms with different synthetic field IDs, one native Gravity Flow Approval step per form, and 25 base entries assigned by Gravity Flow to a synthetic operator account. All names use the `WU21 ...` prefix and all test email addresses use `example.invalid`. No production entry, student, form, field, workflow step, page or route identifier is copied into the lab.

The two form contexts deliberately use different name/photo field IDs. `student.full_name`, `workflow.current_step` and `entry.created_at` are PROVEN in both synthetic binding records. `student.photo` is PROVEN only for Alpha; Beta contains a host value but the binding is `NOT_PROVEN`, so the adapter must return nothing rather than cross-form fallback. `school.name` remains `UNBOUND` and `workflow.due_at` remains `NOT_PROVEN`; neither column is activated. A single manifest-level `surface_profile_id` preserves the shared Inbox-profile invariant without depending on a production package/resolver implementation.

## Runtime behavior and evidence gating

PHP/runtime tests exercise native assignment, authorization isolation, form filtering, sorting, explicit API paging, native task navigation, native Inbox markup, source-backed refresh mechanics and multi-form semantic extraction. Playwright logs into the real ephemeral WordPress admin and exercises the real Gravity Flow AG Grid for render, quick search, sorting, pagination, Entry Details navigation, reload/re-render and native polling refresh. During the refresh test, a synthetic entry is created through WP-CLI while the Inbox is open; the test waits for Gravity Flow's own polling/`inbox/changes`/`applyTransaction` path to add it, then deletes it and waits for the native grid to remove it.

Before browser execution, the lab performs an HTTP negative-control probe against the real native `inbox/changes` route without its required access token. The probe must reach WordPress REST and fail as `rest_missing_callback_param`; an HTML front-controller response or an unregistered route fails the lab. This keeps the polling proof tied to the native Gravity Flow lifecycle instead of substituting a test endpoint or direct grid mutation.

A mechanic receives `PROVEN_IN_REPRODUCIBLE_SIMULATION` only when every test listed as required for that mechanic is `PASS`. A failed or missing required test leaves the mechanic `NOT_PROVEN`. The content-addressed evidence validator rejects any failed/not-run required test, any package/runtime identity mismatch, any digest mismatch, or any attempt to upgrade production equivalence.

## Downstream consumption

A downstream WU may cite the immutable WU21 evidence artifact for the **native Gravity Flow and synthetic fail-closed mechanics** whose required tests passed, but only with the evidence class `PROVEN_IN_REPRODUCIBLE_SIMULATION`. The artifact does not prove that WU09/WU10 package/lifecycle PHP implementations exist or are production-reachable; those implementations were intentionally removed by the reachability cleanup while their destination semantics remain documented separately.

A downstream WU must independently obtain target evidence before claiming exact production plugin versions, licenses/configuration, Form/Field/Step/Page/route IDs, or cache/CDN/theme/server facts. Those production-specific facts remain `UNBOUND` or `NOT_PROVEN` here.

`production_equivalence.state` is permanently `NOT_PROVEN` for this lab artifact.
