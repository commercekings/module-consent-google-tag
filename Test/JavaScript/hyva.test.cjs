const nodeTest = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const adjacentSourceHarness = path.resolve(__dirname, '../../../module-consent-vanilla/Test/JavaScript/hyva-harness.cjs');
const sourceHarness = fs.existsSync(adjacentSourceHarness) ? adjacentSourceHarness
    : path.join(process.env.MAGENTO_ROOT || process.cwd(), 'vendor/commercekings/module-consent-vanilla/Test/JavaScript/hyva-harness.cjs');
const sourceFixture = fs.existsSync(sourceHarness) ? require(sourceHarness).fixture : null;
const test = (name, fn) => nodeTest(name, {skip: !sourceFixture && 'Vanilla source fixture not installed'}, fn);

const root = path.resolve(__dirname, '../../view/frontend/web/js');
const signals = {analytics_storage: 'google_analytics', ad_storage: 'google_ads', ad_user_data: 'google_ads', ad_personalization: 'google_ads'};
const ga4 = {pageTrackingData: {measurementId: 'G-TEST'}, ordersTrackingData: {
    orders: [{transaction_id: 'test-order', currency: 'EUR', value: 25}], products: [{item_id: 'test-product'}]
}, anonymizeIp: true};
const ads = {conversionId: 'AW-TEST', conversionLabel: 'purchase', anonymizeIp: true};
const ua = {pageTrackingData: {accountId: 'UA-TEST', optPageUrl: '', isAnonymizedIpActive: true}, ordersTrackingData: {
    currency: 'EUR', products: [{id: 'test-product'}], orders: [{id: 'test-order'}]
}};

function fixture(options = {}) {
    const f = sourceFixture({
        source: {purposes: ['google_analytics', 'google_ads'], recorded: options.recorded || [],
            categories: {google_analytics: 'analytics', google_ads: 'marketing'}},
        banner: {categories: [{key: 'necessary', required: true}, {key: 'analytics'}, {key: 'marketing'}]},
        loading: options.loading, cookie: options.cookie
    });
    const b = f.b, inserted = [];
    const configNode = {textContent: options.malformedSettings ? '{' : JSON.stringify({
        signals, cookies: ['^_ga', '^_gid', '^_gat'], marketingCookies: ['^_gcl_', '^_gac_']
    })};
    const nodes = (options.jobs || [['ga4', ga4], ['ads', ads]]).map(([kind, config]) => ({
        textContent: typeof config === 'string' ? config : JSON.stringify(config),
        getAttribute: name => name === 'data-ck-google-tag' ? kind : null
    }));
    const getById = b.document.getElementById;
    b.document.getElementById = id => id === 'commercekings-consent-google-tag-config'
        ? (options.noSettings ? null : configNode) : getById(id);
    b.document.querySelectorAll = selector => selector === 'script[data-ck-google-tag]' ? nodes : [];
    b.document.head.appendChild = script => {
        assert.equal(f.provider()?.hasConsent(script.src.includes('analytics.js') ? 'google_analytics'
            : script.src.includes('AW-') ? 'google_ads' : 'google_analytics'), true);
        inserted.push(script.src);
    };
    // Same inline defaults as Config: they precede the deferred scripts and never define window.gtag.
    vm.runInContext(`window.dataLayer = []; (function () {
        function gtag() { window.dataLayer.push(arguments); }
        gtag('consent', 'default', {analytics_storage: 'denied', ad_storage: 'denied',
            ad_user_data: 'denied', ad_personalization: 'denied', wait_for_update: 500});
        gtag('set', 'ads_data_redaction', true);
    }());`, b.context);
    if (options.noProvider) delete b.context.CommerceKingsConsent.provider;
    const run = () => ['consent-mode-core.js', 'analytics-core.js', 'ads-core.js', 'hyva.js'].forEach(file => {
        vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), b.context, {filename: file});
    });
    run();
    const entries = () => JSON.parse(JSON.stringify(b.context.dataLayer.map(entry => [...entry])));
    return {...f, inserted, nodes, entries, run, state: () => entries().filter(e => e[0] === 'consent').at(-1)[2]};
}

test('Hyvä uses the real source/provider: no Google tag before consent; Analytics and Ads stay independent', () => {
    const f = fixture();
    assert.deepEqual(f.inserted, []);
    assert.equal(f.b.context.gtag, undefined);
    f.choose(['analytics']);
    assert.deepEqual(f.inserted, ['https://www.googletagmanager.com/gtag/js?id=G-TEST']);
    assert.equal(f.state().analytics_storage, 'granted');
    assert.equal(f.state().ad_user_data, 'denied');
    f.choose(['analytics', 'marketing']);
    assert.equal(f.state().ad_storage, 'granted');
    assert.equal(f.state().ad_user_data, 'granted');
    assert.equal(f.state().ad_personalization, 'granted');
    assert.equal(f.inserted.length, 1, 'GA4 and Ads share gtag.js');
    const entries = f.entries();
    assert.equal(entries[0][1], 'default');
    assert.ok(entries.findIndex(e => e[1] === 'update') < entries.findIndex(e => e[0] === 'config'));
    assert.equal(entries.filter(e => e[0] === 'event' && e[1] === 'purchase').length, 1);
    assert.equal(entries.filter(e => e[0] === 'event' && e[1] === 'conversion').length, 1);
    assert.deepEqual(entries.find(e => e[1] === 'purchase')[2].items, ga4.ordersTrackingData.products);
});

test('Hyvä marketing alone cannot load Analytics; enabling Analytics afterwards does not fetch gtag twice', () => {
    const f = fixture();
    f.choose(['marketing']);
    assert.deepEqual(f.inserted, ['https://www.googletagmanager.com/gtag/js?id=AW-TEST']);
    assert.equal(f.state().analytics_storage, 'denied');
    assert.equal(f.b.context['ga-disable-G-TEST'], true);
    assert.equal(f.entries().some(e => e[1] === 'purchase'), false);
    f.choose(['analytics', 'marketing']);
    assert.equal(f.inserted.length, 1);
    assert.equal(f.entries().filter(e => e[1] === 'purchase').length, 1);
});

test('Hyvä waits for the provider-ready event and starts a saved choice once, regardless of repeated events', () => {
    const f = fixture({loading: true, cookie: {revision: 2, categories: ['necessary', 'analytics']}});
    assert.deepEqual(f.inserted, []);
    f.dispatch('DOMContentLoaded');
    assert.equal(f.inserted.length, 1);
    f.dispatch('ck-consent:ready', {provider: f.provider()});
    f.dispatch('DOMContentLoaded');
    assert.equal(f.inserted.length, 1);
    assert.equal(f.entries().filter(e => e[1] === 'purchase').length, 1);
});

test('Hyvä rejects an obsolete saved revision and waits for a new source choice', () => {
    const f = fixture({cookie: {revision: 1, categories: ['necessary', 'analytics', 'marketing']}});
    assert.deepEqual(f.inserted, []);
    f.choose(['analytics']);
    assert.equal(f.inserted.length, 1);
});

test('Hyvä fails closed without a source provider, even if a stored choice allowed Analytics', () => {
    const f = fixture({noProvider: true, cookie: {revision: 2, categories: ['necessary', 'analytics']}});
    assert.deepEqual(f.inserted, []);
    f.dispatch('ck-consent:ready', {});
    f.dispatch('ck-consent:ready', {provider: {}});
    assert.deepEqual(f.inserted, []);
    assert.equal(f.b.context.gtag, undefined);
});

for (const option of ['noSettings', 'malformedSettings']) {
    test(`Hyvä fails closed with ${option}, including after an accept-all choice`, () => {
        const f = fixture({[option]: true});
        assert.doesNotThrow(() => f.choose(['analytics', 'marketing']));
        assert.deepEqual(f.inserted, []);
        assert.equal(f.b.context.gtag, undefined);
    });
}

test('Hyvä ignores malformed/unknown loader data and missing IDs without blocking a valid loader', () => {
    const f = fixture({jobs: [['ga4', '{'], ['ga4', []], ['ads', null], ['ga4', {}], ['ads', {}], ['gtm', ga4], ['ga4', ga4]]});
    f.choose(['analytics', 'marketing']);
    assert.deepEqual(f.inserted, ['https://www.googletagmanager.com/gtag/js?id=G-TEST']);
    assert.equal(f.entries().some(e => e[1] === 'conversion'), false);
});

test('Hyvä grants through its granular purpose even with Magento cookie restriction mode on', () => {
    const f = fixture({jobs: [['ga4', {...ga4, isCookieRestrictionModeEnabled: true, cookieName: 'user_allowed_save_cookie', currentWebsite: 1}]]});
    f.b.context.COOKIE_CONFIG = {cookie_restriction_enabled: true};
    assert.equal(f.b.cookies.has('user_allowed_save_cookie'), false);
    f.choose(['analytics']);
    assert.equal(f.inserted.length, 1);
    assert.equal(f.b.context.cookie_consent_groups.analytics, true);
    assert.equal(f.b.context.cookie_consent_groups.marketing, false);
    assert.equal(f.b.cookies.has('user_allowed_save_cookie'), false, 'no blanket approval is fabricated');
});

test('Hyvä recorded Analytics waits for acknowledgement and stays denied after a failed recording', async () => {
    const f = fixture({recorded: ['google_analytics']});
    f.choose(['analytics']);
    assert.equal(f.requests.length, 1);
    assert.deepEqual(f.inserted, []);
    f.requests[0].fail(new Error('Offline'));
    await f.flush();
    assert.equal(f.provider().hasConsent('google_analytics'), false);
    assert.deepEqual(f.inserted, []);
    f.choose([]);
    f.choose(['analytics']);
    f.requests.at(-1).complete({withdrawn: 1});
    await f.flush();
    assert.ok(f.requests.at(-1).url.endsWith('/grant'), 'the new grant follows the pending withdrawal');
    f.requests.at(-1).complete({granted: true});
    await f.flush();
    assert.equal(f.inserted.length, 1);
});

test('Hyvä cannot release a recorded Analytics grant after withdrawal overtakes the response', async () => {
    const f = fixture({recorded: ['google_analytics']});
    f.choose(['analytics']);
    f.choose([]);
    f.requests[0].complete({granted: true});
    await f.flush();
    assert.deepEqual(f.inserted, []);
    assert.equal(f.b.context['ga-disable-G-TEST'], true);
});

test('Hyvä withdrawal sets disable flags before publishing denial, clears cookies/storage and reloads Ads once', () => {
    const f = fixture({jobs: [['ga4', ga4], ['ads', ads], ['ua', ua]]});
    f.choose(['analytics', 'marketing']);
    const context = f.b.context;
    ['_ga_TEST', '_gid', '_gcl_au', '_gac_TEST', 'PHPSESSID'].forEach(name => f.b.cookies.set(name, 'test'));
    context.localStorage.setItem('_gcl_ls', 'click');
    context.localStorage.setItem('cart', 'keep');
    context.dataLayer.push = function (entry) {
        if (entry[0] === 'consent' && entry[2].analytics_storage === 'denied') {
            assert.equal(context['ga-disable-G-TEST'], true);
            assert.equal(context['ga-disable-UA-TEST'], true);
        }
        return Array.prototype.push.call(this, entry);
    };
    let reloads = 0;
    context.location.reload = () => reloads++;
    f.choose([]);
    assert.equal(f.state().analytics_storage, 'denied');
    assert.equal(f.state().ad_user_data, 'denied');
    assert.equal(f.state().ad_personalization, 'denied');
    assert.equal(context.localStorage.getItem('_gcl_ls'), null);
    assert.equal(context.localStorage.getItem('cart'), 'keep');
    assert.equal(f.b.cookies.has('_ga_TEST'), false);
    assert.equal(f.b.cookies.has('_gcl_au'), false);
    assert.equal(f.b.cookies.has('PHPSESSID'), true);
    assert.equal(f.b.cookies.has('cc_cookie'), true);
    f.choose(['analytics', 'marketing']);
    assert.equal(f.entries().filter(e => e[1] === 'purchase').length, 1);
    assert.equal(f.entries().filter(e => e[1] === 'conversion').length, 1);
    [...f.timers.values()].filter(timer => timer.delay === 0).forEach(timer => timer.callback());
    assert.equal(reloads, 1);
});

test('Hyvä still gates the legacy UA loader and preserves native ecommerce calls once per page', () => {
    const f = fixture({jobs: [['ua', ua]]});
    assert.deepEqual(f.inserted, []);
    f.choose(['analytics']);
    assert.deepEqual(f.inserted, ['https://www.google-analytics.com/analytics.js']);
    const commands = () => JSON.parse(JSON.stringify(f.b.context.ga.q.map(e => [...e])));
    assert.deepEqual(commands()[0], ['create', 'UA-TEST', 'auto']);
    assert.ok(commands().some(e => e[0] === 'ec:setAction' && e[1] === 'purchase'));
    f.choose([]);
    f.choose(['analytics']);
    assert.equal(f.inserted.length, 1);
    assert.equal(commands().filter(e => e[0] === 'send').length, 1);
});
