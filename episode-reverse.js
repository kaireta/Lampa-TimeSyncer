(function () {
    'use strict';
    if (window.__ep_reverse_plugin) return;
    window.__ep_reverse_plugin = true;

    var KEY = 'ep_reverse_order';
    var originalOrder = null;
    var lastEl = null;
    var lastCount = 0;

    function isEnabled() {
        try { return !!Lampa.Storage.get(KEY, false); } catch (e) { return false; }
    }

    function getList() {
        var list = $('.torrent-list');
        return list.length ? list : null;
    }

    function applyReverse(list) {
        var items = list.children('.online-prestige');
        if (items.length < 2) return;

        var el = list[0];
        var count = items.length;
        if (el === lastEl && count === lastCount) return;

        originalOrder = items.toArray();
        lastEl = el;
        lastCount = count;

        list.append(originalOrder.slice().reverse());
    }

    function applyRestore(list) {
        if (!originalOrder) return;
        list.append(originalOrder);
        lastEl = list[0];
        lastCount = originalOrder.length;
        originalOrder = null;
    }

    function resetTracking() {
        lastEl = null;
        lastCount = 0;
        originalOrder = null;
    }

    function updateButton() {
        var on = isEnabled();
        $('.ep-rev-btn')
            .css('opacity', on ? '1' : '0.5')
            .find('span').text(on ? '↕ Новые вверху' : '↕ Порядок');
    }

    function addFilterButton() {
        if ($('.ep-rev-btn').length) { updateButton(); return; }
        var filter = $('.torrent-filter');
        if (!filter.length) return;

        var btn = $('<div class="ep-rev-btn filter--sort selector"><span></span></div>');
        btn.css('margin-left', '1em');
        updateButton();

        btn.on('hover:enter', function () {
            var newVal = !isEnabled();
            try { Lampa.Storage.set(KEY, newVal); } catch (e) {}

            var list = getList();
            if (list) {
                if (newVal) { resetTracking(); applyReverse(list); }
                else { applyRestore(list); }
            }
            updateButton();
        });

        filter.append(btn);
    }

    var episodeDebounce, buttonDebounce;

    var observer = new MutationObserver(function () {
        clearTimeout(episodeDebounce);
        episodeDebounce = setTimeout(function () {
            if (!isEnabled()) return;
            var list = getList();
            if (list) applyReverse(list);
        }, 400);

        clearTimeout(buttonDebounce);
        buttonDebounce = setTimeout(addFilterButton, 300);
    });

    function init() {
        if (typeof $ === 'undefined' || !window.Lampa) return false;
        observer.observe(document.body, { childList: true, subtree: true });
        return true;
    }

    if (!init()) {
        var t = setInterval(function () { if (init()) clearInterval(t); }, 100);
    }
})();
