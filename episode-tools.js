(function () {
    'use strict';
    if (window.__ep_scrollbar_plugin) return;
    window.__ep_scrollbar_plugin = true;

    $('<style>').text([
        // pointer-events:none на обёртке — колёсо мыши проходит сквозь к списку
        '.ep-scr{position:absolute;right:0;top:0;bottom:0;width:14px;z-index:100;pointer-events:none}',
        '.ep-scr__track{position:absolute;right:3px;top:6px;bottom:6px;width:4px;background:rgba(255,255,255,.1);border-radius:2px;cursor:pointer;pointer-events:auto}',
        '.ep-scr__thumb{position:absolute;left:0;right:0;background:rgba(255,255,255,.5);border-radius:2px;min-height:32px;cursor:grab;transition:background .15s}',
        '.ep-scr__thumb:hover,.ep-scr--drag .ep-scr__thumb{background:#fff;cursor:grabbing}',
        '.ep-scr__tip{position:absolute;right:20px;width:210px;background:rgba(15,15,15,.95);border:1px solid rgba(255,255,255,.12);border-radius:.6em;padding:.65em;display:none;pointer-events:none;transform:translateY(-50%);box-shadow:0 6px 24px rgba(0,0,0,.6)}',
        '.ep-scr__tip img{width:100%;border-radius:.3em;display:block;margin-bottom:.45em}',
        '.ep-scr__tip-title{font-size:.83em;font-weight:500;line-height:1.3;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}',
        '.ep-scr__tip-pos{font-size:.72em;opacity:.5;margin-top:.3em}'
    ].join('')).appendTo('head');

    var activeObs = null;

    function getTY(el) {
        var m = (el.style.transform || '').match(/translateY\((-?[\d.]+)px\)/);
        return m ? parseFloat(m[1]) : 0;
    }

    function attach(scrollEl) {
        if (scrollEl.find('.ep-scr').length) return;
        var body = scrollEl.find('.scroll__body');
        if (!body.length) return;

        var wrap  = $('<div class="ep-scr">');
        var track = $('<div class="ep-scr__track">');
        var thumb = $('<div class="ep-scr__thumb">');
        var tip   = $('<div class="ep-scr__tip">' +
            '<img class="ep-scr__tip-img">' +
            '<div class="ep-scr__tip-title"></div>' +
            '<div class="ep-scr__tip-pos"></div>' +
            '</div>');
        track.append(thumb);
        wrap.append(track, tip);
        scrollEl.css('position', 'relative').append(wrap);

        var dragging = false;

        // ── позиция бегунка ──────────────────────────────────────────────────
        function update() {
            if (dragging) return;
            var totalH = body[0].scrollHeight, visH = scrollEl.height();
            if (!totalH || totalH <= visH) { wrap.hide(); return; }
            wrap.show();
            var ty = Math.abs(getTY(body[0])), maxScr = totalH - visH;
            var pos = Math.min(ty, maxScr) / maxScr;
            var pct = Math.max(5, (visH / totalH) * 100);
            thumb.css({ top: pos * (100 - pct) + '%', height: pct + '%' });
        }

        if (activeObs) activeObs.disconnect();
        activeObs = new MutationObserver(update);
        activeObs.observe(body[0], { attributes: true, attributeFilter: ['style'] });
        update();

        // ── найти эпизод по позиции трека (0-1) ─────────────────────────────
        // Правильный расчёт: trackPct → скролл-позиция → центр вьюпорта → ближайший эпизод
        function epAt(trackPct) {
            var eps = $('.online-prestige');
            if (!eps.length) return null;
            var totalH = body[0].scrollHeight, visH = scrollEl.height();
            var centerY = trackPct * (totalH - visH) + visH / 2;

            var best = null, minDist = Infinity;
            eps.each(function (i) {
                var mid = this.offsetTop + (this.offsetHeight || 100) / 2;
                var d = Math.abs(mid - centerY);
                if (d < minDist) { minDist = d; best = { el: eps.eq(i), idx: i, total: eps.length }; }
            });
            return best;
        }

        // ── тултип ───────────────────────────────────────────────────────────
        function showTip(trackY, trackPct) {
            var d = epAt(trackPct);
            if (!d) { tip.hide(); return; }
            var src = d.el.find('img').first().attr('src') || '';
            tip.find('.ep-scr__tip-img').attr('src', src).toggle(!!src);
            tip.find('.ep-scr__tip-title').text(d.el.find('.online-prestige__title').text().trim());
            tip.find('.ep-scr__tip-pos').text((d.idx + 1) + ' / ' + d.total);
            tip.css({ top: Math.max(0, trackY) + 'px', display: 'block' });
        }

        // ── перемотка через hover:focus — Lampa сама обновляет внутренний офсет ──
        // Без этого следующее движение колёсом сбрасывало бы позицию обратно.
        function jumpTo(trackPct) {
            var d = epAt(trackPct);
            if (!d || !d.el.length) return;
            d.el.trigger('hover:focus');
        }

        // ── клик и наведение ─────────────────────────────────────────────────
        track.on('mousemove', function (e) {
            showTip(e.offsetY, e.offsetY / track.height());
        });
        track.on('mouseleave', function () { tip.hide(); });
        track.on('click', function (e) {
            if ($(e.target).hasClass('ep-scr__thumb')) return;
            jumpTo(e.offsetY / track.height());
            tip.hide();
        });

        // ── перетаскивание бегунка ───────────────────────────────────────────
        thumb.on('mousedown', function (e) {
            e.preventDefault();
            dragging = true;
            wrap.addClass('ep-scr--drag');

            var startY   = e.clientY;
            var trackH   = track.height();
            var thumbH   = thumb.height();
            var maxTop   = trackH - thumbH;
            var startTop = Math.min((parseFloat(thumb.css('top')) / 100) * trackH, maxTop);

            $(document).on('mousemove.epscr', function (e) {
                var newTop = Math.max(0, Math.min(startTop + e.clientY - startY, maxTop));
                var scrollPct = maxTop > 0 ? newTop / maxTop : 0;

                // Визуально двигаем бегунок
                thumb.css('top', newTop + 'px');
                // Прокручиваем список через Lampa
                jumpTo(scrollPct);
                showTip(newTop + thumbH / 2, scrollPct);
            });

            $(document).on('mouseup.epscr', function () {
                dragging = false;
                wrap.removeClass('ep-scr--drag');
                $(document).off('.epscr');
                tip.hide();
                update(); // синхронизируем бегунок с реальным положением
            });
        });
    }

    // ── следим за появлением списка эпизодов ─────────────────────────────────
    var debounce;
    var observer = new MutationObserver(function () {
        clearTimeout(debounce);
        debounce = setTimeout(function () {
            var list = $('.torrent-list');
            if (!list.length) return;
            var scrollEl = list.closest('.scroll');
            if (scrollEl.length) attach(scrollEl);
        }, 600);
    });

    function init() {
        if (typeof $ === 'undefined') return false;
        observer.observe(document.body, { childList: true, subtree: true });
        return true;
    }

    if (!init()) {
        var t = setInterval(function () { if (init()) clearInterval(t); }, 100);
    }
})();
