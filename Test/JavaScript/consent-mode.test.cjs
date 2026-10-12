const test = require('node:test');
const assert = require('node:assert/strict');
const {browser, load} = require('../../../module-consent/Test/JavaScript/harness.cjs');

const SIGNALS = {analytics_storage: 'google_analytics', ad_storage: 'google_ads', ad_user_data: 'google_ads', ad_personalization: 'google_ads'};

function purposes(initial = {}) {
    const allowed = {...initial}, listeners = {};
    return {
        hasConsent: purpose => allowed[purpose] === true,
        onChange: (purpose, fn) => (listeners[purpose] ||= []).push(fn),
        change(purpose, value) { allowed[purpose] = value; (listeners[purpose] || []).forEach(fn => fn(value)); }
    };
}

function config(extra = {}) {
    return {'commercekings-consent-google-tag-config': {cookies: ['^_ga'], marketingCookies: ['^_gcl_'], signals: SIGNALS, ...extra}};
}

// JSON round-trip: objects made inside the VM have another realm's prototypes
const updates = b => JSON.parse(JSON.stringify((b.context.dataLayer || []).map(e => [...e])))
    .filter(e => e[0] === 'consent' && e[1] === 'update').map(e => e[2]);

function consentMode(allowed = {}) {
    const b = browser(config());
    const consent = purposes(allowed);
    const mode = load(b, 'module-consent-google-tag/view/frontend/web/js/consent-mode.js', {'CommerceKings_Consent/js/consent/provider': consent});
    return {b, consent, mode};
}

test('nothing is sent while everything is still denied (the inline defaults say so) and window.gtag stays undefined', () => {
    const f = consentMode();
    assert.deepEqual(updates(f.b), []);
    assert.equal(f.b.context.gtag, undefined, 'Magento loads gtag.js only when window.gtag is missing');
});

test('analytics grants analytics_storage only; marketing grants all three ad signals', () => {
    const f = consentMode();
    f.consent.change('google_analytics', true);
    f.consent.change('google_ads', true);
    assert.deepEqual(updates(f.b), [
        {analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied'},
        {analytics_storage: 'granted', ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted'}
    ]);
    f.mode.sync();
    assert.equal(updates(f.b).length, 2, 'an unchanged state is not sent again');
});

test('a choice saved earlier is sent on page load', () => {
    const f = consentMode({google_analytics: true});
    assert.deepEqual(updates(f.b), [{analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied'}]);
});

test('Google Ads waits for google_ads, syncs Consent Mode first, and its cookies go when it is withdrawn', async () => {
    const b = browser(config());
    const consent = purposes();
    const order = [];
    let reloads = 0;
    b.context.location.reload = () => reloads++;
    const ads = load(b, 'module-consent-google-tag/view/frontend/web/js/ads.js', {
        'CommerceKings_Consent/js/consent/provider': consent,
        'CommerceKings_ConsentGoogleTag/js/consent-mode': {sync: () => order.push('sync')}
    });
    const mixin = load(b, 'module-consent-google-tag/view/frontend/web/js/ads-mixin.js', {'CommerceKings_ConsentGoogleTag/js/ads': ads});
    const adsConfig = {conversionId: 'AW-1'};
    mixin(received => { assert.equal(received, adsConfig); order.push('load'); })(adsConfig);
    consent.change('google_analytics', true);
    assert.deepEqual(order, [], 'analytics alone does not release Google Ads');
    consent.change('google_ads', true);
    consent.change('google_ads', true);
    assert.deepEqual(order, ['sync', 'load', 'sync'], 'loaded once, after the choice was synced');
    b.cookies.set('_gcl_au', '1'); b.cookies.set('_ga', '2');
    consent.change('google_ads', false);
    assert.deepEqual([...b.cookies.keys()], ['_ga']);
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(reloads, 1, 'the tag ran on this page: reload so it stops');
});

test('withdrawing Google Ads after its tag ran reloads the page; never loaded, no reload', async () => {
    for (const [loaded, expected] of [[true, 1], [false, 0]]) {
        const b = browser(config());
        let reloads = 0;
        b.context.location.reload = () => reloads++;
        const consent = purposes({google_ads: loaded});
        const ads = load(b, 'module-consent-google-tag/view/frontend/web/js/ads.js', {
            'CommerceKings_Consent/js/consent/provider': consent,
            'CommerceKings_ConsentGoogleTag/js/consent-mode': {sync() {}}
        });
        ads.whenAllowed(() => {}, {conversionId: 'AW-1'});
        consent.change('google_ads', false);
        consent.change('google_ads', false);
        await new Promise(resolve => setTimeout(resolve, 5));
        assert.equal(reloads, expected);
    }
});

