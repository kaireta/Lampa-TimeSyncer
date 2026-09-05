/**
 * ================================================================
 *  Lampa TimeSyncer v4.0 (Native Sync) — синхронизация через GitHub Gist
 * ================================================================
 *
 *  ПРИНЦИП РАБОТЫ:
 *  Скрипт НЕ вмешивается в плеер и НЕ перематывает видео сам!
 *  Он только синхронизирует встроенную базу просмотров Lampa
 *  (хранилище file_view) между всеми вашими устройствами через Gist.
 *
 *  Благодаря этому:
 *  - Lampa сама рисует полоски прогресса на постерах в каталоге
 *  - При запуске фильма Lampa сама показывает свой родной диалог:
 *    "Продолжить с XX:YY?" (если в настройках плеера стоит "Спрашивать")
 *  - Поддерживаются профили Lampa (для каждого профиля своя ветка)
 *  - 100% совместимо с Smart TV и мобильными устройствами (чистый ES5)
 *
 *  БЕСПЛАТНО НАВСЕГДА (лимит GitHub: 5000 запросов/час).
 * ================================================================
 */

(function () {
    'use strict';

    var VERSION     = '4.0.1';
    var PLUGIN_NAME = 'TimeSyncer Native';
    var GIST_FILE   = 'lampa_timesync.json';
    var GIST_API    = 'https://api.github.com/gists';

    var PUSH_INTERVAL = 30 * 1000;      // Проверка на отправку изменений каждые 30 сек
    var PULL_INTERVAL = 5 * 60 * 1000;  // Фоновое обновление из облака каждые 5 минут

    var pushTimer   = null;
    var pullTimer   = null;
    var needPush    = false;
    var isSyncing   = false;
    var gistCache   = {};

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

    /**
     * Получает точное имя ключа в Storage Lampa для текущего профиля.
     * Использует родной метод Lampa.Timeline.filename() если доступен.
     */
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

    function readLocalData() {
        var key = getFileViewKey();
        var data = Lampa.Storage.get(key, {});
        if (typeof data === 'string') {
            try { data = JSON.parse(data); } catch (e) { data = {}; }
        }
        return data || {};
    }

    function writeLocalData(data) {
        var key = getFileViewKey();
        Lampa.Storage.set(key, data);

        // Уведомляем интерфейс Lampa, чтобы обновились полосы прогресса на карточках
        try {
            if (Lampa.Timeline && typeof Lampa.Timeline.read === 'function') {
                Lampa.Timeline.read(true);
            }
        } catch (e) {}
    }

    /**
     * Слияние локальных и облачных отметок времени по принципу "побеждает самый свежий" (updated timestamp)
     */
    function mergeTimelines(base, incoming) {
        var result = {};
        var k;

        base = base || {};
        incoming = incoming || {};

        for (k in base) {
            if (Object.prototype.hasOwnProperty.call(base, k)) {
                result[k] = base[k];
            }
        }

        for (k in incoming) {
            if (Object.prototype.hasOwnProperty.call(incoming, k)) {
                var incItem = incoming[k];
                var baseItem = result[k];

                if (!baseItem) {
                    result[k] = incItem;
                } else {
                    var incTime = (incItem && incItem.updated) ? incItem.updated : 0;
                    var baseTime = (baseItem && baseItem.updated) ? baseItem.updated : 0;

                    if (incTime >= baseTime) {
                        result[k] = incItem;
                    }
                }
            }
        }

        return result;
    }

    // ── HTTP-клиент GitHub API ─────────────────────────────────

    function request(method, url, body, callback) {
        var t = token();
        if (!t) {
            callback('No token');
            return;
        }

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
                    callback('Parse error: ' + e.message);
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
                Lampa.Noty.show(PLUGIN_NAME + ': Gist создан');
                callback(null, newId);
            });
        });
    }

    // ── Основные операции синхронизации ────────────────────────

    /**
     * PULL: забираем данные из Gist в локальный Storage Lampa
     */
    function syncPull(silent) {
        if (!token() || isSyncing) return;
        isSyncing = true;

        ensureGist(function (err, id) {
            if (err) {
                isSyncing = false;
                log('Pull error (ensureGist): ' + err);
                return;
            }

            gistRead(id, function (readErr, cloudStore) {
                isSyncing = false;
                if (readErr) {
                    log('Pull error (read): ' + readErr);
                    return;
                }

                gistCache = cloudStore || {};
                var branchKey = getFileViewKey();
                var cloudTimeline = gistCache[branchKey] || {};
                var localTimeline = readLocalData();

                var merged = mergeTimelines(cloudTimeline, localTimeline);
                writeLocalData(merged);

                log('Синхронизация (Pull) завершена для ' + branchKey + '. Записей: ' + Object.keys(merged).length);
                if (!silent) {
                    Lampa.Noty.show(PLUGIN_NAME + ': таймкоды синхронизированы');
                }
            });
        });
    }

    /**
     * PUSH: отправляем свежие локальные таймкоды в Gist
     */
    function syncPush() {
        if (!token() || isSyncing) return;

        var branchKey = getFileViewKey();
        var localTimeline = readLocalData();
        if (!localTimeline || Object.keys(localTimeline).length === 0) {
            needPush = false;
            return;
        }

        isSyncing = true;
        ensureGist(function (err, id) {
            if (err) {
                isSyncing = false;
                log('Push error (ensureGist): ' + err);
                return;
            }

            gistRead(id, function (readErr, currentCloudStore) {
                currentCloudStore = currentCloudStore || gistCache || {};

                var currentBranchCloud = currentCloudStore[branchKey] || {};
                var merged = mergeTimelines(currentBranchCloud, localTimeline);

                currentCloudStore[branchKey] = merged;

                gistWrite(id, currentCloudStore, function (writeErr) {
                    isSyncing = false;
                    if (writeErr) {
                        log('Push error (write): ' + writeErr);
                        return;
                    }

                    gistCache = currentCloudStore;
                    needPush = false;
                    log('Синхронизация (Push) завершена для ' + branchKey);
                });
            });
        });
    }

    // ── Слушатели событий Lampa ────────────────────────────────

    function bootstrap() {
        // Когда Lampa сохраняет прогресс просмотра локально:
        try {
            if (Lampa.Timeline && Lampa.Timeline.listener) {
                Lampa.Timeline.listener.follow('update', function () {
                    needPush = true;
                });
            }
        } catch (e) {}

        // При закрытии плеера: Lampa только что записала финальное время -> делаем Push
        Lampa.Listener.follow('player', function (e) {
            if (e.type === 'destroy') {
                setTimeout(function () {
                    syncPush();
                }, 600);
            }
        });

        // При смене пользователя/профиля: подтягиваем данные нового профиля
        Lampa.Storage.listener.follow('change', function (e) {
            if (e.name === 'account' || e.name === 'account_use') {
                log('Профиль изменен. Обновляем таймкоды...');
                syncPull(true);
            }
        });

        // Первый pull при старте приложения (тихий)
        setTimeout(function () {
            syncPull(true);
        }, 1500);

        // Периодический Push (только если были просмотры)
        pushTimer = setInterval(function () {
            if (needPush) syncPush();
        }, PUSH_INTERVAL);

        // Периодический Pull (чтобы подхватить если смотрели на другом ТВ)
        pullTimer = setInterval(function () {
            syncPull(true);
        }, PULL_INTERVAL);

        if (typeof Lampa.SettingsApi !== 'undefined') {
            registerSettings();
        }

        log('Плагин активирован. Ветка: ' + getFileViewKey());
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
                description: 'Вставьте токен с галочкой "gist". На всех устройствах один токен!'
            },
            onChange: function () {
                setCfg('gist_id', '');
                gistCache = {};
                syncPull(false);
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
                description: 'Нажмите для принудительного обмена данными с облаком'
            },
            onChange: function () {
                syncPull(false);
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
                description: 'Заполняется сам. Очистите поле, если нужно пересоздать Gist.'
            },
            onChange: function () {
                gistCache = {};
            }
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
