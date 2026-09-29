import { ensureNativePagerPage } from './inbox-native-pager-state.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(`Native pager state falsification failed: ${message}`);
}

function fakeNativePager(initialPage, totalPages) {
  let current = initialPage;
  const clicks = [];

  const readPagerState = async () => ({
    count: 1,
    current: String(current),
    previous_disabled: current <= 1,
    next_disabled: current >= totalPages,
  });

  const page = {
    locator(selector) {
      const ref = selector.match(/\[ref="([^"]+)"\]/)?.[1] ?? null;
      return {
        first() { return this; },
        async click() {
          clicks.push(ref);
          if (ref === 'btNext' && current < totalPages) current += 1;
          else if (ref === 'btPrevious' && current > 1) current -= 1;
          else throw new Error(`Fake native control ${ref} cannot move from page ${current}.`);
        },
      };
    },
    async waitForFunction(_fn, expectedPage) {
      if (String(current) !== String(expectedPage)) {
        throw new Error(`Fake native pager expected ${expectedPage}, observed ${current}.`);
      }
    },
  };

  return { page, readPagerState, clicks, current: () => current };
}

const fromPageOne = fakeNativePager(1, 2);
const pageOneResult = await ensureNativePagerPage(fromPageOne.page, fromPageOne.readPagerState, 2);
assert(pageOneResult.initial_page === '1' && pageOneResult.final_page === '2', 'Page 1 entry must explicitly establish Page 2.');
assert(JSON.stringify(fromPageOne.clicks) === JSON.stringify(['btNext']), 'Page 1 entry must use exactly the native Next control.');
assert(fromPageOne.current() === 2, 'Page 1 entry must finish on native Page 2.');

const fromPageTwo = fakeNativePager(2, 2);
const pageTwoResult = await ensureNativePagerPage(fromPageTwo.page, fromPageTwo.readPagerState, 2);
assert(pageTwoResult.initial_page === '2' && pageTwoResult.final_page === '2', 'Page 2 entry must be accepted without synthetic navigation.');
assert(fromPageTwo.clicks.length === 0, 'Page 2 entry must not click any native pager control unnecessarily.');

const impossiblePageTwo = fakeNativePager(1, 1);
let rejected = null;
try {
  await ensureNativePagerPage(impossiblePageTwo.page, impossiblePageTwo.readPagerState, 2);
} catch (error) {
  rejected = String(error?.message || error);
}
assert(rejected?.includes('Cannot establish native pager page 2 from 1: native btNext is disabled.'), 'Unreachable Page 2 must fail explicitly at the native-control boundary.');
assert(impossiblePageTwo.clicks.length === 0, 'Unreachable Page 2 must fail before clicking a disabled native control.');

console.log(JSON.stringify({
  status: 'PASS',
  page_1_entry: pageOneResult,
  page_2_entry: pageTwoResult,
  unreachable_page_2: 'REJECTED',
}, null, 2));
