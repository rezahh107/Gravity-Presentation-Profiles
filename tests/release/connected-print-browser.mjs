import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [stage, fixturePath, baseUrl, out] = process.argv.slice(2);
if (!['unproven','confirmed','invalidated','final'].includes(stage) || !fs.existsSync(fixturePath || '') || !out || !/^http:\/\/127\.0\.0\.1:\d+$/.test(baseUrl || '')) throw Error('Invalid connected Print probe arguments');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const entryUrl = baseUrl + '/wp-admin/admin-ajax.php?action=gravityflow_print_entries&lid=' + fixture.entry_id;
const dossierUrl = entryUrl + '&gpp_presentation=dossier';
const expectedName = fixture.expected_first_name_value + ' ' + fixture.expected_last_name_value;
async function login(page, login, password) {
  await page.goto(baseUrl + '/wp-login.php');
  await page.locator('#user_login').fill(login);
  await page.locator('#user_pass').fill(password);
  await Promise.all([page.waitForNavigation(), page.locator('#wp-submit').click()]);
  if (await page.locator('#login_error').count()) throw Error('Native WordPress login failed');
}
const browser = await chromium.launch({headless:true});
try {
  const ctx = await browser.newContext();
  try {
    const page = await ctx.newPage();
    await login(page, process.env.GPP_TEST_ADMIN_USER, process.env.GPP_TEST_ADMIN_PASS);
    await page.goto(dossierUrl, {waitUntil:'networkidle'});
    const root = page.locator('.gpp-print-dossier[data-gpp-print-state="ready"]');
    if (await root.count() !== 1) throw Error('Authorized native dossier not ready: ' + (await page.locator('body').innerText()).slice(0,300));
    const pages = await root.locator('.gpp-print-sheet').evaluateAll(nodes => nodes.map(n => n.dataset.gppPrintPage));
    if (JSON.stringify(pages) !== '["front","back"]') throw Error('Two-sheet front/back order lost');
    const names = (await root.locator('.front-name-row .front-line:first-child .print-value, .paper-student-identity .name-field .print-value').allTextContents()).map(v => v.trim());
    if (names.length !== 2 || names.some(v => v !== expectedName)) throw Error('Distinct source first/last name derivation failed: ' + JSON.stringify(names));
    const opts = await root.locator('.paper-choice').evaluateAll(nodes => nodes.map(n => ({
      label:(n.textContent || '').replace('✓','').trim(), checked:n.querySelector('i')?.dataset.gppChecked === '1'
    })));
    const female = opts.filter(v => v.label === fixture.expected_choice.canonical_print_label);
    const male = opts.filter(v => v.label === 'مرد');
    const positive = stage === 'confirmed' || stage === 'final';
    if (female.length !== 1 || male.length !== 1 || female[0].checked !== positive || male[0].checked) throw Error('Proof-gated canonical Print choice failed');
    const htmlText = await root.innerText();
    if (htmlText.includes(fixture.expected_choice.host_raw_value) || htmlText.includes(fixture.expected_choice.host_display_value)) throw Error('Host raw/display identity leaked into canonical option');
    const finance = await root.locator('.paper-finance-summary .print-value').allTextContents();
    if (finance.some(v => v.trim())) throw Error('Unbound finance populated');
    if (await root.locator('.gpp-print-receipt-row').count() !== 5 || await root.locator('.gpp-print-cheque-row').count() !== 6) throw Error('Approved finance blanks were changed');
    const report = {stage, native_print_request:true, source_names:names, pages_dom:pages, female_selected:female[0].checked, male_selected:male[0].checked, finance_blank:true, no_raw_label_confusion:true};
    if (stage === 'final') {
      await page.emulateMedia({media:'print'});
      const metrics = await root.evaluate(el => {
        const sheets = [...el.querySelectorAll('.gpp-print-sheet')];
        const values = [...el.querySelectorAll('.print-value')].filter(n => n.textContent.trim());
        return {clipped_values:values.filter(n=>n.scrollWidth>n.clientWidth+1||n.scrollHeight>n.clientHeight+1).length, clipped_sheets:sheets.filter(n=>n.scrollWidth>n.clientWidth+1||n.scrollHeight>n.clientHeight+2).length};
      });
      if (metrics.clipped_values || metrics.clipped_sheets) throw Error('Rendered dossier clipped');
      report.layout = metrics;
      const pdf = path.join(out,'connected-print.pdf');
      await page.pdf({path:pdf,printBackground:true,preferCSSPageSize:true,scale:1});
      const info = spawnSync('pdfinfo',[pdf],{encoding:'utf8'});
      const count = Number(info.stdout.match(/^Pages:\s+(\d+)/m)?.[1]);
      const match = info.stdout.match(/^Page size:\s+([\d.]+) x ([\d.]+) pts/m);
      const w=Number(match?.[1]),h=Number(match?.[2]);
      if (info.status !== 0 || count !== 2 || Math.abs(w-595.28)>=2 || Math.abs(h-841.89)>=2 || w>=h) throw Error('PDF page count/A4 portrait failed: '+info.stdout);
      report.pdf = {pages:count,width_pt:w,height_pt:h};
      fs.writeFileSync(path.join(out,'connected-print-dossier.html'),await root.evaluate(el=>el.outerHTML)+'\n');
      const raster = spawnSync('pdftoppm',['-f','1','-l','2','-png','-r','96',pdf,path.join(out,'connected-print-page')],{encoding:'utf8'});
      if (raster.status !== 0 || !fs.existsSync(path.join(out,'connected-print-page-1.png')) || !fs.existsSync(path.join(out,'connected-print-page-2.png'))) throw Error('PDF page images not captured');
      await page.goto(entryUrl,{waitUntil:'networkidle'});
      if (await page.locator('.gpp-print-dossier').count() || await page.locator('#view-container > form').count()!==1 || !await page.locator('#view-container > form').evaluate(n=>getComputedStyle(n).display!=='none')) throw Error('Ordinary native Print altered');
      report.native_print_preserved = true;
      await page.goto(entryUrl+','+fixture.second_entry_id+'&gpp_presentation=dossier',{waitUntil:'networkidle'});
      if (await page.locator('[data-gpp-print-failure="unsupported_request_cardinality"]').count()!==1 || await page.locator('[data-gpp-print-state="ready"]').count()) throw Error('Bulk dossier failed to close');
      report.bulk_failed_closed = true;
      const viewer = await browser.newContext();
      try {
        const denied = await viewer.newPage();
        await login(denied,process.env.GPP_TEST_VIEWER_USER,process.env.GPP_TEST_VIEWER_PASS);
        await denied.goto(dossierUrl,{waitUntil:'networkidle'});
        const body = (await denied.locator('body').innerText()).replace(/\s+/g,' ');
        if (!body.includes("You don't have permission to view this entry.") || await denied.locator('.gpp-print-dossier, .gpp-print-decision-trace').count()) throw Error('Authenticated native Flow authorization negative failed: '+body.slice(0,250));
        report.unauthorized_authenticated_viewer_denied = true;
      } finally { await viewer.close(); }
    }
    fs.writeFileSync(path.join(out,'connected-print-'+stage+'.json'),JSON.stringify(report,null,2)+'\n');
    console.log('GPP_CONNECTED_PRINT_'+stage.toUpperCase()+'_PASS');
  } finally { await ctx.close(); }
} finally { await browser.close(); }
