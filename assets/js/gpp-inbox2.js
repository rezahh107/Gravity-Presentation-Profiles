/* GPP Inbox 2: shared, per-instance presentation lifecycle (shortcode and future host adapter). */
(() => {
  'use strict';
  if (window.GPPInbox2) { window.GPPInbox2.initAll(document); return; }
  const instances = new Map();
  const rootSelector = '[data-ciq2-root]';
  const formatNumber = n => new Intl.NumberFormat('fa-IR', {useGrouping: false}).format(n);
  const normalize = s => String(s).replace(/[۰-۹٠-٩]/g, d => {
    const cp = d.charCodeAt(0);
    return String(cp >= 0x6f0 ? cp - 0x6f0 : cp - 0x660);
  }).trim().toLocaleLowerCase('fa-IR');

  function mount(root, dynamic = false) {
    if (!root.isConnected || instances.has(root)) return;
    const find = name => root.querySelector('[data-ciq2-' + name + ']');
    const list = find('list'), input = find('search'), status = find('status');
    const empty = find('empty'), noResults = find('no-results');
    const previous = find('prev'), next = find('next'), pageLabel = find('page');
    const pager = find('pager'), announcement = find('announcement');
    const heading = root.querySelector('h2'), form = root.querySelector('form');
    if (![list,input,status,empty,noResults,previous,next,pageLabel,pager,announcement,heading,form].every(Boolean)) return;

    let page = 1, generation = 0, busy = false, controller = null, watchdog = null;
    let verifiedAt = root.dataset.ciq2VerifiedAt || '';
    function announce(message) {
      if (announcement.textContent !== message) announcement.textContent = message;
    }
    function focusedEntry() {
      const focus = document.activeElement;
      return list.contains(focus) ? focus.closest('[data-ciq2-entry]')?.dataset.ciq2Entry : null;
    }
    function restoreFocus(id) {
      if (!id || !root.isConnected) return;
      const item = [...list.querySelectorAll('[data-ciq2-entry]')].find(
        node => node.dataset.ciq2Entry === id && !node.hidden);
      // If missing, never focus another student's action.
      (item?.querySelector('[data-ciq2-detail]') || heading).focus({preventScroll:true});
    }
    function draw(live = false) {
      const nodes = [...list.querySelectorAll('[data-ciq2-entry]')];
      const query = normalize(input.value);
      // Do not index school, hidden fields, or unapproved data.
      const filtered = nodes.filter(node => !query || normalize(
        node.querySelector('[data-ciq2-name]').textContent + ' ' +
        node.querySelector('[data-ciq2-national-id]').textContent).includes(query));
      const pages = Math.max(1, Math.ceil(filtered.length / 20));
      page = Math.max(1, Math.min(page, pages));
      const visible = filtered.slice((page - 1) * 20, page * 20);
      const visibleSet = new Set(visible);
      nodes.forEach(node => { node.hidden = !visibleSet.has(node); node.removeAttribute('data-ciq2-first'); });
      visible.forEach((node, i) => {
        const ordinal = node.querySelector('[data-ciq2-ordinal]');
        if (ordinal) ordinal.textContent = formatNumber((page - 1) * 20 + i + 1);
      });
      // Emphasis is a visual cue, not a required processing order.
      if (!query && page === 1 && visible[0]) visible[0].setAttribute('data-ciq2-first', '');
      empty.hidden = nodes.length !== 0;
      noResults.hidden = nodes.length === 0 || filtered.length !== 0;
      pager.hidden = filtered.length <= 20;
      previous.disabled = page <= 1; next.disabled = page >= pages;
      pageLabel.textContent = 'صفحه ' + formatNumber(page) + ' از ' + formatNumber(pages);
      status.textContent = (query ? formatNumber(filtered.length) + ' مورد مطابق جست‌وجو از ' +
        formatNumber(nodes.length) : formatNumber(nodes.length) + ' پرونده در صف') +
        (verifiedAt ? ' · آخرین تأیید ' + verifiedAt : '');
      root.dataset.ciq2State = 'current';
      if (live) announce(status.textContent);
    }
    function cancel() {
      ++generation;
      if (controller) controller.abort();
      if (watchdog) clearTimeout(watchdog);
      controller = null; watchdog = null; busy = false;
    }
    function stale(code = 503, message = '') {
      const focus = focusedEntry();
      list.replaceChildren();
      root.dataset.ciq2State = 'stale';
      empty.hidden = true; noResults.hidden = true; pager.hidden = true;
      status.textContent = message || (code === 403
        ? 'نشست یا مجوز دسترسی تغییر کرده است؛ اطلاعات قدیمی پاک شد. دوباره وارد شوید.'
        : 'فهرست قابل تأیید نیست؛ اطلاعات قدیمی پاک شد. برای تلاش دوباره، تازه‌سازی را بزنید.');
      announce(status.textContent);
      restoreFocus(focus);
    }
    async function refresh(force = false, quiet = false) {
      if (!root.isConnected) { destroy(root); return; }
      if (busy && !force) return;
      cancel();
      const serial = ++generation;
      const pending = new AbortController();
      controller = pending; busy = true;
      root.dataset.ciq2State = 'syncing';
      status.textContent = 'در حال بررسی فهرست' +
        (verifiedAt ? ' · آخرین تأیید ' + verifiedAt : ' · هنوز تأیید نشده');
      if (!quiet) announce('در حال تازه‌سازی فهرست.');
      const timer = setTimeout(() => {
        if (serial !== generation) return;
        cancel(); stale(503);
      }, 30000);
      watchdog = timer;
      try {
        const response = await fetch(root.dataset.ciq2Ajax, {
          method:'POST', credentials:'same-origin', cache:'no-store',
          headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
          body:new URLSearchParams({
            action:'gpp_inbox2_read', nonce:root.dataset.ciq2Nonce,
            page_id:root.dataset.ciq2Page, form_id:root.dataset.ciq2Form,
            native_page_id:root.dataset.ciq2NativePage
          }),
          signal:pending.signal
        });
        if (serial !== generation || !root.isConnected) return;
        if (!response.ok) {
          const error = new Error('read_failed');
          error.status = response.status;
          throw error;
        }
        const data = await response.json();
        if (!data.success || !data.data || !Number.isSafeInteger(data.data.count) ||
            data.data.count < 0 || typeof data.data.html !== 'string') throw new Error('invalid_response');
        const doc = new DOMParser().parseFromString(data.data.html, 'text/html');
        const returned = doc.querySelector(rootSelector);
        const authoritative = returned?.querySelector('[data-ciq2-list]');
        if (!authoritative || !returned.dataset.ciq2VerifiedAt ||
            ['ciq2Page','ciq2Form','ciq2NativePage'].some(key =>
              returned.dataset[key] !== root.dataset[key])) throw new Error('invalid_scope_or_shape');
        const incoming = [...authoritative.querySelectorAll('[data-ciq2-entry]')];
        const ids = incoming.map(node => Number(node.dataset.ciq2Entry));
        if (ids.length !== data.data.count || ids.some(id => !Number.isSafeInteger(id) || id < 1) ||
            new Set(ids).size !== ids.length) throw new Error('incomplete_or_duplicate_identity');
        if (serial !== generation || !root.isConnected) return;
        const focus = focusedEntry();
        list.replaceChildren(...incoming.map(node => document.importNode(node, true)));
        verifiedAt = returned.dataset.ciq2VerifiedAt;
        root.dataset.ciq2VerifiedAt = verifiedAt;
        draw(!quiet);
        restoreFocus(focus);
      } catch (error) {
        if (serial !== generation || !root.isConnected || error.name === 'AbortError') return;
        stale(error.status || 503);
      } finally {
        clearTimeout(timer);
        if (serial === generation) { busy = false; controller = null; watchdog = null; }
      }
    }
    const onInput = event => {
      if (event.target !== input) return;
      page = 1;
      if (root.dataset.ciq2State === 'current') draw(true);
    };
    const onClick = event => {
      if (previous.contains(event.target)) { if (page > 1) { page--; draw(true); } }
      else if (next.contains(event.target)) { page++; draw(true); }
    };
    const onSubmit = event => {
      if (event.target !== form) return;
      event.preventDefault(); refresh(true);
    };
    root.addEventListener('input', onInput);
    root.addEventListener('click', onClick);
    root.addEventListener('submit', onSubmit);
    const poll = setInterval(() => {
      if (!root.isConnected) { destroy(root); return; }
      if (!document.hidden) refresh(false, true);
    }, 30000);
    instances.set(root, {
      invalidate(message = '') { cancel(); stale(503, message); },
      reenter() {
        input.value = ''; page = 1;
        cancel(); stale(503, 'در حال تأیید دوبارهٔ فهرست…');
        refresh(true, true);
      },
      cleanup() {
        cancel(); clearInterval(poll);
        root.removeEventListener('input', onInput);
        root.removeEventListener('click', onClick);
        root.removeEventListener('submit', onSubmit);
      }
    });
    if (dynamic) {
      // Never trust old personalized HTML carried by an inserted/replaced widget.
      cancel(); stale(503, 'در حال دریافت فهرست تأییدشده…');
      refresh(true, true);
    } else draw();
  }
  function destroy(root) {
    const instance = instances.get(root);
    if (instance) { instance.cleanup(); instances.delete(root); }
  }
  function initAll(container = document, dynamic = false) {
    if (container.matches?.(rootSelector)) mount(container, dynamic);
    container.querySelectorAll?.(rootSelector).forEach(root => mount(root, dynamic));
  }
  window.GPPInbox2 = Object.freeze({initAll, destroy});
  window.addEventListener('pagehide', () => instances.forEach(instance => instance.invalidate()));
  window.addEventListener('pageshow', event => {
    if (event.persisted) instances.forEach(instance => instance.reenter());
  });
  document.addEventListener('visibilitychange', () => {
    instances.forEach(instance => {
      if (document.hidden) instance.invalidate();
      else instance.reenter();
    });
  });
  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const node of mutation.removedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches?.(rootSelector) && !node.isConnected) destroy(node);
        node.querySelectorAll?.(rootSelector).forEach(root => { if (!root.isConnected) destroy(root); });
      }
      for (const node of mutation.addedNodes) {
        if (node.nodeType === 1) initAll(node, true);
      }
    }
  });
  observer.observe(document.documentElement, {childList:true,subtree:true});
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', () => initAll(document), {once:true});
  else initAll(document);
})();
