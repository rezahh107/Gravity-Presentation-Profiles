/* Elementor V4 Atomic: static placeholder -> authenticated pending shell -> existing Inbox 2 pipeline. */
(() => {
  'use strict';
  const selector = '[data-gpp-atomic-inbox2="pending"]';
  const states = new WeakMap();
  const active = new Set();
  const config = window.gppInbox2AtomicConfig;
  if (!config || typeof config.ajax !== 'string' || !/^[1-9]\d*$/.test(String(config.page))) return;

  function inEditor() {
    // No automated private bootstrap in either actual editor iframe or preview.
    return window !== window.top ||
      new URLSearchParams(window.location.search).has('elementor-preview') ||
      Boolean(window.elementorFrontend?.isEditMode?.());
  }
  function safeMessage(node) {
    if (!node.isConnected) return;
    node.replaceChildren();
    const message = document.createElement('p');
    message.setAttribute('role', 'status');
    message.textContent = 'فهرست در دسترس نیست. صفحه را دوباره بارگذاری کنید.';
    node.appendChild(message);
  }
  function halt(state) {
    state.controller.abort();
    active.delete(state);
    states.delete(state.node);
  }
  async function start(node) {
    if (!node.isConnected || states.has(node) || inEditor() || document.hidden) return;
    const host = node.closest('[data-widget_type][data-id]');
    const element = host?.getAttribute('data-id') || '';
    if (host?.getAttribute('data-widget_type') !== 'e-gpp-inbox-2.default' ||
        !/^[a-zA-Z0-9]{6,32}$/.test(element) ||
        host.querySelectorAll(selector).length !== 1) {
      safeMessage(node);
      return;
    }
    const state = {node, controller: new AbortController()};
    states.set(node, state);
    active.add(state);
    const serial = state.controller.signal;
    try {
      const response = await fetch(config.ajax, {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: {'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'},
        body: new URLSearchParams({
          action: 'gpp_inbox2_atomic_bootstrap', page_id: String(config.page), element_id: element
        }), signal: serial
      });
      if (!response.ok) throw new Error('bootstrap_denied');
      const result = await response.json();
      if (!result?.success || typeof result.data?.html !== 'string') throw new Error('bootstrap_shape');
      const parsed = new DOMParser().parseFromString(result.data.html, 'text/html');
      const root = parsed.querySelector('[data-ciq2-root]');
      if (!root || root.dataset.ciq2State !== 'pending' ||
          root.dataset.ciq2Element !== element || root.dataset.ciq2Page !== String(config.page) ||
          !/^[1-9]\d*$/.test(root.dataset.ciq2Form || '') ||
          !/^[1-9]\d*$/.test(root.dataset.ciq2NativePage || '') ||
          !root.dataset.ciq2Nonce || root.dataset.ciq2VerifiedAt ||
          root.querySelectorAll('[data-ciq2-entry]').length ||
          root.querySelectorAll('[data-ciq2-list]').length !== 1) throw new Error('unsafe_bootstrap');
      if (serial.aborted || !node.isConnected || document.hidden || inEditor() ||
          !host.isConnected || host.getAttribute('data-id') !== element) return;
      const inserted = document.importNode(root, true);
      // Keep the original Atomic/Twig class-bearing element: Elementor native
      // Classes, Variables and breakpoint styles target this wrapper.
      node.replaceChildren(inserted);
      node.dataset.gppAtomicInbox2 = 'ready';
      window.GPPInbox2?.initAll(inserted);
    } catch (error) {
      if (!serial.aborted) safeMessage(node);
    } finally {
      active.delete(state);
      states.delete(node);
    }
  }
  function scan(container) {
    if (container.matches?.(selector)) start(container);
    container.querySelectorAll?.(selector).forEach(start);
  }
  function onResume() {
    if (inEditor() || document.hidden) return;
    scan(document);
  }
  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const node of mutation.removedNodes) {
        if (node.nodeType !== 1) continue;
        for (const state of [...active]) {
          if (!state.node.isConnected) halt(state);
        }
      }
      for (const node of mutation.addedNodes) {
        if (node.nodeType === 1) scan(node);
      }
    }
  });
  observer.observe(document.documentElement, {childList: true, subtree: true});
  window.addEventListener('pagehide', () => { for (const state of [...active]) halt(state); });
  window.addEventListener('pageshow', event => { if (event.persisted) onResume(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) for (const state of [...active]) halt(state);
    else onResume();
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onResume, {once: true});
  } else onResume();
})();
