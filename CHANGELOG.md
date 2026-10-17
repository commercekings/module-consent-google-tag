# Changelog

## Unreleased

- Requires Magento 2.4.5 or later (`magento/framework ^103.0.5`): Magento's GA4/gtag module
  (`Magento_GoogleGtag`) was added in 2.4.5.
- Gate native Hyvä GA4, legacy Analytics and Google Ads through the shared consent logic, without RequireJS or a separate package. Preserve Magento tracking data, independent purposes and single purchase/conversion execution; cover the templates and real provider/Vanilla lifecycle.
- Requires a consent banner (`commercekings/consent-source`, provided by `module-consent-vanilla`): without one
  Google tags could never load.
- Ignore malformed custom cookie patterns individually so valid cleanup, Analytics disable flags and Ads withdrawal reload still run; cover denied startup and withdrawal with regression tests.
- Apply Analytics disable flags before Consent Mode updates and clear Ads `_gcl_ls` local storage on withdrawal, with ordering and storage regression tests.
- Consent gates for Magento's native Google Analytics and Google Ads tags, including Consent Mode v2.
- Prepare Composer metadata, Magento dependency bounds and source/distribution packaging for the first public release.
- Adapt unit tests to PHPUnit 12 while retaining older data-provider annotations.
- Document the verified runtime separately from the declared PHP dependency range.
- Add PHP syntax/metadata/archive CI checks and explicit compatibility notes.

No public release has been tagged or published yet.
