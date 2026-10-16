const test = require('node:test');
const assert = require('node:assert/strict');
const {browser, load, provider} = require('./harness.cjs');

function fixture(allowed = false, cookies = ['^_ga', '^_gid', '^_gat']) {
    const b = browser({'commercekings-consent-google-tag-config': {cookies}});
    const consent = provider(allowed);
    const analytics = load(b, 'module-consent-google-tag/view/frontend/web/js/analytics.js', {
        'CommerceKings_Consent/js/consent/provider': consent,
        'CommerceKings_ConsentGoogleTag/js/consent-mode': {sync() {}, onBeforeUpdate() {}}
    });
    const mixin = load(b, 'module-consent-google-tag/view/frontend/web/js/ga-mixin.js', {
        'CommerceKings_ConsentGoogleTag/js/analytics': analytics
    });
    return {b, consent, mixin};
}

test('blocks native GA without permission, starts once on grant, and does not replay purchases on reaccept', () => {
    const {b, consent, mixin} = fixture();
    let calls = 0;
    const config = {pageTrackingData: {measurementId: 'G-TEST'}};
    const wrapped = mixin(received => { assert.equal(received, config); calls++; });
    wrapped(config);
    wrapped(config);
    assert.equal(calls, 0);
    assert.equal(b.context['ga-disable-G-TEST'], true);
    consent.change(true, 'google_analytics');
    assert.equal(calls, 1);
    assert.equal(b.context['ga-disable-G-TEST'], false);
    consent.change(false, 'google_analytics');
    consent.notify(true, 'google_analytics'); // An earlier grant request finishes after withdrawal.
    assert.equal(b.context['ga-disable-G-TEST'], true);
    assert.equal(calls, 1);
    consent.change(true, 'google_analytics');
    assert.equal(b.context['ga-disable-G-TEST'], false);
    assert.equal(calls, 1);
});

test('withdrawal disables all known GA4/UA ids and cleans tracking cookies without deleting source/cart cookies', () => {
    const {b, consent, mixin} = fixture(true);
    mixin(() => {})({pageTrackingData: {measurementId: 'G-TEST'}});
    mixin(() => {})({pageTrackingData: {accountId: 'UA-TEST'}});
    b.context.dataLayer = [['config', 'G-OTHER']];
    ['_ga', '_ga_TEST', '_gid', '_gat_gtag_TEST', 'cc_cookie', 'ck_consent_seen', 'PHPSESSID'].forEach(name => b.cookies.set(name, 'value'));
    consent.change(false, 'google_analytics');
    ['G-TEST', 'UA-TEST', 'G-OTHER'].forEach(id => assert.equal(b.context['ga-disable-' + id], true));
    assert.deepEqual([...b.cookies.keys()], ['cc_cookie', 'ck_consent_seen', 'PHPSESSID']);
    assert.ok(b.writes.some(value => value.includes('domain=.example.test')));
    assert.ok(b.writes.some(value => value.includes('domain=shop.example.test')));
});

test('cleans leftovers on a page without a native loader and without a banner', () => {
    const b = browser({'commercekings-consent-google-tag-config': {cookies: ['^_ga']}});
    b.cookies.set('_ga', 'old');
    load(b, 'module-consent-google-tag/view/frontend/web/js/analytics.js', {'CommerceKings_Consent/js/consent/provider': provider(), 'CommerceKings_ConsentGoogleTag/js/consent-mode': {sync() {}, onBeforeUpdate() {}}});
    assert.equal(b.cookies.has('_ga'), false);
});

test('malformed cookie patterns cannot interrupt Analytics withdrawal or valid cookie cleanup', () => {
    const {b, consent, mixin} = fixture(true, ['[', '^_ga', '(']);
    let loads = 0;
    mixin(() => loads++)({pageTrackingData: {measurementId: 'G-TEST'}});
    b.cookies.set('_ga_TEST', 'tracking');
    b.cookies.set('PHPSESSID', 'keep');
    assert.doesNotThrow(() => consent.change(false, 'google_analytics'));
    assert.equal(b.context['ga-disable-G-TEST'], true);
    assert.deepEqual([...b.cookies.keys()], ['PHPSESSID']);
    assert.equal(loads, 1);
});

test('malformed patterns on denied startup do not load Analytics or preserve valid matching cookies', () => {
    const b = browser({'commercekings-consent-google-tag-config': {cookies: ['[', '^_ga']}});
    b.cookies.set('_ga', 'old');
    b.cookies.set('cc_cookie', 'choice');
    assert.doesNotThrow(() => load(b, 'module-consent-google-tag/view/frontend/web/js/analytics.js', {
        'CommerceKings_Consent/js/consent/provider': provider(),
        'CommerceKings_ConsentGoogleTag/js/consent-mode': {sync() {}, onBeforeUpdate() {}}
    }));
    assert.deepEqual([...b.cookies.keys()], ['cc_cookie']);
});

// Magento's own loader: from the Magento root (or MAGENTO_ROOT); skipped where Magento is not installed
const NATIVE_GA4 = require('node:path').join(process.env.MAGENTO_ROOT || process.cwd(), 'vendor/magento/module-google-gtag/view/frontend/web/js/google-analytics.js');

test('calls the actual Magento GA4 loader and preserves its cookie-restriction check', {skip: !require('node:fs').existsSync(NATIVE_GA4) && 'Magento not found'}, () => {
    const {b, consent, mixin} = fixture();
    const fs = require('node:fs');
    const vm = require('node:vm');
    const path = require('node:path');
    let native;
    b.context.define = (names, factory) => { native = factory({mage: {cookies: {get: () => null}}}); };
    vm.runInContext(fs.readFileSync(NATIVE_GA4, 'utf8'), b.context);
    const inserted = [];
    b.document.head.insertBefore = script => inserted.push(script.src);
    const wrapped = mixin(native);
    wrapped({isCookieRestrictionModeEnabled: true, pageTrackingData: {measurementId: 'G-RESTRICTED'}, ordersTrackingData: {}});
    consent.change(true, 'google_analytics');
    assert.equal(inserted.length, 0);
    wrapped({isCookieRestrictionModeEnabled: false, pageTrackingData: {measurementId: 'G-ALLOWED'}, ordersTrackingData: {}});
    assert.deepEqual(inserted, ['https://www.googletagmanager.com/gtag/js?id=G-ALLOWED']);
});
