# CommerceKings_ConsentGoogleTag

Install in a Magento project with `composer require commercekings/module-consent-google-tag:^0.1` after the first
release is published. Then enable its modules:

```sh
bin/magento module:enable CommerceKings_Consent CommerceKings_ConsentGoogleTag
bin/magento setup:upgrade
bin/magento cache:clean
```

Use the shop's normal DI compilation and static-content deployment process for production.
For development/tests use source checkouts (`--prefer-source`); release archives omit `Test/`.
See [compatibility and verification](COMPATIBILITY.md) and [changes](CHANGELOG.md).

Consent for **Magento's own Google tags**, with **Google Consent Mode v2**. No settings of its own: everything is configured where Magento has it – **Stores > Configuration > Sales > Google API**. Depends on `CommerceKings_Consent`; works with any consent source.

| Magento setting | Purpose | Loader held until | Consent Mode signals |
|---|---|---|---|
| Google GTag > Google Analytics4 (`google/gtag/analytics4/active`) | `google_analytics` | it is allowed | `analytics_storage` |
| Google Analytics, legacy UA (`google/analytics/active`) | `google_analytics` | it is allowed | `analytics_storage` |
| Google GTag > Google AdWords (`google/gtag/adwords/active`) | `google_ads` | it is allowed | `ad_storage`, `ad_user_data`, `ad_personalization` |

## Purposes

Both are declared in `etc/di.xml` – one purpose per integration, so each has its own consent, records and recording setting – with `record = optional` (evidence only if ticked in *Consent > Record consent for*), `active_if` on the Magento settings above and a default category: `google_analytics` → **Analytics**, `google_ads` → **Marketing** of the `CommerceKings_ConsentDefaults` categories (other integrations can join the same category with their own purpose). A category appears only while one of its purposes is active. Sites with their own categories list `google_analytics` / `google_ads` in them. Cookie patterns (deleted when the purpose is off): `^_ga`, `^_gid`, `^_gat`; `^_gcl_`, `^_gac_`.

## Behaviour

1. **Consent Mode defaults, inline in `<head>`** (CSP nonce): all four signals `denied`, `wait_for_update` 500 ms, `ads_data_redaction`. They are the first `dataLayer` entries, before Magento's loaders (RequireJS) push anything. Only rendered while one of the Google settings is on. The script pushes to `dataLayer` directly – it never defines `window.gtag`, because Magento's loaders load `gtag.js` only when it is missing.
2. **Gates** (mixins on `Magento_GoogleGtag/js/google-analytics`, `Magento_GoogleAnalytics/js/google-analytics`, `Magento_GoogleGtag/js/google-adwords`): each loader waits for its purpose, then runs once per configuration. Right before releasing it, the gate sends the visitor's choice (`gtag('consent', 'update', …)`), so Google gets it before the tag's first command. This is Google's **basic** consent mode: nothing goes to Google before consent.
3. **Changes**: every change of `google_analytics` / `google_ads` sends an `update`. Withdrawal: `update` → denied, GA also gets `ga-disable-<id>`, and the purpose's first-party cookies are deleted (current host and parent domains). Google Ads has no switch that stops a loaded tag – "denied" still allows cookieless pings – so withdrawing it after the tag ran **reloads the page**; the next page does not load it. Reacceptance does not replay purchase events. Cleanup also runs on every page while a purpose is off.
4. Magento's own cookie-restriction check (`isCookieRestrictionModeEnabled`) still applies inside the loaders.

## Not covered

- **Legacy Google AdWords** (Sales > Google API > Google Analytics > Google AdWords, `Magento_GoogleAdwords`): renders its own conversion script on the order success page and is **not** gated – keep it off; use Google GTag > Google AdWords.
- Google Tag Manager containers (Adobe Commerce's `Magento_GoogleTagManager`) and tags pasted into the theme: they load without consent. Use Magento's settings above, or add an integration for them.

## Setup

```sh
bin/magento module:enable CommerceKings_Consent CommerceKings_ConsentGoogleTag
bin/magento setup:upgrade
```

Configure GA4 / Google Ads in Magento as usual, pick a consent source in *CommerceKings > Consent*, flush caches.

## Tests

From the Magento root, with the package installed:

```sh
node --test vendor/commercekings/module-consent-google-tag/Test/JavaScript/*.test.cjs
vendor/bin/phpunit --no-configuration --bootstrap vendor/autoload.php vendor/commercekings/module-consent-google-tag/Test/Unit
```

The analytics test also runs Magento's real GA4 loader (from `vendor/magento/module-google-gtag`; set `MAGENTO_ROOT` when not running from the Magento root – skipped if not found) to check its cookie-restriction behaviour is kept.
