# Google tags with consent

Consent for **Magento's own Google tags**, with **Google Consent Mode v2**. Nothing reaches Google before the visitor
agrees. It works with any consent source and has no settings of its own.

```sh
composer require commercekings/module-consent-google-tag:^0.1 commercekings/module-consent-vanilla:^0.1
bin/magento setup:upgrade
```

It needs a consent banner: Composer refuses to install it without one (`commercekings/module-consent-vanilla`, or any
package that provides `commercekings/consent-source`).

## What it covers

Configure the tags where Magento has them – **Stores > Configuration > Sales > Google API**:

| Magento setting | Purpose (banner category) | Consent Mode signals |
|---|---|---|
| Google GTag > Google Analytics4 | `google_analytics` (Analytics) | `analytics_storage` |
| Google Analytics (legacy UA) | `google_analytics` (Analytics) | `analytics_storage` |
| Google GTag > Google AdWords | `google_ads` (Marketing) | `ad_storage`, `ad_user_data`, `ad_personalization` |

Each tag loads only after its purpose is allowed; Consent Mode defaults to `denied`. Withdrawing deletes the
purpose's Google cookies; withdrawing Google Ads after its tag ran reloads the page.

## Not covered

- **Legacy Google AdWords** (Google API > Google Analytics > Google AdWords) is not gated – keep it off and use
  Google GTag > Google AdWords.
- **Google Tag Manager** and tags pasted into the theme load without consent.
- **Hyvä themes**: Google tag loaders are not gated yet – keep the Google settings off on Hyvä store views.

Check the live result with Google's [Tag Assistant](https://developers.google.com/tag-platform/security/guides/consent-debugging).

## More

[How it works](docs/how-it-works.md) · [Compatibility](COMPATIBILITY.md) · [Changes](CHANGELOG.md)
