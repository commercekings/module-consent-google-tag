const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {browser, load} = require('./harness.cjs');

const root = process.env.MAGENTO_ROOT || process.cwd();
const gaFile = path.join(root, 'vendor/magento/module-google-gtag/view/frontend/web/js/google-analytics.js');
const adsFile = path.join(root, 'vendor/magento/module-google-gtag/view/frontend/web/js/google-adwords.js');

test('native GA4 and Ads preserve consent ordering, independent choices and single purchase/conversion execution', {
    skip: (!fs.existsSync(gaFile) || !fs.existsSync(adsFile)) && 'Magento not found'
}, async () => {
    const b = browser({'commercekings-consent-google-tag-config': {
        cookies: ['^_ga'], marketingCookies: ['^_gcl_'],
        signals: {analytics_storage: 'google_analytics', ad_storage: 'google_ads', ad_user_data: 'google_ads', ad_personalization: 'google_ads'}
    }});
    const allowed = {}, listeners = {};
    const consent = {
        hasConsent: purpose => allowed[purpose] === true,
        onChange: (purpose, callback) => (listeners[purpose] ||= []).push(callback)
    };
    const change = choices => {
        Object.assign(allowed, choices);
        Object.keys(choices).forEach(purpose => (listeners[purpose] || []).forEach(fn => fn(allowed[purpose])));
    };
    const mode = load(b, 'module-consent-google-tag/view/frontend/web/js/consent-mode.js', {'CommerceKings_Consent/js/consent/provider': consent});
    const dependencies = {'CommerceKings_Consent/js/consent/provider': consent, 'CommerceKings_ConsentGoogleTag/js/consent-mode': mode};
    const analytics = load(b, 'module-consent-google-tag/view/frontend/web/js/analytics.js', dependencies);
    const ads = load(b, 'module-consent-google-tag/view/frontend/web/js/ads.js', dependencies);
    const inserted = [];
    b.document.head.appendChild = b.document.head.insertBefore = script => inserted.push(script.src);
    const native = file => {
        let loader;
        b.context.define = (names, factory) => { loader = factory({mage: {cookies: {get: () => null}}}); };
        vm.runInContext(fs.readFileSync(file, 'utf8'), b.context);
        return loader;
    };
    analytics.whenAllowed(native(gaFile), {
        pageTrackingData: {measurementId: 'G-TEST'},
        ordersTrackingData: {orders: [{transaction_id: 'fixture-order'}], products: []}
    });
    ads.whenAllowed(native(adsFile), {
        conversionId: 'AW-TEST', conversionLabel: 'fixture-label',
        gtagSiteSrc: 'https://www.googletagmanager.com/gtag/js?id=AW-TEST'
    });
    assert.deepEqual(inserted, [], 'neither native loader runs before consent');
    change({google_analytics: true});
    assert.deepEqual(inserted, ['https://www.googletagmanager.com/gtag/js?id=G-TEST']);
    const queue = b.context.dataLayer;
    const entries = () => Array.from(queue, entry => Array.from(entry));
    const state = () => entries().filter(entry => entry[0] === 'consent').at(-1)[2];
    assert.equal(state().analytics_storage, 'granted');
    assert.equal(state().ad_storage, 'denied');
    assert.ok(entries().findIndex(entry => entry[0] === 'consent') < entries().findIndex(entry => entry[0] === 'config'));
    change({google_ads: true});
    assert.equal(inserted.length, 2);
    assert.equal(state().ad_user_data, 'granted');
    assert.equal(state().ad_personalization, 'granted');
    b.context.localStorage.setItem('_gcl_ls', 'ad-click');
    b.cookies.set('_ga', 'analytics-cookie');
    b.cookies.set('_gcl_au', 'ads-cookie');
    b.cookies.set('cc_cookie', 'choice');
    let reloads = 0;
    b.context.location.reload = () => {
        assert.equal(b.context.localStorage.getItem('_gcl_ls'), null);
        assert.equal(b.cookies.has('_gcl_au'), false);
        reloads++;
    };
    queue.push = function (entry) {
        if (entry[0] === 'consent' && entry[2].analytics_storage === 'denied') {
            assert.equal(b.context['ga-disable-G-TEST'], true, 'guard is set before Google can process denial');
        }
        return Array.prototype.push.call(this, entry);
    };
    change({google_ads: false, google_analytics: false});
    assert.equal(state().analytics_storage, 'denied');
    assert.equal(state().ad_storage, 'denied');
    assert.equal(state().ad_user_data, 'denied');
    assert.equal(state().ad_personalization, 'denied');
    assert.deepEqual([...b.cookies.keys()], ['cc_cookie']);
    change({google_analytics: true});
    assert.equal(b.context['ga-disable-G-TEST'], false);
    assert.equal(entries().filter(entry => entry[0] === 'event' && entry[1] === 'purchase').length, 1);
    assert.equal(entries().filter(entry => entry[0] === 'event' && entry[1] === 'conversion').length, 1);
    assert.equal(inserted.length, 2, 'the existing native jobs are not replayed on reacceptance');
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(reloads, 1);
});
