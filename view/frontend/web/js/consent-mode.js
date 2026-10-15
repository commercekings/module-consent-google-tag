/**
 * Google Consent Mode v2 from the consent purposes. The defaults (all denied) are set inline in <head>;
 * this sends 'update' when a purpose changes. The gates (analytics.js, ads.js) call sync() right before
 * they release a Google loader, so the visitor's choice is in dataLayer before the tag's first command.
 * Never defines window.gtag - Magento's loaders only load gtag.js when it is missing.
 */
define(['CommerceKings_Consent/js/consent/provider'], function (consent) {
    'use strict';

    var element = document.getElementById('commercekings-consent-google-tag-config'),
        settings = element ? JSON.parse(element.textContent || '{}') : {},
        signals = settings.signals || {},
        beforeUpdate = [],
        last;

    function gtag() {
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push(arguments);
    }

    function state() {
        var current = {};
        Object.keys(signals).forEach(function (signal) {
            current[signal] = consent.hasConsent(signals[signal]) ? 'granted' : 'denied';
        });
        return current;
    }

    function sync() {
        var current = state(),
            key = JSON.stringify(current);
        if (key !== last) {
            // Apply local tracking guards before a loaded tag can process the update.
            beforeUpdate.forEach(function (callback) { callback(); });
            last = key;
            gtag('consent', 'update', current);
        }
    }

    // the inline defaults: nothing to send while everything is still denied
    last = JSON.stringify(Object.keys(signals).reduce(function (all, signal) {
        all[signal] = 'denied';
        return all;
    }, {}));
    Object.keys(signals).map(function (signal) { return signals[signal]; })
        .filter(function (purpose, index, all) { return all.indexOf(purpose) === index; })
        .forEach(function (purpose) { consent.onChange(purpose, sync); });
    sync();

    return {
        sync: sync,
        onBeforeUpdate: function (callback) { beforeUpdate.push(callback); }
    };
});
