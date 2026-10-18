# How it works

Purposes, the loader gates and Consent Mode updates. Start with the [README](../README.md).

## Purposes

Both are declared in `etc/di.xml` – one purpose per integration, so each has its own consent, records and recording setting – with `record = optional` (evidence only if ticked in *Consent > Records > Record consent for*), `active_if` on the Magento settings above and a default category: `google_analytics` → **Analytics**, `google_ads` → **Marketing** of the `CommerceKings_ConsentDefaults` categories (other integrations can join the same category with their own purpose). A category appears only while one of its purposes is active. Sites with their own categories list `google_analytics` / `google_ads` in them. Cookie patterns (deleted when the purpose is off): `^_ga`, `^_gid`, `^_gat`; `^_gcl_`, `^_gac_`.

## Behavior

1. **Consent Mode defaults, inline in `<head>`** (CSP nonce): all four signals `denied`, `wait_for_update` 500 ms, `ads_data_redaction`. They precede any Google loader commands. Only rendered while one of the Google settings is on. The script pushes to `dataLayer` directly – it never defines `window.gtag`, because Magento's loaders load `gtag.js` only when it is missing.
2. **Shared gates**: each loader waits for its purpose, then runs once per configuration. Luma uses mixins on `Magento_GoogleGtag/js/google-analytics`, `Magento_GoogleAnalytics/js/google-analytics` and `Magento_GoogleGtag/js/google-adwords`. Hyvä's `hyva_default` layout replaces the native inline loaders with JSON tracking data from the same Magento blocks and Ads view model. Deferred external scripts consume that data through the same gates when Consent's `ck-consent:ready` event fires (or use an already available provider). Missing provider or malformed settings: no Google loader. GA4 and Ads share one `gtag.js` download on Hyvä. Right before releasing a loader, the gate sends the visitor's choice (`gtag('consent', 'update', …)`), so Google gets it before the tag's first command. This is Google's **basic** consent mode: nothing goes to Google before consent.
3. **Changes**: every change of `google_analytics` / `google_ads` sends an `update`. GA's `ga-disable-<id>` flags are applied **before** any changed consent state is pushed, including combined choices triggered by another purpose. Withdrawal also deletes the purpose's first-party cookies (current host and parent domains). Ads cleanup removes Google's `_gcl_ls` local-storage entry when storage access is available; blocked storage access does not interrupt consent updates or cookie cleanup. Google Ads has no switch that stops a loaded tag – "denied" still allows cookieless pings – so withdrawing it after the tag ran **reloads the page**; the next page does not load it. Reacceptance does not replay purchase events. Cleanup also runs on every page while a purpose is off.
4. Luma retains Magento's own cookie-restriction check (`isCookieRestrictionModeEnabled`) inside its native loaders. Hyvä uses the explicit purpose instead of Magento's blanket cookie approval, so accepting Analytics does not enable Marketing. It works with cookie restriction mode on and does not create a blanket approval cookie. Hyvä starts a permitted tag immediately after consent; the native Google lazy-load setting does not defer it further. Magento's order data and checkout success conversion label are preserved.

## Tests

From the Magento root, with the package installed:

```sh
node --test vendor/commercekings/module-consent-google-tag/Test/JavaScript/*.test.cjs
vendor/bin/phpunit --no-configuration --bootstrap vendor/autoload.php vendor/commercekings/module-consent-google-tag/Test/Unit
```

The analytics test also runs Magento's real GA4 loader (from `vendor/magento/module-google-gtag`; set `MAGENTO_ROOT` when not running from the Magento root – skipped if not found) to check its cookie-restriction behavior is kept.

Regressions cover disable flags at the moment a loaded tag receives an update, combined Analytics/Ads choices, reacceptance, local-storage cleanup on startup and withdrawal, and blocked storage access/removal. The combined native-loader test checks GA4/Ads gating and single purchase/conversion execution. Hyvä regressions use the real Consent provider and Vanilla adapter: saved/obsolete choices, independent purposes, missing provider/config, malformed loader data, cookie restriction mode, failed recording, stale grant responses, withdrawal cleanup, and single purchase/conversion execution. PHP tests render the Hyvä templates with native Magento blocks and check safe JSON output, disabled tags and checkout-only conversion labels. These tests simulate the browser and native loaders; live Google request validation with [Tag Assistant](https://developers.google.com/tag-platform/security/guides/consent-debugging) remains a deployment check.
