(function (window, document) {
    'use strict';

    var DEFAULT_RECOVERY_MS = 15000;
    var MIN_RECOVERY_MS = 250;
    var MAX_RECOVERY_MS = 60000;

    function parseRecoveryMs(button) {
        var raw = Number(button.getAttribute('data-gpp-print-recovery-ms'));
        if (Number.isFinite(raw) && raw >= MIN_RECOVERY_MS && raw <= MAX_RECOVERY_MS) {
            return raw;
        }
        return DEFAULT_RECOVERY_MS;
    }

    function sameUrl(candidate, expected) {
        if (!candidate || !expected) {
            return false;
        }
        try {
            return new URL(candidate, document.baseURI).href === new URL(expected, document.baseURI).href;
        } catch (error) {
            return candidate === expected;
        }
    }

    function setBusy(button, busy) {
        var label = button.querySelector('[data-gpp-print-label]');
        var icon = button.querySelector('[data-gpp-print-icon]');
        var spinner = button.querySelector('[data-gpp-print-spinner]');
        var utility = button.closest('[data-gpp-print-utility="dossier"]');
        var status = utility ? utility.querySelector('[data-gpp-print-status]') : null;
        var idleLabel = button.getAttribute('data-gpp-print-idle-label') || 'چاپ پرونده';
        var busyLabel = button.getAttribute('data-gpp-print-busy-label') || 'در حال آماده‌سازی چاپ…';

        button.setAttribute('aria-busy', busy ? 'true' : 'false');
        button.setAttribute('aria-disabled', busy ? 'true' : 'false');
        button.setAttribute('data-gpp-print-busy', busy ? '1' : '0');

        if (label) {
            label.textContent = busy ? busyLabel : idleLabel;
        }
        if (icon) {
            icon.hidden = busy;
        }
        if (spinner) {
            spinner.hidden = !busy;
        }
        if (status) {
            status.textContent = busy ? busyLabel : '';
        }
    }

    function matchingPrintIframe(node, expectedUrl) {
        if (!node || node.nodeType !== 1) {
            return null;
        }
        if (node.tagName === 'IFRAME' && sameUrl(node.getAttribute('src') || node.src, expectedUrl)) {
            return node;
        }
        if (typeof node.querySelectorAll !== 'function') {
            return null;
        }
        var frames = node.querySelectorAll('iframe');
        for (var i = 0; i < frames.length; i += 1) {
            if (sameUrl(frames[i].getAttribute('src') || frames[i].src, expectedUrl)) {
                return frames[i];
            }
        }
        return null;
    }

    function observeNativePrintHandoff(expectedUrl, release) {
        var observed = new WeakSet();
        var observer = new MutationObserver(function (records) {
            for (var i = 0; i < records.length; i += 1) {
                var record = records[i];
                if (record.type === 'attributes') {
                    attach(record.target);
                    continue;
                }
                for (var j = 0; j < record.addedNodes.length; j += 1) {
                    attach(record.addedNodes[j]);
                }
            }
        });

        function attach(node) {
            var iframe = matchingPrintIframe(node, expectedUrl);
            if (!iframe || observed.has(iframe)) {
                return;
            }
            observed.add(iframe);
            iframe.addEventListener('load', function () {
                release('native_iframe_load');
            }, { once: true });
        }

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['src']
        });

        var existing = document.querySelectorAll('iframe');
        for (var i = 0; i < existing.length; i += 1) {
            attach(existing[i]);
        }

        return observer;
    }

    window.gppPrintUtilityActivate = function (button) {
        if (!button || button.getAttribute('data-gpp-print-busy') === '1') {
            return false;
        }

        var url = button.getAttribute('data-gpp-dossier-print-url');
        if (!url) {
            return false;
        }

        setBusy(button, true);

        var observer = null;
        var timer = null;
        var released = false;

        function release() {
            if (released) {
                return;
            }
            released = true;
            if (observer) {
                observer.disconnect();
            }
            if (timer) {
                window.clearTimeout(timer);
            }
            setBusy(button, false);
        }

        timer = window.setTimeout(function () {
            release('recovery_timeout');
        }, parseRecoveryMs(button));

        if (typeof window.printPage === 'function') {
            observer = observeNativePrintHandoff(url, release);
            try {
                window.printPage(url);
            } catch (error) {
                release('native_dispatch_exception');
            }
            return false;
        }

        try {
            window.open(url, '_blank', 'noopener');
        } finally {
            // The fallback has no native iframe lifecycle in the parent page.
            // Release only the UI lock; do not infer success or retry Print.
            window.setTimeout(release, 0);
        }

        return false;
    };
})(window, document);
