(function () {
    'use strict';

    var plugin_name = 'vk_video_balancer';
    if (window[plugin_name + '_loaded']) return;
    window[plugin_name + '_loaded'] = true;

    function parseVK(query, onsuccess, onerror) {
        var url = 'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://vk.com/al_video.php?act=search_video&al=1&q=' + encodeURIComponent(query));
        Lampa.network.request(url, function(res) {
            try {
                var jsonStr = res;
                var start = jsonStr.indexOf('{"payload"');
                if (start !== -1) {
                    jsonStr = jsonStr.substring(start);
                    var data = JSON.parse(jsonStr);
                    var list = data.payload[1][2].list;
                    var results = [];
                    list.forEach(function(item) {
                        var oid = item[0];
                        var vid = item[1];
                        var thumb = item[2];
                        var title = item[3].replace(/<\/?[^>]+(>|$)/g, ""); // strip html
                        
                        var hash = '';
                        var durationStr = '';
                        
                        item.forEach(function(val) {
                            if (typeof val === 'string' && /^[a-f0-9]{18}$/i.test(val)) {
                                hash = val;
                            }
                        });
                        
                        item.forEach(function(val) {
                            if (typeof val === 'string' && /^\d+:\d+(:\d+)?$/.test(val)) {
                                durationStr = val;
                            }
                        });
                        
                        if (hash) {
                            results.push({
                                title: title,
                                thumb: thumb,
                                time: durationStr,
                                url: 'https://vk.com/video_ext.php?oid=' + oid + '&id=' + vid + '&hash=' + hash
                            });
                        }
                    });
                    onsuccess(results);
                } else {
                    onerror();
                }
            } catch (e) {
                console.log('VK Parse error', e);
                onerror();
            }
        }, function(a, c) {
            onerror();
        }, false, {
            dataType: 'text'
        });
    }

    function extractHLS(iframeUrl, onsuccess, onerror) {
        var url = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(iframeUrl);
        Lampa.network.request(url, function(res) {
            var m = res.match(/"hls":"([^"]+)"/);
            if (m && m[1]) {
                var hls = m[1].replace(/\\\//g, '/');
                onsuccess(hls);
            } else {
                onerror();
            }
        }, function() {
            onerror();
        }, false, { dataType: 'text' });
    }

    function VKVideoComponent(object) {
        var network = new Lampa.Reguest();
        var scroll = new Lampa.Scroll({mask:true, over:true});
        var filter = new Lampa.Filter(object);
        var files = new Lampa.Files(object);
        
        var self = this;
        this.activity = object;
        this.results = [];

        this.create = function () {
            this.build();
            this.search();
        };

        this.build = function () {
            Lampa.Background.change(object.movie.backdrop_path || object.movie.poster_path);
            Lampa.Template.add('vk_video_main', '<div class="vk-video-main"></div>');
            this.html = Lampa.Template.get('vk_video_main');
            
            // Setup filter
            filter.onSearch = function(value) {
                self.search(value);
            };
            filter.onBack = function() {
                self.start();
            };
            filter.render().find('.filter--search').show();
            this.html.append(filter.render());
            
            // Setup files (list) container inside scroll
            this.html.append(scroll.render());
            scroll.append(files.render());
        };

        this.search = function (customQuery) {
            files.clear();
            var q = customQuery || (object.movie.title || object.movie.name) + ' ' + (object.movie.release_date || object.movie.first_air_date || '').substring(0, 4);
            Lampa.Noty.show('Поиск в VK: ' + q);
            
            parseVK(q, function(results) {
                self.results = results;
                if (results.length > 0) {
                    self.append(results);
                } else {
                    files.append('<div class="empty__title">Ничего не найдено</div>');
                }
            }, function() {
                files.append('<div class="empty__title">Ошибка загрузки VK</div>');
            });
        };

        this.append = function(items) {
            items.forEach(function (element) {
                var itemHtml = Lampa.Template.get('file', {
                    title: element.title,
                    info: element.time
                });
                
                itemHtml.find('.file__img').css({
                    'background-image': 'url(' + element.thumb + ')',
                    'background-size': 'cover'
                });

                itemHtml.on('hover:enter click', function () {
                    Lampa.Noty.show('Извлекаем HLS...');
                    extractHLS(element.url, function(hlsUrl) {
                        var video = {
                            title: element.title,
                            url: hlsUrl
                        };
                        Lampa.Player.play(video);
                        Lampa.Player.playlist([video]);
                    }, function() {
                        Lampa.Noty.show('Используем iframe плеер');
                        var video = {
                            title: element.title,
                            url: element.url,
                            method: 'iframe'
                        };
                        Lampa.Player.play(video);
                        Lampa.Player.playlist([video]);
                    });
                });
                
                files.append(itemHtml);
            });
            self.start();
        };

        this.render = function () { return this.html; };
        this.start = function () { 
            Lampa.Controller.add('content', { 
                toggle: function () { 
                    Lampa.Controller.collectionSet(self.html); 
                    Lampa.Controller.collectionFocus(self.results.length ? files.render() : filter.render(), self.html); 
                }, 
                left: function () { if (Navigator.canmove('left')) Navigator.move('left'); else Lampa.Controller.toggle('menu'); }, 
                right: function () { Navigator.move('right'); }, 
                up: function () { if (Navigator.canmove('up')) Navigator.move('up'); else Lampa.Controller.toggle('head'); }, 
                down: function () { if (Navigator.canmove('down')) Navigator.move('down'); }, 
                back: function () { Lampa.Activity.backward(); } 
            }); 
            Lampa.Controller.toggle('content'); 
        };
        this.pause = function () {};
        this.stop = function () {};
        this.empty = function () {};
        this.back = function () { Lampa.Activity.backward(); };
        this.destroy = function () { 
            if (this.html) this.html.remove(); 
            scroll.destroy(); 
            files.destroy();
            filter.destroy();
        };
    }

    Lampa.Component.add('vk_video_balancer', VKVideoComponent);

    Lampa.Listener.follow('full:ready', function(e) {
        if (e.type !== 'movie' && e.type !== 'tv') return;
        var btn = $('<div class="full-start__button selector" data-action="vk_video"><div>VK Видео</div></div>');
        btn.on('hover:enter click', function() {
            Lampa.Activity.push({
                url: '',
                title: 'VK Видео',
                component: 'vk_video_balancer',
                movie: e.object
            });
        });
        
        var parent = e.html.find('.full-start__buttons').eq(0);
        if (parent.length) {
            parent.append(btn);
        } else {
            e.html.find('.view--actions').append(btn);
        }
    });

})();
