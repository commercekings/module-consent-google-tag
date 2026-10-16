/** Magento entry point; Hyvä uses the same consent gates without RequireJS. */
define([
    'CommerceKings_Consent/js/consent/provider',
    'CommerceKings_ConsentGoogleTag/js/consent-mode-core'
], function (consent, createConsentMode) {
    'use strict';

    return createConsentMode(consent);
});
