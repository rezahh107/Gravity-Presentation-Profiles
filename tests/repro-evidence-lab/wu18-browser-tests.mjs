import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function bounded(value, max = 5000) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function entryUrl(manifest, key) {
  const fixture = manifest.forms[key];
  const url = new URL(manifest.page.url);
  url.searchParams.set('page', 'gravityflow-inbox');
  url.searchParams.set('view', 'entry');
  url.searchParams.set('id', String(fixture.form_id));
  url.searchParams.set('lid', String(fixture.entry_id));
  return url.toString();
}

async function login(page, baseUrl, user) {
  await page.goto(`${baseUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', user.login);
  await page.fill('#user_pass', user.password);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.click('#wp-submit'),
  ]);
}

function runtimeControl(action) {
  const wpCli = process.env.WU21_WP_CLI;
  const wpPath = process.env.WU21_WP_PATH;
  const repoRoot = process.env.GITHUB_WORKSPACE;
  const env = { ...process.env, WU18_CONTROL: action };
  const script = path.join(repoRoot, 'tests/repro-evidence-lab/wu18-runtime-control.php');
  const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval-file', script], { encoding: 'utf8', env });
  if (cp.status !== 0) {
    throw new Error(`WU18 runtime control ${action} failed:\n${cp.stdout}\n${cp.stderr}`);
  }
  return cp.stdout.trim();
}

async function waitForEnhanced(page) {
  await page.waitForSelector('.gravityflow_workflow_detail', { timeout: 30000 });
  await page.waitForSelector('.gravityflow_workflow_detail.gpp-entry-detail--enhanced [data-gpp-entry-detail-projection]', { state: 'visible', timeout: 30000 });
}

async function materialSnapshot(page) {
  return page.evaluate(() => {
    const projection = document.querySelector('[data-gpp-entry-detail-projection]');
    const text = element => element ? element.textContent.trim().replace(/\s+/g, ' ') : null;
    return {
      profile: projection?.getAttribute('data-gpp-profile-id') || null,
      identity: text(projection?.querySelector('.gpp-entry-detail__identity')),
      task_title: text(projection?.querySelector('#gpp-current-task-title')),
      section_titles: [...(projection?.querySelectorAll('.gpp-entry-detail__material > .gpp-entry-detail__section > h2') || [])].map(text),
      facts: [...(projection?.querySelectorAll('.gpp-entry-detail__fact') || [])].map(node => ({
        label: text(node.querySelector('dt')),
        value: text(node.querySelector('dd')),
      })),
      documents: [...(projection?.querySelectorAll('.gpp-entry-detail__document-name, .gpp-entry-detail__thumbnail > span') || [])].map(text),
      history_summary: text(projection?.querySelector('.gpp-entry-detail__history > summary')),
      history_help: text(projection?.querySelector('.gpp-entry-detail__history-help')),
    };
  });
}

export async function runWu18BrowserTests({ browser, baseUrl, artifactDir }) {
  const manifest = JSON.parse(fs.readFileSync(path.join(artifactDir, 'wu18-fixture-manifest.json'), 'utf8'));
  const results = [];
  const record = (id, name, status, details = null) => results.push({ id, name, status, details });
  const test = async (page, id, name, fn) => {
    try {
      record(id, name, 'PASS', await fn());
    } catch (error) {
      record(id, name, 'FAIL', { error: bounded(error?.stack || error) });
    }
  };

  const operatorContext = await browser.newContext();
  const page = await operatorContext.newPage();
  await login(page, baseUrl, manifest.operator);
  const alphaUrl = entryUrl(manifest, 'alpha');
  const betaUrl = entryUrl(manifest, 'beta');

  await test(page, 'WU18-BROWSER-001', 'native Entry Detail becomes one continuous dossier with identity before current task', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(alphaUrl, { waitUntil: 'networkidle' });
    await waitForEnhanced(page);
    const state = await page.evaluate(() => {
      const root = document.querySelector('.gravityflow_workflow_detail');
      const projection = document.querySelector('[data-gpp-entry-detail-projection]');
      const identity = projection?.querySelector('.gpp-entry-detail__identity');
      const task = projection?.querySelector('.gpp-entry-detail__task');
      const backlink = root?.querySelector('.gravityflow-back-link-container');
      const nativeGrid = root?.querySelector('table.entry-detail-view');
      const taskStyle = task ? getComputedStyle(task) : null;
      const identityStyle = identity ? getComputedStyle(identity) : null;
      return {
        native_roots: document.querySelectorAll('.gravityflow_workflow_detail').length,
        projections: document.querySelectorAll('[data-gpp-entry-detail-projection]').length,
        profile: projection?.getAttribute('data-gpp-profile-id') || null,
        task_title: task?.querySelector('h2')?.textContent.trim() || null,
        identity_before_task: !!(identity && task && (identity.compareDocumentPosition(task) & Node.DOCUMENT_POSITION_FOLLOWING)),
        native_grid_display: nativeGrid ? getComputedStyle(nativeGrid).display : null,
        backlink_visible: !!(backlink && backlink.getBoundingClientRect().height > 0),
        task_background: taskStyle?.backgroundColor || null,
        identity_background: identityStyle?.backgroundColor || null,
        task_border: taskStyle?.borderTopColor || null,
        identity_border: identityStyle?.borderTopColor || null,
      };
    });
    if (state.native_roots !== 1 || state.projections !== 1) throw new Error(`Unexpected Entry Detail ownership: ${JSON.stringify(state)}`);
    if (state.profile !== 'shared.entry_detail.v1') throw new Error(`Wrong shared profile: ${state.profile}`);
    if (state.task_title !== 'کاری که الان باید انجام دهید') throw new Error(`Current-task title changed: ${state.task_title}`);
    if (!state.identity_before_task || !state.backlink_visible) throw new Error(`Dossier semantic order/backlink failed: ${JSON.stringify(state)}`);
    if (state.native_grid_display !== 'none') throw new Error(`Native grid was not presentation-hidden after readiness: ${state.native_grid_display}`);
    if (state.task_background === state.identity_background && state.task_border === state.identity_border) throw new Error('Current-task section is not visually distinct from identity.');
    return state;
  });

  await test(page, 'WU18-BROWSER-002', 'read-only facts stay label/value and only native Approval actions are exposed', async () => {
    await page.goto(alphaUrl, { waitUntil: 'networkidle' });
    await waitForEnhanced(page);
    const materialControls = await page.locator('[data-gpp-material-content] input, [data-gpp-material-content] select, [data-gpp-material-content] textarea, .gpp-entry-detail__identity input, .gpp-entry-detail__identity select, .gpp-entry-detail__identity textarea').count();
    if (materialControls !== 0) throw new Error(`GPP created editable dossier controls: ${materialControls}`);

    const buttons = page.locator('.gpp-entry-detail__task .gravityflow-action-buttons button[type="submit"]');
    if (await buttons.count() !== 2) throw new Error(`Expected exactly two native Approval actions, got ${await buttons.count()}`);
    const values = (await buttons.evaluateAll(nodes => nodes.map(node => node.value))).sort();
    if (JSON.stringify(values) !== JSON.stringify(['approved', 'rejected'])) throw new Error(`Unexpected native action values: ${JSON.stringify(values)}`);
    const labels = await buttons.evaluateAll(nodes => nodes.map(node => node.textContent.trim().replace(/\s+/g, ' ')));
    if (!labels.some(label => label.includes('تأیید پرونده')) || !labels.some(label => label.includes('رد پرونده'))) throw new Error(`Persian native action labels missing: ${JSON.stringify(labels)}`);
    const hostOwned = await buttons.evaluateAll(nodes => nodes.every(node => node.closest('form[id^="gform_"]') && (node.getAttribute('onclick') || '').includes('handleApprovalStepButtonClick')));
    if (!hostOwned) throw new Error('Approval buttons lost native form/controller ownership.');
    const taskText = await page.locator('.gpp-entry-detail__task').innerText();
    for (const invented of ['Save Draft', 'Send Next', 'Return for Correction']) {
      if (taskText.includes(invented)) throw new Error(`Invented workflow action leaked into dossier: ${invented}`);
    }
    if (await page.locator('.gpp-entry-detail__task .gravityflow-action-buttons button[value="revert"]').count() !== 0) throw new Error('Revert action was manufactured/exposed.');
    return { material_controls: materialControls, action_values: values, labels, native_controller: true };
  });

  await test(page, 'WU18-BROWSER-003', 'image document preview supports Escape backdrop focus and scroll restoration', async () => {
    await page.setViewportSize({ width: 900, height: 620 });
    await page.goto(alphaUrl, { waitUntil: 'networkidle' });
    await waitForEnhanced(page);
    const trigger = page.locator('[data-gpp-image-preview-open]').first();
    if (await trigger.count() !== 1) throw new Error('Authentic bound image thumbnail was not rendered.');
    await trigger.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, 80));
    const beforeScroll = await page.evaluate(() => window.scrollY);
    await trigger.click();
    const dialog = page.locator('[data-gpp-image-preview-dialog]').first();
    if (!(await dialog.isVisible())) throw new Error('Image dialog did not open on the same page.');
    await page.keyboard.press('Escape');
    if (await dialog.isVisible()) throw new Error('Escape did not close image preview.');
    const focusRestoredEscape = await trigger.evaluate(node => document.activeElement === node);
    const afterEscapeScroll = await page.evaluate(() => window.scrollY);
    if (!focusRestoredEscape || Math.abs(afterEscapeScroll - beforeScroll) > 2) throw new Error(`Escape restoration failed: focus=${focusRestoredEscape} scroll=${beforeScroll}->${afterEscapeScroll}`);

    await trigger.click();
    await dialog.click({ position: { x: 4, y: 4 } });
    if (await dialog.isVisible()) throw new Error('Backdrop did not close image preview.');
    const focusRestoredBackdrop = await trigger.evaluate(node => document.activeElement === node);
    const afterBackdropScroll = await page.evaluate(() => window.scrollY);
    if (!focusRestoredBackdrop || Math.abs(afterBackdropScroll - beforeScroll) > 2) throw new Error(`Backdrop restoration failed: focus=${focusRestoredBackdrop} scroll=${beforeScroll}->${afterBackdropScroll}`);
    return { escape: true, backdrop: true, focus_restored: true, scroll_restored: true };
  });

  await test(page, 'WU18-BROWSER-004', 'non-image document preserves host file identity/open behavior and optional photo fails closed', async () => {
    await page.goto(betaUrl, { waitUntil: 'networkidle' });
    await waitForEnhanced(page);
    if (await page.locator('.gpp-entry-detail__identity-photo img').count() !== 0) throw new Error('NOT_PROVEN Beta photo leaked into identity presentation.');
    if (await page.locator('.gpp-entry-detail__identity-photo > span[aria-hidden="true"]').count() !== 1) throw new Error('NOT_PROVEN Beta photo did not use local fallback.');
    if (await page.locator('[data-gpp-image-preview-open]').count() !== 0) throw new Error('PDF/non-image file was incorrectly treated as image preview.');
    const file = page.locator('.gpp-entry-detail__document--file').first();
    if (await file.count() !== 1) throw new Error('Host-backed non-image document presentation missing.');
    const name = await file.locator('.gpp-entry-detail__document-name').innerText();
    const link = file.locator('a');
    const href = await link.getAttribute('href');
    if (name !== manifest.forms.beta.report_file) throw new Error(`Real file identity changed: ${name}`);
    if (!href || !href.includes('action=gf-download')) throw new Error(`File open affordance does not use Gravity Forms safe download URL: ${href}`);
    if (await link.getAttribute('target') !== '_blank') throw new Error('Non-image open affordance lost normal new-tab behavior.');
    return { file_name: name, safe_host_download: true, optional_photo: 'fail_closed_fallback' };
  });

  await test(page, 'WU18-BROWSER-005', 'history is secondary collapsed and contains the authentic native timeline', async () => {
    await page.goto(alphaUrl, { waitUntil: 'networkidle' });
    await waitForEnhanced(page);
    const history = page.locator('.gpp-entry-detail__history');
    if (await history.getAttribute('open') !== null) throw new Error('History is not collapsed by default.');
    const helper = (await history.locator('.gpp-entry-detail__history-help').innerText()).trim().replace(/\s+/g, ' ');
    const expected = 'اینجا می‌توانید ببینید پرونده در چه تاریخ‌هایی بررسی شده، چه نتیجه‌ای ثبت شده و اگر برای اصلاح برگشته، دلیل آن چه بوده است.';
    if (helper !== expected) throw new Error(`Locked history helper changed: ${helper}`);
    if (await history.locator('.gravityflow-timeline').count() !== 1) throw new Error('Native Gravity Flow timeline was not preserved in history.');
    const ordering = await page.evaluate(() => {
      const material = document.querySelector('[data-gpp-material-content]');
      const history = document.querySelector('.gpp-entry-detail__history');
      const sections = material ? [...material.querySelectorAll(':scope > .gpp-entry-detail__section')] : [];
      const lastSection = sections.length ? sections[sections.length - 1] : null;
      return !!(lastSection && history && (lastSection.compareDocumentPosition(history) & Node.DOCUMENT_POSITION_FOLLOWING));
    });
    if (!ordering) throw new Error('History is not near the end after primary dossier sections.');
    return { collapsed: true, locked_helper: true, native_timeline: true };
  });

  await test(page, 'WU18-BROWSER-006', 'mobile preserves desktop material dossier content and section order', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(alphaUrl, { waitUntil: 'networkidle' });
    await waitForEnhanced(page);
    const desktop = await materialSnapshot(page);
    await page.setViewportSize({ width: 700, height: 1000 });
    await page.reload({ waitUntil: 'networkidle' });
    await waitForEnhanced(page);
    const mobile = await materialSnapshot(page);
    if (JSON.stringify(desktop) !== JSON.stringify(mobile)) throw new Error(`Desktop/mobile material content diverged.\nDesktop=${JSON.stringify(desktop)}\nMobile=${JSON.stringify(mobile)}`);
    return { profile: desktop.profile, material_content_equal: true, section_titles: desktop.section_titles };
  });

  await test(page, 'WU18-BROWSER-007', 'missing required binding fails closed to operable native Entry Detail', async () => {
    runtimeControl('required-not-proven-on');
    try {
      await page.setViewportSize({ width: 1200, height: 900 });
      await page.goto(alphaUrl, { waitUntil: 'networkidle' });
      await page.waitForSelector('.gravityflow_workflow_detail', { timeout: 30000 });
      const state = await page.evaluate(() => {
        const root = document.querySelector('.gravityflow_workflow_detail');
        const grid = root?.querySelector('table.entry-detail-view');
        return {
          unready: root?.querySelectorAll('[data-gpp-entry-detail-readiness="unready"]').length || 0,
          enhanced: root?.classList.contains('gpp-entry-detail--enhanced') || false,
          projection: root?.querySelectorAll('[data-gpp-entry-detail-projection]').length || 0,
          native_grid_visible: !!(grid && getComputedStyle(grid).display !== 'none' && grid.getBoundingClientRect().height > 0),
          native_form: root?.querySelectorAll('form[id^="gform_"]').length || 0,
        };
      });
      if (state.unready !== 1 || state.enhanced || state.projection !== 0 || !state.native_grid_visible || state.native_form !== 1) throw new Error(`Fail-closed native fallback failed: ${JSON.stringify(state)}`);
      return state;
    } finally {
      runtimeControl('required-not-proven-off');
    }
  });

  await test(page, 'WU18-BROWSER-008', 'native authorization denial cannot be bypassed by GPP presentation', async () => {
    const deniedContext = await browser.newContext();
    const deniedPage = await deniedContext.newPage();
    try {
      await login(deniedPage, baseUrl, manifest.denied_user);
      await deniedPage.goto(alphaUrl, { waitUntil: 'networkidle' });
      await deniedPage.waitForSelector('.gravityflow_workflow_detail', { timeout: 30000 });
      const state = await deniedPage.evaluate(() => ({
        projection: document.querySelectorAll('[data-gpp-entry-detail-projection]').length,
        ready_marker: document.querySelectorAll('[data-gpp-entry-detail-readiness="ready"]').length,
        native_form: document.querySelectorAll('.gravityflow_workflow_detail form[id^="gform_"]').length,
        enhanced: document.querySelector('.gravityflow_workflow_detail')?.classList.contains('gpp-entry-detail--enhanced') || false,
        text: document.querySelector('.gravityflow_workflow_detail')?.textContent.trim().replace(/\s+/g, ' ').slice(0, 300) || '',
      }));
      if (state.projection !== 0 || state.ready_marker !== 0 || state.native_form !== 0 || state.enhanced) throw new Error(`GPP bypassed native access denial: ${JSON.stringify(state)}`);
      return { ...state, native_denial_preserved: true };
    } finally {
      await deniedContext.close();
    }
  });

  await test(page, 'WU18-BROWSER-009', 'native Print remains a utility outside current-task actions without a GPP route', async () => {
    await page.goto(alphaUrl, { waitUntil: 'networkidle' });
    await waitForEnhanced(page);
    const state = await page.evaluate(() => {
      const print = document.querySelector('.detail-view-print');
      const utility = document.querySelector('[data-gpp-print-utility-slot]');
      const task = document.querySelector('.gpp-entry-detail__task');
      const link = print?.querySelector('a');
      return {
        print_exists: !!print,
        inside_utility: !!(print && utility?.contains(print)),
        inside_task: !!(print && task?.contains(print)),
        href: link?.getAttribute('href') || null,
        onclick: link?.getAttribute('onclick') || null,
      };
    });
    if (!state.print_exists || !state.inside_utility || state.inside_task) throw new Error(`Print utility placement failed: ${JSON.stringify(state)}`);
    if (state.href !== 'javascript:;' || !String(state.onclick).includes('action=gravityflow_print_entries')) throw new Error(`Print utility no longer uses the native host behavior: ${JSON.stringify(state)}`);
    return { native_print_preserved: true, outside_task_cluster: true, new_gpp_print_route: false };
  });

  await test(page, 'WU18-BROWSER-010', 'enhancement preserves exactly one native Entry Detail application', async () => {
    await page.goto(alphaUrl, { waitUntil: 'networkidle' });
    await waitForEnhanced(page);
    const state = await page.evaluate(() => ({
      native_roots: document.querySelectorAll('.gravityflow_workflow_detail').length,
      native_forms: document.querySelectorAll('.gravityflow_workflow_detail form[id^="gform_"]').length,
      native_status_boxes: document.querySelectorAll('#gravityflow-status-box-container').length,
      native_timelines: document.querySelectorAll('.gravityflow-timeline').length,
      replacement_apps: document.querySelectorAll('[data-gpp-replacement-entry-detail], .gpp-custom-entry-app').length,
      projections: document.querySelectorAll('[data-gpp-entry-detail-projection]').length,
    }));
    if (state.native_roots !== 1 || state.native_forms !== 1 || state.native_status_boxes !== 1 || state.native_timelines !== 1 || state.replacement_apps !== 0 || state.projections !== 1) {
      throw new Error(`Entry Detail ownership duplication detected: ${JSON.stringify(state)}`);
    }
    return state;
  });

  if (results.some(result => result.status !== 'PASS')) {
    await page.screenshot({ path: path.join(artifactDir, 'wu18-browser-failure.png'), fullPage: true }).catch(() => {});
  }
  await operatorContext.close();

  fs.writeFileSync(
    path.join(artifactDir, 'wu18-browser-results.json'),
    JSON.stringify({ suite: 'WU18 native Entry Detail browser/runtime', results }, null, 2) + '\n',
  );
  for (const result of results) console.log(`${result.status} ${result.id} ${result.name}`);
  return results;
}
