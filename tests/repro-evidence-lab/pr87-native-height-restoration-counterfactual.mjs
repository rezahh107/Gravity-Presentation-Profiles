// Qualification-only compatibility entrypoint. The v2 harness supersedes the
// initial probe after the first run exposed an over-strict empty-overlay check.
await import('./pr87-native-height-restoration-counterfactual-v2.mjs');
