# PersianGravity Jalali Consumer V1

## Status

GPP optionally consumes PersianGravity's public Jalali presentation facade for host-owned Gregorian/system dates whose source semantics are explicitly qualified by the owning GPP surface.

This is presentation-only. Gravity Forms, Gravity Flow, and WordPress remain authoritative for stored values, timezone semantics, ordering, filtering, queries, workflow state, permissions, and transitions.

The exact qualified provider contract is PersianGravity `v4.6.0`, source `d134c9ac81b177a32a3138f074fca3d1c1ebfae4`, through:

```php
PGR_Jalali_Presentation::format_datetime(
    DateTimeInterface $source,
    ?DateTimeZone $target_timezone = null
): ?string
```

GPP does not load PersianGravity files, call its converter internals, or contain a Gregorian→Jalali conversion algorithm. The provider remains optional and is detected at the public-facade boundary. Provider releases other than the exact qualified `4.6.0` version remain native until separately qualified.

## Covered sources

### Gravity Forms `entry.date_created`

Canonical `entry.created_at` bindings resolve to Gravity Forms `date_created`. This source is treated as the host-owned UTC `Y-m-d H:i:s` datetime contract. GPP constructs a `DateTimeImmutable` with an explicit `UTC` timezone and omits the provider target timezone so PersianGravity applies the WordPress site timezone contract.

This covers the existing Entry Detail and Inbox presentation paths that consume canonical `entry.created_at`. The underlying entry value is never changed.

### Gravity Flow Timeline/history — exact 3.1.0 qualification

The admitted Timeline remains the native Gravity Flow Timeline. For the qualified Gravity Flow `3.1.0` runtime, WU18 verifies that:

- native Timeline events come through `Gravity_Flow_Common::get_timeline_notes()`;
- the raw event object exposes `date_created`;
- native Entry Detail passes that raw value to its date header formatter;
- Gravity Flow/GF note creation uses the UTC WordPress timestamp source;
- the synthetic `Workflow Submitted` Timeline event carries the authoritative entry `date_created` value.

Only that raw `note->date_created` seam is eligible for provider presentation, and only on exact Gravity Flow `3.1.0`. GPP never parses the already-rendered Timeline date text. If the version, raw property, strict source shape, provider, or conversion result is unavailable, the original native Timeline date node is retained unchanged.

## Deliberately native / not covered

- **Current-step Due:** the current admitted WU18 runtime has no authentic Due value in the current DOM and its producing source/timezone contract is not independently qualified for this integration. Numeric Due candidates therefore remain native and do not reach PersianGravity.
- **Inbox `workflow.due_at`:** remains optional and currently unbound/unadmitted. No Due value is fabricated or guessed.
- **Print dossier:** the current admitted Print composition has no host-owned/system date source that is both rendered and qualified for this consumer. Existing field-owned dates remain under their field/native presentation ownership.
- **Gravity Forms fields:** arbitrary field values are never interpreted as Gregorian system dates. Dedicated Jalali-domain values such as `pgr_jalali_date` stay on the native field presentation path and are never double-converted.

## Fail-safe behavior

Native presentation is retained when PersianGravity is absent, the provider version is not exactly the qualified `4.6.0` release, the qualified capability cannot be established, the `jalali_presentation` module is disabled, the public facade is unavailable, the source contract or strict source shape is not qualified, the provider returns `null`, the date is outside the provider's validated range, or the optional provider raises an exception.

No provider state is persisted by GPP. No global WordPress date filter, save/update hook, database rewrite, browser-side conversion, AJAX conversion endpoint, parallel Timeline, or duplicate date state is introduced.

## Diagnostics and evidence

The existing GPP runtime diagnostics vocabulary includes the bounded `integration.persian_gravity / JALALI_PRESENTATION` decision stage. It records non-PII reason codes for native fallback versus actual provider application; it does not record real entry timestamps.

WU18 additionally installs and byte-verifies the released PersianGravity `v4.6.0` ZIP in the existing disposable WordPress/Gravity Forms/Gravity Flow evidence lab. It verifies the released module-default-disabled native fallback, the real public facade after module enablement, an exact UTC→WordPress-site-timezone day-boundary case, provider `null` fallback, deterministic repeated rendering, and the qualified Timeline raw-date seam.
