<?php
declare(strict_types=1);

namespace CommerceKings\ConsentGoogleTag\ViewModel;

use CommerceKings\Consent\Api\PurposeRegistryInterface;
use Magento\Framework\View\Element\Block\ArgumentInterface;

/**
 * Settings for the JS gates and Google Consent Mode, plus the Consent Mode defaults: inline in <head>,
 * so they are in dataLayer before Magento's Google loaders (RequireJS) push anything.
 */
class Config implements ArgumentInterface
{
    /** How long Google tags wait for the visitor's choice before using the defaults (ms). */
    private const WAIT_FOR_UPDATE = 500;

    /** @param array<string, string> $signals Google consent signal => purpose (di.xml) */
    public function __construct(
        private readonly PurposeRegistryInterface $purposes,
        private readonly array $signals = []
    ) {
    }

    /** A Google tag is on in Magento (one of the purposes is active). */
    public function isConsentModeActive(): bool
    {
        foreach (array_unique($this->signals) as $purpose) {
            if ($this->purposes->isDeclared($purpose)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Every signal denied until the visitor's choice is known; ads data redacted while ad_storage is
     * denied. Pushes to dataLayer directly: defining window.gtag would make Magento's loaders skip
     * loading gtag.js.
     */
    public function getDefaultsScript(): string
    {
        $defaults = array_fill_keys(array_keys($this->signals), 'denied') + ['wait_for_update' => self::WAIT_FOR_UPDATE];
        return '(function () {'
            . 'window.dataLayer = window.dataLayer || [];'
            . 'function gtag() { window.dataLayer.push(arguments); }'
            . "gtag('consent', 'default', " . $this->json($defaults) . ');'
            . "gtag('set', 'ads_data_redaction', true);"
            . '}());';
    }

    public function getConfigJson(): string
    {
        return $this->json([
            'cookies' => $this->purposes->getCookiePatterns('google_analytics'),
            'marketingCookies' => $this->purposes->getCookiePatterns('google_ads'),
            'signals' => $this->signals,
        ]);
    }

    private function json(array $data): string
    {
        return (string)json_encode($data, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_SLASHES);
    }
}
