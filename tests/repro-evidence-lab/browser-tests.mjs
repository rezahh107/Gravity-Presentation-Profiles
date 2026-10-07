await import('./browser-tests-core.mjs');
await import('./manual-inbox-refresh-browser-test.mjs');

// Candidate C production verification runs inside the same pinned WU21 runtime
// as the native Inbox suite. The original module preserves the shipped one-shot
// regression gates; the bidirectional unit module adds provenance/grow controls.
// Candidate C's synthetic binding falsifier predates its exact-delta cleanup and
// can leave the shared runtime ambiguous when a whole-option restore is
// ineffective. Run the fail-hard teardown/readback immediately after Candidate C
// and before the bidirectional browser qualification, so the latter can only run
// against the authoritative mirrored five-column SRWF binding. The final browser
// module then drives authentic shortcode + Block Inboxes against the real
// production adapter/asset and pinned Gravity Flow runtime.
await import('./inbox-width-candidate-c-test.mjs');
await import('./inbox-width-bidirectional-fit-recovery-test.mjs');
await import('./inbox-width-candidate-c-browser.mjs');
await import('./inbox-width-candidate-c-teardown.mjs');
await import('./inbox-width-bidirectional-fit-recovery-browser.mjs');
await import('./inbox-width-legacy-v040-carry-forward-qualification-browser.mjs');
await import('./inbox-width-legacy-v040-carry-forward-evidence-bridge.mjs');

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
