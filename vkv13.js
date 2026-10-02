(function () {
    'use strict';

    var plugin_name = 'vk_video_balancer_v13';
    if (window[plugin_name + '_loaded']) return;
    window[plugin_name + '_loaded'] = true;

    var PROXY = 'https://vkvideo.appleid000936.workers.dev/?url=';

    var style = document.createElement('style');
    style.textContent = '.vk-video-main { height: 100%; display: flex; flex-direction: column; overflow: hidden; }';
    document.head.appendChild(style);

    // ── Хелпер: fetch с таймаутом ────────────────────────────────────────────
    function fetchText(url, timeoutMs, onSuccess, onError) {
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, timeoutMs || 30000);
        fetch(url, { signal: controller.signal })
            .then(function (r) { return r.text(); })
            .then(function (text) { clearTimeout(timer); onSuccess(text); })
            .catch(function (e) {
                clearTimeout(timer);
                console.error('[VK v13] fetch error:', e.name, e.message, 'url:', url);
                onError(e);
            });
    }

    // ── Хелпер: декодирование HTML ───────────────────────────────────────────
    function decodeHtml(str) {
        var d = document.createElement('div');
        d.innerHTML = str || '';
        return d.textContent || d.innerText || str || '';
    }

    // ── Поиск видео VK ────────────────────────────────────────────────────────
    function parseVK(query, onsuccess, onerror) {
        var vkUrl = 'https://vk.com/al_video.php?act=search_video&al=1&q=' + encodeURIComponent(query);
        var url = PROXY + encodeURIComponent(vkUrl);

        fetchText(url, 30000, function (res) {
            try {
                var start = res.indexOf('{"payload"');
                if (start === -1) throw new Error('no payload in response');
                var data = JSON.parse(res.substring(start));
                var list = data.payload[1][2].list;
                var results = [];
                list.forEach(function (item) {
                    var oid   = item[0];
                    var vid   = item[1];
                    var thumb = item[2] || '';
                    var title = decodeHtml((item[3] || '').replace(/<\/?[^>]+(>|$)/g, ''));
                    var hash  = '';
                    var dur   = '';

                    item.forEach(function (val) {
                        if (typeof val === 'string' && /^[a-f0-9]{12,24}$/i.test(val) && val.length > hash.length)
                            hash = val;
                        if (typeof val === 'string' && /^\d+:\d+(:\d+)?$/.test(val))
                            dur = val;
                    });

                    if (hash) {
                        results.push({
                            title: title,
                            thumb: thumb,
                            time:  dur,
                            url:   'https://vk.com/video_ext.php?oid=' + oid + '&id=' + vid + '&hash=' + hash
                        });
                    }
                });
                onsuccess(results);
            } catch (e) {
                console.error('[VK v13] parse error:', e.message);
                onerror();
            }
        }, function () { onerror(); });
    }

    // ── Получение HLS-потока из iframe ───────────────────────────────────────
    function extractHLS(iframeUrl, onsuccess, onerror) {
        var url = PROXY + encodeURIComponent(iframeUrl);
        fetchText(url, 25000, function (res) {
            // 1. HLS поток (приоритет)
            var m = res.match(/"hls":"([^"]+)"/);
            if (m && m[1]) return onsuccess(m[1].replace(/\\\//g, '/'));

            // 2. Прямые URL разных качеств (VK хранит в json внутри HTML)
            var qualities = ['url_hd', 'url_sd', 'mp4_1080', 'mp4_720', 'mp4_480', 'mp4_360', 'mp4_240'];
            for (var i = 0; i < qualities.length; i++) {
                var re = new RegExp('"' + qualities[i] + '":"([^"]+)"');
                var mm = res.match(re);
                if (mm && mm[1]) return onsuccess(mm[1].replace(/\\\//g, '/'));
            }

            // 3. Любой .m3u8 URL
            var m3u8 = res.match(/https?:\\?\/\\?\/[^"'\\]+\.m3u8[^"'\\]*/);
            if (m3u8) return onsuccess(m3u8[0].replace(/\\\//g, '/'));

            // 4. Любой .mp4 URL
            var mp4 = res.match(/https?:\\?\/\\?\/[^"'\\]+\.mp4[^"'\\]*/);
            if (mp4) return onsuccess(mp4[0].replace(/\\\//g, '/'));

            console.warn('[VK v13] No playable URL in embed page:', iframeUrl);
            onerror();
        }, function () { onerror(); });
    }

    // ── Умный парсинг эпизодов ───────────────────────────────────────────────
    function detectEpisode(title) {
        var t = title || '';
        var patterns = [
            /(?:серия|сер\.?)\s+(\d{1,4})/i,          // "серия 3", "сер. 03"
            /(\d{1,4})\s*(?:-я|-ая)?\s*(?:серия|сер)/i,// "3 серия", "3-я серия"
            /s\d+\s*e(\d+)/i,                           // "S01E03", "s1e3"
            /(?:эпизод|episode|ep\.?)\s*(\d{1,4})/i,   // "Эпизод 3", "ep. 3"
            /(?:часть|ч\.?|part)\s+(\d{1,4})/i,        // "часть 3", "ч. 3"
            /^\[?(\d{1,4})\]?\s*[-.\s]/,               // "03. Название", "[3] ..."
            /\((\d{1,4})\s*(?:серия|эпизод)\)/i,       // "(3 серия)"
        ];
        for (var i = 0; i < patterns.length; i++) {
            var m = t.match(patterns[i]);
            if (m) {
                var n = parseInt(m[1], 10);
                if (n > 0 && n < 2000) return n;
            }
        }
        return null;
    }

    function groupResults(results) {
        var byEp = {};
        var noEp = [];

        results.forEach(function (item) {
            var ep = detectEpisode(item.title);
            if (ep !== null) {
                if (!byEp[ep]) byEp[ep] = [];
                byEp[ep].push(item);
            } else {
                noEp.push(item);
            }
        });

        var epKeys = Object.keys(byEp);
        // Использовать эпизодный режим только если >=30% видео имеют номера серий
        // и найдено >= 2 разных серий
        var useEpisodeMode = (epKeys.length >= 2) &&
            (results.length - noEp.length) >= Math.max(2, results.length * 0.3);

        return { byEp: byEp, noEp: noEp, epKeys: epKeys, useEpisodeMode: useEpisodeMode };
    }


    // ── Компонент Lampa ───────────────────────────────────────────────────────
    function VKVideoComponent(object) {
        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var filter = new Lampa.Filter(object);

        var self = this;
        this.activity = object;
        this.results  = [];
        this.m        = object.movie || {};
        this._grouped = null;

        this.create = function () {
            this.build();
            this.search();
        };

        this.build = function () {
            Lampa.Background.change(this.m.backdrop_path || this.m.poster_path);
            Lampa.Template.add('vk_video_main', '<div class="vk-video-main"></div>');
            this.html = Lampa.Template.get('vk_video_main');

            filter.onSearch = function (value) { self.search(value); };
            filter.onBack   = function () { self.start(); };
            filter.render().find('.filter--search').show();
            this.html.append(filter.render());

            var searchBtn = $('<div class="full-start__button selector" style="margin:1em;display:inline-block;background:rgba(255,255,255,0.1);padding:10px 20px;border-radius:5px;">Найти вручную</div>');
            searchBtn.on('hover:enter', function () {
                Lampa.Input.edit({
                    title: 'Поиск в VK',
                    value: '',
                    free: true,
                    nosave: true
                }, function (new_val) {
                    if (new_val) self.search(new_val);
                });
            });
            this.html.append(searchBtn);
            this.html.append(scroll.render());
        };

        this.search = function (customQuery) {
            scroll.clear();
            var title = this.m.title || this.m.name || '';
            var year  = (this.m.release_date || this.m.first_air_date || '').substring(0, 4);
            var q     = this.activity.customQuery || customQuery || (title + (year ? ' ' + year : '')).trim();

            if (q) {
                Lampa.Noty.show('Поиск в VK: ' + q);
                var loading = $('<div class="empty__title">Загрузка...</div>');
                scroll.append(loading);

                parseVK(q, function (results) {
                    loading.remove();
                    self.results = results;
                    if (results.length > 0) {
                        self.renderContent(results);
                        Lampa.Controller.collectionSet(self.html);
                        Lampa.Controller.collectionFocus(scroll.render(), self.html);
                    } else {
                        scroll.append($('<div class="empty__title">Ничего не найдено</div>'));
                    }
                }, function () {
                    loading.remove();
                    scroll.append($('<div class="empty__title">Ошибка загрузки VK или превышено время ожидания</div>'));
                });
            } else {
                scroll.append($('<div class="empty__title">Введите запрос для поиска</div>'));
            }
        };

        this.renderContent = function (results) {
            scroll.clear();
            var grouped = groupResults(results);

            if (grouped.useEpisodeMode) {
                self._grouped = grouped;
                self.showEpisodeGrid(grouped);
            } else {
                self.showFlatList(results);
            }
        };

        this.showEpisodeGrid = function (grouped) {
            scroll.clear();
            var epNums = grouped.epKeys.map(Number).sort(function (a, b) { return a - b; });

            epNums.forEach(function (ep) {
                var variants = grouped.byEp[ep];
                var card = $('<div class="selector" style="display:inline-flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(255,255,255,0.08);border-radius:8px;padding:1.2em 1.5em;margin:0.4em;cursor:pointer;min-width:120px;text-align:center;"></div>');
                $('<div style="font-size:1.4em;font-weight:bold;color:#fff;"></div>').text('Серия ' + ep).appendTo(card);
                $('<div style="font-size:0.8em;color:rgba(255,255,255,0.5);margin-top:0.3em;"></div>').text(variants.length + ' ' + (variants.length === 1 ? 'вариант' : variants.length < 5 ? 'варианта' : 'вариантов')).appendTo(card);

                card.on('hover:enter', function () {
                    self.showVariants(ep, variants);
                });
                scroll.append(card);
            });

            if (grouped.noEp.length > 0) {
                scroll.append($('<div style="padding:0.8em 0.4em;color:rgba(255,255,255,0.4);font-size:0.85em;">Прочие видео</div>'));
                self.showFlatList(grouped.noEp, true);
            }

            Lampa.Controller.collectionSet(self.html);
            Lampa.Controller.collectionFocus(scroll.render(), self.html);
        };

        this.showVariants = function (ep, variants) {
            scroll.clear();

            var backBtn = $('<div class="selector" style="display:inline-flex;align-items:center;gap:0.5em;padding:0.7em 1.2em;margin-bottom:0.8em;background:rgba(255,255,255,0.06);border-radius:6px;cursor:pointer;"></div>');
            $('<span>←</span>').appendTo(backBtn);
            $('<span></span>').text('Серия ' + ep + ' — выберите вариант').appendTo(backBtn);
            backBtn.on('hover:enter', function () {
                self.showEpisodeGrid(self._grouped);
            });
            scroll.append(backBtn);

            self.showFlatList(variants, true);

            Lampa.Controller.collectionSet(self.html);
            Lampa.Controller.collectionFocus(scroll.render(), self.html);
        };

        this.showFlatList = function (items, appendMode) {
            if (!appendMode) scroll.clear();

            items.forEach(function (item) {
                var card = $('<div class="selector" style="display:flex;align-items:center;padding:0.8em 1em;margin-bottom:0.4em;background:rgba(255,255,255,0.05);border-radius:6px;cursor:pointer;gap:1em;"></div>');

                if (item.thumb) {
                    $('<img loading="lazy" style="width:120px;height:68px;object-fit:cover;border-radius:4px;flex-shrink:0;"/>').attr('src', item.thumb).appendTo(card);
                }

                var info = $('<div style="flex:1;min-width:0;"></div>');
                $('<div style="font-size:1em;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></div>').text(item.title || 'VK Video').appendTo(info);
                if (item.time) {
                    $('<div style="font-size:0.85em;color:rgba(255,255,255,0.5);margin-top:0.3em;"></div>').text(item.time).appendTo(info);
                }
                info.appendTo(card);

                card.on('hover:enter', function () {
                    Lampa.Noty.show('Получение потока...');
                    extractHLS(item.url, function (hlsUrl) {
                        var p = { url: hlsUrl, title: item.title };
                        Lampa.Player.play(p);
                        Lampa.Player.playlist([p]);
                    }, function () {
                        Lampa.Noty.show('Не удалось получить ссылку на видео');
                    });
                });

                scroll.append(card);
            });
        };

        this.render  = function () { return this.html; };

        this.start = function () {
            Lampa.Controller.toggle('content');
            Lampa.Controller.collectionSet(self.html);
            Lampa.Controller.collectionFocus(
                self.results.length ? scroll.render() : filter.render(),
                self.html
            );
        };

        this.pause   = function () {};
        this.stop    = function () {};
        this.empty   = function () {};
        this.back    = function () { Lampa.Activity.backward(); };
        this.destroy = function () {
            if (this.html) this.html.remove();
            scroll.destroy();
            filter.destroy();
        };
    }

    Lampa.Component.add('vk_video_balancer', VKVideoComponent);

    // ── Кнопка VK на странице фильма ─────────────────────────────────────────
    var last_movie = null;
    Lampa.Listener.follow('full:ready', function (e) {
        if (e.type !== 'movie' && e.type !== 'tv') return;

        last_movie = {
            title:          e.object.title          || e.object.name          || '',
            original_title: e.object.original_title || e.object.original_name || '',
            release_date:   e.object.release_date   || e.object.first_air_date || '',
            backdrop_path:  e.object.backdrop_path  || '',
            poster_path:    e.object.poster_path    || ''
        };

        var btn = $('<div class="full-start__button selector" data-action="vk_video"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M2.067 11.234c0-4.062 0-6.094 1.258-7.359C4.582 2.61 6.6 2.61 10.64 2.61h2.72c4.04 0 6.06 0 7.316 1.265 1.259 1.265 1.259 3.297 1.259 7.359v1.532c0 4.062 0 6.094-1.259 7.359-1.257 1.265-3.277 1.265-7.317 1.265h-2.72c-4.04 0-6.059 0-7.316-1.265-1.258-1.265-1.258-3.297-1.258-7.359v-1.532Zm13.88 1.488a.333.333 0 0 0 0-.444l-5.698-4.985a.333.333 0 0 0-.527.222v9.97a.333.333 0 0 0 .527.222l5.698-4.985Z"/></svg><span>VK</span></div>');

        btn.on('hover:enter', function () {
            Lampa.Activity.push({
                url:       '',
                title:     'VK Видео',
                component: 'vk_video_balancer',
                movie:     last_movie
            });
        });

        var parent = e.html.find('.full-start__buttons').eq(0);
        if (parent.length) {
            var first = parent.find('.full-start__button').eq(0);
            if (first.length) btn.insertAfter(first); else parent.append(btn);
        } else {
            e.html.find('.view--actions').append(btn);
        }
    });

    // ── Добавление VK в меню "Источник" (ALPAC, LUMIO, Cinema) ───────────────
    var original_select_show = Lampa.Select.show;
    Lampa.Select.show = function (params) {
        var is_source_menu = false;

        if (params && (params.title === 'Источники' || params.title === 'Source'))
            is_source_menu = true;

        if (params && params.items && params.items.some(function (i) {
            var t = (i.title || '').toLowerCase();
            return t.indexOf('lumio') !== -1 || t.indexOf('alpac') !== -1 ||
                   t.indexOf('cinema') !== -1 || t.indexOf('онлайн') !== -1;
        })) is_source_menu = true;

        if (is_source_menu) {
            var hasVK = params.items.some(function (i) { return i.vk_video; });
            if (!hasVK) {
                params.items.push({
                    title:    'VK Видео',
                    subtitle: 'VK Search v13',
                    icon:     '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M2.067 11.234c0-4.062 0-6.094 1.258-7.359C4.582 2.61 6.6 2.61 10.64 2.61h2.72c4.04 0 6.06 0 7.316 1.265 1.259 1.265 1.259 3.297 1.259 7.359v1.532c0 4.062 0 6.094-1.259 7.359-1.257 1.265-3.277 1.265-7.317 1.265h-2.72c-4.04 0-6.059 0-7.316-1.265-1.258-1.265-1.258-3.297-1.258-7.359v-1.532Zm13.88 1.488a.333.333 0 0 0 0-.444l-5.698-4.985a.333.333 0 0 0-.527.222v9.97a.333.333 0 0 0 .527.222l5.698-4.985Z"/></svg>',
                    vk_video: true
                });

                var original_onSelect = params.onSelect;
                params.onSelect = function (a) {
                    if (a.vk_video) {
                        function getValidMovie(obj) {
                            if (obj && (obj.title || obj.name || obj.search_title)) return obj;
                            return null;
                        }

                        var act = Lampa.Activity.active() || {};
                        var m = getValidMovie(act.card) || getValidMovie(act.movie) || getValidMovie(act.object);
                        if (!m && act.activity)
                            m = getValidMovie(act.activity.card) || getValidMovie(act.activity.movie) || getValidMovie(act.activity.object);
                        if (!m) m = getValidMovie(last_movie);
                        if (!m && Lampa.Activity.history) {
                            var hist = Lampa.Activity.history;
                            for (var i = hist.length - 1; i >= 0; i--) {
                                m = getValidMovie(hist[i].card) || getValidMovie(hist[i].movie) || getValidMovie(hist[i].object);
                                if (m) break;
                            }
                        }
                        m = m || {};

                        var safe_movie = {
                            title:          m.title          || m.name          || m.search_title || '',
                            original_title: m.original_title || m.original_name || '',
                            release_date:   m.release_date   || m.first_air_date || '',
                            backdrop_path:  m.backdrop_path  || '',
                            poster_path:    m.poster_path   || ''
                        };

                        var launchVK = function (customQuery) {
                            var pushData = {
                                url:       '',
                                title:     'VK Видео',
                                component: 'vk_video_balancer',
                                movie:     safe_movie
                            };
                            if (customQuery) pushData.customQuery = customQuery;
                            Lampa.Activity.push(pushData);
                        };

                        if (safe_movie.title) {
                            launchVK();
                        } else {
                            Lampa.Input.edit({
                                title:   'Поиск в VK',
                                value:   '',
                                free:    true,
                                nosave:  true
                            }, function (new_val) {
                                if (new_val) {
                                    safe_movie.title = new_val;
                                    launchVK(new_val);
                                }
                            });
                        }
                    } else if (original_onSelect) {
                        original_onSelect(a);
                    }
                };
            }
        }

        return original_select_show.apply(this, arguments);
    };

})();
