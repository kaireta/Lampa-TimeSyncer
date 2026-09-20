(function () {
    'use strict';

    var plugin_name = 'rus_movie_clean';
    if (window[plugin_name + '_loaded']) return;
    window[plugin_name + '_loaded'] = true;

    var today = new Date().toISOString().substring(0, 10);

    var CATEGORIES = [
        { title: 'Русские фильмы', img: 'https://bylampa.github.io/img/rus_movie.jpg', request: 'discover/movie?vote_average.gte=5&vote_average.lte=9.5&with_original_language=ru&sort_by=primary_release_date.desc&primary_release_date.lte=' + today },
        { title: 'Русские сериалы', img: 'https://bylampa.github.io/img/rus_tv.jpg', request: 'discover/tv?sort_by=first_air_date.desc&with_original_language=ru&air_date.lte=' + today },
        { title: 'Русские мультфильмы', img: 'https://bylampa.github.io/img/rus_mult.jpg', request: 'discover/movie?vote_average.gte=5&vote_average.lte=9.5&with_genres=16&with_original_language=ru&sort_by=primary_release_date.desc&primary_release_date.lte=' + today },
        { title: 'Ток-шоу и Реалити', img: 'https://cdn.jsdelivr.net/gh/kaireta/Lampa-TimeSyncer@main/talk_shows.jpg', request: 'discover/tv?with_original_language=ru&with_genres=10767,10764&sort_by=popularity.desc' },
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

    function RusMovieComponent(object) {
        var self = this;
        this.activity = object;

        this.create = function () {
            self._dom = $('<div class="rus-movie-wrap mapping--grid"></div>');
            self._dom.css({ padding: '1em', height: '100%', boxSizing: 'border-box', overflowY: 'auto' });
            
            var grid = $('<div class="rus-grid"></div>');
            grid.css({ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1em' });

            CATEGORIES.forEach(function (cat) {
                var card = $('<div class="card selector" style="background:rgba(255,255,255,0.05);border-radius:.5em;overflow:hidden;cursor:pointer;transition:transform 0.15s;text-align:center;">' +
                             '<div class="card__img"><img src="' + cat.img + '" style="width:100%;aspect-ratio:16/9;object-fit:cover;display:block;" loading="lazy"/></div>' +
                             '<div class="card__title" style="padding:0.5em;font-size:0.9em;">' + cat.title + '</div>' +
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
                
                card.on('hover:focus', function() { card.css('transform', 'scale(1.04)'); card.css('outline', '2px solid #fff'); });
                card.on('hover:empty', function() { card.css('transform', 'scale(1)'); card.css('outline', 'none'); });

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
        var li = $('<li class="menu__item selector" data-action="rus_movie"><div class="menu__ico">' + icon + '</div><div class="menu__text">Русское</div></li>');
        li.on('hover:enter click', function () { Lampa.Activity.push({ url: '', title: 'Русское', component: 'rus_movie_clean' }); });
        
        function inject() {
            var nav = document.querySelector('.menu ul, .menu__list, .navigation__items');
            if (nav) $(nav).append(li);
        }
        Lampa.Listener.follow('app:ready', inject);
        setTimeout(inject, 1500);
    }

    addMenuEntry();

})();
