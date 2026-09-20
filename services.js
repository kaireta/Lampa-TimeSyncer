(function () {
    'use strict';

    var plugin_name = 'rus_movie_clean_v3';
    if (window[plugin_name + '_loaded']) return;
    window[plugin_name + '_loaded'] = true;

    var today = new Date().toISOString().substring(0, 10);

    var CATEGORIES = [
        { title: 'Русские фильмы', img: 'https://bylampa.github.io/img/rus_movie.jpg', request: 'discover/movie?vote_average.gte=5&vote_average.lte=9.5&with_original_language=ru&sort_by=primary_release_date.desc&primary_release_date.lte=' + today },
        { title: 'Русские сериалы', img: 'https://bylampa.github.io/img/rus_tv.jpg', request: 'discover/tv?sort_by=first_air_date.desc&with_original_language=ru&air_date.lte=' + today },
        { title: 'Русские мультфильмы', img: 'https://bylampa.github.io/img/rus_mult.jpg', request: 'discover/movie?vote_average.gte=5&vote_average.lte=9.5&with_genres=16&with_original_language=ru&sort_by=primary_release_date.desc&primary_release_date.lte=' + today },
        { title: 'Ток-шоу и Реалити', img: 'https://cdn.jsdelivr.net/gh/kaireta/Lampa-TimeSyncer@main/talk_shows.jpg', request: 'discover/tv?with_original_language=ru&with_genres=10767|10764&sort_by=popularity.desc' },
        { title: 'Netflix', img: 'https://cdn.jsdelivr.net/gh/kaireta/Lampa-TimeSyncer@main/netflix.jpg', request: 'discover/tv?with_networks=213&sort_by=first_air_date.desc&air_date.lte=' + today },
        { title: 'Start', img: 'https://bylampa.github.io/img/start.jpg', request: 'discover/tv?with_networks=3923&sort_by=first_air_date.desc&air_date.lte=' + today },
        { title: 'Premier', img: 'https://bylampa.github.io/img/premier.jpg', request: 'discover/tv?with_networks=2859&sort_by=first_air_date.desc&air_date.lte=' + today },
        { title: 'KION', img: 'https://bylampa.github.io/img/kion.jpg', request: 'discover/tv?with_networks=4085&sort_by=first_air_date.desc&air_date.lte=' + today },
        { title: 'ИВИ', img: 'https://bylampa.github.io/img/ivi.jpg', request: 'discover/tv?with_networks=3871&sort_by=first_air_date.desc&air_date.lte=' + today },
        { title: 'Okko', img: 'https://bylampa.github.io/img/okko.jpg', request: 'discover/tv?with_networks=2493&sort_by=first_air_date.desc&air_date.lte=' + today },
        { title: 'КиноПоиск', img: 'https://bylampa.github.io/img/kinopoisk.jpg', request: 'discover/tv?with_networks=3827&sort_by=first_air_date.desc&air_date.lte=' + today },
        { title: 'Wink', img: 'https://bylampa.github.io/img/wink.jpg', request: 'discover/tv?with_networks=5806&sort_by=first_air_date.desc&air_date.lte=' + today },
        { title: 'СТС', img: 'https://bylampa.github.io/img/sts.jpg', request: 'discover/tv?with_networks=806&sort_by=first_air_date.desc&air_date.lte=' + today },
        { title: 'ТНТ', img: 'https://bylampa.github.io/img/tnt.jpg', request: 'discover/tv?with_networks=1191&sort_by=first_air_date.desc&air_date.lte=' + today }
    ];

    var css = '.rus-wrap { padding: 2em; height: 100%; box-sizing: border-box; overflow-y: auto; } ' +
              '.rus-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); grid-gap: 1.5em; gap: 1.5em; padding-bottom: 3em; } ' +
              '.rus-card { background: rgba(255,255,255,0.06); border-radius: 0.6em; overflow: hidden; cursor: pointer; transition: transform 0.2s, background 0.2s; display: flex; flex-direction: column; text-align: center; height: 100%; } ' +
              '.rus-card img { width: 100%; height: auto; aspect-ratio: 16/9; object-fit: cover; display: block; } ' +
              '.rus-card__title { padding: 0.8em 0.5em; font-size: 1.1em; color: #fff; flex-grow: 1; display: flex; align-items: center; justify-content: center; } ' +
              '.rus-card.focus { transform: scale(1.05); outline: 3px solid #fff; background: rgba(255,255,255,0.15); }';
    
    var style = document.createElement('style');
    style.innerHTML = css;
    document.head.appendChild(style);

    function RusMovieComponent(object) {
        var self = this;
        this.activity = object;

        this.create = function () {
            self._dom = $('<div class="rus-wrap"></div>');
            var grid = $('<div class="rus-grid"></div>');

            CATEGORIES.forEach(function (cat) {
                var card = $('<div class="rus-card selector">' +
                             '<img src="' + cat.img + '" loading="lazy"/>' +
                             '<div class="rus-card__title">' + cat.title + '</div>' +
                             '</div>');
                
                card.on('hover:enter click', function () {
                    Lampa.Activity.push({
                        url: cat.request,
                        title: cat.title,
                        component: 'category_full',
                        source: 'tmdb',
                        page: 1
                    });
                });
                
                grid.append(card);
            });

            self._dom.append(grid);
        };

        this.render = function () { return self._dom; };
        this.start = function () {};
        this.pause = function () {};
        this.stop = function () {};
        this.empty = function () {};
        this.back = function () {};
        this.destroy = function () { if (self._dom) self._dom.remove(); };
    }

    Lampa.Component.add('rus_movie_clean', RusMovieComponent);

    function addMenuEntry() {
        var icon = '<svg xmlns="http://www.w3.org/2000/svg" width="1.2em" height="1.2em" viewBox="0 0 48 48"><g fill="none" stroke="currentColor" stroke-width="4"><path stroke-linejoin="round" d="M24 44c11.046 0 20-8.954 20-20S35.046 4 24 4S4 12.954 4 24s8.954 20 20 20Z"/><path stroke-linejoin="round" d="M24 18a3 3 0 1 0 0-6a3 3 0 0 0 0 6Zm0 18a3 3 0 1 0 0-6a3 3 0 0 0 0 6Zm-9-9a3 3 0 1 0 0-6a3 3 0 0 0 0 6Zm18 0a3 3 0 1 0 0-6a3 3 0 0 0 0 6Z"/><path stroke-linecap="round" d="M24 44h20"/></g></svg>';
        var li = $('<li class="menu__item selector" data-action="rus_movie"><div class="menu__ico">' + icon + '</div><div class="menu__text">Сервисы (v3)</div></li>');
        li.on('hover:enter click', function () { Lampa.Activity.push({ url: '', title: 'Сервисы', component: 'rus_movie_clean' }); });
        
        function inject() {
            var nav = document.querySelector('.menu ul, .menu__list, .navigation__items');
            if (nav) $(nav).append(li);
        }
        Lampa.Listener.follow('app:ready', inject);
        setTimeout(inject, 1500);
    }

    addMenuEntry();

})();
