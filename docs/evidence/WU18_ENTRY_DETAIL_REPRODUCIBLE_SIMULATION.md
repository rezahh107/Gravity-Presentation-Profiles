# WU18 Entry Detail Reproducible Simulation

`WU-GPP-GF-ENTRY-FINAL-18` is exercised against the repository's pinned Gravity Forms `3.1.1.1` and Gravity Flow `3.1.0` source/runtime packages in `.github/workflows/wu18-entry-detail-evidence.yml`.

The lab creates only synthetic `example.invalid` users, two synthetic forms with deliberately different Field IDs, native Approval steps, host-owned image/PDF upload values, and a native front-end Gravity Flow Inbox/Entry Detail shortcode page. The production adapter receives no fixture IDs.

Positive evidence from this lab is bounded to `PROVEN_IN_REPRODUCIBLE_SIMULATION`. It does not prove target-production Form IDs, Field IDs, Step IDs, Page/route IDs, editability, action availability, uploaded-file representation, or binding-set applicability. Those target facts remain `UNBOUND` / `NOT_PROVEN` until independently read back from the target environment.

The WU18 check deliberately remains separate from the immutable WU21 evidence builder. WU21 continues to prove its original native Inbox mechanics with its exact existing test-ID set; WU18 adds Entry Detail evidence without reinterpreting or weakening WU21.

The direct WU18 evidence artifact evaluates `AC-WU18-001` through `AC-WU18-008` from concrete PHP/native-runtime and Playwright results. The browser suite covers the enhanced native dossier, read-only/editability boundary, host-owned Approval actions, image preview accessibility/restoration, non-image file behavior, collapsed native history, desktop/mobile material parity, fail-closed missing bindings, native authorization denial, print utility placement, and preservation of one native Entry Detail application.

WU19 two-page A4 composition and WU20 final acceptance/release are explicitly outside this evidence unit.
