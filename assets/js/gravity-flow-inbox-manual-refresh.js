( function () {
    'use strict';

    var surfaceSelector = '.gflow-inbox.gflow-grid.gflow-common';
    var controlSelector = '[data-gpp-inbox-manual-refresh]';
    var controlAttribute = 'data-gpp-inbox-manual-refresh';
    var idleLabel = 'به‌روزرسانی کارهای من';
    var busyLabel = 'در حال به‌روزرسانی…';

    function setIdle( button ) {
        if ( ! button ) {
            return;
        }

        button.disabled = false;
        button.removeAttribute( 'aria-busy' );
        button.textContent = idleLabel;
    }

    function mount() {
        // Admission is complete before any DOM node is created or mutated.
        var inbox = document.querySelector( surfaceSelector );
        if ( ! inbox || ! inbox.parentNode || document.querySelector( controlSelector ) ) {
            return false;
        }

        var container = document.createElement( 'p' );
        container.className = 'gpp-inbox-manual-refresh';

        var button = document.createElement( 'button' );
        button.type = 'button';
        button.className = 'button button-secondary gpp-inbox-manual-refresh__button';
        button.setAttribute( controlAttribute, '' );
        button.setAttribute( 'aria-label', idleLabel );
        button.setAttribute( 'lang', 'fa' );
        button.setAttribute( 'dir', 'rtl' );
        button.textContent = idleLabel;
        button.addEventListener( 'click', function () {
            if ( button.disabled ) {
                return;
            }

            button.disabled = true;
            button.setAttribute( 'aria-busy', 'true' );
            button.textContent = busyLabel;
            window.location.reload();
        } );

        container.appendChild( button );

        // The utility is a sibling of the host subtree. Native AG Grid rerender
        // and Live Refresh can replace Grid descendants without GPP reconciling
        // native-node parentage or creating a second Inbox lifecycle.
        inbox.parentNode.insertBefore( container, inbox );
        return true;
    }

    function recoverFromPageShow() {
        setIdle( document.querySelector( controlSelector ) );
    }

    if ( 'loading' === document.readyState ) {
        document.addEventListener( 'DOMContentLoaded', mount, { once: true } );
    } else {
        mount();
    }

    // bfcache restoration can preserve the pre-navigation disabled state.
    window.addEventListener( 'pageshow', recoverFromPageShow );
}() );
