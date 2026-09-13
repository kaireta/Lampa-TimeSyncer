(function () {
    'use strict';

    var GUARD = '__lampac_multi_fix_v5';
    if (window[GUARD]) return;
    window[GUARD] = true;

    // ── Fix 1: window.lampac_plugin guard ────────────────────────────────────
    // Если Cinema успела выставить lampac_plugin = true до нас — удаляем её значение,
    // затем переопределяем свойство так, чтобы getter всегда возвращал undefined.
    // Это гарантирует что оба плагина всегда запустят startPlugin(),
    // даже если Cinema загрузилась раньше нашего фикса.
    try {
        if (window.lampac_plugin) delete window.lampac_plugin;
        Object.defineProperty(window, 'lampac_plugin', {
            get: function () { return undefined; },
            set: function () {},
            configurable: true
        });
    } catch (e) {}

    // ── Fix 2: .lampac--button CSS guard ─────────────────────────────────────
    // Оба плагина проверяют: if (render.find('.lampac--button').length) return;
    // Первый добавил кнопку — второй видит её и выходит, не добавив свою.
    // Патчим $.fn.find так, чтобы поиск '.lampac--button' всегда возвращал пустой результат.
    function applyFindPatch() {
        var _origFind = $.fn.find;
        $.fn.find = function (sel) {
            if (typeof sel === 'string' && sel.trim() === '.lampac--button') {
                return $([]);
            }
            return _origFind.apply(this, arguments);
        };
    }

    if (typeof $ !== 'undefined' && $.fn) {
        applyFindPatch();
    } else {
        var _t = setInterval(function () {
            if (typeof $ !== 'undefined' && $.fn) {
                clearInterval(_t);
                applyFindPatch();
            }
        }, 50);
    }

    // ── Fix 3: отложенное восстановление Alpac ────────────────────────────────
    // Если из-за гонки загрузки startPlugin у Alpac всё же не запустился,
    // ищем тег <script> с Alpac и перезапускаем его — на этот раз lampac_plugin
    // уже перехвачен нашим defineProperty и startPlugin выполнится.
    function tryReviveAlpac() {
        if (!window.Lampa) return;
        // Alpac регистрирует компонент 'alcopac' — если его нет, startPlugin не выполнялся
        if (Lampa.Component && Lampa.Component.defined && Lampa.Component.defined('alcopac')) return;

        // Ищем script-тег Alpac по характерному признаку (URL содержит l-vid.online)
        var scripts = document.querySelectorAll('script[src]');
        var alpacScript = null;
        for (var i = 0; i < scripts.length; i++) {
            var src = scripts[i].src || '';
            if (src.indexOf('l-vid.online') !== -1 || src.indexOf('alcopac') !== -1) {
                alpacScript = src;
                break;
            }
        }

        if (!alpacScript) return;

        // Перезагружаем скрипт — теперь lampac_plugin перехвачен и startPlugin выполнится
        var s = document.createElement('script');
        s.src = alpacScript + (alpacScript.indexOf('?') === -1 ? '?' : '&') + '_fix=' + Date.now();
        document.head.appendChild(s);
    }

    // Запускаем проверку через 2 секунды — к этому времени все плагины должны загрузиться
    setTimeout(tryReviveAlpac, 2000);

})();
