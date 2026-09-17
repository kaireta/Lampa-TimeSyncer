(function () {
    'use strict';

    var GUARD = '__youtube_lampa_v4';
    if (window[GUARD]) return;
    window[GUARD] = true;

    var STORE_KEY      = 'yt_lampa';
    var DEFAULT_SERVER = 'https://invidious.io';
    var INVIDIOUS_LIST = [
        'https://invidious.io',
        'https://yt.artemislena.eu',
        'https://invidious.nerdvpn.de',
        'https://inv.tux.pizza',
        'https://invidious.privacydev.net',
        'https://invidious.fdn.fr',
        'https://invidious.lunar.icu',
        'https://vid.puffyan.us'
    ];

    function store(key, val) {
        if (val === undefined) {
            var d = Lampa.Storage.get(STORE_KEY, {});
            return d[key];
        }
        var d = Lampa.Storage.get(STORE_KEY, {});
        d[key] = val;
        Lampa.Storage.set(STORE_KEY, d);
    }

    function getServer()   { return store('server')    || DEFAULT_SERVER; }
    function getApiKey()   { return store('api_key')   || ''; }
    function getToken()    { return store('token')     || ''; }
    function getClientId() { return store('client_id') || ''; }
    function isLoggedIn()  { return !!getToken(); }

    function get(url, params, onSuccess, onError) {
        var qs = Object.keys(params || {}).map(function (k) {
            return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
        }).join('&');
        var fullUrl = url + (qs ? (url.indexOf('?') >= 0 ? '&' : '?') + qs : '');
        var xhr = new XMLHttpRequest();
        xhr.open('GET', fullUrl, true);
        if (getToken() && fullUrl.indexOf('googleapis.com') >= 0) {
            xhr.setRequestHeader('Authorization', 'Bearer ' + getToken());
        }
        xhr.onreadystatechange = function () {
            if (xhr.readyState !== 4) return;
            if (xhr.status >= 200 && xhr.status < 300) {
                try { onSuccess(JSON.parse(xhr.responseText)); }
                catch (e) { onSuccess(xhr.responseText); }
            } else {
                if (onError) onError(xhr.status, xhr.responseText);
            }
        };
        xhr.send();
    }

    function invGet(path, params, onSuccess, onError) {
        get(getServer() + '/api/v1' + path, params, onSuccess, onError);
    }

    function invTrending(onSuccess, onError) {
        invGet('/trending', { type: 'default', region: 'US' }, onSuccess, onError);
    }

    function invSearch(query, page, onSuccess, onError) {
        invGet('/search', { q: query, page: page || 1, type: 'video', sort_by: 'relevance' }, onSuccess, onError);
    }

    function invVideo(videoId, onSuccess, onError) {
        invGet('/videos/' + videoId, {}, onSuccess, onError);
    }

    var YT_BASE = 'https://www.googleapis.com/youtube/v3';

    function ytGet(path, params, onSuccess, onError) {
        var p = Object.assign({}, params, { key: getApiKey() });
        get(YT_BASE + path, p, onSuccess, onError);
    }

    function ytSubscriptions(pageToken, onSuccess, onError) {
        ytGet('/subscriptions', { part: 'snippet', mine: 'true', maxResults: 50, order: 'alphabetical', pageToken: pageToken || '' }, onSuccess, onError);
    }

    function ytHistory(pageToken, onSuccess, onError) {
        ytGet('/playlistItems', { part: 'snippet,contentDetails', playlistId: 'HL', maxResults: 50, pageToken: pageToken || '' }, onSuccess, onError);
    }

    function ytLiked(pageToken, onSuccess, onError) {
        ytGet('/videos', { part: 'snippet,contentDetails', myRating: 'like', maxResults: 50, pageToken: pageToken || '' }, onSuccess, onError);
    }

    function ytPlaylists(pageToken, onSuccess, onError) {
        ytGet('/playlists', { part: 'snippet,contentDetails', mine: 'true', maxResults: 50, pageToken: pageToken || '' }, onSuccess, onError);
    }

    function ytPlaylistItems(playlistId, pageToken, onSuccess, onError) {
        ytGet('/playlistItems', { part: 'snippet,contentDetails', playlistId: playlistId, maxResults: 50, pageToken: pageToken || '' }, onSuccess, onError);
    }

    function normalizeInvVideo(v) {
        return {
            id: v.videoId, title: v.title,
            thumb: v.videoThumbnails && v.videoThumbnails.length > 0 ? v.videoThumbnails[0].url : '',
            views: v.viewCount || 0, duration: v.lengthSeconds || 0,
            channel: v.author || '', type: 'video'
        };
    }

    function normalizeYTItem(item) {
        var s = item.snippet || {};
        var id = (item.contentDetails && item.contentDetails.videoId) ||
                 (typeof item.id === 'string' ? item.id : (item.id && item.id.videoId)) || '';
        return { id: id, title: s.title || '', thumb: s.thumbnails ? (s.thumbnails.high || s.thumbnails.default || {}).url : '', channel: (s.channelTitle || s.videoOwnerChannelTitle || ''), type: 'video' };
    }

    function normalizeYTPlaylist(item) {
        var s = item.snippet || {};
        return { id: item.id, title: s.title || '', thumb: s.thumbnails ? (s.thumbnails.high || s.thumbnails.default || {}).url : '', count: (item.contentDetails && item.contentDetails.itemCount) || 0, type: 'playlist' };
    }

    function playVideo(videoId, title) {
        Lampa.Activity.push({ url: '', title: title || 'YouTube', component: 'yt_lampa_player', video_id: videoId });
    }

    function cardHtml(item) {
        var img = item.thumb || '';
        var title = (item.title || '').substring(0, 60);
        var sub = item.channel || (item.count !== undefined ? item.count + ' videos' : '');
        return '<div class="card selector yt-card" data-video-id="' + (item.id || '') + '" data-type="' + item.type + '">' +
               '<div class="card__img"><img src="' + img + '" loading="lazy"/></div>' +
               '<div class="card__title">' + title + '</div>' +
               '<div class="card__age">' + sub + '</div></div>';
    }

    var css = '.yt-wrap{padding:1em;height:100%;box-sizing:border-box;overflow-y:auto}.yt-tabs{display:flex;gap:.6em;margin-bottom:1em;flex-wrap:wrap}.yt-tab{padding:.4em 1em;border-radius:2em;background:rgba(255,255,255,.1);cursor:pointer;font-size:.9em}.yt-tab.active,.yt-tab.focus{background:#f00;color:#fff}.yt-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:1em}.yt-card{background:rgba(255,255,255,.06);border-radius:.5em;overflow:hidden;cursor:pointer;transition:transform .15s}.yt-card.focus,.yt-card:hover{transform:scale(1.04);outline:2px solid #f00}.yt-card img{width:100%;aspect-ratio:16/9;object-fit:cover;display:block}.yt-card .card__title{padding:.4em .5em;font-size:.85em;line-height:1.3}.yt-card .card__age{padding:0 .5em .4em;font-size:.75em;color:rgba(255,255,255,.5)}.yt-search-bar{display:flex;gap:.5em;margin-bottom:1em}.yt-search-bar input{flex:1;padding:.5em 1em;border-radius:2em;background:rgba(255,255,255,.1);border:none;color:#fff;font-size:1em;outline:none}.yt-search-bar input:focus{background:rgba(255,255,255,.2)}.yt-btn{padding:.4em 1.2em;border-radius:2em;background:#f00;color:#fff;border:none;cursor:pointer;font-size:.9em}.yt-btn.secondary{background:rgba(255,255,255,.15)}.yt-login-box{text-align:center;padding:3em 1em}.yt-login-box p{margin-bottom:1em;opacity:.7}.yt-status{opacity:.5;padding:2em;text-align:center}.yt-oauth-popup{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.85);display:flex;flex-direction:column;align-items:center;justify-content:center}.yt-oauth-popup iframe{width:90vw;max-width:500px;height:80vh;border:none;border-radius:1em;background:#fff}.yt-oauth-popup .yt-btn{margin-top:1em}.yt-settings-form{max-width:500px;padding:.5em 0}.yt-field{margin-bottom:1.2em}.yt-field label{display:block;font-size:.85em;opacity:.6;margin-bottom:.4em}.yt-inp{width:100%;padding:.5em .8em;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.15);border-radius:.4em;color:#fff;font-size:.95em;outline:none;box-sizing:border-box}.yt-inp:focus{border-color:#f00;background:rgba(255,255,255,.15)}select.yt-inp option{background:#222;color:#fff}';

    var styleEl = document.createElement('style');
    styleEl.textContent = css;
    document.head.appendChild(styleEl);

    // OAuth Client ID is read from settings (store key: client_id)

    function openLoginPopup(onComplete) {
        var apiKey = getApiKey();
        if (!apiKey) { Lampa.Noty.show('Укажи Google API Key в настройках плагина'); return; }
        var scope   = 'https://www.googleapis.com/auth/youtube.readonly';
        var authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' +
            'client_id=' + encodeURIComponent(getClientId()) +
            '&redirect_uri=' + encodeURIComponent('https://localhost') +
            '&response_type=token' +
            '&scope=' + encodeURIComponent(scope);
        if (!getClientId()) { Lampa.Noty.show('Укажи OAuth Client ID в настройках'); return; }
        var popup = document.createElement('div');
        popup.className = 'yt-oauth-popup';
        var frame = document.createElement('iframe');
        frame.src = authUrl;
        var closeBtn = document.createElement('button');
        closeBtn.className = 'yt-btn secondary';
        closeBtn.textContent = 'Закрыть';
        popup.appendChild(frame);
        popup.appendChild(closeBtn);
        document.body.appendChild(popup);
        var poll = setInterval(function () {
            try {
                var href = frame.contentWindow.location.href;
                if (href && href.indexOf('access_token=') >= 0) {
                    clearInterval(poll);
                    var hash = href.split('#')[1] || href.split('?')[1] || '';
                    var p = {};
                    hash.split('&').forEach(function (kv) { var a = kv.split('='); p[decodeURIComponent(a[0])] = decodeURIComponent(a[1] || ''); });
                    if (p.access_token) {
                        store('token', p.access_token);
                        document.body.removeChild(popup);
                        Lampa.Noty.show('Вход выполнен!');
                        if (onComplete) onComplete();
                    }
                }
            } catch (e) {}
        }, 600);
        closeBtn.onclick = function () { clearInterval(poll); document.body.removeChild(popup); };
    }

    function YtLampaPlayer(object) {
        var self = this;
        this.activity = object;

        this.create = function () {
            var params = self.activity.get(0) || {};
            self._dom = $('<div class="yt-wrap"></div>');
            self._dom.html('<div class="yt-status">Загрузка...</div>');
            invVideo(params.video_id, function (data) {
                var hls = data.hlsUrl ? (getServer() + data.hlsUrl) : '';
                if (!hls) {
                    var fmts = (data.formatStreams || data.adaptiveFormats || []).filter(function (f) { return f.type && f.type.indexOf('video') >= 0; });
                    fmts.sort(function (a, b) { return (b.resolution || '') > (a.resolution || '') ? 1 : -1; });
                    if (fmts.length) hls = fmts[0].url;
                }
                if (!hls) { self._dom.html('<div class="yt-status">Не удалось получить ссылку</div>'); return; }
                Lampa.Player.play({ title: data.title || '', url: hls, poster: (data.videoThumbnails && data.videoThumbnails.length) ? data.videoThumbnails[0].url : '' });
                self.activity.back();
            }, function (e) { self._dom.html('<div class="yt-status">Ошибка: ' + e + '</div>'); });
        };

        this.render = function () { return self._dom; };
        this.back = function () {};
        this.destroy = function () {};
    }

    function YtLampaMain(object) {
        var self = this;
        this.activity = object;
        this._tab = 'trending';

        this.create = function () {
            self._dom = $('<div class="yt-wrap"></div>');
            self._buildTabs();
            self._loadTab('trending');
        };

        this._buildTabs = function () {
            var tabs = [{ id: 'trending', label: 'Тренды' }, { id: 'search', label: 'Поиск' }];
            if (isLoggedIn()) {
                tabs.push(
                    { id: 'subscriptions', label: 'Подписки' },
                    { id: 'history',       label: 'История' },
                    { id: 'liked',         label: 'Лайки' },
                    { id: 'playlists',     label: 'Плейлисты' },
                    { id: 'logout',        label: 'Выйти' }
                );
            } else {
                tabs.push({ id: 'login', label: 'Войти' });
            }
            tabs.push({ id: 'settings', label: '⚙' });

            var bar = $('<div class="yt-tabs"></div>');
            tabs.forEach(function (t) {
                var el = $('<div class="yt-tab selector">' + t.label + '</div>');
                if (t.id === self._tab) el.addClass('active');
                el.on('hover:enter click', function () {
                    if (t.id === 'logout') {
                        store('token', '');
                        Lampa.Noty.show('Выход выполнен');
                        self._buildTabs();
                        self._loadTab('trending');
                        return;
                    }
                    self._dom.find('.yt-tab').removeClass('active');
                    el.addClass('active');
                    self._tab = t.id;
                    self._loadTab(t.id);
                });
                bar.append(el);
            });
            self._dom.find('.yt-tabs').remove();
            self._dom.prepend(bar);
        };

        this._loadTab = function (tab) {
            var content = $('<div class="yt-content"></div>');
            self._dom.find('.yt-content').remove();
            self._dom.append(content);

            if (tab === 'trending') {
                content.html('<div class="yt-status">Загрузка трендов...</div>');
                invTrending(function (data) { self._renderGrid(content, (data || []).map(normalizeInvVideo)); }, function (e) { content.html('<div class="yt-status">Ошибка: ' + e + '</div>'); });

            } else if (tab === 'search') {
                var bar = $('<div class="yt-search-bar"></div>');
                var inp = $('<input type="text" placeholder="Поиск на YouTube..."/>');
                var btn = $('<button class="yt-btn selector">Найти</button>');
                var doSearch = function () {
                    var q = inp.val().trim();
                    if (!q) return;
                    content.find('.yt-grid,.yt-status').remove();
                    content.append('<div class="yt-status">Поиск...</div>');
                    invSearch(q, 1, function (data) {
                        self._renderGrid(content, (data || []).filter(function (v) { return v.type === 'video'; }).map(normalizeInvVideo));
                    }, function (e) { content.find('.yt-status').text('Ошибка: ' + e); });
                };
                btn.on('hover:enter click', doSearch);
                inp.on('keydown', function (e) { if (e.key === 'Enter') doSearch(); });
                bar.append(inp).append(btn);
                content.append(bar);

            } else if (tab === 'login') {
                var box = $('<div class="yt-login-box"></div>');
                box.append('<p>Войди в Google, чтобы видеть подписки, историю и лайки</p>');
                var loginBtn = $('<button class="yt-btn selector">Войти через Google</button>');
                loginBtn.on('hover:enter click', function () { openLoginPopup(function () { self._buildTabs(); self._loadTab('subscriptions'); }); });
                box.append(loginBtn);
                content.append(box);

            } else if (tab === 'subscriptions') {
                content.html('<div class="yt-status">Загрузка подписок...</div>');
                ytSubscriptions('', function (data) {
                    var items = (data.items || []).map(function (item) {
                        var s = item.snippet || {};
                        return { id: s.resourceId ? s.resourceId.channelId : '', title: s.title || '', thumb: s.thumbnails ? (s.thumbnails.high || s.thumbnails.default || {}).url : '', type: 'channel' };
                    });
                    self._renderGrid(content, items);
                }, function (e) { content.html('<div class="yt-status">Ошибка: ' + e + '. Проверь API Key и авторизацию</div>'); });

            } else if (tab === 'history') {
                content.html('<div class="yt-status">Загрузка истории...</div>');
                ytHistory('', function (data) { self._renderGrid(content, (data.items || []).map(normalizeYTItem)); }, function (e) { content.html('<div class="yt-status">Ошибка: ' + e + '</div>'); });

            } else if (tab === 'liked') {
                content.html('<div class="yt-status">Загрузка лайков...</div>');
                ytLiked('', function (data) { self._renderGrid(content, (data.items || []).map(normalizeYTItem)); }, function (e) { content.html('<div class="yt-status">Ошибка: ' + e + '</div>'); });

            } else if (tab === 'playlists') {
                content.html('<div class="yt-status">Загрузка плейлистов...</div>');
                ytPlaylists('', function (data) { self._renderGrid(content, (data.items || []).map(normalizeYTPlaylist), true); }, function (e) { content.html('<div class="yt-status">Ошибка: ' + e + '</div>'); });

            } else if (tab === 'settings') {
                var srvOptions = INVIDIOUS_LIST.map(function (s) {
                    var label = s.replace('https://', '');
                    var sel = s === getServer() ? ' selected' : '';
                    return '<option value="' + s + '"' + sel + '>' + label + '</option>';
                }).join('');
                content.html(
                    '<div class="yt-settings-form">' +
                    '<div class="yt-field"><label>OAuth Client ID</label>' +
                    '<input class="yt-inp" id="yt-client-id" type="text" placeholder="*.apps.googleusercontent.com" value="' + (getClientId() || '') + '"/></div>' +
                    '<div class="yt-field"><label>Google API Key</label>' +
                    '<input class="yt-inp" id="yt-api-key" type="text" placeholder="AIza..." value="' + (getApiKey() || '') + '"/></div>' +
                    '<div class="yt-field"><label>Invidious сервер</label>' +
                    '<select class="yt-inp" id="yt-server">' + srvOptions + '</select></div>' +
                    '<button class="yt-btn selector" id="yt-save">Сохранить</button>' +
                    '</div>'
                );
                content.find('#yt-save').on('click hover:enter', function () {
                    store('client_id', content.find('#yt-client-id').val().trim());
                    store('api_key',   content.find('#yt-api-key').val().trim());
                    store('server',    content.find('#yt-server').val());
                    Lampa.Noty.show('Настройки сохранены');
                });
            }
        };

        this._renderGrid = function (container, items, isPlaylist) {
            container.find('.yt-grid,.yt-status').remove();
            if (!items || !items.length) { container.append('<div class="yt-status">Ничего не найдено</div>'); return; }
            var grid = $('<div class="yt-grid"></div>');
            items.forEach(function (item) {
                var card = $(cardHtml(item));
                card.on('hover:enter click', function () {
                    if (isPlaylist || item.type === 'playlist') {
                        container.find('.yt-grid').remove();
                        container.append('<div class="yt-status">Загрузка...</div>');
                        ytPlaylistItems(item.id, '', function (data) { self._renderGrid(container, (data.items || []).map(normalizeYTItem)); }, function (e) { container.find('.yt-status').text('Ошибка: ' + e); });
                    } else if (item.type === 'video' && item.id) {
                        playVideo(item.id, item.title);
                    }
                });
                grid.append(card);
            });
            container.append(grid);
        };

        this.render = function () { return self._dom; };
        this.back = function () {};
        this.destroy = function () { if (self._dom) self._dom.remove(); };
    }

    Lampa.Component.add('yt_lampa_player', YtLampaPlayer);
    Lampa.Component.add('yt_lampa_main', YtLampaMain);

    // Lampa's native SettingsApi is unstable in this fork. 
    // Settings are handled exclusively via the internal "⚙" tab inside the YouTube component.


    function addMenuEntry() {
        var icon = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M10 15l5.19-3L10 9v6zm11.56-7.83c.25.94.43 2.2.54 3.73L22 12l-.9 1.1c-.11 1.53-.29 2.79-.54 3.73-.23.86-.88 1.51-1.74 1.74-.94.25-3.3.43-5.82.43s-4.88-.18-5.82-.43c-.86-.23-1.51-.88-1.74-1.74C6.18 15.9 6 14.53 6 13l-.01-1 .01-1c.11-1.53.29-2.79.54-3.73C6.77 6.41 7.42 5.76 8.28 5.53 9.22 5.28 11.58 5.1 14.1 5.1s4.88.18 5.82.43c.86.23 1.51.88 1.64 1.64z"/></svg>';
        var li = $('<li class="menu__item selector" data-action="yt_lampa"><div class="menu__ico">' + icon + '</div><div class="menu__text">YouTube</div></li>');
        li.on('hover:enter click', function () { Lampa.Activity.push({ url: '', title: 'YouTube', component: 'yt_lampa_main' }); });
        function inject() {
            var nav = document.querySelector('.menu ul, .menu__list, .navigation__items');
            if (nav) $(nav).append(li);
        }
        Lampa.Listener.follow('app:ready', inject);
        setTimeout(inject, 1500);
    }

    addMenuEntry();

})();
