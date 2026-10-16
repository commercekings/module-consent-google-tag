const test = require('node:test');
const assert = require('node:assert/strict');
const {browser, load} = require('./harness.cjs');

const SIGNALS = {analytics_storage: 'google_analytics', ad_storage: 'google_ads', ad_user_data: 'google_ads', ad_personalization: 'google_ads'};

function purposes(initial = {}) {
    const allowed = {...initial}, listeners = {};
    return {
        hasConsent: purpose => allowed[purpose] === true,
        onChange: (purpose, fn) => (listeners[purpose] ||= []).push(fn),
        change(purpose, value) { allowed[purpose] = value; (listeners[purpose] || []).forEach(fn => fn(value)); },
        changeMany(choices, order = Object.keys(choices)) {
            Object.assign(allowed, choices);
            order.forEach(purpose => (listeners[purpose] || []).forEach(fn => fn(allowed[purpose])));
        }
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

function analyticsWithMode(initial = {}) {
    const f = consentMode(initial);
    f.analytics = load(f.b, 'module-consent-google-tag/view/frontend/web/js/analytics.js', {
        'CommerceKings_Consent/js/consent/provider': f.consent,
        'CommerceKings_ConsentGoogleTag/js/consent-mode': f.mode
    });
    return f;
}

test('all known Analytics IDs are disabled before the denied update reaches a loaded tag', () => {
    const {b, consent, analytics} = analyticsWithMode({google_analytics: true});
    let loads = 0;
    analytics.whenAllowed(() => loads++, {pageTrackingData: {measurementId: 'G-TEST'}});
    analytics.whenAllowed(() => loads++, {pageTrackingData: {accountId: 'UA-TEST'}});
    b.context.dataLayer.push(['config', 'G-CONNECTED']);
    const ids = ['G-TEST', 'UA-TEST', 'G-CONNECTED'];
    const observed = [];
    const queue = b.context.dataLayer;
    queue.push = function (entry) {
        if (entry[0] === 'consent' && entry[1] === 'update') {
            observed.push({state: entry[2].analytics_storage, disabled: ids.map(id => b.context['ga-disable-' + id])});
        }
        return Array.prototype.push.call(this, entry);
    };
    consent.change('google_analytics', false);
    consent.change('google_analytics', true);
    assert.deepEqual(observed, [
        {state: 'denied', disabled: [true, true, true]},
        {state: 'granted', disabled: [false, false, false]}
    ]);
    assert.equal(loads, 2, 'reacceptance must not replay either loader or its purchase events');
});

test('an Ads callback cannot publish Analytics denial before its disable flags are applied', () => {
    const {b, consent, analytics} = analyticsWithMode({google_analytics: true});
    analytics.whenAllowed(() => {}, {pageTrackingData: {measurementId: 'G-TEST'}});
    const observed = [];
    const queue = b.context.dataLayer;
    queue.push = function (entry) {
        if (entry[0] === 'consent' && entry[1] === 'update') {
            observed.push({state: entry[2].analytics_storage, disabled: b.context['ga-disable-G-TEST']});
        }
        return Array.prototype.push.call(this, entry);
    };
    consent.changeMany({google_analytics: false, google_ads: true}, ['google_ads', 'google_analytics']);
    assert.deepEqual(observed, [{state: 'denied', disabled: true}]);
    assert.equal(updates(b).at(-1).ad_storage, 'granted', 'Ads stays independently allowed');
});

test('new Analytics IDs are disabled even when consent state did not change', () => {
    const {b, consent, analytics} = analyticsWithMode();
    let loads = 0;
    analytics.whenAllowed(() => loads++, {pageTrackingData: {measurementId: 'G-LATE'}});
    assert.equal(b.context['ga-disable-G-LATE'], true);
    assert.deepEqual(updates(b), [], 'no redundant denied update is needed');
    consent.change('google_analytics', true);
    assert.equal(b.context['ga-disable-G-LATE'], false);
    assert.equal(loads, 1);
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

test('Ads denied on startup removes only its local-storage entry without loading or reloading', () => {
    const b = browser(config());
    b.context.localStorage.setItem('_gcl_ls', 'old-ad-click');
    b.context.localStorage.setItem('shop-preference', 'keep');
    b.context.sessionStorage.setItem('_gcl_ls', 'unrelated-session-storage');
    let reloads = 0, loads = 0;
    b.context.location.reload = () => reloads++;
    const ads = load(b, 'module-consent-google-tag/view/frontend/web/js/ads.js', {
        'CommerceKings_Consent/js/consent/provider': purposes(),
        'CommerceKings_ConsentGoogleTag/js/consent-mode': {sync() {}}
    });
    ads.whenAllowed(() => loads++, {});
    assert.equal(b.context.localStorage.getItem('_gcl_ls'), null);
    assert.equal(b.context.localStorage.getItem('shop-preference'), 'keep');
    assert.equal(b.context.sessionStorage.getItem('_gcl_ls'), 'unrelated-session-storage');
    assert.equal(loads, 0);
    assert.equal(reloads, 0);
});

test('Ads withdrawal deletes local storage and cookies before reloading, preserving unrelated storage', async () => {
    const b = browser(config());
    const consent = purposes({google_ads: true});
    b.context.localStorage.setItem('_gcl_ls', 'ad-click');
    b.context.localStorage.setItem('shop-preference', 'keep');
    const reloads = [];
    b.context.location.reload = () => reloads.push({
        click: b.context.localStorage.getItem('_gcl_ls'), cookie: b.cookies.has('_gcl_au')
    });
    const ads = load(b, 'module-consent-google-tag/view/frontend/web/js/ads.js', {
        'CommerceKings_Consent/js/consent/provider': consent,
        'CommerceKings_ConsentGoogleTag/js/consent-mode': {sync() {}}
    });
    let loads = 0;
    ads.whenAllowed(() => loads++, {});
    assert.equal(b.context.localStorage.getItem('_gcl_ls'), 'ad-click', 'allowed Ads storage is retained');
    b.cookies.set('_gcl_au', 'ad-cookie');
    consent.change('google_ads', false);
    consent.change('google_ads', false);
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.deepEqual(reloads, [{click: null, cookie: false}]);
    assert.equal(b.context.localStorage.getItem('shop-preference'), 'keep');
    assert.equal(loads, 1);
});

for (const blocked of ['access', 'removal']) {
    test(`blocked local-storage ${blocked} does not interrupt Ads denial, cookie cleanup or reload`, async () => {
        const f = consentMode({google_ads: true});
        let reloads = 0;
        f.b.context.location.reload = () => reloads++;
        if (blocked === 'access') {
            Object.defineProperty(f.b.context, 'localStorage', {get() { throw new Error('SecurityError'); }});
        } else {
            f.b.context.localStorage.removeItem = () => { throw new Error('SecurityError'); };
        }
        const ads = load(f.b, 'module-consent-google-tag/view/frontend/web/js/ads.js', {
            'CommerceKings_Consent/js/consent/provider': f.consent,
            'CommerceKings_ConsentGoogleTag/js/consent-mode': f.mode
        });
        ads.whenAllowed(() => {}, {});
        f.b.cookies.set('_gcl_au', 'ad-cookie');
        assert.doesNotThrow(() => f.consent.change('google_ads', false));
        assert.equal(updates(f.b).at(-1).ad_storage, 'denied');
        assert.equal(f.b.cookies.has('_gcl_au'), false);
        await new Promise(resolve => setTimeout(resolve, 5));
        assert.equal(reloads, 1);
    });
}

test('malformed Ads cookie patterns cannot interrupt denial, valid storage cleanup or reload', async () => {
    const b = browser(config({marketingCookies: ['[', '^_gcl_', '(']}));
    const consent = purposes({google_ads: true});
    const mode = load(b, 'module-consent-google-tag/view/frontend/web/js/consent-mode.js', {
        'CommerceKings_Consent/js/consent/provider': consent
    });
    let reloads = 0, loads = 0;
    b.context.location.reload = () => reloads++;
    const ads = load(b, 'module-consent-google-tag/view/frontend/web/js/ads.js', {
        'CommerceKings_Consent/js/consent/provider': consent,
        'CommerceKings_ConsentGoogleTag/js/consent-mode': mode
    });
    ads.whenAllowed(() => loads++, {});
    b.cookies.set('_gcl_au', 'tracking');
    b.cookies.set('_ga', 'unrelated');
    b.context.localStorage.setItem('_gcl_ls', 'ad-click');
    b.context.localStorage.setItem('shop-preference', 'keep');
    assert.doesNotThrow(() => consent.change('google_ads', false));
    assert.equal(updates(b).at(-1).ad_storage, 'denied');
    assert.deepEqual([...b.cookies.keys()], ['_ga']);
    assert.equal(b.context.localStorage.getItem('_gcl_ls'), null);
    assert.equal(b.context.localStorage.getItem('shop-preference'), 'keep');
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(reloads, 1);
    assert.equal(loads, 1);
});

test('malformed Ads patterns on denied startup still clear valid storage without loading a tag', () => {
    const b = browser(config({marketingCookies: ['[', '^_gcl_']}));
    b.cookies.set('_gcl_au', 'tracking');
    b.cookies.set('PHPSESSID', 'keep');
    b.context.localStorage.setItem('_gcl_ls', 'ad-click');
    let loads = 0, reloads = 0;
    b.context.location.reload = () => reloads++;
    const ads = load(b, 'module-consent-google-tag/view/frontend/web/js/ads.js', {
        'CommerceKings_Consent/js/consent/provider': purposes(),
        'CommerceKings_ConsentGoogleTag/js/consent-mode': {sync() {}}
    });
    ads.whenAllowed(() => loads++, {});
    assert.deepEqual([...b.cookies.keys()], ['PHPSESSID']);
    assert.equal(b.context.localStorage.getItem('_gcl_ls'), null);
    assert.equal(loads, 0);
    assert.equal(reloads, 0);
});

