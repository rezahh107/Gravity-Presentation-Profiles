# PersianGravity Jalali Consumer V1

## Status

GPP optionally consumes PersianGravity's public Jalali presentation facade for host-owned Gregorian/system dates whose source semantics are explicitly qualified by the owning GPP surface.

This is presentation-only. Gravity Forms, Gravity Flow, and WordPress remain authoritative for stored values, timezone semantics, ordering, filtering, queries, workflow state, permissions, and transitions.

The public provider contract was first runtime-qualified on PersianGravity `v4.6.0`, source `d134c9ac81b177a32a3138f074fca3d1c1ebfae4`, through:

```php
PGR_Jalali_Presentation::format_datetime(
    DateTimeInterface $source,
    ?DateTimeZone $target_timezone = null
): ?string
```

GPP does not load PersianGravity files, call its converter internals, or contain a Gregorian→Jalali conversion algorithm. The provider remains optional and is detected at the public-facade boundary.

Runtime admission is capability-first: GPP requires the already-loaded public `PGR_Jalali_Presentation` facade and callable `format_datetime()` method, then validates the nullable/non-empty string result. `PGR_VERSION` may distinguish diagnostic provider-presence context, but version identity does not admit or reject the integration. A missing facade/callable or unusable provider result preserves native presentation.

For the capability-first migration, the released PersianGravity `v4.8.0` facade was independently rechecked against `v4.6.0`: `includes/class-pgr-jalali-presentation.php` has the same Git blob SHA-1 `335dc59850dcbef8fe62dc28beae26bf0302c9b3` in both tags. This establishes continuity of the exact public facade consumed by GPP without promoting either release number into runtime compatibility authority.

## Covered sources

### Gravity Forms `entry.date_created`

Canonical `entry.created_at` bindings resolve to Gravity Forms `date_created`. This source is treated as the host-owned UTC `Y-m-d H:i:s` datetime contract. GPP constructs a `DateTimeImmutable` with an explicit `UTC` timezone and omits the provider target timezone so PersianGravity applies the WordPress site timezone contract.

This covers the existing Entry Detail and Inbox presentation paths that consume canonical `entry.created_at`. The underlying entry value is never changed.

### Gravity Flow Timeline/history — capability + provenance admission

The admitted Timeline remains the native Gravity Flow Timeline and reaches GPP only through the documented `gravityflow_timeline_notes` display-time filter. Runtime date admission does not inspect Gravity Flow version identity.

GPP admits exactly two timestamp provenance families:

- **Persisted Gravity Flow notes:** the Timeline note must have a positive note ID whose `date_created` exactly matches the corresponding `note_type=gravityflow` record returned for the same Entry by the public `GFAPI::get_notes()` API. Gravity Forms remains the authoritative note store and UTC timestamp owner.
- **Synthetic Workflow Submitted:** the item must match the bounded native Workflow Submitted signature, carry synthetic ID `0`, and its raw `date_created` must exactly equal the current Entry's authoritative UTC `date_created`.

Only after one of those provenance relationships is established does GPP apply strict `Y-m-d H:i:s`/real-date validation and delegate to PersianGravity. Unknown synthetic Timeline events, altered persisted timestamps, missing note capability, malformed sources, provider failure, or unusable provider output leave the original native Timeline date node unchanged.

The historical Gravity Flow `3.1.0` WU18 package/source evidence remains a reproducible control proving how the observed note families are produced in that runtime. It is evidence provenance, not production compatibility authority. GPP never parses already-rendered Timeline date text.

## Deliberately native / not covered

- **Current-step Due:** the current admitted WU18 runtime has no authentic Due value in the current DOM and its producing source/timezone contract is not independently qualified for this integration. Numeric Due candidates therefore remain native and do not reach PersianGravity.
- **Inbox `workflow.due_at`:** remains optional and currently unbound/unadmitted. No Due value is fabricated or guessed.
- **Print dossier:** the current admitted Print composition has no host-owned/system date source that is both rendered and qualified for this consumer. Existing field-owned dates remain under their field/native presentation ownership.
- **Gravity Forms fields:** arbitrary field values are never interpreted as Gregorian system dates. Dedicated Jalali-domain values such as `pgr_jalali_date` stay on the native field presentation path and are never double-converted.

## Fail-safe behavior

Native presentation is retained when PersianGravity/public facade is absent, the required callable capability cannot be established, the `jalali_presentation` module is disabled, the source contract or strict source shape is not qualified, the provider returns `null`/empty/unusable output, the date is outside the provider's validated range, or the optional provider raises an exception. A version mismatch by itself is not a fallback reason.

No provider state is persisted by GPP. No global WordPress date filter, save/update hook, database rewrite, browser-side conversion, AJAX conversion endpoint, parallel Timeline, or duplicate date state is introduced.

## Diagnostics and evidence

The existing GPP runtime diagnostics vocabulary includes the bounded `integration.persian_gravity / JALALI_PRESENTATION` decision stage. It records non-PII reason codes for native fallback versus actual provider application; it does not record real entry timestamps.

The historical WU18 qualification still installs and byte-verifies the released PersianGravity `v4.6.0` ZIP in the disposable WordPress/Gravity Forms/Gravity Flow evidence lab. It proves the environment it actually tested and is not rewritten as capability-first evidence.

The current capability-first regression additionally downloads and verifies the real PersianGravity `v4.8.0` release asset (SHA-256 `a050a4c5eaa87b9b3e8a216d83dcf08cf8af5aa887648ba7d0e98d04ce41a3ea`), verifies the public facade Git blob identity above, checks the reflected `DateTimeInterface` / optional `DateTimeZone` / nullable-string contract, and executes the real facade through the GPP bridge at an exact UTC→WordPress-site-timezone boundary plus provider-null fallback.
