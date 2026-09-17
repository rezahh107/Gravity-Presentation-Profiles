import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
const repoRoot = process.env.GITHUB_WORKSPACE;
const resultFile = path.join(artifactDir, 'pr32-human-display-browser-results.json');

function wpCommand(args) {
  const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, ...args], {
    encoding: 'utf8',
    cwd: repoRoot,
    env: process.env,
  });
  if (cp.status !== 0) throw new Error(`WP command failed: ${cp.stderr}\n${cp.stdout}`);
  return cp.stdout.trim();
}

wpCommand(['eval-file', path.join(repoRoot, 'tests/repro-evidence-lab/prepare-inbox-human-display-fixture.php')]);
const fixture = JSON.parse(fs.readFileSync(path.join(artifactDir, 'pr32-human-display-fixture.json'), 'utf8'));

const result = {
  id: 'PR32-INBOX-DISPLAY-001',
  name: 'authentic GF display labels and single-file photo render through native Inbox search',
  status: 'FAIL',
  details: {},
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

async function waitForInbox() {
  await page.waitForSelector('[data-js="gflow-inbox"] .ag-root-wrapper', { timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container > .ag-row').length > 0, null, { timeout: 30000 });
}

async function search(query) {
  const input = page.locator('[data-js="gflow-inbox-search"]');
  if (await input.count() !== 1) throw new Error('Native Gravity Flow quick-search control is unavailable.');
  await input.click();
  await input.press('Control+A');
  await input.press('Backspace');
  await input.pressSequentially(query);
  await page.waitForFunction(
    ({ name }) => [...document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container > .ag-row')]
      .some(row => row.textContent.includes(name)),
    { name: fixture.student_name },
    { timeout: 15000 },
  );
  return page.locator('[data-js="gflow-inbox"] .ag-center-cols-container > .ag-row', { hasText: fixture.student_name }).first();
}

try {
  if (fixture.host_fields.grade.class !== 'GF_Field_Select' || fixture.host_fields.grade.type !== 'select') {
    throw new Error(`Grade fixture is not an authentic Gravity Forms select field: ${JSON.stringify(fixture.host_fields.grade)}`);
  }
  if (fixture.host_fields.school.class !== 'GF_Field_Select' || fixture.host_fields.school.type !== 'select') {
    throw new Error(`School fixture is not an authentic Gravity Forms select field: ${JSON.stringify(fixture.host_fields.school)}`);
  }
  if (fixture.host_fields.photo.class !== 'GF_Field_FileUpload' || fixture.host_fields.photo.type !== 'fileupload' || fixture.host_fields.photo.multipleFiles) {
    throw new Error(`Photo fixture is not an authentic single-file Gravity Forms field: ${JSON.stringify(fixture.host_fields.photo)}`);
  }
  if (fixture.multi_photo_resolution.status !== 'multiple_files_selection_unproven' || fixture.multi_photo_resolution.url !== null) {
    throw new Error('Authentic multi-file ambiguity did not preserve safe fallback semantics.');
  }

  await page.goto(`${baseUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', 'bootstrap_admin');
  await page.fill('#user_pass', 'wu21-bootstrap-pass-2026');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.click('#wp-submit'),
  ]);

  await page.goto(fixture.frontend_inbox_url, { waitUntil: 'networkidle' });
  await waitForInbox();

  const byLabel = await search(fixture.display_school);
  const card = byLabel.locator('.gpp-inbox-card');
  if (await card.count() !== 1) throw new Error('Human-label native search did not return the GPP card row.');

  const gradeVisible = (await card.locator('.gpp-inbox-card__grade-group dd').innerText()).trim();
  const schoolVisible = (await card.locator('.gpp-inbox-card__school dd').innerText()).trim();
  if (gradeVisible !== fixture.display_grade) throw new Error(`Grade visible value is not host display text: ${gradeVisible}`);
  if (schoolVisible !== fixture.display_school) throw new Error(`School visible value is not host display text: ${schoolVisible}`);
  if (gradeVisible === fixture.raw_grade || schoolVisible === fixture.raw_school) throw new Error('Raw choice identity leaked into visible card value.');

  const searchKey = (await byLabel.locator('.gpp-inbox-card__search-key').textContent()) || '';
  for (const expected of [fixture.display_grade, fixture.raw_grade, fixture.display_school, fixture.raw_school]) {
    if (!searchKey.includes(expected)) throw new Error(`Searchable presentation is missing ${expected}.`);
  }
  if (searchKey.includes('<') || searchKey.includes('>')) throw new Error('Hidden searchable text contains markup instead of normalized text.');

  const photo = card.locator('.gpp-inbox-card__photo-image');
  if (await photo.count() !== 1) throw new Error('Authoritative single-file student photo did not render.');
  const photoSrc = await photo.getAttribute('src');
  if (!photoSrc || photoSrc !== fixture.photo_resolution.url) {
    throw new Error(`Rendered photo URL did not come from Gravity Forms host resolution: ${photoSrc}`);
  }
  if (await card.locator('.gpp-inbox-card__photo-fallback').count() !== 0) throw new Error('Photo fallback rendered despite a valid authoritative image.');

  const byRaw = await search(fixture.raw_school);
  if (await byRaw.locator('.gpp-inbox-card').count() !== 1) throw new Error('Raw authoritative source value is no longer useful through native quick filtering.');

  result.status = 'PASS';
  result.details = {
    form_id: fixture.form_id,
    entry_id: fixture.entry_id,
    grade_field: fixture.host_fields.grade,
    school_field: fixture.host_fields.school,
    photo_field: fixture.host_fields.photo,
    multi_photo_field: fixture.host_fields.multi_photo,
    raw_grade: fixture.raw_grade,
    display_grade: gradeVisible,
    raw_school: fixture.raw_school,
    display_school: schoolVisible,
    visible_label_native_search: true,
    raw_value_native_search: true,
    resolved_photo_url: photoSrc,
    multi_file_selection: fixture.multi_photo_resolution.status,
  };
} catch (error) {
  result.details.error = String(error?.stack || error).slice(0, 8000);
} finally {
  await browser.close();
}

fs.writeFileSync(resultFile, JSON.stringify(result, null, 2) + '\n');
console.log(`${result.status} ${result.id} ${result.name}`);
if (result.status !== 'PASS') process.exit(1);
