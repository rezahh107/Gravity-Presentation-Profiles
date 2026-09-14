(function () {
    'use strict';

    function one(root, selector) {
        var nodes = root.querySelectorAll(selector);
        return nodes.length === 1 ? nodes[0] : null;
    }

    function exactApprovalButtons(statusBox) {
        var buttons = Array.prototype.slice.call(
            statusBox.querySelectorAll('.gravityflow-action-buttons button[type="submit"]')
        );

        if (buttons.length !== 2) {
            return false;
        }

        var values = buttons.map(function (button) { return button.value; }).sort();
        return values[0] === 'approved' && values[1] === 'rejected';
    }

    function installPreviewController(root) {
        var openDialog = null;
        var opener = null;
        var scrollX = 0;
        var scrollY = 0;
        var priorHtmlOverflow = '';
        var priorBodyOverflow = '';

        function closePreview() {
            if (!openDialog) {
                return;
            }

            openDialog.hidden = true;
            document.documentElement.style.overflow = priorHtmlOverflow;
            document.body.style.overflow = priorBodyOverflow;
            window.scrollTo(scrollX, scrollY);

            var restore = opener;
            openDialog = null;
            opener = null;

            if (restore && typeof restore.focus === 'function') {
                try {
                    restore.focus({ preventScroll: true });
                } catch (error) {
                    restore.focus();
                }
            }
        }

        root.addEventListener('click', function (event) {
            var trigger = event.target.closest('[data-gpp-image-preview-open]');
            if (trigger && root.contains(trigger)) {
                var id = trigger.getAttribute('data-gpp-image-preview-open');
                var dialog = id ? document.getElementById(id) : null;
                if (!dialog || !root.contains(dialog)) {
                    return;
                }

                opener = trigger;
                scrollX = window.scrollX;
                scrollY = window.scrollY;
                priorHtmlOverflow = document.documentElement.style.overflow;
                priorBodyOverflow = document.body.style.overflow;
                openDialog = dialog;
                dialog.hidden = false;
                document.documentElement.style.overflow = 'hidden';
                document.body.style.overflow = 'hidden';

                var closeButton = dialog.querySelector('[data-gpp-image-preview-close]');
                if (closeButton) {
                    closeButton.focus({ preventScroll: true });
                }
                return;
            }

            if (!openDialog) {
                return;
            }

            if (event.target.closest('[data-gpp-image-preview-close]') || event.target === openDialog) {
                closePreview();
            }
        });

        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && openDialog) {
                event.preventDefault();
                closePreview();
            }
        });
    }

    function enhance() {
        var root = document.querySelector('.gravityflow_workflow_detail');
        if (!root || root.classList.contains('gpp-entry-detail--enhanced')) {
            return;
        }

        var projection = one(root, '[data-gpp-entry-detail-projection][data-gpp-readiness="ready"]');
        var readyMarker = one(root, '[data-gpp-entry-detail-readiness="ready"]');
        var unreadyMarker = root.querySelector('[data-gpp-entry-detail-readiness="unready"]');
        if (!projection || !readyMarker || unreadyMarker) {
            return;
        }

        var instructions = one(root, '.gravityflow-instructions');
        var statusBox = one(root, '#gravityflow-status-box-container');
        var timeline = one(root, '.gravityflow-timeline');
        var nativeGrid = one(root, 'table.entry-detail-view');
        var instructionsSlot = one(projection, '[data-gpp-native-instructions-slot]');
        var actionsSlot = one(projection, '[data-gpp-native-task-actions-slot]');
        var historySlot = one(projection, '[data-gpp-native-history-slot]');
        var printSlot = one(projection, '[data-gpp-print-utility-slot]');

        // The pinned Gravity Flow 3.1.0 Approval surface is the admitted DOM
        // seam. Validate the entire seam before moving a single host-owned node.
        if (!instructions || !statusBox || !timeline || !nativeGrid || !instructionsSlot || !actionsSlot || !historySlot || !printSlot) {
            return;
        }
        if (root.querySelector('#gravityflow-admin-action')) {
            return;
        }
        if (!exactApprovalButtons(statusBox)) {
            return;
        }

        var printUtility = one(root, '.detail-view-print');

        instructionsSlot.appendChild(instructions);
        actionsSlot.appendChild(statusBox);
        historySlot.appendChild(timeline);
        if (printUtility) {
            printSlot.appendChild(printUtility);
        }

        root.classList.add('gpp-entry-detail--enhanced');
        installPreviewController(projection);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', enhance, { once: true });
    } else {
        enhance();
    }
}());
