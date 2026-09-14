(() => {
  'use strict';

  const init = () => {
    document.querySelectorAll('[data-gpp-entry-dossier="ready"]').forEach(root => {
      if (root.dataset.gppInitialized === 'true') return;
      root.dataset.gppInitialized = 'true';

      const form = root.closest('form');
      if (!form) return;

      const instructionsSlot = root.querySelector('[data-gpp-host-instructions]');
      const actionsSlot = root.querySelector('[data-gpp-host-actions]');
      const utilitiesSlot = root.querySelector('[data-gpp-host-utilities]');
      const editorSlot = root.querySelector('[data-gpp-host-editor]');
      const fallbackSlot = root.querySelector('[data-gpp-host-fallback]');
      const fallbackSection = root.querySelector('[data-gpp-host-fallback-section]');

      const instructions = form.querySelector('.gravityflow-instructions');
      if (instructions && instructionsSlot && root.dataset.gppInstructionsAdmitted === 'true') {
        instructionsSlot.append(instructions);
      }

      const statusBox = form.querySelector('#gravityflow-status-box-container');
      if (statusBox && actionsSlot) {
        const buttons = [...statusBox.querySelectorAll('.gravityflow-action-buttons button[value]')];
        const values = buttons.map(button => button.value);
        const onlyApprovedRejected = values.every(value => value === 'approved' || value === 'rejected');
        const hasUnexpectedAction = values.length > 0 && !onlyApprovedRejected;
        if (!hasUnexpectedAction) {
          actionsSlot.append(statusBox);
          root.dataset.gppActionReorganization = 'host-owned';
        } else {
          root.dataset.gppActionReorganization = 'not-proven';
        }
      }

      const print = form.querySelector('.detail-view-print');
      if (print && utilitiesSlot) {
        utilitiesSlot.append(print);
        root.dataset.gppPrintOwnership = 'native-host';
      }

      const nativeTable = form.querySelector('.entry-detail-view');
      if (nativeTable) {
        const hasRows = Boolean(nativeTable.querySelector('tbody tr'));
        if (root.dataset.gppHostEditable === 'true' && editorSlot) {
          editorSlot.append(nativeTable);
          root.dataset.gppFieldOwnership = 'native-editable-host';
        } else if (hasRows && fallbackSlot && fallbackSection) {
          fallbackSlot.append(nativeTable);
          fallbackSection.hidden = false;
          root.dataset.gppFieldOwnership = 'native-readonly-fallback';
        } else if (!hasRows) {
          nativeTable.hidden = true;
          root.dataset.gppFieldOwnership = 'projected-readonly';
        }
      }

      const timeline = form.querySelector('.gravityflow-timeline');
      const helper = form.querySelector('[data-gpp-history-helper]');
      if (timeline && root.dataset.gppTimelineAdmitted === 'true' && !timeline.closest('.gpp-entry-history')) {
        const details = document.createElement('details');
        details.className = 'gpp-entry-history';
        details.dataset.gppHistory = 'native';
        const summary = document.createElement('summary');
        summary.textContent = 'تاریخچه بررسی پرونده';
        details.append(summary);
        if (helper) details.append(helper);
        timeline.parentNode.insertBefore(details, timeline);
        details.append(timeline);
      }

      const dialog = root.querySelector('[data-gpp-image-dialog]');
      const large = dialog?.querySelector('[data-gpp-image-large]');
      const closeButton = dialog?.querySelector('[data-gpp-image-close]');
      let invoker = null;
      let scrollPosition = null;

      const restore = () => {
        if (scrollPosition) {
          window.scrollTo(scrollPosition.x, scrollPosition.y);
          scrollPosition = null;
        }
        if (invoker && typeof invoker.focus === 'function') {
          invoker.focus({ preventScroll: true });
          invoker = null;
        }
      };

      root.querySelectorAll('[data-gpp-image-preview]').forEach(button => {
        button.addEventListener('click', () => {
          if (!dialog || !large || typeof dialog.showModal !== 'function') return;
          invoker = button;
          scrollPosition = { x: window.scrollX, y: window.scrollY };
          large.src = button.dataset.gppPreviewSrc || '';
          large.alt = button.dataset.gppPreviewAlt || '';
          dialog.showModal();
          closeButton?.focus({ preventScroll: true });
        });
      });

      closeButton?.addEventListener('click', () => dialog?.close());
      dialog?.addEventListener('click', event => {
        if (event.target === dialog) dialog.close();
      });
      dialog?.addEventListener('close', restore);
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
