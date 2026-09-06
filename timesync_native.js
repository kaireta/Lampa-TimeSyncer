/**
 * ================================================================
 *  Lampa TimeSyncer v4.3 — синхронизация через GitHub Gist
 * ================================================================
 *
 *  ПАРАМЕТРЫ ОЧИСТКИ:
 *  - Лимит размера: 950 КБ (~1 МБ) для быстрого прямого чтения без урезаний.
 *  - Проверка: раз в 24 часа.
 *  - При достижении лимита: удаляются 25% самых старых записей просмотров.
 *  - ВАЖНО: Закладки (Избранное) хранятся в отдельной базе Lampa и НИКАК
 *    не затрагиваются этой очисткой.
 * ================================================================
 */

(function () {
    'use strict';

    var VERSION     = '4.3.0';
    var PLUGIN_NAME = 'TimeSyncer Native';
    var GIST_FILE   = 'lampa_timesync.json';
    var GIST_API    = 'https://api.github.com/gists';

    // 950 КБ — безопасный порог до 1 МБ (лимита inline-чтения GitHub)
    var MAX_GIST_SIZE_BYTES = 950 * 1024;
    var CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // Раз в сутки

    var SYNC_INTERVAL = 2 * 60 * 1000; // Фоновая синхронизация каждые 2 минуты
    var syncTimer     = null;
    var isSyncing     = false;

    function log(msg) {
        console.log('[' + PLUGIN_NAME + ' v' + VERSION + ']', msg);
    }

    function cfg(key, def) {
        return Lampa.Storage.get('timesync_' + key, def !== undefined ? def : '');
    }

    function setCfg(key, val) {
        Lampa.Storage.set('timesync_' + key, val);
    }

    function token() {
        return (cfg('token') || '').trim();
    }

    function gistId() {
        return (cfg('gist_id') || '').trim();
    }

    function getFileViewKey() {
        try {
            if (Lampa.Timeline && typeof Lampa.Timeline.filename === 'function') {
                return Lampa.Timeline.filename();
            }
        } catch (e) {}

        try {
            var account = Lampa.Storage.get('account', {});
            if (typeof account === 'string') account = JSON.parse(account);
            if (account && account.profile && account.profile.id) {
                return 'file_view_' + account.profile.id;
            }
        } catch (e) {}

        return 'file_view';
    }

    function readStorage(key, def) {
        var val = Lampa.Storage.get(key, def);
        if (typeof val === 'string') {
            try { val = JSON.parse(val); } catch (e) { val = def; }
        }
        return val || def;
    }

    function getByteSize(str) {
        try {
            return new Blob([str]).size;
        } catch (e) {
            return unescape(encodeURIComponent(str)).length;
        }
    }

    function mergeTimelines(a, b) {
        var res = {};
        var k;
        a = a || {};
        b = b || {};

        for (k in a) {
            if (Object.prototype.hasOwnProperty.call(a, k)) res[k] = a[k];
        }

        for (k in b) {
            if (Object.prototype.hasOwnProperty.call(b, k)) {
                var itemB = b[k];
                var itemA = res[k];

                if (!itemA) {
                    res[k] = itemB;
                } else {
                    var timeB = (itemB && itemB.updated) ? itemB.updated : 0;
                    var timeA = (itemA && itemA.updated) ? itemA.updated : 0;

                    if (timeB > timeA) {
                        res[k] = itemB;
                    } else if (timeB < timeA) {
                        res[k] = itemA;
                    } else {
                        var pB = (itemB && typeof itemB.percent !== 'undefined') ? itemB.percent : (typeof itemB === 'number' ? itemB : 0);
                        var pA = (itemA && typeof itemA.percent !== 'undefined') ? itemA.percent : (typeof itemA === 'number' ? itemA : 0);
                        res[k] = (pB >= pA) ? itemB : itemA;
                    }
                }
            }
        }
        return res;
    }

    function mergeArrays(a, b) {
        a = Array.isArray(a) ? a : [];
        b = Array.isArray(b) ? b : [];
        var set = {};
        var result = [];
        var i;

        for (i = 0; i < a.length; i++) {
            if (!set[a[i]]) { set[a[i]] = true; result.push(a[i]); }
        }
        for (i = 0; i < b.length; i++) {
            if (!set[b[i]]) { set[b[i]] = true; result.push(b[i]); }
        }
        return result;
    }

    /**
     * Автоочистка 25% самых старых просмотров при превышении 950 КБ.
     * Затрагивает ТОЛЬКО историю просмотров (file_view). Закладки не трогает!
     */
    function checkAndPruneOldRecords(cloudStore) {
        var jsonStr = JSON.stringify(cloudStore);
        var currentBytes = getByteSize(jsonStr);

        log('Размер файла в Gist: ' + Math.round(currentBytes / 1024) + ' КБ');

        if (currentBytes < MAX_GIST_SIZE_BYTES) {
            return false;
        }

        log('Файл достиг порога ' + Math.round(currentBytes / 1024) + ' КБ (~1 МБ). Очистка 25% старых просмотров...');

        var changed = false;
        for (var branch in cloudStore) {
            if (!Object.prototype.hasOwnProperty.call(cloudStore, branch)) continue;
            var data = cloudStore[branch];
            if (typeof data !== 'object' || Array.isArray(data)) continue;

            var keys = Object.keys(data);
            if (keys.length > 50) {
                // Сортировка от самых старых к новым по дате просмотра
                keys.sort(function (a, b) {
                    var tA = (data[a] && data[a].updated) ? data[a].updated : 0;
                    var tB = (data[b] && data[b].updated) ? data[b].updated : 0;
                    return tA - tB;
                });

                var toRemove = Math.ceil(keys.length * 0.25);
                for (var i = 0; i < toRemove; i++) {
                    delete data[keys[i]];
                }
                changed = true;
                log('Ветвь ' + branch + ': удалено ' + toRemove + ' старых отметок просмотров.');
            }
        }

        // Также подрезаем массив online_view если он слишком разросся
        if (Array.isArray(cloudStore.online_view) && cloudStore.online_view.length > 2000) {
            cloudStore.online_view = cloudStore.online_view.slice(-1500);
            changed = true;
        }

        return changed;
    }

    // ── HTTP API Gist ──────────────────────────────────────────

    function request(method, url, body, callback) {
        var t = token();
        if (!t) { callback('No token'); return; }

        var xhr = new XMLHttpRequest();
        xhr.open(method, url, true);
        xhr.setRequestHeader('Authorization', 'Bearer ' + t);
        xhr.setRequestHeader('Accept', 'application/vnd.github+json');
        xhr.setRequestHeader('X-GitHub-Api-Version', '2022-11-28');
        if (body) xhr.setRequestHeader('Content-Type', 'application/json');

        xhr.onreadystatechange = function () {
            if (xhr.readyState !== 4) return;
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    var json = xhr.responseText ? JSON.parse(xhr.responseText) : {};
                    callback(null, json);
                } catch (e) {
                    callback('JSON parse error: ' + e.message);
                }
            } else {
                callback('HTTP ' + xhr.status + ' ' + (xhr.statusText || ''));
            }
        };
        xhr.onerror = function () { callback('Network error'); };
        xhr.send(body ? JSON.stringify(body) : null);
    }

    function gistRead(id, callback) {
        request('GET', GIST_API + '/' + id, null, function (err, data) {
            if (err) { callback(err); return; }
            try {
                var file = data.files && data.files[GIST_FILE];
                if (!file) { callback(null, {}); return; }

                // Если файл урезан (truncated), скачиваем напрямую по raw_url
                if (file.truncated && file.raw_url) {
                    log('Файл урезан API, загрузка через raw_url...');
                    var rawXhr = new XMLHttpRequest();
                    rawXhr.open('GET', file.raw_url, true);
                    rawXhr.onreadystatechange = function () {
                        if (rawXhr.readyState !== 4) return;
                        try {
                            callback(null, JSON.parse(rawXhr.responseText));
                        } catch (e) {
                            callback('Raw JSON parse error');
                        }
                    };
                    rawXhr.onerror = function () { callback('Raw network error'); };
                    rawXhr.send();
                    return;
                }

                var content = file.content ? JSON.parse(file.content) : {};
                callback(null, content);
            } catch (e) {
                callback('Gist content parse error: ' + e.message);
            }
        });
    }

    function gistWrite(id, fullStore, callback) {
        var files = {};
        files[GIST_FILE] = { content: JSON.stringify(fullStore, null, 2) };

        request('PATCH', GIST_API + '/' + id, { files: files }, function (err) {
            if (callback) callback(err || null);
        });
    }

    function ensureGist(callback) {
        var id = gistId();
        if (id) {
            callback(null, id);
            return;
        }

        log('Поиск существующего Gist...');
        request('GET', GIST_API + '?per_page=100', null, function (err, list) {
            if (err) { callback(err); return; }

            if (Array.isArray(list)) {
                for (var i = 0; i < list.length; i++) {
                    if (list[i].files && list[i].files[GIST_FILE]) {
                        var foundId = list[i].id;
                        log('Найден существующий Gist: ' + foundId);
                        setCfg('gist_id', foundId);
                        callback(null, foundId);
                        return;
                    }
                }
            }

            log('Создание нового приватного Gist...');
            var files = {};
            files[GIST_FILE] = { content: '{}' };

            request('POST', GIST_API, {
                description: 'Lampa TimeSyncer Native storage',
                public: false,
                files: files
            }, function (createErr, created) {
                if (createErr) { callback(createErr); return; }
                var newId = created.id;
                setCfg('gist_id', newId);
                log('Gist успешно создан: ' + newId);
                callback(null, newId);
            });
        });
    }

    // ── Двусторонняя синхронизация + Ежедневная проверка ───────

    function fullSync(silent) {
        if (!token() || isSyncing) return;
        isSyncing = true;

        ensureGist(function (err, id) {
            if (err) {
                isSyncing = false;
                log('Sync error (ensureGist): ' + err);
                if (!silent) Lampa.Noty.show(PLUGIN_NAME + ': ошибка связи');
                return;
            }

            gistRead(id, function (readErr, cloudStore) {
                if (readErr) {
                    isSyncing = false;
                    log('Sync error (read): ' + readErr);
                    if (!silent) Lampa.Noty.show(PLUGIN_NAME + ': ошибка чтения Gist');
                    return;
                }

                cloudStore = cloudStore || {};

                // 1. Синхронизируем таймлайн (file_view)
                var branchKey = getFileViewKey();
                var cloudTimeline = cloudStore[branchKey] || {};
                var localTimeline = readStorage(branchKey, {});
                var mergedTimeline = mergeTimelines(cloudTimeline, localTimeline);

                // 2. Синхронизируем отметки онлайн-просмотров (online_view)
                var cloudOnline = cloudStore.online_view || [];
                var localOnline = readStorage('online_view', []);
                var mergedOnline = mergeArrays(cloudOnline, localOnline);

                // Применяем локально:
                Lampa.Storage.set(branchKey, mergedTimeline);
                Lampa.Storage.set('online_view', mergedOnline);

                try {
                    if (Lampa.Timeline && typeof Lampa.Timeline.read === 'function') {
                        Lampa.Timeline.read();
                    }
                } catch (e) {}

                // 3. Ежедневная проверка размера файла (порог 950 КБ):
                var lastCleanup = parseInt(cfg('last_cleanup_check', '0'), 10) || 0;
                var now = Date.now();
                var pruned = false;

                if (now - lastCleanup > CLEANUP_INTERVAL_MS) {
                    setCfg('last_cleanup_check', now);
                    pruned = checkAndPruneOldRecords(cloudStore);
                    if (pruned) {
                        mergedTimeline = cloudStore[branchKey] || mergedTimeline;
                        Lampa.Storage.set(branchKey, mergedTimeline);
                    }
                }

                // 4. Проверяем изменения для выгрузки в Gist:
                var cloudTimelineCount = Object.keys(cloudTimeline).length;
                var mergedTimelineCount = Object.keys(mergedTimeline).length;
                var cloudOnlineCount = cloudOnline.length;
                var mergedOnlineCount = mergedOnline.length;

                var needsCloudUpdate = pruned ||
                                      (mergedTimelineCount !== cloudTimelineCount) ||
                                      (mergedOnlineCount !== cloudOnlineCount) ||
                                      (JSON.stringify(cloudTimeline) !== JSON.stringify(mergedTimeline));

                if (needsCloudUpdate) {
                    cloudStore[branchKey] = mergedTimeline;
                    cloudStore.online_view = mergedOnline;

                    gistWrite(id, cloudStore, function (writeErr) {
                        isSyncing = false;
                        if (writeErr) {
                            log('Sync error (write): ' + writeErr);
                        } else {
                            log('Синхронизация завершена. Облако обновлено.');
                        }
                        if (!silent) {
                            Lampa.Noty.show(PLUGIN_NAME + ': синхронизировано (' + mergedTimelineCount + ' видео)');
                        }
                    });
                } else {
                    isSyncing = false;
                    log('Синхронизация завершена. Актуально (' + mergedTimelineCount + ' видео).');
                    if (!silent) {
                        Lampa.Noty.show(PLUGIN_NAME + ': синхронизировано (' + mergedTimelineCount + ' видео)');
                    }
                }
            });
        });
    }

    // ── Слушатели событий Lampa ────────────────────────────────

    function bootstrap() {
        // Ловим закрытие плеера:
        try {
            if (Lampa.Player && Lampa.Player.listener) {
                Lampa.Player.listener.follow('destroy', function () {
                    log('Плеер закрыт. Запуск синхронизации...');
                    setTimeout(function () {
                        fullSync(true);
                    }, 800);
                });
            }
        } catch (e) {}

        // Смена профиля:
        Lampa.Storage.listener.follow('change', function (e) {
            if (e.name === 'account' || e.name === 'account_use') {
                log('Сменился профиль. Синхронизируем...');
                fullSync(true);
            }
        });

        // Первая синхронизация при запуске Lampa
        setTimeout(function () {
            fullSync(true);
        }, 1500);

        // Фоновая проверка каждые 2 минуты
        clearInterval(syncTimer);
        syncTimer = setInterval(function () {
            fullSync(true);
        }, SYNC_INTERVAL);

        if (typeof Lampa.SettingsApi !== 'undefined') {
            registerSettings();
        }

        log('Плагин активирован v' + VERSION);
    }

    // ── Меню настроек ──────────────────────────────────────────

    function registerSettings() {
        Lampa.SettingsApi.addComponent({
            component: 'timesync_native',
            name: PLUGIN_NAME,
            icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/></svg>'
        });

        Lampa.SettingsApi.addParam({
            component: 'timesync_native',
            param: {
                name: 'timesync_token',
                type: 'input',
                values: '',
                placeholder: 'ghp_xxxxxxxxxxxxxxxxxxxx',
                default: ''
            },
            field: {
                name: 'GitHub Token (gist scope)',
                description: 'Один и тот же токен на всех ваших устройствах'
            },
            onChange: function () {
                setCfg('gist_id', '');
                fullSync(false);
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'timesync_native',
            param: {
                name: 'timesync_sync_now',
                type: 'button'
            },
            field: {
                name: 'Синхронизировать сейчас',
                description: 'Двусторонний обмен таймкодами с GitHub Gist'
            },
            onChange: function () {
                fullSync(false);
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'timesync_native',
            param: {
                name: 'timesync_gist_id',
                type: 'input',
                values: '',
                placeholder: 'Заполняется автоматически',
                default: ''
            },
            field: {
                name: 'Gist ID (автоматически)',
                description: 'ID вашего хранилища. Очистите поле, если нужно пересоздать Gist.'
            },
            onChange: function () {}
        });
    }

    // ── Точка входа ────────────────────────────────────────────

    if (typeof Lampa === 'undefined' || !Lampa.Listener) {
        var wait = setInterval(function () {
            if (typeof Lampa !== 'undefined' && Lampa.Listener) {
                clearInterval(wait);
                bootstrap();
            }
        }, 300);
    } else {
        bootstrap();
    }
})();
