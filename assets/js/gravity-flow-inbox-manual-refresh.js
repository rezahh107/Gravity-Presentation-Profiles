( function () {
    'use strict';

    var surfaceSelector = '.gflow-inbox.gflow-grid.gflow-common';
    var controlSelector = '[data-gpp-inbox-manual-refresh]';
    var label = 'به‌روزرسانی کارهای من';
    var settingsLabel = 'تنظیمات اعلان‌ها';
    var compositions = new WeakMap();

    function rollback( inbox ) {
        var state = compositions.get( inbox );
        if ( ! state ) { return; }
        state.slots.forEach( function ( slot ) {
            if ( slot.node.isConnected && slot.anchor.parentNode ) {
                slot.anchor.parentNode.insertBefore( slot.node, slot.anchor );
            }
            slot.anchor.remove();
        } );
        state.settings.textContent = state.text;
        [ 'title', 'aria-label' ].forEach( function ( name, index ) {
            if ( state.attributes[index] === null ) { state.settings.removeAttribute( name ); }
            else { state.settings.setAttribute( name, state.attributes[index] ); }
        } );
        if ( ! state.toolbar.firstChild ) { state.toolbar.remove(); }
        compositions.delete( inbox );
    }

    function mount( inbox ) {
        var control = inbox.querySelector( controlSelector );
        var outside = inbox.previousElementSibling;
        if ( ! control && outside && outside.classList.contains( 'gpp-inbox-manual-refresh' ) ) {
            control = outside.querySelector( controlSelector );
        }
        if ( ! control ) {
            var container = document.createElement( 'p' );
            container.className = 'gpp-inbox-manual-refresh';
            control = document.createElement( 'button' );
            control.type = 'button';
            control.className = 'button button-secondary gpp-inbox-manual-refresh__button';
            control.setAttribute( 'data-gpp-inbox-manual-refresh', '' );
            control.setAttribute( 'lang', 'fa' );
            control.setAttribute( 'dir', 'rtl' );
            control.setAttribute( 'aria-label', label );
            control.textContent = label;
            control.addEventListener( 'click', function () {
                if ( control.disabled ) { return; }
                control.disabled = true;
                control.setAttribute( 'aria-busy', 'true' );
                control.textContent = 'در حال به‌روزرسانی…';
                control.setAttribute( 'aria-label', control.textContent );
                // Preserve the existing native document lifecycle and URL. Flow
                // does not persist its quick search across a document reload.
                window.location.reload();
            } );
            container.appendChild( control );
            inbox.parentNode.insertBefore( container, inbox );
        }

        // Only the admitted SRWF frontend surface gets the composition. Keep
        // the Inbox/flyout sibling relationship used by native Push intact.
        if ( ! inbox.closest( '.gpp-inbox-surface' ) ) { return; }
        var roots = inbox.querySelectorAll( '[data-js="gflow-inbox"]' );
        var host = roots.length === 1 ? roots[0] : null;
        if ( ! host || host.dataset.gridId !== inbox.dataset.gridId ) { rollback( inbox ); return; }
        var headers = host.querySelectorAll( '.gflow-grid__header' );
        var searches = inbox.querySelectorAll( '[data-js="gflow-inbox-search"]' );
        var settings = inbox.querySelectorAll( 'button[data-js="inbox-settings"]' );
        var toolbar = inbox.querySelector( '[data-gpp-inbox-toolbar]' );
        var valid = headers.length === 1 && searches.length === 1 && settings.length === 1
            && headers[0].contains( searches[0] ) && inbox.dataset.gridId
            && settings[0].dataset.gridId === inbox.dataset.gridId
            && ( headers[0].parentNode === host || headers[0].parentNode === toolbar )
            && ( settings[0].parentNode === host || settings[0].parentNode === toolbar );
        var existing = compositions.get( inbox );
        if ( existing && ( existing.toolbar !== toolbar || existing.slots[0].node !== headers[0] || existing.settings !== settings[0] ) ) {
            rollback( inbox );
            toolbar = null;
        }
        if ( ! valid ) {
            // Unknown/replaced host shape: unwrap only our composition. Never
            // remove a native node or apply a substitute action.
            rollback( inbox );
            return;
        }
        if ( ! toolbar ) {
            toolbar = document.createElement( 'div' );
            toolbar.setAttribute( 'data-gpp-inbox-toolbar', '' );
            toolbar.setAttribute( 'role', 'group' );
            toolbar.setAttribute( 'aria-label', 'ابزارهای کارهای من' );
            var nodes = [ headers[0], control.parentNode, settings[0] ];
            var state = {
                toolbar: toolbar, settings: settings[0], text: settings[0].textContent,
                attributes: [ settings[0].getAttribute( 'title' ), settings[0].getAttribute( 'aria-label' ) ],
                slots: nodes.map( function ( node ) {
                    var anchor = document.createComment( 'gpp-inbox-original-position' );
                    node.parentNode.insertBefore( anchor, node );
                    return { node: node, anchor: anchor };
                } )
            };
            compositions.set( inbox, state );
            host.insertBefore( toolbar, host.firstChild );
        }
        // Idempotent original-node moves preserve delegated native events,
        // search's closest Inbox, grid identity and DOM keyboard order.
        [ headers[0], control.parentNode, settings[0] ].forEach( function ( node ) {
            if ( node.parentNode !== toolbar ) { toolbar.appendChild( node ); }
        } );
        if ( settings[0].textContent !== settingsLabel ) {
            settings[0].textContent = settingsLabel;
            settings[0].setAttribute( 'aria-label', settingsLabel );
            settings[0].setAttribute( 'title', settingsLabel );
        }
    }

    function reconcile() {
        document.querySelectorAll( surfaceSelector ).forEach( mount );
    }

    function start() {
        reconcile();
        // Persistent, mutation-driven and idempotent: native grid rerenders may
        // replace controls. No timers, host API calls or duplicated state.
        if ( typeof MutationObserver !== 'undefined' ) {
            new MutationObserver( reconcile ).observe( document.body, { childList: true, subtree: true } );
        }
    }
    window.addEventListener( 'pageshow', function () {
        document.querySelectorAll( controlSelector ).forEach( function ( control ) {
            control.disabled = false;
            control.removeAttribute( 'aria-busy' );
            control.textContent = label;
            control.setAttribute( 'aria-label', label );
        } );
    } );
    if ( 'loading' === document.readyState ) {
        document.addEventListener( 'DOMContentLoaded', start, { once: true } );
    } else { start(); }
}() );
