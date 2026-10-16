/**
 * Magento's Google Ads (gtag) conversion loader under the "google_ads" purpose: held until it is
 * allowed, called once per configuration. While it is not allowed, Google Ads' first-party cookies
 * and _gcl_ls local-storage entry are deleted. Withdrawn after the tag ran: the page reloads - Ads has no switch
 * that stops a loaded tag (Consent Mode "denied" still allows cookieless pings), the next page does not
 * load it. A withdrawal not yet acknowledged by the server is still sent from the next page.
 */
(function (root, factory) {
    'use strict';

    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else {
        root.CommerceKingsConsentGoogleTag = root.CommerceKingsConsentGoogleTag || {};
        root.CommerceKingsConsentGoogleTag.createAds = factory();
    }
}(window, function () {
    'use strict';

    return function (consent, consentMode) {
        var jobs = [],
            running = false,
            element = document.getElementById('commercekings-consent-google-tag-config'),
            settings = element ? JSON.parse(element.textContent || '{}') : {};

        function eraseStorage() {
            var parts = location.hostname.split('.'),
                domains = [''],
                patterns = [];

            (settings.marketingCookies || []).forEach(function (pattern) {
                try {
                    patterns.push(new RegExp(pattern));
                } catch (e) {
                    // One invalid custom pattern must not prevent storage cleanup or stopping the loaded tag.
                }
            });

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
            try {
                window.localStorage.removeItem('_gcl_ls');
            } catch (e) {
                // Browser privacy settings may block storage access; cookie cleanup and tag stopping still apply.
            }
        }

        function applyChoice() {
            if (!consent.hasConsent('google_ads')) {
                eraseStorage();
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
    };
}));
