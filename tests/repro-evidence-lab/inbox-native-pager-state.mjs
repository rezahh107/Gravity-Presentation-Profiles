function parseNativePage(value, label) {
  const page = Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isInteger(page) || page < 1) {
    throw new Error(`Invalid native pager ${label}: ${JSON.stringify(value)}`);
  }
  return page;
}

export async function ensureNativePagerPage(page, readPagerState, requestedPage, options = {}) {
  if (!page || typeof page.locator !== 'function' || typeof page.waitForFunction !== 'function') {
    throw new Error('Native pager page object is unavailable.');
  }
  if (typeof readPagerState !== 'function') {
    throw new Error('Native pager state reader is unavailable.');
  }

  const target = parseNativePage(requestedPage, 'target');
  const timeout = Number.isFinite(Number(options.timeout)) ? Number(options.timeout) : 10000;
  const maxTransitions = Number.isInteger(options.maxTransitions) && options.maxTransitions > 0
    ? options.maxTransitions
    : 100;
  const transitions = [];
  let initialPage = null;

  for (let attempt = 0; attempt <= maxTransitions; attempt += 1) {
    const state = await readPagerState(page);
    if (state?.count !== 1) {
      throw new Error(`Cannot establish native pager page ${target}: expected exactly one native pager, observed ${state?.count}.`);
    }

    const current = parseNativePage(state.current, 'current page');
    if (initialPage === null) initialPage = current;
    if (current === target) {
      return {
        initial_page: String(initialPage),
        final_page: String(current),
        transitions,
      };
    }

    if (attempt === maxTransitions) {
      break;
    }

    const forward = current < target;
    const ref = forward ? 'btNext' : 'btPrevious';
    const disabled = forward ? state.next_disabled === true : state.previous_disabled === true;
    if (disabled) {
      throw new Error(`Cannot establish native pager page ${target} from ${current}: native ${ref} is disabled.`);
    }

    const expected = current + (forward ? 1 : -1);
    await page.locator(`[data-js="gflow-inbox"] [ref="${ref}"]`).first().click();
    await page.waitForFunction(
      expectedPage => document.querySelector('[data-js="gflow-inbox"] [ref="lbCurrent"]')?.textContent?.trim() === expectedPage,
      String(expected),
      { timeout },
    );

    const after = await readPagerState(page);
    const observed = parseNativePage(after.current, 'post-navigation page');
    if (observed !== expected) {
      throw new Error(`Native pager ${ref} expected page ${expected} but observed ${observed}.`);
    }
    transitions.push({ control: ref, from: String(current), to: String(observed) });
  }

  throw new Error(`Cannot establish native pager page ${target}: transition limit ${maxTransitions} exceeded.`);
}
