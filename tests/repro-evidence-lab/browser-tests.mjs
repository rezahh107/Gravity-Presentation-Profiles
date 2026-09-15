await import('./browser-tests-core.mjs');
await import('./manual-inbox-refresh-browser-test.mjs');
globalThis.CSS = globalThis.CSS || { escape: value => String(value).replace(/([^A-Za-z0-9_-])/g, '\\$1') };
await import('./authoring-prompt-admin-browser-tests.mjs');
await import('./diagnostics-admin-browser-tests.mjs');
await import('./diagnostics-bundle-validate.mjs');
