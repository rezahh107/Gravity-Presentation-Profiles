# PRI-FND-001 — ADMIN_CAPABILITY_BOUNDARY_ALIGNMENT qualification

**Disposition:** `SELECTED_METHOD_INFEASIBLE` under the complete requested positive workflow. This is evidence only; no authorization fix is admitted.

- Repository: `rezahh107/Gravity-Presentation-Profiles`, PR #154
- Reviewed initial Head: `39bbc1cd1dfcc26e60ac3f0f73803ebb7b347a05`
- Reconciled base: `bbf807ae6eb8f1305ad4f494b004d291e76d3307`
- Authentic host: WU21 WordPress 6.8.3 / Gravity Forms 3.1.1.1, synthetic users and data only.

## Confirmed two-capability boundary

The existing editor registers its submenu under `options-general.php` with `manage_options` but independently checks `GFCommon::current_user_can_any('gravityforms_edit_settings')` before rendering and downloading.

In WU21 the synthetic administrator had `manage_options=true`, WordPress `current_user_can('gravityforms_edit_settings')=false`, but `GFCommon::current_user_can_any('gravityforms_edit_settings')=true`. Therefore replacing `manage_options` with the granular WordPress capability directly is not equivalent to the existing Gravity Forms permission and broke the original administrator route. See WU21 run `38250240306`.

A test-only registration of the original `options-general.php/manage_options` tuple under a distinct probe slug returned HTTP 403 for a real logged-in user with `gravityforms_edit_settings=true` and `manage_options=false`. This is a faithful registration-tuple reproduction, **not** a literal replay of the reviewed original editor source.

## Bounded attempted method and observed results

A prototype registered the editor only after the **same** `GFCommon` authorization check, with WordPress's `read` permission used solely as the registered page's routing primitive. No user capabilities were granted in production, and the render/download authorization remained unchanged.

Executed WU21 run `38251394203` established:
- Generic independent no-code Gravity Forms E2E: PASS, including the previously established immutable successor roundtrip.
- A synthetic user with only the granular GF settings capability and no `manage_options` opened the GPP editor **direct URL** successfully (HTTP 200).
- That same user received HTTP **403** for the existing native `admin.php?page=gf_settings&subview=gravity-presentation-profiles` inventory.
- Adding `gravityforms_edit_forms` to that *ephemeral test user* (not a product role change) still left the native inventory at HTTP **403**.
- Original `manage_options` menu-tuple control returned HTTP **403**.
- A synthetic unrelated-capability user had `manage_options=true` but `GFCommon` settings permission false. The follow-on HTTP negative and download assertions were **not reached**, because inventory access failed first.

Earlier WU21 run `38250773402` similarly reproduced native inventory HTTP 403 for the GF-settings-only fixture. Core/merge-result CI on prototype Head `b87365956226d54e7bc649b2a920b36e5e48515f` was green (`38251394190`), but this does **not** qualify the failed authentic positive authorization journey.

## Decision and scope

The requested method must preserve the **existing** installed-profile inventory link and have that very user traverse the native GF settings page. WordPress/GF native settings navigation denies that user before GPP's editor authorization executes. A GPP submenu-capability repair alone cannot make the required existing inventory reachable.

Making that route work requires a separate authorization/navigation decision in Gravity Forms or a different GPP inventory surface, or relaxing the positive test's existing-inventory requirement. Those are outside the locked selected method. Do **not** silently grant roles, add a second capability authority, or claim admission from the passing direct-editor test.

The prototype's production edits, temporary authorization browser test and CI hook have been reverted in this PR. Reviewed editor behavior remains unchanged and **PRI-FND-001 remains open**. No merge, release or deployment is authorized from this finding.
