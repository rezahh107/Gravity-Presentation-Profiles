// Qualification-only compatibility entrypoint. Capture the exact pinned Gravity Flow
// grid-sizing seam inventory before executing the V2 counterfactual. This is evidence
// only; production source and host runtime behavior remain unchanged.
await import('./pr87-host-grid-seam-inventory.mjs');
await import('./pr87-native-height-restoration-counterfactual-v2.mjs');
