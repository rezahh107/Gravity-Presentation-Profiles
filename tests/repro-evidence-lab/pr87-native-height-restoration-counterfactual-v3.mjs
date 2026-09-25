// Qualification-only compatibility entrypoint. The V2 harness now contains the
// corrected positive-control contract directly: current PR87 desktop materialization
// must remain a strict subset of native 20, without assuming every integrated host
// stage materializes exactly five rows.
await import('./pr87-native-height-restoration-counterfactual-v2.mjs');
