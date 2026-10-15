/** Native Magento GA loaders use the google_analytics purpose, regardless of the selected source. */
define([
    'CommerceKings_Consent/js/consent/provider',
    'CommerceKings_ConsentGoogleTag/js/consent-mode'
], function (consent, consentMode) {
    'use strict';

    var jobs = [],
        ids = [],
        element = document.getElementById('commercekings-consent-google-tag-config'),
        settings = element ? JSON.parse(element.textContent || '{}') : {};

    function rememberId(id) {
        if (id && ids.indexOf(id) === -1) {
            ids.push(id);
        }
    }

    function eraseCookies() {
        var parts = location.hostname.split('.'),
            domains = [''],
            patterns = [];

        (settings.cookies || []).forEach(function (pattern) {
            try {
                patterns.push(new RegExp(pattern));
            } catch (e) {
                // One invalid custom pattern must not interrupt withdrawal or the remaining cleanup.
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
    }

    function applyDisableFlags() {
        // Re-read the source: a grant response may arrive after the visitor already withdrew.
        var allowed = consent.hasConsent('google_analytics');
        (window.dataLayer || []).forEach(function (entry) {
            if (entry && entry[0] === 'config') {
                rememberId(entry[1]);
            }
        });
        ids.forEach(function (id) {
            window['ga-disable-' + id] = !allowed;
        });
        return allowed;
    }

    function applyChoice() {
        var allowed = applyDisableFlags();
        if (!allowed) {
            eraseCookies();
            return;
        }
        // the visitor's choice goes to Google before the loader's first command
        consentMode.sync();
        jobs.forEach(function (job) {
            if (!job.loaded) {
                job.loaded = true;
                // Preserve Magento's own cookie-restriction checks and purchase-event behavior.
                job.load(job.config);
            }
        });
    }

    // Another purpose can publish a combined choice before our own onChange callback runs.
    consentMode.onBeforeUpdate(applyDisableFlags);
    consent.onChange('google_analytics', applyChoice);
    applyChoice();

    return {
        whenAllowed: function (load, config) {
            var tracking = config.pageTrackingData || {};
            rememberId(tracking.measurementId || tracking.accountId);
            if (!jobs.some(function (job) { return job.load === load && job.config === config; })) {
                jobs.push({load: load, config: config, loaded: false});
            }
            applyChoice();
        }
    };
});
