import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
const repoRoot = process.env.GITHUB_WORKSPACE;
const settingsUrl = `${baseUrl}/wp-admin/admin.php?page=gf_settings&subview=gravity-presentation-profiles`;
const resultFile = path.join(artifactDir, 'authoring-prompt-browser-results.json');

function wpEval(code) {
  const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], { encoding: 'utf8' });
  if (cp.status !== 0) throw new Error(`WP eval failed: ${cp.stderr}\n${cp.stdout}`);
  return cp.stdout;
}

function visualLifecycleSnapshot() {
  const output = wpEval('$state=get_option("gpp_visual_package_lifecycle_v1", null); echo wp_json_encode($state, JSON_UNESCAPED_SLASHES);').trim();
  return output === 'null' || output === '' ? null : JSON.parse(output);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

function sameJson(a, b) {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

async function saveSettings(page, textarea, value) {
  await textarea.fill(value);
  const form = textarea.locator('xpath=ancestor::form');
  const submit = form.locator('button[type="submit"], input[type="submit"]').last();
  await submit.waitFor({ state: 'visible', timeout: 15000 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
    submit.click(),
  ]);
  await page.waitForLoadState('networkidle');
}

const result = {
  id: 'GPP-AUTHORING-PROMPT-ADMIN-001',
  name: 'fixed offline General LLM prompt delivery and real package import boundary',
  status: 'FAIL',
  details: {},
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
try {
  await page.goto(`${baseUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', 'bootstrap_admin');
  await page.fill('#user_pass', 'wu21-bootstrap-pass-2026');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.click('#wp-submit'),
  ]);

  await page.goto(settingsUrl, { waitUntil: 'networkidle' });

  const section = page.locator('[data-gpp-general-llm-authoring-prompt="offline"]');
  await section.waitFor({ state: 'visible', timeout: 30000 });
  const sectionText = await section.innerText();
  for (const requiredText of [
    'GPP does not contact an AI service',
    'external general-purpose LLM',
    'Optional screenshots or design references',
    'resulting package JSON',
    'untrusted input',
  ]) {
    if (!sectionText.includes(requiredText)) throw new Error(`Authoring section missing required offline explanation: ${requiredText}`);
  }

  if (await section.locator('input[name*="api" i], input[name*="key" i], input[type="password"]').count() !== 0) {
    throw new Error('Authoring section unexpectedly exposes an API/provider credential field.');
  }

  const copyable = section.locator('[data-gpp-general-llm-authoring-prompt-copyable]');
  const uiPrompt = await copyable.inputValue();
  const canonicalPrompt = wpEval('echo \\GravityPresentationProfiles\\Core\\Authoring\\GeneralLlmAuthoringPrompt::contents();');
  if (uiPrompt !== canonicalPrompt) throw new Error('Copyable prompt does not match the canonical packaged prompt.');

  const download = section.locator('[data-gpp-general-llm-authoring-prompt-download]');
  const downloadHref = await download.getAttribute('href');
  if (!downloadHref) throw new Error('Prompt download action is missing.');
  if (new URL(downloadHref).origin !== new URL(baseUrl).origin) throw new Error('Prompt download escaped the local WordPress origin.');
  const response = await page.context().request.get(downloadHref);
  if (!response.ok()) throw new Error(`Prompt download failed with HTTP ${response.status()}.`);
  const downloadedPrompt = await response.text();
  if (downloadedPrompt !== canonicalPrompt) throw new Error('Downloaded prompt does not match the canonical packaged prompt.');
  const disposition = response.headers()['content-disposition'] || '';
  if (!disposition.includes('gpp-general-llm-authoring-prompt-v1.md')) throw new Error(`Unexpected prompt download filename: ${disposition}`);
  if (!(response.headers()['content-type'] || '').includes('text/markdown')) throw new Error('Prompt download did not use a local text/Markdown content type.');

  const promptSha = createHash('sha256').update(canonicalPrompt).digest('hex');
  const validJson = fs.readFileSync(path.join(repoRoot, 'tests/fixtures/general-llm-minimal-valid.json'), 'utf8');
  const invalidJson = fs.readFileSync(path.join(repoRoot, 'tests/fixtures/general-llm-unsupported-field.json'), 'utf8');

  const importField = page.getByLabel('Profile Package JSON', { exact: true });
  await importField.waitFor({ state: 'visible', timeout: 30000 });
  const beforeValid = visualLifecycleSnapshot();
  const beforeActivations = beforeValid?.activations || {};
  await saveSettings(page, importField, validJson);

  const afterValid = visualLifecycleSnapshot();
  if (!afterValid?.installed?.['portable.minimal.presentation']?.['1.0.0']) {
    throw new Error('Representative external-LLM package did not install through the real settings lifecycle.');
  }
  if (!sameJson(beforeActivations, afterValid.activations || {})) throw new Error('Package import unexpectedly changed visual activation state.');
  const inventoryText = await page.locator('body').innerText();
  if (!inventoryText.includes('portable.minimal.presentation') || !inventoryText.includes('portable.minimal.v1')) {
    throw new Error('Installed profile inventory did not expose the imported package/profile.');
  }

  const importFieldAfterValid = page.getByLabel('Profile Package JSON', { exact: true });
  const beforeInvalid = visualLifecycleSnapshot();
  await saveSettings(page, importFieldAfterValid, invalidJson);
  const afterInvalid = visualLifecycleSnapshot();
  if (!sameJson(beforeInvalid, afterInvalid)) throw new Error('Rejected generated package mutated authoritative visual lifecycle state.');
  const rejectedBody = await page.locator('body').innerText();
  if (!rejectedBody.includes('fictional_preference') && !rejectedBody.includes('unknown key')) {
    throw new Error('Unsupported generated package was not visibly rejected by the real settings lifecycle.');
  }

  if (await page.getByText('Mapping & Binding Health', { exact: true }).count() < 1) throw new Error('Mapping & Binding Health section disappeared.');
  if (await page.getByText('Diagnostics & Support', { exact: true }).count() < 1) throw new Error('Diagnostics & Support section disappeared.');
  if (await page.locator('[data-gpp-diagnostics="local"]').count() !== 1) throw new Error('Diagnostics runtime surface is not operational.');

  result.status = 'PASS';
  result.details = {
    settings_url: settingsUrl,
    prompt_sha256: promptSha,
    prompt_bytes: Buffer.byteLength(canonicalPrompt, 'utf8'),
    download_origin: new URL(downloadHref).origin,
    download_filename: 'gpp-general-llm-authoring-prompt-v1.md',
    copyable_matches_canonical: true,
    download_matches_canonical: true,
    credential_fields_in_authoring_section: 0,
    imported_package: 'portable.minimal.presentation@1.0.0',
    imported_profile: 'portable.minimal.v1',
    import_changed_activation_state: false,
    invalid_package_rejected_without_lifecycle_mutation: true,
    mapping_health_visible: true,
    diagnostics_visible: true,
  };
} catch (error) {
  result.details.error = String(error?.stack || error).slice(0, 8000);
} finally {
  await browser.close();
}

fs.writeFileSync(resultFile, JSON.stringify(result, null, 2) + '\n');
console.log(`${result.status} ${result.id} ${result.name}`);
if (result.status !== 'PASS') process.exit(1);
