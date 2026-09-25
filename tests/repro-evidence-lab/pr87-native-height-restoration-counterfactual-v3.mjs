// Qualification-only compatibility entrypoint. Capture the exact pinned Gravity Flow
// grid-sizing evidence and execute bounded counterfactuals before the pre-existing
// visual diagnostics reach the already-known PR87 failure. Production source remains
// untouched; the row-buffer experiment mutates only the ephemeral WU21 runtime and
// removes its temporary MU plugin before returning.
await import('./pr87-host-grid-seam-inventory.mjs');
await import('./pr87-row-buffer-source-probe.mjs');
await import('./pr87-native-height-restoration-counterfactual-v2.mjs');
await import('./pr87-row-buffer-sweep-and-run.mjs');
