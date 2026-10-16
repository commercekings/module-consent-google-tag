/** Magento entry point; Hyvä uses the same consent gates without RequireJS. */
define([
    'CommerceKings_Consent/js/consent/provider',
    'CommerceKings_ConsentGoogleTag/js/analytics-core',
    'CommerceKings_ConsentGoogleTag/js/consent-mode'
], function (consent, createAnalytics, consentMode) {
    'use strict';

    return createAnalytics(consent, consentMode);
});
