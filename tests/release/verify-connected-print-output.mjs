/**
 * Verify ACTUAL Chromium PDF pages and captured Poppler rasters, not DOM metadata.
 * Arguments: PDF PNG1 PNG2 FULL_NAME FEMALE_LABEL RAW_CHOICE DISPLAY_CHOICE.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [pdf, page1, page2, fullName, femaleLabel, rawChoice, displayChoice] = process.argv.slice(2);
function requireOutput(ok, message) {
  if (!ok) throw Error('GPP_CONNECTED_PRINT_OUTPUT_FAIL: ' + message);
}
function poppler(command, args, encoding = null) {
  const run = spawnSync(command, args, { encoding, maxBuffer: 20 * 1024 * 1024 });
  requireOutput(!run.error && run.status === 0, command + ' failed: ' + (run.error?.message || String(run.stderr).slice(0, 400)));
  return run.stdout;
}
function wordsForPage(page) {
  const xml = poppler('pdftotext', ['-f', String(page), '-l', String(page), '-bbox', pdf, '-'], 'utf8');
  return [...xml.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)]
    .map(match => ({x1:+match[1], y1:+match[2], x2:+match[3], y2:+match[4], text:match[5]}));
}
function normalized(text) {
  return text.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').normalize('NFC');
}
function pgmPixels(file) {
  const bytes = fs.readFileSync(file);
  const match = /^P5\s+(\d+)\s+(\d+)\s+255\s/.exec(bytes.toString('latin1', 0, 64));
  requireOutput(!!match, 'Poppler grayscale raster has an invalid PGM header');
  const start = Buffer.byteLength(match[0], 'latin1');
  const width = Number(match[1]), height = Number(match[2]);
  requireOutput(width > 0 && height > 0 && bytes.length === start + width * height, 'Unexpected grayscale raster dimensions/data');
  return {pixels:bytes.subarray(start), width, height};
}
function inkWithin(box, pgm, pdfSize) {
  const x1 = Math.max(0, Math.floor(box.x1 * pgm.width / pdfSize.width));
  const x2 = Math.min(pgm.width, Math.ceil(box.x2 * pgm.width / pdfSize.width));
  const y1 = Math.max(0, Math.floor(box.y1 * pgm.height / pdfSize.height));
  const y2 = Math.min(pgm.height, Math.ceil(box.y2 * pgm.height / pdfSize.height));
  let ink = 0;
  for (let y = y1; y < y2; y++) for (let x = x1; x < x2; x++) {
    if (pgm.pixels[y * pgm.width + x] < 180) ink++;
  }
  return ink;
}
function center(box) { return {x:(box.x1 + box.x2)/2, y:(box.y1 + box.y2)/2}; }

requireOutput([pdf,page1,page2].every(p => p && fs.existsSync(p) && fs.statSync(p).size > 100), 'PDF or captured raster page missing');
requireOutput(typeof fullName === 'string' && fullName.trim().split(/\s+/u).length >= 2 && femaleLabel && rawChoice && displayChoice, 'Expected source/choice evidence incomplete');
const info = poppler('pdfinfo', [pdf], 'utf8');
const count = Number(info.match(/^Pages:\s+(\d+)/m)?.[1]);
const size = info.match(/^Page size:\s+([\d.]+) x ([\d.]+) pts/m);
const width = Number(size?.[1]), height = Number(size?.[2]);
requireOutput(count === 2 && Math.abs(width-595.28)<2 && Math.abs(height-841.89)<2 && width<height, 'PDF is not precisely two portrait A4 pages');
const nameParts = fullName.trim().split(/\s+/u);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gpp-print-output-'));
try {
  for (const page of [1,2]) {
    const text = normalized(poppler('pdftotext', ['-f',String(page),'-l',String(page),'-layout',pdf,'-'], 'utf8'));
    requireOutput(text.includes(fullName), 'Printed full name absent from PDF page ' + page);
    requireOutput(!text.includes(rawChoice) && !text.includes(displayChoice), 'Raw/host-choice leaked into PDF page ' + page);
    const words = wordsForPage(page);
    const groups = words.flatMap((w,i) => nameParts.every((part,k) => words[i+k]?.text === part) ? [words.slice(i,i+nameParts.length)] : []);
    requireOutput(groups.length === 1, 'Source first/last tokens not together exactly once in PDF page ' + page);
    const nameWords = groups[0];
    requireOutput(nameWords.every((word,i) => i === 0 || (Math.abs(center(word).y - center(nameWords[0]).y)<8 && word.x1>=nameWords[i-1].x2)), 'Full name lacks a contiguous page-local print position on page ' + page);

    // Re-render the exact PDF independently. Substituted, blank or stale
    // captured raster files cannot satisfy byte-for-byte equality.
    const prefix = path.join(temp, 'page-' + page);
    poppler('pdftoppm', ['-f',String(page),'-l',String(page),'-png','-r','96','-singlefile',pdf,prefix]);
    const expectedRaster = fs.readFileSync(prefix+'.png');
    const actualRaster = fs.readFileSync(page === 1 ? page1 : page2);
    requireOutput(actualRaster.equals(expectedRaster), 'Captured raster does not match the actual PDF page ' + page);
    poppler('pdftoppm', ['-f',String(page),'-l',String(page),'-gray','-r','96','-singlefile',pdf,prefix]);
    const pgm = pgmPixels(prefix+'.pgm');
    const pageSize = {width, height};
    for (const word of nameWords) {
      requireOutput(inkWithin(word,pgm,pageSize) >= 2, 'Printed name token is invisible on PDF raster page ' + page + ': ' + word.text);
    }
    if (page === 1) {
      requireOutput(new RegExp('✓\\s*' + femaleLabel.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&'), 'u').test(text), 'Selected canonical female indicator absent from printed PDF page one');
      const ticks = words.filter(word=>word.text==='✓');
      requireOutput(ticks.length === 1, 'Expected exactly one page-one selected checkmark in PDF');
      // Ignore the nearby printed circle/box border: only central checkmark
      // ink counts. Otherwise white-on-white check text could falsely PASS.
      const mark = ticks[0];
      const mid = {x1:mark.x1+0.2*(mark.x2-mark.x1),x2:mark.x2-0.2*(mark.x2-mark.x1),
        y1:mark.y1+0.3*(mark.y2-mark.y1),y2:mark.y2-0.3*(mark.y2-mark.y1)};
      requireOutput(inkWithin(mid,pgm,pageSize) >= 2, 'Selected canonical indicator is invisible on page-one raster');
    } else {
      requireOutput(!words.some(word => word.text === '✓'), 'Unexpected selected canonical indicator on page two');
    }
  }
  console.log('GPP_CONNECTED_PRINT_OUTPUT_PASS pdf_pages=2 names=2 female_mark=1 raster_pages=2');
} finally {
  fs.rmSync(temp, {recursive:true, force:true});
}
