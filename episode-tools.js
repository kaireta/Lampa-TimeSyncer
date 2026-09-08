(function () {
    'use strict';
    if (window.__ep_scrollbar_plugin) return;
    window.__ep_scrollbar_plugin = true;

    $('<style>').text([
        '.ep-scr{position:absolute;right:0;top:0;bottom:0;width:14px;z-index:100}',
        '.ep-scr__track{position:absolute;right:3px;top:6px;bottom:6px;width:4px;background:rgba(255,255,255,.1);border-radius:2px;cursor:pointer}',
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
        var tip   = $('<div class="ep-scr__tip"><img class="ep-scr__tip-img"><div class="ep-scr__tip-title"></div><div class="ep-scr__tip-pos"></div></div>');
        track.append(thumb);
        wrap.append(track, tip);
        scrollEl.css('position', 'relative').append(wrap);

        function update() {
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
        scrollEl.on('wheel.epscr', function () { setTimeout(update, 50); });

        function epAt(pct) {
            var eps = $('.online-prestige');
            if (!eps.length) return null;
            var idx = Math.min(Math.floor(pct * eps.length), eps.length - 1);
            return { el: eps.eq(idx), idx: idx, total: eps.length };
        }

        function showTip(trackY, pct) {
            var d = epAt(pct);
            if (!d) { tip.hide(); return; }
            var src = d.el.find('img').first().attr('src') || '';
            tip.find('.ep-scr__tip-img').attr('src', src).toggle(!!src);
            tip.find('.ep-scr__tip-title').text(d.el.find('.online-prestige__title').text().trim());
            tip.find('.ep-scr__tip-pos').text((d.idx + 1) + ' / ' + d.total);
            tip.css({ top: Math.max(0, trackY) + 'px', display: 'block' });
        }

        function jumpTo(pct) {
            var d = epAt(pct);
            if (!d || !d.el.length) return;
            var totalH = body[0].scrollHeight, visH = scrollEl.height();
            var newY = -Math.min(Math.max(0, d.el[0].offsetTop - visH / 3), totalH - visH);
            body.css('transform', 'translateY(' + newY + 'px)');
            d.el.trigger('hover:focus');
            update();
        }

        track.on('mousemove', function (e) { showTip(e.offsetY, e.offsetY / track.height()); });
        track.on('mouseleave', function () { tip.hide(); });
        track.on('click', function (e) {
            if ($(e.target).hasClass('ep-scr__thumb')) return;
            jumpTo(e.offsetY / track.height());
            tip.hide();
        });

        thumb.on('mousedown', function (e) {
            e.preventDefault();
            wrap.addClass('ep-scr--drag');
            var startY = e.clientY, trackH = track.height(), thumbH = thumb.height();
            var startTop = (parseFloat(thumb.css('top')) / 100) * trackH;
            $(document).on('mousemove.epscr', function (e) {
                var newTop = Math.max(0, Math.min(startTop + e.clientY - startY, trackH - thumbH));
                var pct = newTop / (trackH - thumbH || 1);
                jumpTo(pct);
                showTip(newTop + thumbH / 2, (newTop + thumbH / 2) / trackH);
            });
            $(document).on('mouseup.epscr', function () {
                wrap.removeClass('ep-scr--drag');
                $(document).off('.epscr');
                tip.hide();
            });
        });
    }

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
