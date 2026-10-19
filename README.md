# Google tags with consent<a href="https://commercekings.net"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/commercekings/module-consent-google-tag/main/.github/commercekings-dark.svg"><img align="right" width="152" src="https://raw.githubusercontent.com/commercekings/module-consent-google-tag/main/.github/commercekings-light.svg" alt="Built by CommerceKings. Ready to sell more? Talk to us"></picture></a>

Works with Magento 2.4.5+ · Luma and Hyvä · PHP 8.1–8.5

[![License](https://badgen.net/github/license/commercekings/module-consent-google-tag)](LICENSE) [![Release](https://badgen.net/github/release/commercekings/module-consent-google-tag)](https://github.com/commercekings/module-consent-google-tag/releases) [![Checks](https://github.com/commercekings/module-consent-google-tag/actions/workflows/checks.yml/badge.svg?branch=main)](https://github.com/commercekings/module-consent-google-tag/actions/workflows/checks.yml)

**Magento's own Google tags, only after consent – with Google Consent Mode v2.**

- **Nothing reaches Google before consent** – GA4, Google Ads and legacy Universal Analytics.
- **Google Consent Mode v2:** all four signals, updated the moment a choice changes.
- **Clean withdrawal.** Google cookies are removed; Ads stops on the next page.
- **No new settings.** Configure Google where Magento already has it.

## Installation

```sh
composer require commercekings/module-consent-google-tag:^0.1 commercekings/module-consent-vanilla:^0.1
bin/magento setup:upgrade
```

It needs a consent banner – ours or any package that provides `commercekings/consent-source`; Composer refuses to
install it without one.

## What it covers

Configure the tags where Magento has them – **Stores > Configuration > Sales > Google API**:

| Magento setting | Purpose (banner category) | Consent Mode signals |
|---|---|---|
| Google GTag > Google Analytics4 | `google_analytics` (Analytics) | `analytics_storage` |
| Google Analytics (legacy UA) | `google_analytics` (Analytics) | `analytics_storage` |
| Google GTag > Google AdWords | `google_ads` (Marketing) | `ad_storage`, `ad_user_data`, `ad_personalization` |

## Limitations

- **Legacy Google AdWords** (Google API > Google Analytics > Google AdWords) is not gated – keep it off and use
  Google GTag > Google AdWords.
- **Google Tag Manager** and tags pasted into the theme load without consent.

Check the live result with Google's [Tag Assistant](https://developers.google.com/tag-platform/security/guides/consent-debugging).

## Tested (as of 0.1.0)

- **Automated tests:** 10 unit and 34 JavaScript tests (GA4, Google Ads, legacy Universal Analytics, Consent Mode v2, Hyvä) (unit and JavaScript tests run on every push); 94.7% line coverage by the unit tests.
- **Install:** a fresh install of every CommerceKings package from GitHub on an empty Magento database, verified.
- **Not tested:** live in Google Tag Assistant, and end to end in a browser.

## More

[How it works](docs/how-it-works.md) · [Compatibility](COMPATIBILITY.md) · [Changes](CHANGELOG.md)

## Disclaimer

These modules help you ask for, record and respect your shoppers' choices – they don't make your store compliant on
their own. You are responsible for your store's privacy: what you collect, the wording you show, your privacy policy
and whether your setup meets the laws that apply to you (e.g. GDPR, ePrivacy, email marketing rules). Get legal advice
if you are unsure.

---

**Need it installed, set up or customized?** **[Get in touch →](https://commercekings.net)**
