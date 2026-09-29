await import('./browser-tests-core.mjs');
await import('./manual-inbox-refresh-browser-test.mjs');

globalThis.CSS = globalThis.CSS || { escape: value => String(value).replace(/([^A-Za-z0-9_-])/g, '\\$1') };
await import('./authoring-prompt-admin-browser-tests.mjs');
await import('./diagnostics-admin-row-browser-tests.mjs');
await import('./diagnostics-bundle-validate.mjs');
await import('./inbox-settings-admin-browser-tests.mjs');

// Card Mode, card-humanization, card palette/fidelity, card accessibility and the
// PR65 width prototype are historical qualification artifacts. They are not
// current Native-First merge gates and must not force production back onto the
// superseded gpp_case_card topology.

// Establish the one authoritative, idempotent P06 fixture before the late
// reachability consumer. P06 now proves only bounded asset/surface admission and
// preservation of the native Gravity Flow Inbox topology.
await import('./p06-fixture-bootstrap.mjs');

if (process.env.GPP_DEFER_P06_QUALIFICATION !== '1') {
  await import('./p06-inbox-asset-reachability-browser-test.mjs');
}

// Bounded INBOX_VISUAL_DESIGN_V2 evidence reuses this exact WU21 host, Grid,
// fixtures and polling transport. The qualifier restores its synthetic mutation
// state and removes its MU probe before the deferred P06/visual-host stages run.
await import('./inbox-visual-design-v2-qualification.mjs');
