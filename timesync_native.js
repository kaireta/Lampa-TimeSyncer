/**
 * ================================================================
 *  Lampa TimeSyncer v4.1 (Full 2-Way Sync) — синхронизация через GitHub Gist
 * ================================================================
 *
 *  ИСПРАВЛЕНИЯ v4.1:
 *  1. Двусторонняя синхронизация (2-Way Sync): при синхронизации данные
 *     не только скачиваются, но и выгружают уже имеющуюся историю просмотров в Gist!
 *  2. Слушатель плеера переключен на Lampa.Player.listener (вместо Lampa.Listener),
 *     поэтому сохранение при выходе из плеера теперь РЕАЛЬНО срабатывает.
 *  3. Умное слияние (Merge): если метки времени равны или отсутствуют,
 *     выбирается максимальный прогресс просмотра, ничего не затирается.
 *  4. Синхронизирует и file_view (полоски прогресса/секунды), и online_view (просмотренные серии).
 *  5. Вызов Lampa.Timeline.read() без параметров вызывает событие state:changed,
 *     чтобы полоски на экране сразу перерисовались без перезапуска страницы.
 * ================================================================
 */

(function () {
    'use strict';

    var VERSION     = '4.1.0';
    var PLUGIN_NAME = 'TimeSyncer Native';
    var GIST_FILE   = 'lampa_timesync.json';
    var GIST_API    = 'https://api.github.com/gists';

    var SYNC_INTERVAL = 2 * 60 * 1000; // Автоматическая проверка каждые 2 минуты
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

    /**
     * Слияние двух таймлайнов:
     * 1. Если есть метка updated — побеждает более поздняя.
     * 2. Если метки равны или отсутствуют — побеждает наибольший процент просмотра.
     */
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

    /**
     * Слияние массивов (например, online_view с просмотренными сериями)
     */
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
                var content = file && file.content ? JSON.parse(file.content) : {};
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

    // ── Полная двусторонняя синхронизация (2-Way Sync) ──────────

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

                // Применяем объединенные данные локально в Lampa:
                Lampa.Storage.set(branchKey, mergedTimeline);
                Lampa.Storage.set('online_view', mergedOnline);

                // Заставляем Lampa обновить полосы прогресса на экране:
                try {
                    if (Lampa.Timeline && typeof Lampa.Timeline.read === 'function') {
                        Lampa.Timeline.read(); // Без true, чтобы Lampa вызвала событие обновления экрана
                    }
                } catch (e) {}

                // Проверяем, есть ли новые данные для отправки в облако:
                var cloudTimelineCount = Object.keys(cloudTimeline).length;
                var mergedTimelineCount = Object.keys(mergedTimeline).length;
                var cloudOnlineCount = cloudOnline.length;
                var mergedOnlineCount = mergedOnline.length;

                var needsCloudUpdate = (mergedTimelineCount !== cloudTimelineCount) ||
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
                            log('Синхронизация завершена. Данные обновлены в облаке.');
                        }
                        if (!silent) {
                            Lampa.Noty.show(PLUGIN_NAME + ': синхронизировано (' + mergedTimelineCount + ' видео)');
                        }
                    });
                } else {
                    isSyncing = false;
                    log('Синхронизация завершена. Данные уже актуальны (' + mergedTimelineCount + ' видео).');
                    if (!silent) {
                        Lampa.Noty.show(PLUGIN_NAME + ': синхронизировано (' + mergedTimelineCount + ' видео)');
                    }
                }
            });
        });
    }

    // ── Слушатели событий Lampa ────────────────────────────────

    function bootstrap() {
        // Ловим закрытие плеера на НАСТОЯЩЕМ слушателе плеера (Lampa.Player.listener):
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

        // При смене профиля — сразу полная синхронизация
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

        // Периодическая фоновая синхронизация каждые 2 минуты
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
