/**
 * Magento's Google Ads (gtag) conversion loader under the "google_ads" purpose: held until it is
 * allowed, called once per configuration. While it is not allowed, Google Ads' first-party cookies
 * are deleted. Withdrawn after the tag ran on this page: the page reloads - Google Ads has no switch
 * that stops a loaded tag (Consent Mode "denied" still allows cookieless pings), the next page does not
 * load it. A withdrawal not yet acknowledged by the server is still sent from the next page.
 */
define([
    'CommerceKings_Consent/js/consent/provider',
    'CommerceKings_ConsentGoogleTag/js/consent-mode'
], function (consent, consentMode) {
    'use strict';

    var jobs = [],
        running = false,
        element = document.getElementById('commercekings-consent-google-tag-config'),
        settings = element ? JSON.parse(element.textContent || '{}') : {};

    function eraseCookies() {
        var parts = location.hostname.split('.'),
            domains = [''],
            patterns = (settings.marketingCookies || []).map(function (pattern) { return new RegExp(pattern); });

        for (var i = 0; i < parts.length - 1; i++) {
            domains.push(parts.slice(i).join('.'), '.' + parts.slice(i).join('.'));
        }
        document.cookie.split(';').forEach(function (cookie) {
            var name = cookie.split('=')[0].trim();
            if (name && patterns.some(function (pattern) { return pattern.test(name); })) {
                domains.forEach(function (domain) {
                    document.cookie = name + '=; Max-Age=0; path=/' + (domain ? '; domain=' + domain : '');
                });
            }
        });
    }

    function applyChoice() {
        if (!consent.hasConsent('google_ads')) {
            eraseCookies();
            if (running) {
                running = false;
                // after the source has saved the choice that triggered this
                window.setTimeout(function () { window.location.reload(); }, 0);
            }
            return;
        }
        consentMode.sync();
        jobs.forEach(function (job) {
            if (!job.loaded) {
                job.loaded = true;
                running = true;
                job.load(job.config);
            }
        });
    }

    consent.onChange('google_ads', applyChoice);
    applyChoice();

    return {
        whenAllowed: function (load, config) {
            if (!jobs.some(function (job) { return job.load === load && job.config === config; })) {
                jobs.push({load: load, config: config, loaded: false});
            }
            applyChoice();
        }
    };
});
