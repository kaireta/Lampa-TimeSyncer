(function () {
    'use strict';

    var plugin_name = 'vk_video_balancer_v12';
    if (window[plugin_name + '_loaded']) return;
    window[plugin_name + '_loaded'] = true;

    var PROXY = 'https://vkvideo.appleid000936.workers.dev/?url=';

    // ── Хелпер: fetch с таймаутом ────────────────────────────────────────────
    function fetchText(url, timeoutMs, onSuccess, onError) {
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, timeoutMs || 30000);
        fetch(url, { signal: controller.signal })
            .then(function (r) { return r.text(); })
            .then(function (text) { clearTimeout(timer); onSuccess(text); })
            .catch(function (e) {
                clearTimeout(timer);
                console.error('[VK v12] fetch error:', e.name, e.message, 'url:', url);
                onError(e);
            });
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
                    var title = (item[3] || '').replace(/<\/?[^>]+(>|$)/g, '');
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
                console.error('[VK v12] parse error:', e.message);
                onerror();
            }
        }, function () { onerror(); });
    }

    // ── Получение HLS-потока из iframe ───────────────────────────────────────
    function extractHLS(iframeUrl, onsuccess, onerror) {
        var url = PROXY + encodeURIComponent(iframeUrl);
        fetchText(url, 20000, function (res) {
            var m = res.match(/"hls":"([^"]+)"/);
            if (m && m[1]) {
                onsuccess(m[1].replace(/\\\//g, '/'));
            } else {
                console.warn('[VK v12] HLS not found in iframe');
                onerror();
            }
        }, function () { onerror(); });
    }

    // ── Компонент Lampa ───────────────────────────────────────────────────────
    function VKVideoComponent(object) {
        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var filter = new Lampa.Filter(object);

        var self = this;
        this.activity = object;
        this.results  = [];
        this.m        = object.movie || {};

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
                        self.append(results);
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

        this.append = function (results) {
            results.forEach(function (item) {
                var card = $('<div class="selector" style="display:flex;align-items:center;padding:0.8em 1em;margin-bottom:0.5em;background:rgba(255,255,255,0.05);border-radius:6px;cursor:pointer;gap:1em;">' +
                    (item.thumb ? '<img src="' + item.thumb + '" style="width:120px;height:68px;object-fit:cover;border-radius:4px;flex-shrink:0;" loading="lazy"/>' : '') +
                    '<div>' +
                        '<div style="font-size:1em;color:#fff;">' + (item.title || 'VK Video') + '</div>' +
                        (item.time ? '<div style="font-size:0.85em;color:rgba(255,255,255,0.5);">' + item.time + '</div>' : '') +
                    '</div>' +
                '</div>');

                card.on('hover:enter', function () {
                    Lampa.Player.play({ url: item.url, title: item.title });
                    Lampa.Player.playlist([{ url: item.url, title: item.title }]);
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
                    subtitle: 'VK Search v12',
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
