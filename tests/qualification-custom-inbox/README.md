# Independent read-only Inbox qualification

Disposable Owner-authorized architecture experiment, separate from the binding
Native-First production architecture. No production code, vendor source, authority,
capability or live data changes. Do not merge, release or deploy this branch.

## Gate A — source-inspected PASS

Authentic Flow 3.1.0 package SHA-256:
`ac0573b75831380417a21a455176e25eb746d718bbbd0bb70d6da6f48cba5404`.
Source is inspected locally; no vendor source is added to this experiment.

| Boundary | Source / signature | Classification and finding |
| --- | --- | --- |
| Entries | `includes/class-api.php:376`, static `get_inbox_entries($args = array(), &$total_count = 0)` | DOCUMENTED_PUBLIC; official Flow 2.4 release publicly announces it; native current Task Model delegates to it. Full GF entry arrays, **not** field-redacted objects. |
| Count | same file:406, static `get_inbox_entries_count($args = array())` | DOCUMENTED_PUBLIC; same search/form selection, count only. |
| Search/identity | same file:432/482/510/540/578, `get_inbox_search_criteria`, `get_inbox_filter_key`, `get_inbox_form_ids`, `get_inbox_paging`, `get_inbox_sorting` | PUBLIC_UNDOCUMENTED methods; documented related hooks. Current user unless caller overrides filter_key/user_id. Host pending user/role membership, active entries, relevant workflow forms. Server must not accept arbitrary identity arguments. |
| Native model | `includes/inbox/models/class-task.php:721`, `get_inbox_tasks($args)` | INTERNAL; parses native defaults and gravityflow_inbox_args, calls public query and projects columns/URLs. Native service provider:223–265 serializes this into Grid rowData. |
| Entry access | `includes/pages/class-entry-detail.php:386`, static `is_permission_granted($entry,$form,$current_step)` | INTERNAL; creator, assignee or host full/status privileges; native caller subsequently applies gravityflow_permission_granted_entry_detail. Not inferred from a generic WordPress capability. |
| Field visibility | `includes/class-common.php:455`, static `is_display_field($field,$current_step,$form,$entry,$is_product_field=false)` | INTERNAL helper; native Approval detail uses it after gform_pre_render, conditional visibility, step display policy and documented gravityflow_workflow_detail_display_field. Not a general standalone supported field API. |
| Native frontend | `class-gravity-flow.php:6165/6376`, shortcode / Inbox routing | DOCUMENTED_PUBLIC shortcode; logged-in frontend users need not have wp-admin gravityflow_inbox capability. Native wp-admin capability is a separate boundary. |

Public API default page size is 150. Enumerate explicit offset/page_size and verify
stable total and unique IDs. Errors from GFAPI can propagate; empty result is an
array. Count initializes to zero. Entry ID uniquely denotes the sequential current
step in this fixture; compare `(entry_id, form_id, current_step_id)` as well. This
does not qualify multiple simultaneously actionable assignments or email tokens.

Official source links: https://gravityflow.io/releases/gravity-flow-2-4-released/
and https://docs.gravityflow.io/gravityflow_workflow_detail_display_field/ and
https://docs.gravityflow.io/shortcodes/ . The release documents API existence,
not a complete caller-authorization or field-redaction contract.

## Execution

The dedicated Actions workflow reuses WU21's exact pinned provisioning, package
verification, 25-task multi-form fixture, runtime capture and PHP host assertions.
`headless.php` invokes PR162's actual mixed-readiness fixture and complete
page-size-one identity oracle, then adds three low-privilege officer tasks with a
withheld identifier. No capabilities are modified. Native Task Model output is the
behavioral reference. Each user is compared against their own current identity.

The candidate query owns no assignment SQL/state. Its projection calls native
entry/field checks, omits unqualified forms/fields, and currently qualifies only
simple text fields on current-assignee Approval steps. User Input field semantics
are NOT_PROVEN. Raw entry values remain server-side, never a client response.
Any later UI must be constructed only after observed Gate B success.

Scope: version-specific synthetic compatibility, not production admission, target
Owner site acceptance, all Gravity Flow features, or universal compatibility.
No exact-version production rejection rule follows from the fixture pin.
Search/sort/live refresh, performance at scale, alternate caches, session races,
theme/PersianGravity coexistence and wider field types remain unqualified.
