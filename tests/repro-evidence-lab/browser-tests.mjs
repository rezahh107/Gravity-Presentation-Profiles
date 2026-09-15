await import('./browser-tests-core.mjs');
globalThis.CSS = globalThis.CSS || { escape: value => String(value).replace(/([^A-Za-z0-9_-])/g, '\\$1') };
await import('./diagnostics-admin-browser-tests.mjs');
await import('./diagnostics-bundle-validate.mjs');
