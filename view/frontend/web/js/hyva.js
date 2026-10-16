/** Hyvä loaders use Magento's tracking data and the same purpose gates as Luma. No RequireJS. */
(function () {
    'use strict';

    var google = window.CommerceKingsConsentGoogleTag,
        started = false;

    function readConfig(node) {
        try {
            var value = node && JSON.parse(node.textContent);
            return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
        } catch (error) {
            return null;
        }
    }

    function insertScript(url) {
        var script = document.createElement('script');
        script.async = true;
        script.src = url;
        document.head.appendChild(script);
    }

    function initGtag(id) {
        if (!window.gtag) {
            window.dataLayer = window.dataLayer || [];
            window.gtag = function () { window.dataLayer.push(arguments); };
            window.gtag('js', new Date());
            window.gtag('set', 'developer_id.dYjhlMD', true);
            insertScript('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id));
        }
    }

    function loadGa4(config) {
        var id = config.pageTrackingData.measurementId,
            orders = config.ordersTrackingData || {};
        initGtag(id);
        window.gtag('config', id, {anonymize_ip: config.anonymizeIp});
        if (orders.orders && orders.orders.length) {
            var purchase = Object.assign({}, orders.orders[0], {items: orders.products || []});
            window.gtag('event', 'purchase', purchase);
        }
    }

    function loadAds(config) {
        initGtag(config.conversionId);
        window.gtag('config', config.conversionId, {anonymize_ip: config.anonymizeIp});
        if (config.conversionLabel) {
            window.gtag('event', 'conversion', {send_to: config.conversionId + '/' + config.conversionLabel});
        }
    }

    function loadUa(config) {
        var tracking = config.pageTrackingData,
            orders = config.ordersTrackingData || {};
        window.GoogleAnalyticsObject = 'ga';
        window.ga = window.ga || function () { (window.ga.q = window.ga.q || []).push(arguments); };
        window.ga.l = Date.now();
        insertScript('https://www.google-analytics.com/analytics.js');
        window.ga('create', tracking.accountId, 'auto');
        if (tracking.isAnonymizedIpActive) {
            window.ga('set', 'anonymizeIp', true);
        }
        if (Object.prototype.hasOwnProperty.call(orders, 'currency')) {
            window.ga('require', 'ec', 'ec.js');
            window.ga('set', 'currencyCode', orders.currency);
            (orders.products || []).forEach(function (item) { window.ga('ec:addProduct', item); });
            (orders.orders || []).forEach(function (order) { window.ga('ec:setAction', 'purchase', order); });
            window.ga('send', 'pageview');
        } else {
            window.ga('send', 'pageview' + tracking.optPageUrl);
        }
    }

    function start(provider) {
        if (started || !provider || typeof provider.hasConsent !== 'function' || typeof provider.onChange !== 'function'
            || !google || typeof google.createConsentMode !== 'function' || typeof google.createAnalytics !== 'function'
            || typeof google.createAds !== 'function' || !readConfig(document.getElementById('commercekings-consent-google-tag-config'))
        ) {
            return;
        }
        started = true;
        var mode = google.createConsentMode(provider),
            analytics = google.createAnalytics(provider, mode),
            ads = google.createAds(provider, mode);

        document.querySelectorAll('script[data-ck-google-tag]').forEach(function (node) {
            var config = readConfig(node),
                kind = node.getAttribute('data-ck-google-tag'),
                tracking = config && config.pageTrackingData || {};
            if (!config) {
                return;
            }
            // The purpose replaces Hyvä's blanket cookie approval; it also works with restriction mode on.
            if (kind === 'ga4' && typeof tracking.measurementId === 'string' && tracking.measurementId.trim()) {
                analytics.whenAllowed(loadGa4, config);
            } else if (kind === 'ua' && typeof tracking.accountId === 'string' && tracking.accountId.trim()) {
                analytics.whenAllowed(loadUa, config);
            } else if (kind === 'ads' && typeof config.conversionId === 'string' && config.conversionId.trim()) {
                ads.whenAllowed(loadAds, config);
            }
        });
    }

    // Listen before the source starts, or pick up an already initialized provider on a late load.
    window.addEventListener('ck-consent:ready', function (event) { start(event.detail && event.detail.provider); });
    function ready() { start(window.CommerceKingsConsent && window.CommerceKingsConsent.provider); }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ready, {once: true});
    } else {
        ready();
    }
}());
