from pathlib import Path
import re


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one match, found {count}')
    p.write_text(text.replace(old, new, 1))


def regex_once(path, pattern, replacement):
    p = Path(path)
    text = p.read_text()
    new, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f'{path}: regex expected one match, found {count}')
    p.write_text(new)


# PRI-FND-004: owned current-task heading class + narrowly scoped admin cascade win.
adapter = 'src/SRWF/GravityFlow/EntryDetailPresentationAdapter.php'
replace_once(
    adapter,
    "        echo '<h2>' . esc_html__( 'کاری که الان باید انجام دهید', 'gravity-presentation-profiles' ) . '</h2>';",
    "        echo '<h2 class=\"gpp-entry-dossier__task-heading\">' . esc_html__( 'کاری که الان باید انجام دهید', 'gravity-presentation-profiles' ) . '</h2>';",
)
css = 'assets/css/srwf-gravity-flow-entry-detail.css'
replace_once(
    css,
    '.gpp-entry-dossier .gpp-entry-dossier__task h2 { font-size: 21px; }',
    '.gpp-entry-dossier .gpp-entry-dossier__task > .gpp-entry-dossier__task-heading,\n#poststuff .gpp-entry-dossier__task > .gpp-entry-dossier__task-heading { font-size: 21px; font-weight: 700; }',
)
replace_once(
    css,
    '    .gpp-entry-dossier .gpp-entry-dossier__task h2 { font-size: 19px; }',
    '    .gpp-entry-dossier .gpp-entry-dossier__task > .gpp-entry-dossier__task-heading,\n    #poststuff .gpp-entry-dossier__task > .gpp-entry-dossier__task-heading { font-size: 19px; font-weight: 700; }',
)

# Runtime proof that the owned typography rule remains isolated from host headings/actions.
entry = 'tests/repro-evidence-lab/entry-visual-contract-tests.mjs'
replace_once(
    entry,
    "    const h1 = identity.querySelector('h1'); const h2 = task.querySelector('h2');",
    "    const h1 = identity.querySelector('h1'); const h2 = task.querySelector('.gpp-entry-dossier__task-heading');\n    if (!h2) return { missing: true, reason: 'owned current-task heading missing' };\n    const nativeHeading = task.querySelector('[data-gpp-native-editor] h1, [data-gpp-native-editor] h2, [data-gpp-native-editor] h3, [data-gpp-native-editor] h4, [data-gpp-native-editor] .gsection_title');\n    const nativeAction = task.querySelector('[data-gpp-native-actions] button, [data-gpp-native-actions] input[type=\"submit\"], [data-gpp-native-native-actions] input[type=\"button\"]');",
)
replace_once(
    entry,
    "    })();\n    return {\n      missing: false, root: r(root), identity: r(identity), task: r(task), documents: documents ? r(documents) : null, history: history ? r(history) : null, actions: actions ? r(actions) : null,",
    "    })();\n    const ownedTypographyIsolation = (() => {\n      const headingMatches = []; const actionMatches = [];\n      const visit = rules => {\n        for (const rule of rules) {\n          if (rule.type === CSSRule.STYLE_RULE && rule.selectorText?.includes('gpp-entry-dossier__task-heading')) {\n            try { if (nativeHeading?.matches(rule.selectorText)) headingMatches.push(rule.selectorText); } catch {}\n            try { if (nativeAction?.matches(rule.selectorText)) actionMatches.push(rule.selectorText); } catch {}\n          }\n          if (rule.cssRules) { try { visit(rule.cssRules); } catch {} }\n        }\n      };\n      for (const sheet of document.styleSheets) { try { visit(sheet.cssRules); } catch {} }\n      return { task_heading_has_owned_class: h2.classList.contains('gpp-entry-dossier__task-heading'), native_heading_present: Boolean(nativeHeading), native_action_present: Boolean(nativeAction), native_heading_owned_rule_matches: headingMatches, native_action_owned_rule_matches: actionMatches };\n    })();\n    return {\n      missing: false, root: r(root), identity: r(identity), task: r(task), documents: documents ? r(documents) : null, history: history ? r(history) : null, actions: actions ? r(actions) : null,",
)
replace_once(
    entry,
    "      h2FontSizeCascade: fontSizeCascade,\n      weights,",
    "      h2FontSizeCascade: fontSizeCascade,\n      ownedTypographyIsolation,\n      weights,",
)
replace_once(
    entry,
    "  if (actual.styles.fontSynthesis !== 'none') failures.push(`font-synthesis must be none, got ${actual.styles.fontSynthesis}`);\n  return { pass: failures.length === 0, failures };",
    "  if (actual.styles.fontSynthesis !== 'none') failures.push(`font-synthesis must be none, got ${actual.styles.fontSynthesis}`);\n  if (!actual.ownedTypographyIsolation?.task_heading_has_owned_class) failures.push('current-task H2 is not owned by the GPP task-heading class');\n  if (actual.ownedTypographyIsolation?.native_heading_owned_rule_matches?.length) failures.push('owned task-heading typography selector matches a native editor heading');\n  if (actual.ownedTypographyIsolation?.native_action_owned_rule_matches?.length) failures.push('owned task-heading typography selector matches a native Approval action');\n  if (!actual.h2FontSizeCascade?.winner?.selector?.includes('gpp-entry-dossier__task-heading')) failures.push(`current-task H2 cascade winner is not the owned GPP rule: ${JSON.stringify(actual.h2FontSizeCascade?.winner)}`);\n  if (actual.h2FontSizeCascade?.winner?.priority !== 'normal') failures.push(`owned current-task H2 unexpectedly requires !important: ${actual.h2FontSizeCascade?.winner?.priority}`);\n  return { pass: failures.length === 0, failures };",
)
replace_once(
    entry,
    "    return { tolerance_derivation: tolerances, owner_root_width_px: reference.root.width, owner_stage_width_px: reference.stage.width, major_regions_compared: regionNames, no_overlap: true, no_horizontal_overflow: true, palette_contract: true, typography_reference_conformance: true, forbidden_weight_600: false };",
    "    return { tolerance_derivation: tolerances, owner_root_width_px: reference.root.width, owner_stage_width_px: reference.stage.width, major_regions_compared: regionNames, no_overlap: true, no_horizontal_overflow: true, palette_contract: true, typography_reference_conformance: true, current_task_h2_px: actual.h2.size, current_task_h2_weight: actual.h2.weight, cascade_winner: actual.h2FontSizeCascade.winner, native_host_typography_rule_isolation: actual.ownedTypographyIsolation, forbidden_weight_600: false };",
)

# PRI-FND-005: Owner-derived structural rules/edges only; glyph/text density is excluded.
print_test = 'tests/repro-evidence-lab/print-visual-contract-tests.mjs'
structural = r'''function pdfPageGeometry(pdf) {
  const cp = spawnSync('pdfinfo', [pdf], { encoding: 'utf8' });
  if (cp.status !== 0) throw new Error(`pdfinfo failed for ${pdf}: ${cp.stderr}`);
  const pages = cp.stdout.match(/^Pages:\s+(\d+)/m);
  const size = cp.stdout.match(/^Page size:\s+([\d.]+) x ([\d.]+) pts \(([^)]+)\)/m);
  if (!pages || !size) throw new Error(`Unable to parse PDF geometry for ${pdf}`);
  return { pages: Number(pages[1]), width_pt: Number(size[1]), height_pt: Number(size[2]), label: size[3] };
}
const structuralPolicy = Object.freeze({
  dark_threshold: 205,
  horizontal_min_fraction: 0.18,
  vertical_min_fraction: 0.45,
  horizontal_min_px: 18,
  vertical_min_px: 12,
  extraction_cluster_px: 3,
  match_tolerance_px: 5,
  page_tolerance_pt: 0.5,
});
function runs(length, isDark) {
  const out = []; let start = -1;
  for (let i = 0; i < length; i++) {
    const dark = isDark(i);
    if (dark && start < 0) start = i;
    if (start >= 0 && (!dark || i === length - 1)) {
      const end = dark && i === length - 1 ? i : i - 1;
      out.push([start, end]); start = -1;
    }
  }
  return out;
}
function structuralSignature(image, region) {
  const x0 = Math.max(0, Math.floor(region[0] * image.width)); const y0 = Math.max(0, Math.floor(region[1] * image.height));
  const x1 = Math.min(image.width, Math.ceil((region[0] + region[2]) * image.width)); const y1 = Math.min(image.height, Math.ceil((region[1] + region[3]) * image.height));
  const width = x1 - x0, height = y1 - y0;
  const minH = Math.max(structuralPolicy.horizontal_min_px, Math.round(width * structuralPolicy.horizontal_min_fraction));
  const minV = Math.max(structuralPolicy.vertical_min_px, Math.round(height * structuralPolicy.vertical_min_fraction));
  const horizontal = []; const vertical = [];
  const addHorizontal = (start, end) => {
    const item = { start: start / width, end: end / width };
    if (!horizontal.some(v => Math.abs(v.start - item.start) * width <= structuralPolicy.extraction_cluster_px && Math.abs(v.end - item.end) * width <= structuralPolicy.extraction_cluster_px)) horizontal.push(item);
  };
  const addVertical = x => {
    const item = x / width;
    if (!vertical.some(v => Math.abs(v - item) * width <= structuralPolicy.extraction_cluster_px)) vertical.push(item);
  };
  for (let y = 0; y < height; y++) {
    for (const [start, end] of runs(width, x => image.pixels[(y0 + y) * image.width + x0 + x] < structuralPolicy.dark_threshold)) {
      if (end - start + 1 >= minH) addHorizontal(start, end);
    }
  }
  for (let x = 0; x < width; x++) {
    for (const [start, end] of runs(height, y => image.pixels[(y0 + y) * image.width + x0 + x] < structuralPolicy.dark_threshold)) {
      if (end - start + 1 >= minV) addVertical(x);
    }
  }
  horizontal.sort((a,b) => a.start - b.start || a.end - b.end); vertical.sort((a,b) => a - b);
  return { width, height, horizontal, vertical, extraction: { min_horizontal_px: minH, min_vertical_px: minV } };
}
const printRegions = [
  { page: 0, name: 'front_header', box: [0.04, 0.02, 0.92, 0.15] },
  { page: 0, name: 'front_identifiers', box: [0.04, 0.15, 0.92, 0.10] },
  { page: 0, name: 'front_candidate', box: [0.04, 0.23, 0.92, 0.64] },
  { page: 0, name: 'front_footer', box: [0.04, 0.93, 0.92, 0.05] },
  { page: 1, name: 'back_header_identity', box: [0.04, 0.02, 0.92, 0.18] },
  { page: 1, name: 'back_finance_table', box: [0.04, 0.19, 0.92, 0.27] },
  { page: 1, name: 'back_finance_summary', box: [0.04, 0.46, 0.92, 0.14] },
  { page: 1, name: 'back_approvals', box: [0.04, 0.59, 0.92, 0.17] },
  { page: 1, name: 'back_management', box: [0.04, 0.75, 0.92, 0.12] },
  { page: 1, name: 'back_notes', box: [0.04, 0.85, 0.92, 0.09] },
];
function structuralComparison(reference, actual) {
  const tolerance = structuralPolicy.match_tolerance_px / reference.width;
  const missingHorizontal = reference.horizontal.filter(r => !actual.horizontal.some(a => Math.abs(a.start-r.start) <= tolerance && Math.abs(a.end-r.end) <= tolerance));
  const missingVertical = reference.vertical.filter(r => !actual.vertical.some(a => Math.abs(a-r) <= tolerance));
  return { missing_horizontal: missingHorizontal, missing_vertical: missingVertical };
}
function validatePrintPdf(actualPdf, referencePdf, tag) {
  const dir = path.join(artifactDir, `pgm-${tag}`); fs.mkdirSync(dir, { recursive: true });
  const referenceInfo = pdfPageGeometry(referencePdf); const actualInfo = pdfPageGeometry(actualPdf);
  const ref = renderPdf(referencePdf, path.join(dir, 'reference')); const actual = renderPdf(actualPdf, path.join(dir, 'actual'));
  const failures = []; const metrics = [];
  if (referenceInfo.pages !== 2 || referenceInfo.label !== 'A4') failures.push(`locked Owner PDF is not exactly two A4 pages: ${JSON.stringify(referenceInfo)}`);
  if (actualInfo.pages !== 2 || actualInfo.label !== 'A4') failures.push(`actual PDF is not exactly two A4 pages: ${JSON.stringify(actualInfo)}`);
  if (Math.abs(referenceInfo.width_pt - actualInfo.width_pt) > structuralPolicy.page_tolerance_pt || Math.abs(referenceInfo.height_pt - actualInfo.height_pt) > structuralPolicy.page_tolerance_pt) failures.push(`A4 page dimensions differ from locked Owner PDF: actual=${actualInfo.width_pt}x${actualInfo.height_pt} reference=${referenceInfo.width_pt}x${referenceInfo.height_pt}`);
  for (let p = 0; p < 2; p++) if (Math.abs(ref[p].width - actual[p].width) > 2 || Math.abs(ref[p].height - actual[p].height) > 2) failures.push(`page ${p + 1} raster dimensions differ`);
  for (const spec of printRegions) {
    const reference = structuralSignature(ref[spec.page], spec.box); const observed = structuralSignature(actual[spec.page], spec.box);
    const compared = structuralComparison(reference, observed);
    metrics.push({ page: spec.page + 1, region: spec.name, reference_structural_lines: { horizontal: reference.horizontal, vertical: reference.vertical }, actual_structural_lines: { horizontal: observed.horizontal, vertical: observed.vertical }, missing_owner_horizontal: compared.missing_horizontal, missing_owner_vertical: compared.missing_vertical, extraction: reference.extraction });
    if (!reference.horizontal.length && !reference.vertical.length) failures.push(`${spec.name} has no extractable Owner structural geometry`);
    if (compared.missing_horizontal.length) failures.push(`${spec.name} missing ${compared.missing_horizontal.length} Owner horizontal structural rule(s)`);
    if (compared.missing_vertical.length) failures.push(`${spec.name} missing ${compared.missing_vertical.length} Owner vertical structural rule(s)`);
  }
  return { pass: failures.length === 0, failures, metrics, page_geometry: { reference: referenceInfo, actual: actualInfo }, policy: structuralPolicy, signal: 'long-rules-borders-and-box-edges-only' };
}'''
regex_once(print_test, r'function regionSignature\(image, region\) \{.*?\n\}\n\nconst browser', structural + '\n\nconst browser')

print_cases = r'''const canonicalPdf = path.join(artifactDir, 'wu19-canonical.pdf');
await test('VISUAL-PRINT-EF', 'Owner PDF E/F structural page-region contract', async () => {
  if (!fs.existsSync(canonicalPdf)) throw new Error('WU19 canonical PDF missing.');
  const validation = validatePrintPdf(canonicalPdf, ownerPdf, 'canonical');
  fs.writeFileSync(path.join(artifactDir, 'print-visual-metrics.json'), JSON.stringify(validation, null, 2) + '\n');
  const render = spawnSync('pdftoppm', ['-png', '-r', '96', ownerPdf, path.join(artifactDir, 'print-reference')], { encoding: 'utf8' });
  if (render.status !== 0) throw new Error(`Reference diagnostic rendering failed: ${render.stderr}`);
  const actualRender = spawnSync('pdftoppm', ['-png', '-r', '96', canonicalPdf, path.join(artifactDir, 'print-actual')], { encoding: 'utf8' });
  if (actualRender.status !== 0) throw new Error(`Actual diagnostic rendering failed: ${actualRender.stderr}`);
  if (!validation.pass) throw new Error(`Print E/F structural contract failed: ${JSON.stringify(validation.failures)}`);
  return { front_E: 'PASS', back_F: 'PASS', page_region_contracts: printRegions.length, signal: validation.signal, page_geometry: validation.page_geometry };
});

async function openReadyPrint() {
  await productionPage.setViewportSize({ width: 1280, height: 1000 });
  await productionPage.goto(dossierUrl, { waitUntil: 'networkidle' });
  await productionPage.waitForSelector('.gpp-print-dossier[data-gpp-print-state="ready"]');
  await productionPage.emulateMedia({ media: 'print' });
}

await test('VISUAL-PRINT-CONTENT-VARIATION', 'Structural comparator ignores content-only variation while preserving layout', async () => {
  await openReadyPrint();
  const variation = await productionPage.evaluate(() => {
    const values = [...document.querySelectorAll('.gpp-print-dossier .paper-finance .print-value')].slice(0, 3);
    const replacements = ['۱', '۱۲۳۴۵۶۷۸۹۰', '۹۹۹۹۹۹۹۹۹۹۹۹'];
    const changed = values.map((node, index) => { const before = node.textContent || ''; let after = replacements[index] || '۷'; if (after === before) after += '۸'; node.textContent = after; return { before_length: before.length, after_length: after.length }; });
    const boxes = [...document.querySelectorAll('.gpp-print-dossier .paper-choice i')].slice(0, 2);
    const boxChanges = boxes.map(node => { const before = node.textContent || ''; node.textContent = before.trim() ? '' : '✓'; return { before, after: node.textContent }; });
    return { changed_values: changed, changed_checkboxes: boxChanges };
  });
  if (variation.changed_values.length < 2 || variation.changed_checkboxes.length < 1) throw new Error(`Content-variation control could not mutate enough fixed-layout values: ${JSON.stringify(variation)}`);
  const variedPdf = path.join(artifactDir, 'print-content-variation.pdf');
  await productionPage.pdf({ path: variedPdf, printBackground: true, preferCSSPageSize: true, scale: 1 });
  const validation = validatePrintPdf(variedPdf, ownerPdf, 'content-variation');
  if (!validation.pass) throw new Error(`Content-only variation changed structural geometry verdict: ${JSON.stringify(validation.failures)}`);
  return { ...variation, geometry_verdict: 'PASS', dynamic_text_excluded_from_signal: true, signal: validation.signal };
});

await test('VISUAL-PRINT-REGRESSION', 'Structural gate rejects the existing 48px finance-table displacement', async () => {
  await openReadyPrint();
  const controlPdf = path.join(artifactDir, 'qualification-print-control.pdf');
  await productionPage.pdf({ path: controlPdf, printBackground: true, preferCSSPageSize: true, scale: 1 });
  const control = validatePrintPdf(controlPdf, ownerPdf, 'deliberate-control');
  if (!control.pass) throw new Error(`Precondition control PDF does not pass structural gate: ${JSON.stringify(control.failures)}`);
  await productionPage.addStyleTag({ content: '.gpp-print-dossier .paper-finance{transform:translateX(48px)!important;}' });
  const mutatedPdf = path.join(artifactDir, 'print-deliberate-regression.pdf');
  await productionPage.pdf({ path: mutatedPdf, printBackground: true, preferCSSPageSize: true, scale: 1 });
  const mutated = validatePrintPdf(mutatedPdf, ownerPdf, 'deliberate-finance');
  if (mutated.pass || !mutated.failures.some(f => f.startsWith('back_finance_table '))) throw new Error(`Structural gate did not specifically reject the 48px finance-table displacement: ${JSON.stringify(mutated.failures)}`);
  return { injected_only_in_test: true, rejected: true, target_region: 'back_finance_table', failure_classes: mutated.failures };
});

await test('VISUAL-PRINT-REGRESSION-MANAGEMENT', 'Structural gate rejects a non-finance management-box displacement', async () => {
  await openReadyPrint();
  await productionPage.addStyleTag({ content: '.gpp-print-dossier .paper-management{transform:translateX(36px)!important;}' });
  const mutatedPdf = path.join(artifactDir, 'print-management-regression.pdf');
  await productionPage.pdf({ path: mutatedPdf, printBackground: true, preferCSSPageSize: true, scale: 1 });
  const mutated = validatePrintPdf(mutatedPdf, ownerPdf, 'deliberate-management');
  if (mutated.pass || !mutated.failures.some(f => f.startsWith('back_management '))) throw new Error(`Structural gate did not specifically reject management displacement: ${JSON.stringify(mutated.failures)}`);
  return { injected_only_in_test: true, rejected: true, target_region: 'back_management', failure_classes: mutated.failures };
});'''
regex_once(print_test, r"const canonicalPdf = path\.join\(artifactDir, 'wu19-canonical\.pdf'\);.*?\n\nawait productionContext\.close\(\);", print_cases + '\n\nawait productionContext.close();')
replace_once(
    print_test,
    "  deliberate_regression:results.find(r=>r.id==='VISUAL-PRINT-REGRESSION')?.status==='PASS'?'REJECTED_AS_EXPECTED':'NOT_PROVEN',\n  results,",
    "  content_variation:results.find(r=>r.id==='VISUAL-PRINT-CONTENT-VARIATION')?.status||'FAIL',\n  deliberate_regression:results.find(r=>r.id==='VISUAL-PRINT-REGRESSION')?.status==='PASS'?'REJECTED_AS_EXPECTED':'NOT_PROVEN',\n  deliberate_management_regression:results.find(r=>r.id==='VISUAL-PRINT-REGRESSION-MANAGEMENT')?.status==='PASS'?'REJECTED_AS_EXPECTED':'NOT_PROVEN',\n  structural_signal:'long-rules-borders-and-box-edges-only',\n  results,",
)

# Evidence cannot be emitted unless positive content variation and both structural mutations pass.
builder = 'tests/repro-evidence-lab/build-qualification-evidence.php'
replace_once(
    builder,
    "        'deliberate_print_regression' => $print_visual['deliberate_regression'],",
    "        'print_content_variation' => isset( $print_visual['content_variation'] ) ? $print_visual['content_variation'] : 'MISSING',\n        'deliberate_print_regression' => $print_visual['deliberate_regression'],\n        'deliberate_print_management_regression' => isset( $print_visual['deliberate_management_regression'] ) ? $print_visual['deliberate_management_regression'] : 'MISSING',",
)
replace_once(
    builder,
    "foreach ( array( 'deliberate_entry_regression', 'deliberate_entry_old_gate_bypass', 'deliberate_print_regression' ) as $key ) if ( 'REJECTED_AS_EXPECTED' !== $evidence['visual_contract'][ $key ] ) throw new RuntimeException( 'Deliberate visual regression proof missing: ' . $key );",
    "if ( 'PASS' !== $evidence['visual_contract']['print_content_variation'] ) throw new RuntimeException( 'Print content-variation structural invariance is not proven.' );\nforeach ( array( 'deliberate_entry_regression', 'deliberate_entry_old_gate_bypass', 'deliberate_print_regression', 'deliberate_print_management_regression' ) as $key ) if ( 'REJECTED_AS_EXPECTED' !== $evidence['visual_contract'][ $key ] ) throw new RuntimeException( 'Deliberate visual regression proof missing: ' . $key );",
)

# Final enforcement checks actual continue-on-error outcomes before evidence is built.
workflow = '.github/workflows/wu19-a4-print-runtime.yml'
replace_once(
    workflow,
    '''          test -s "$WU21_ARTIFACT_DIR/core-spine-results.json"
          test -s "$WU21_ARTIFACT_DIR/entry-visual-contract-results.json"
          test -s "$WU21_ARTIFACT_DIR/print-visual-contract-results.json"
          php tests/repro-evidence-lab/build-qualification-evidence.php
          test -s "$WU21_ARTIFACT_DIR/gpp-qualification.json"
          test "${{ steps.core_qualification.outcome }}" = 'success'
          test "${{ steps.entry_visual_qualification.outcome }}" = 'success'
          test "${{ steps.print_visual_qualification.outcome }}" = 'success' ''',
    '''          test -s "$WU21_ARTIFACT_DIR/core-spine-results.json"
          test -s "$WU21_ARTIFACT_DIR/entry-visual-contract-results.json"
          test -s "$WU21_ARTIFACT_DIR/print-visual-contract-results.json"
          test "${{ steps.core_qualification.outcome }}" = 'success'
          test "${{ steps.entry_visual_qualification.outcome }}" = 'success'
          test "${{ steps.print_visual_qualification.outcome }}" = 'success'
          php tests/repro-evidence-lab/build-qualification-evidence.php
          test -s "$WU21_ARTIFACT_DIR/gpp-qualification.json" ''',
)
