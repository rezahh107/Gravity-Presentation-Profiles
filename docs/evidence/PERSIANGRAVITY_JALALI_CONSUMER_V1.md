# PersianGravity Jalali consumer integration — V1

## Scope

Gravity Presentation Profiles (GPP) is a presentation-only consumer of PersianGravity's public Jalali system-date presentation capability. GPP does not own Gregorian-to-Jalali calendar arithmetic and does not load PersianGravity implementation files.

Qualified provider identity:

- repository: `rezahh107/PersianGravity`
- release: `v4.6.0`
- source commit: `d134c9ac81b177a32a3138f074fca3d1c1ebfae4`
- public facade: `PGR_Jalali_Presentation`
- public instant method: `PGR_Jalali_Presentation::format_datetime(DateTimeInterface $source, ?DateTimeZone $target_timezone = null): ?string`
- provider validated Gregorian range: `1800-01-01` through `2124-03-19`

`null` from the provider means native presentation must be retained.

## Optionality and failure behavior

PersianGravity is not a GPP runtime dependency. The consumer feature-detects the provider version plus the loaded/callable public facade. GPP does not `require` provider files and does not call `PGR_Gregorian_Jalali_Converter`.

Native presentation is retained when the provider is absent, older than the qualified contract, its `jalali_presentation` module is disabled, the facade is unavailable, the source is malformed or not semantically qualified, the provider returns `null`, the source falls outside the provider's validated product range, or the optional provider call throws.

The consumer never changes stored values, query values, sorting/filtering keys, workflow state, permissions, transitions, or host timestamps.

## Qualified source semantics and covered surfaces

### Gravity Forms `entry.date_created`

GPP admits only the canonical `gravity_forms.entry_meta` / `date_created` source. Gravity Forms owns this raw value and documents it as UTC. GPP parses only strict `Y-m-d H:i:s` with an explicit `UTC` timezone, then passes the resulting `DateTimeImmutable` to the PersianGravity facade without a target timezone so PersianGravity applies the WordPress site-timezone contract.

This source is used by the admitted Entry Detail `entry.created_at` semantic and the Inbox `entry.created_at` semantic. The raw Entry value remains unchanged.

### Gravity Flow Timeline/history

Timeline Jalali presentation is version-bounded to Gravity Flow `3.1.0` and uses the native note object's raw `date_created` property. GPP never parses the already-rendered Timeline date text.

The WU18 pinned runtime gate must prove all of the following before the Timeline date seam is described as runtime-qualified on a Head:

- native Timeline notes expose raw `note.date_created`;
- the value has the exact host datetime shape;
- Gravity Flow obtains native Timeline notes from Gravity Forms note storage;
- Gravity Flow feeds raw `note.date_created` into its native header/date formatting path;
- native note creation uses WordPress UTC database time;
- malformed raw values preserve native Timeline date presentation;
- native event order/content are unchanged and no synthetic Timeline event is introduced.

If the host version differs from `3.1.0` or any precondition is absent, GPP leaves the native Timeline date unchanged.

### Entry Detail current-stage Due

The existing Full Width current-stage projection may present a Due value only when the authentic current Gravity Flow step reports `supports_due_date()` and supplies a positive numeric `get_due_date_timestamp()`. That numeric value is treated only as a Unix instant; GPP performs no date-string parsing. Missing Due remains omitted.

### Inbox Due

`workflow.due_at` remains optional and currently has no admitted Inbox source adapter. An unbound or unsupported Due does not make an otherwise-ready Inbox row unready, and GPP does not manufacture a Due value. Therefore V1 does not claim an active Inbox Due Jalali path merely because the formatter is capable of formatting a qualified instant.

### Print

The current admitted Print composition does not expose a proven host-owned Gregorian/system-date seam equivalent to Entry `date_created` or Timeline note `date_created`. Existing print semantic date fields are not reinterpreted based on their appearance. Print therefore remains unchanged by V1 unless a future bounded source contract proves an explicit Gregorian/system source.

## Already-Jalali and arbitrary-field protection

Only source ownership/semantics admit conversion. GPP does not infer Gregorian versus Jalali from digit shapes, year magnitude, or visible text.

Gravity Forms fields continue through the native field display path. This includes dedicated Jalali-domain values such as `pgr_jalali_date` and arbitrary user-entered date fields. They are never sent to the Gregorian/system-date consumer merely because their value looks date-like.

## Diagnostics

The existing runtime diagnostics surface records the bounded integration stage `JALALI_PRESENTATION` without recording real entry values or timestamps. It distinguishes provider/capability/source fallback states from successful provider application. A successful application means the real consumer path returned provider presentation output; provider installation alone is not success evidence.

## Verification boundary

Focused unit tests cover absent/disabled/incompatible/provider-failure/provider-null behavior, strict source parsing, deterministic rendering, and provider-only output. The WU18 pinned runtime path additionally downloads and byte-verifies the exact PersianGravity `v4.6.0` release package, proves module-disabled native fallback, enables the real public capability in the disposable lab, checks a UTC-to-site-timezone day boundary, verifies exact provider/GPP output equality, and exercises the Gravity Flow `3.1.0` Timeline raw timestamp seam.

Exact-Head runtime/CI results are evidence for a particular commit only; this document does not convert an unexecuted check into a PASS.
