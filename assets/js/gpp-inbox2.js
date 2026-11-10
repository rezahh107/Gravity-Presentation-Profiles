/* GPP Inbox 2: local paging, search, and host refresh. */
(() => {
      document.querySelectorAll('[data-ciq2-root]').forEach(root => {
      const list = root.querySelector('[data-ciq2-list]');
      const input = root.querySelector('[data-ciq2-search]');
      const status = root.querySelector('[data-ciq2-status]');
      const empty = root.querySelector('[data-ciq2-empty]');
      const noResults = root.querySelector('[data-ciq2-no-results]');
      const previous = root.querySelector('[data-ciq2-prev]');
      const next = root.querySelector('[data-ciq2-next]');
      const pageLabel = root.querySelector('[data-ciq2-page]');
      const pager = root.querySelector('[data-ciq2-pager]');
      const pageSize = 20;
      const requestDeadlineMs = 30000; // Bounded synthetic host read; not an atomic snapshot.
      let page = 1, generation = 0, busy = false, controller = null;
      const normalize = s => String(s).replace(/[۰-۹٠-٩]/g, d => {
        const cp = d.charCodeAt(0);
        return String(cp >= 0x6f0 && cp <= 0x6f9 ? cp - 0x6f0 : cp - 0x660);
      }).trim().toLocaleLowerCase('fa-IR');
      function draw() {
        const nodes = [...list.querySelectorAll('[data-ciq2-entry]')];
        const query = normalize(input.value);
        const filtered = nodes.filter(node => !query || normalize(
          node.querySelector('[data-ciq2-name]').textContent + ' ' +
          node.querySelector('[data-ciq2-national-id]').textContent
        ).includes(query));
        const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
        page = Math.max(1, Math.min(page, pages));
        const visible = new Set(filtered.slice((page - 1) * pageSize, page * pageSize));
        nodes.forEach(node => { node.hidden = !visible.has(node); });
        empty.hidden = nodes.length !== 0;
        noResults.hidden = nodes.length === 0 || filtered.length !== 0;
        pager.hidden = filtered.length <= pageSize;
        previous.disabled = page <= 1;
        next.disabled = page >= pages;
        pageLabel.textContent = 'صفحه ' + page + ' از ' + pages;
        status.textContent = filtered.length + ' پرونده' +
          (query ? ' مطابق جست‌وجو' : '') + ' (از ' + nodes.length + ')';
        root.dataset.ciq2State = 'current';
      }
      function stale(code) {
        list.replaceChildren();
        root.dataset.ciq2State = 'stale';
        empty.hidden = true; noResults.hidden = true; pager.hidden = true;
        status.textContent = code === 403
          ? 'نشست یا مجوز دسترسی تغییر کرده است؛ اطلاعات قدیمی پاک شد. دوباره وارد شوید.'
          : 'فهرست قابل تأیید نیست؛ اطلاعات قدیمی پاک شد. برای تلاش دوباره، به‌روزرسانی را بزنید.';
      }
      async function refresh(force = false) {
        if (busy && !force) return; // Automatic polling never overlaps.
        if (controller) controller.abort(); // Manual retry invalidates an older request.
        const serial = ++generation;
        controller = new AbortController();
        busy = true;
        root.dataset.ciq2State = 'syncing';
        status.textContent = 'در حال بررسی مجدد فهرست؛ داده‌های قبلی هنوز تأیید مجدد نشده‌اند.';
        const watchdog = setTimeout(() => {
          if (serial !== generation) return;
          // A fetch that never settles must not block every later polling cycle.
          ++generation;
          const pending = controller;
          controller = null;
          busy = false;
          pending.abort();
          stale(503);
        }, requestDeadlineMs);
        try {
          const response = await fetch(root.dataset.ciq2Ajax, {
            method: 'POST', credentials: 'same-origin', cache: 'no-store',
            headers: {'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'},
            body: new URLSearchParams({action: 'gpp_inbox2_read', nonce: root.dataset.ciq2Nonce, page_id: root.dataset.ciq2Page, form_id: root.dataset.ciq2Form, native_page_id: root.dataset.ciq2NativePage}),
            signal: controller.signal
          });
          if (serial !== generation) return;
          if (!response.ok) { const error = new Error('refresh_failed'); error.status = response.status; throw error; }
          const data = await response.json();
          if (!data.success || !data.data || !Number.isSafeInteger(data.data.count)) throw new Error('incomplete_response');
          const result = new DOMParser().parseFromString(data.data.html, 'text/html');
          const authoritativeList = result.querySelector('[data-ciq2-list]');
          if (!authoritativeList) throw new Error('missing_list');
          const incoming = [...authoritativeList.querySelectorAll('[data-ciq2-entry]')];
          const ids = incoming.map(node => Number(node.dataset.ciq2Entry));
          if (ids.length !== data.data.count || ids.some(id => !Number.isSafeInteger(id) || id < 1) ||
              new Set(ids).size !== ids.length) throw new Error('incomplete_or_duplicate_identity');
          if (serial !== generation) return;
          list.replaceChildren(...incoming.map(node => document.importNode(node, true)));
          draw(); // Preserve search and clamp invalidated page to the last valid page.
        } catch (error) {
          if (serial !== generation || error.name === 'AbortError') return;
          stale(error.status || 503);
        } finally {
          clearTimeout(watchdog);
          if (serial === generation) { busy = false; controller = null; }
        }
      }
      input.addEventListener('input', () => { page = 1; if (root.dataset.ciq2State === 'current') draw(); });
      previous.addEventListener('click', () => { if (page > 1) { page--; draw(); } });
      next.addEventListener('click', () => { page++; draw(); });
      root.querySelector('form').addEventListener('submit', event => { event.preventDefault(); refresh(true); });
      // Never revive a cached, previously authorized queue after Detail or tab
      // re-entry. Invalidate synchronously; only a fresh host read may repopulate.
      function invalidateForReentry() {
        ++generation;
        if (controller) controller.abort();
        controller = null;
        busy = false;
        stale(503);
      }
      window.addEventListener('pagehide', invalidateForReentry);
      window.addEventListener('pageshow', event => {
        if (!event.persisted) return; // New navigation is rendered by a fresh PHP read.
        input.value = ''; // Queue-first: avoid hiding the next case behind old search.
        page = 1;
        invalidateForReentry();
        refresh(true);
      });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          invalidateForReentry();
        } else {
          invalidateForReentry();
          refresh(true);
        }
      });
      draw();
      setInterval(() => { if (!document.hidden) refresh(); }, 30000);
      });
    })();
