# Native Inbox cell parity — separate experimental successor to PR169

Production main remains a159e22c54f102ff2f73c365a97ade6beb90b63e. Immediate
test-only parent is PR169 Head 47b9ac13bc88458cbfb01338cafe42e23c8ed935;
PR169 remains open/draft and its branch is not changed.

## Source-inspected Gate A

Native Task::get_inbox_tasks(args) in includes/inbox/models/class-task.php:721
parses host defaults, invokes public get_inbox_entries, calls get_table_columns,
then generates each actual native row. Numeric base fields use the field's
get_value_entry_list, then gform_entries_field_value, then
gravityflow_inbox_field_value. The host's date helper is at priority 10; GPP's
InboxTableHeaderPresentation registers at PHP_INT_MAX. GPP composes the name
and school/grade from BoundHostValueReader::readDisplay, which invokes each GF
field's get_value_entry_detail(..., use_text=true, format=text), not the complete
Entry Detail renderer. It does not apply gform_entry_field_value or
gform_field_content merely because those callbacks are registered.

GPP's column admission resolves a unique form-scoped current binding/proof.
Global/multi-form or incomplete/stale bindings preserve native fallback. Readiness
is source availability, never user permission or entry-value completeness.

The native JS cell valueFormatter reads displayKey from the row. cellLinkRenderer
puts it into a span through innerHTML. The candidate accepts only final scalar
plain cells, decodes entities once, and must escape in its own UI. Non-scalar or
actual rich HTML output is individually omitted with an unqualified-cell reason.
No whitespace/case/digit/Unicode normalization is applied to parity. The browser
must compare the native span's actual textContent, including punctuation and ZWNJ.

Candidate boundary: use the authentic native Task Model's final row output and
header definitions; never call a filter directly on raw entry values, and never
copy GPP composition or native authorization. Reuse PR169's task enumeration and
entry guard. Use GPP's own initialGeometryContract to identify admitted semantic
columns. Only the three accepted student-information columns may be projected.

Public stability inventory:
- get_inbox_entries/count and published column/value hooks: DOCUMENTED_PUBLIC.
- Native Task Model/container/header generation, GPP geometry contract and
  native Entry Detail permission helper: INTERNAL integration dependencies.
- GF field display methods are exposed framework contracts, but calling one
  alone would be insufficient to reproduce the final native Inbox pipeline.
- Native internal inbox/changes endpoint also invokes the same Task Model.
  Manual AJAX response parity, if run, is not automatic Live Refresh qualification.

Owner Native-First/Foundation/Toolbox documents were reused after current Drive
modification metadata confirmed no change from the preceding retrieved snapshots.
Their accepted form-scoped five-column projection explicitly includes national ID;
Entry Detail Display Fields is a distinct surface setting. The new experiment
does not convert native parity alone into universal disclosure permission.

## Gate sequence and tests

The inherited WU21 17 host tests, complete PR169 headless tests and 20 Chromium
tests run unchanged before the additional fixture is created. A new synthetic
form uses the same real OperationsSetup/BindingRepair/InboxSetup services and
default-subscriber Officer, default-subscriber viewer and administrator. Native
task selection remains the sole task owner. Native and candidate must enumerate
all results and compare entry/form/current-step tuples and exact effective cells.

Discriminating controls test final native Inbox masking, list filters, Detail-only
masking, an unrelated final-field-HTML hook, an explicitly participating hook,
opaque output limited to one cell, stale proof after real binding remap, proper
requalification, missing data/choice labels/Unicode/HTML-sensitive values, denied
entry, and unchanged global/unproven/unconfigured fallback. Same comparators must
reject wrong compositions, raw unmasked value, unauthorized rows, stale proof and
hidden sensitive response values. Early name masking is separately observed:
GPP's later composition may override it; that is not a universal masking guarantee.

No personal-field custom UI is added until the new headless gate is observed
passing. No production source, vendor file, capability, authority, real data,
release, tag, merge or deployment is authorized by this experiment.
