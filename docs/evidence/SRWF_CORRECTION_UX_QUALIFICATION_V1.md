# SRWF Correction / User Input UX Qualification V1

Status: **QUALIFICATION-ONLY / DO-NOT-MERGE / NO RELEASE**

## Exact planning baseline

- Repository: `rezahh107/Gravity-Presentation-Profiles`
- Fresh `main`: `8d2b066c64ffc0963bdfc45829495ffb4d08cf8d`
- Pinned Gravity Forms: `3.1.1.1`
- Pinned Gravity Flow: `3.1.0`
- Target host used by the existing MR-4 qualification family: Hello Elementor `3.5.1` at `e86d30a7d64b2ab59373422a14933bba3621ee04`

## Authority / product boundary

Correction remains native Gravity Flow Revert -> native Gravity Flow User Input -> native completion -> Review.

Gravity Forms / Gravity Flow remain authoritative for editable fields, values, validation, conditional logic, uploads, permissions, authorization, submission, workflow transition, nonces, errors and Save Progress behavior. GPP may own only bounded presentation adaptation.

This qualification must not rebuild the form, clone or move editable controls, add a custom endpoint/action, replace native validation, or use brittle DOM text replacement.

## Production isolation

This PR intentionally does **not** modify:

- `src/SRWF/GravityFlow/EntryDetailJourneyPresentationAdapter.php`
- `assets/css/srwf-gravity-flow-entry-detail-journey.css`
- Inbox geometry code
- terminal Approved/Rejected behavior
- workflow/admin management behavior

The branch adds only an isolated qualification workflow, source/runtime probes and this evidence document.

## Questions under qualification

1. Which host/native container actually controls edge-to-edge Correction geometry, and where is the smallest safe gutter/max-readable-width seam?
2. Which nodes compute LTR/left alignment and where can RTL presentation be applied without breaking phone/code/email/URL/numeric values?
3. Which minimal spacing/surface rules are sufficient without redesigning the form?
4. Does exact Gravity Flow `3.1.0` expose and execute a scoped native label seam for the User Input completion control, preserving native identity and completion semantics?

## Evidence design

`srwf-journey-host-correction-ux-source-probe.php` inventories the exact installed Gravity package source for User Input CTA filters and button topology.

`srwf-journey-host-correction-ux-browser.mjs` reaches authentic Review -> Revert -> User Input, captures computed geometry/direction/text alignment at 1920, 1680 and 390, takes screenshots, and records the outer ancestor chain controlling width.

If the exact pinned package contains `gravityflow_update_button_text_user_input`, the browser probe installs a **test-only MU-plugin** that scopes the filter to the exact synthetic form + correction step and changes only the visible update label to `اصلاح اطلاعات`. It then compares native form/button identity, hidden controls and successful control names before/after, and completes the native step to prove the workflow still returns to Review.

No production repair is included in this qualification.

## Current evidence before dedicated run

The existing MR-4 production qualification already proves that the Correction admission marker is rendered, the authentic `.gform_wrapper` remains the editor, current GPP wrapper/input/button surface CSS is effective, native conditional logic and validation remain live, the completion control is `#gravityflow_update_button`, keyboard focus remains reachable, and native completion returns to Review.

That earlier evidence does **not** identify the actual outer geometry owner, computed RTL/text alignment chain, or CTA-label host seam; those are the remaining qualification targets here.

## Planned disposition

After exact-Head artifacts are captured, this document/PR description will be updated with:

- exact route/topology and viewports;
- geometry and RTL root-cause map;
- current-CSS effectiveness classification;
- exact native CTA ownership and label-seam result (`PROVEN` / `NOT_PROVEN`);
- one bounded production repair direction and its regression obligations;
- unresolved evidence, if any.
