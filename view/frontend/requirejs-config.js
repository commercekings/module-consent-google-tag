var config = {
    deps: [
        'CommerceKings_ConsentGoogleTag/js/consent-mode',
        'CommerceKings_ConsentGoogleTag/js/analytics',
        'CommerceKings_ConsentGoogleTag/js/ads'
    ],
    config: {
        mixins: {
            'Magento_GoogleGtag/js/google-analytics': {
                'CommerceKings_ConsentGoogleTag/js/ga-mixin': true
            },
            'Magento_GoogleAnalytics/js/google-analytics': {
                'CommerceKings_ConsentGoogleTag/js/ga-mixin': true
            },
            'Magento_GoogleGtag/js/google-adwords': {
                'CommerceKings_ConsentGoogleTag/js/ads-mixin': true
            }
        }
    }
};
