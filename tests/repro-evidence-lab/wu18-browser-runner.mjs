import { chromium } from 'playwright';
import { runWu18BrowserTests } from './wu18-browser-tests.mjs';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
if (!artifactDir) {
  throw new Error('WU21_ARTIFACT_DIR is required for WU18 browser evidence.');
}

const browser = await chromium.launch({ headless: true });
let results = [];
try {
  results = await runWu18BrowserTests({ browser, baseUrl, artifactDir });
} finally {
  await browser.close();
}

if (results.some(result => result.status !== 'PASS')) {
  process.exit(1);
}
