const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const consentHarness = path.resolve(__dirname, '../../../module-consent/Test/JavaScript/harness.cjs');
const magento = process.env.MAGENTO_ROOT || process.cwd();
const base = require(fs.existsSync(consentHarness) ? consentHarness
    : path.join(magento, 'vendor/commercekings/module-consent/Test/JavaScript/harness.cjs'));
const root = path.resolve(__dirname, '../..');
const cores = {
    'CommerceKings_ConsentGoogleTag/js/analytics-core': 'analytics-core.js',
    'CommerceKings_ConsentGoogleTag/js/ads-core': 'ads-core.js',
    'CommerceKings_ConsentGoogleTag/js/consent-mode-core': 'consent-mode-core.js'
};

function load(browser, module, dependencies = {}) {
    let exported;
    browser.context.define = (names, factory) => {
        exported = factory(...names.map(name => {
            if (name in dependencies) return dependencies[name];
            if (name in cores) return load(browser, 'module-consent-google-tag/view/frontend/web/js/' + cores[name]);
            throw new Error(`Missing dependency ${name}`);
        }));
    };
    browser.context.define.amd = {};
    const file = path.join(root, module.replace(/^module-consent-google-tag\//, ''));
    vm.runInContext(fs.readFileSync(file, 'utf8'), browser.context, {filename: module});
    return exported;
}

module.exports = {...base, load};
