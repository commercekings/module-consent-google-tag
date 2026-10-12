define(['CommerceKings_ConsentGoogleTag/js/ads'], function (ads) {
    'use strict';

    return function (loadAds) {
        return function (config) {
            ads.whenAllowed(loadAds, config);
        };
    };
});
