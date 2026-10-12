define(['CommerceKings_ConsentGoogleTag/js/analytics'], function (analytics) {
    'use strict';

    return function (loadAnalytics) {
        return function (config) {
            analytics.whenAllowed(loadAnalytics, config);
        };
    };
});
