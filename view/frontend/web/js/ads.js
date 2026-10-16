/** Magento entry point; Hyvä uses the same consent gates without RequireJS. */
define([
    'CommerceKings_Consent/js/consent/provider',
    'CommerceKings_ConsentGoogleTag/js/ads-core',
    'CommerceKings_ConsentGoogleTag/js/consent-mode'
], function (consent, createAds, consentMode) {
    'use strict';

    return createAds(consent, consentMode);
});
