import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
    await page.emulateMedia({media:'print'});
    if (stage === 'final') {
      const metrics = await root.evaluate(el => {
        const sheets = [...el.querySelectorAll('.gpp-print-sheet')];
        const values = [...el.querySelectorAll('.print-value')].filter(n => n.textContent.trim());
        return {clipped_values:values.filter(n=>n.scrollWidth>n.clientWidth+1||n.scrollHeight>n.clientHeight+1).length, clipped_sheets:sheets.filter(n=>n.scrollWidth>n.clientWidth+1||n.scrollHeight>n.clientHeight+2).length};
      });
      if (metrics.clipped_values || metrics.clipped_sheets) throw Error('Rendered dossier clipped');
      report.layout = metrics;
    }
    const basename = stage === 'final' ? 'connected-print' : 'connected-print-' + stage;
    const pdf = path.join(out, basename+'.pdf');
      await page.pdf({path:pdf,printBackground:true,preferCSSPageSize:true,scale:1});
      const info = spawnSync('pdfinfo',[pdf],{encoding:'utf8'});
      const count = Number(info.stdout.match(/^Pages:\s+(\d+)/m)?.[1]);
      const match = info.stdout.match(/^Page size:\s+([\d.]+) x ([\d.]+) pts/m);
      const w=Number(match?.[1]),h=Number(match?.[2]);
      if (info.status !== 0 || count !== 2 || Math.abs(w-595.28)>=2 || Math.abs(h-841.89)>=2 || w>=h) throw Error('PDF page count/A4 portrait failed: '+info.stdout);
      report.pdf = {pages:count,width_pt:w,height_pt:h};
      if (stage === 'final') fs.writeFileSync(path.join(out,'connected-print-dossier.html'),await root.evaluate(el=>el.outerHTML)+'\n');
      const raster = spawnSync('pdftoppm',['-f','1','-l','2','-png','-r','96',pdf,path.join(out,basename+'-page')],{encoding:'utf8'});
      if (raster.status !== 0 || !fs.existsSync(path.join(out,basename+'-page-1.png')) || !fs.existsSync(path.join(out,basename+'-page-2.png'))) throw Error('PDF page images not captured');
      // This is the enforcement boundary: verify the exported PDF and its
      // actual raster pages, not the DOM that existed before page.pdf().
      const verifier = fileURLToPath(new URL('./verify-connected-print-output.mjs', import.meta.url));
      const rasterOne = path.join(out, basename+'-page-1.png');
      const rasterTwo = path.join(out, basename+'-page-2.png');
      const verify = (pdfFile, firstRaster, secondRaster) => {
        const result = spawnSync(process.execPath, [
          verifier, pdfFile, firstRaster, secondRaster, expectedName,
          fixture.expected_choice.canonical_print_label,
          fixture.expected_choice.host_raw_value,
          fixture.expected_choice.host_display_value,
          stage
        ], { encoding:'utf8', maxBuffer:20*1024*1024 });
        return { accepted:result.status === 0 && !result.error,
          message:String(result.stderr || result.stdout || result.error?.message || '').trim() };
      };
      const baseline = verify(pdf, rasterOne, rasterTwo);
      if (!baseline.accepted || !baseline.message.includes('GPP_CONNECTED_PRINT_OUTPUT_PASS')) throw Error('Post-export PDF/raster verification failed: '+baseline.message);
      report.post_export_pdf_raster_verified = true;
      if (stage === 'unproven' || stage === 'invalidated') {
        // PRI-FND-002: reproduce the original false-acceptance boundary.
        // This is a PRINT-ONLY pseudo-element, so the native unselected DOM
        // and GF/Flow mapping state are unchanged.
        const marker = page.locator('.gpp-print-sheet[data-gpp-print-page="front"] .front-study .front-options .paper-choice:first-child i');
        if (await marker.count() !== 1 ||
            (await marker.textContent()).trim() !== '' ||
            await marker.getAttribute('data-gpp-checked') !== null ||
            !(await marker.locator('xpath=..').innerText()).includes(fixture.expected_choice.canonical_print_label)) {
          throw Error('Cannot establish unselected female DOM control before print mutation: '+stage);
        }
        const css = '@media print {.gpp-print-sheet[data-gpp-print-page="front"] .front-study .front-options .paper-choice:first-child i::after {content:"✓"!important;display:inline!important;font-family:Arial,sans-serif!important;font-weight:900!important;font-size:11px!important;color:#000!important}}';
        const mutation = await page.addStyleTag({content:css});
        const dir = fs.mkdtempSync(path.join(out,'connected-print-'+stage+'-negative-'));
        try {
          const pseudo = await marker.evaluate(el => getComputedStyle(el, '::after').content);
          if (!pseudo.includes('✓') || (await marker.textContent()).trim() !== '' ||
              await marker.getAttribute('data-gpp-checked') !== null) {
            throw Error('Print-only mutation did not preserve unselected DOM state: '+stage);
          }
          const mutantPdf = path.join(dir,'selected-gender-in-unselected.pdf');
          await page.pdf({path:mutantPdf,printBackground:true,preferCSSPageSize:true,scale:1});
          const extracted = spawnSync('pdftotext',['-f','1','-l','1','-layout',mutantPdf,'-'],{encoding:'utf8'});
          if (extracted.status !== 0 ||
              !extracted.stdout.includes('✓') ||
              !extracted.stdout.includes(fixture.expected_choice.canonical_print_label)) {
            throw Error('Print-media mutant did not materially create a selected indicator in the exported PDF: '+stage);
          }
          const prefix = path.join(dir,'selected-gender-in-unselected');
          const images = spawnSync('pdftoppm',['-f','1','-l','2','-png','-r','96',mutantPdf,prefix],{encoding:'utf8'});
          if (images.status !== 0) throw Error('Cannot rasterize print-only mutation: '+stage+' '+images.stderr);
          if (fs.readFileSync(prefix+'-1.png').equals(fs.readFileSync(rasterOne))) {
            throw Error('Print-only mutation did not change actual first-page raster pixels: '+stage);
          }
          const rejected = verify(mutantPdf,prefix+'-1.png',prefix+'-2.png');
          const requiredReason = 'Unexpected selected canonical gender indicator in unselected printed PDF page 1';
          if (rejected.accepted || !rejected.message.includes(requiredReason)) {
            throw Error('Unselected stage falsely accepted a printed gender indicator: '+stage+' '+rejected.message);
          }
          const preserved = verify(pdf,rasterOne,rasterTwo);
          if (!preserved.accepted || !preserved.message.includes('GPP_CONNECTED_PRINT_OUTPUT_PASS stage='+stage+' ')) {
            throw Error('Original unselected PDF/raster positive control lost: '+stage+' '+preserved.message);
          }
          fs.writeFileSync(path.join(out,'connected-print-'+stage+'-falsification.json'),JSON.stringify({
            stage, source:'PRINT_ONLY_CSS_IN_NATIVE_CHROMIUM_PDF',
            dom_female_unselected:true, mutation_materialized_in_pdf:true,
            mutant_first_page_raster_changed:true,
            extracted_text_indicator:'✓',
            mutated_pdf_result:'REJECTED_AS_REQUIRED',
            original_pdf_raster_result:'ACCEPTED_AS_REQUIRED'
          },null,2)+'\n');
        } finally {
          fs.rmSync(dir,{recursive:true,force:true});
          await mutation.evaluate(el=>el.remove());
        }
      }
      if (stage === 'final') {
      const negativeCases = [
        {
          key:'first_page_name_print_only_hidden',
          css:'@media print {.gpp-print-sheet[data-gpp-print-page="front"] .front-name-row .front-line:first-child .print-value {visibility:hidden!important}}',
          selector:'.gpp-print-sheet[data-gpp-print-page="front"] .front-name-row .front-line:first-child .print-value',
          reason:'Printed full name absent from PDF page 1'
        },
        {
          key:'second_page_name_print_only_hidden',
          css:'@media print {.gpp-print-sheet[data-gpp-print-page="back"] .paper-student-identity .name-field .print-value {visibility:hidden!important}}',
          selector:'.gpp-print-sheet[data-gpp-print-page="back"] .paper-student-identity .name-field .print-value',
          reason:'Printed full name absent from PDF page 2'
        },
        {
          key:'selected_gender_indicator_print_only_hidden',
          css:'@media print {.gpp-print-sheet[data-gpp-print-page="front"] .paper-choice i[data-gpp-checked="1"] {visibility:hidden!important}}',
          selector:'.gpp-print-sheet[data-gpp-print-page="front"] .paper-choice i[data-gpp-checked="1"]',
          reason:'Selected canonical female indicator absent from printed PDF page one'
        }
      ];
      const falsifications = [];
      const mutants = fs.mkdtempSync(path.join(out, 'connected-print-negative-'));
      try {
        for (const scenario of negativeCases) {
          const style = await page.addStyleTag({content:scenario.css});
          try {
            if (await page.locator(scenario.selector).count() !== 1 ||
              await page.locator(scenario.selector).evaluate(el => getComputedStyle(el).visibility) !== 'hidden' ||
              !(await root.innerText()).includes(expectedName) ||
              await root.locator('i[data-gpp-checked="1"]').count() !== 1 ||
              (await root.locator('i[data-gpp-checked="1"]').textContent()).trim() !== '✓') {
              throw Error('Print-only falsification did not preserve the DOM while hiding its printed target: '+scenario.key);
            }
            const mutatedPdf = path.join(mutants, scenario.key+'.pdf');
            await page.pdf({path:mutatedPdf,printBackground:true,preferCSSPageSize:true,scale:1});
            const prefix = path.join(mutants,scenario.key);
            const result = spawnSync('pdftoppm',['-f','1','-l','2','-png','-r','96',mutatedPdf,prefix],{encoding:'utf8'});
            if (result.status !== 0) throw Error('Poppler mutation rendering failed: '+result.stderr);
            const verdict = verify(mutatedPdf,prefix+'-1.png',prefix+'-2.png');
            if (verdict.accepted || !verdict.message.includes(scenario.reason)) {
              throw Error('Post-export verifier failed to falsify '+scenario.key+': '+verdict.message);
            }
            falsifications.push({case:scenario.key, result:'REJECTED_AS_REQUIRED', reason:scenario.reason});
          } finally {
            await style.evaluate(el => el.remove());
          }
        }
        // Exact original PDF + raster must remain valid. Only the raster is
        // corrupted in this negative control: PDF content and geometry are intact.
        const white = await page.evaluate(() => {
          const canvas=document.createElement('canvas');
          canvas.width=794; canvas.height=1123;
          const ctx=canvas.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,794,1123);
          return canvas.toDataURL('image/png').split(',')[1];
        });
        const blank = path.join(mutants,'blank.png');
        fs.writeFileSync(blank,Buffer.from(white,'base64'));
        const rasterVerdict = verify(pdf,blank,rasterTwo);
        if (rasterVerdict.accepted || !rasterVerdict.message.includes('Captured raster does not match the actual PDF page 1')) {
          throw Error('Blank-raster falsification not rejected: '+rasterVerdict.message);
        }
        falsifications.push({case:'blank_raster_substitution',result:'REJECTED_AS_REQUIRED',reason:'Captured raster does not match the actual PDF page 1'});
      } finally {
        fs.rmSync(mutants,{recursive:true,force:true});
      }
      const recheck = verify(pdf,rasterOne,rasterTwo);
      if (!recheck.accepted || !recheck.message.includes('GPP_CONNECTED_PRINT_OUTPUT_PASS')) throw Error('Original valid PDF/raster not preserved: '+recheck.message);
      falsifications.push({case:'original_pdf_and_rasters_preserved',result:'ACCEPTED_AS_REQUIRED'});
      report.output_falsifications = falsifications;
      fs.writeFileSync(path.join(out,'connected-print-falsification.json'),JSON.stringify({authority:'CURRENT_RUN_CHROMIUM_PDF_AND_POPPLER_RASTERS',results:falsifications},null,2)+'\n');
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
