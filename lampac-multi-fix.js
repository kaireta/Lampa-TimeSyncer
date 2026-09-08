(function () {
    'use strict';

    var GUARD = '__lampac_multi_fix_v3';
    if (window[GUARD]) return;
    window[GUARD] = true;

    // Fix 1: window.lampac_plugin guard
    // Both plugins check: if (!window.lampac_plugin) startPlugin();
    // The first plugin sets it to true — the second never runs startPlugin at all.
    // Solution: make the property always return undefined (falsy)
    // so every plugin always runs its own startPlugin.
    try {
        Object.defineProperty(window, 'lampac_plugin', {
            get: function () { return undefined; },
            set: function () {},
            configurable: true
        });
    } catch (e) {}

    // Fix 2: .lampac--button CSS guard
    // Both plugins check: if (render.find('.lampac--button').length) return;
    // Patch Lampa.Listener.send (the internal dispatcher) so during a 'full'
    // event all handlers see zero existing lampac--buttons and each adds its own.
    // This is order-independent: works regardless of when plugins registered.
    var seenNodes = new WeakSet();

    function patchSend(listener) {
        var _orig = listener.send;

        listener.send = function (type, data) {
            if (type !== 'full' || !data || data.type !== 'complite') {
                return _orig.apply(this, arguments);
            }

            // Identify the render anchor so we can prevent duplicate buttons
            // if the same 'full' event fires more than once for the same DOM node.
            var anchor = null;
            try { anchor = data.object.activity.render().find('.view--torrent')[0]; } catch (_) {}
            if (!anchor) try { anchor = data.object.activity.render()[0]; } catch (_) {}

            // Already processed this exact render — let handlers run normally
            // (each will find its own button and exit early as intended).
            if (anchor && seenNodes.has(anchor)) {
                return _orig.apply(this, arguments);
            }

            // During this dispatch, hide all .lampac--button elements from $.fn.find
            // so every handler believes no button exists yet and adds its own.
            var _origFind = $.fn.find;
            $.fn.find = function (sel) {
                if (typeof sel === 'string' && sel.trim() === '.lampac--button') {
                    return $([]);
                }
                return _origFind.apply(this, arguments);
            };

            try {
                var result = _orig.apply(this, arguments);
                if (anchor) seenNodes.add(anchor);
                return result;
            } finally {
                $.fn.find = _origFind;
            }
        };
    }

    function init() {
        if (!window.Lampa || !Lampa.Listener || typeof Lampa.Listener.send !== 'function') {
            return false;
        }
        patchSend(Lampa.Listener);
        return true;
    }

    if (!init()) {
        var _t = setInterval(function () {
            if (init()) clearInterval(_t);
        }, 50);
    }

})();
