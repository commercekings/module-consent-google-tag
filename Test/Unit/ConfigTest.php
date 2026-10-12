<?php
declare(strict_types=1);

namespace CommerceKings\ConsentGoogleTag\Test\Unit;

use CommerceKings\Consent\Model\PurposePool;
use CommerceKings\ConsentGoogleTag\ViewModel\Config;
use Magento\Framework\App\Config\ScopeConfigInterface;
use PHPUnit\Framework\TestCase;

class ConfigTest extends TestCase
{
    private const SIGNALS = [
        'analytics_storage' => 'google_analytics',
        'ad_storage' => 'google_ads',
        'ad_user_data' => 'google_ads',
        'ad_personalization' => 'google_ads',
    ];

    private function config(array $flags): Config
    {
        $scope = $this->createStub(ScopeConfigInterface::class);
        $scope->method('isSetFlag')->willReturnCallback(fn ($path) => $flags[$path] ?? false);
        return new Config(new PurposePool([
            'google_analytics' => ['active_if' => ['ga4' => 'google/gtag/analytics4/active'], 'cookies' => ['ga' => '^_ga']],
            'google_ads' => ['active_if' => ['ads' => 'google/gtag/adwords/active'], 'cookies' => ['gcl' => '^_gcl_']],
        ], $scope), self::SIGNALS);
    }

    public function testConsentModeOnlyWhileAGoogleTagIsOnInMagento(): void
    {
        $this->assertFalse($this->config([])->isConsentModeActive());
        $this->assertTrue($this->config(['google/gtag/analytics4/active' => true])->isConsentModeActive());
        $this->assertTrue($this->config(['google/gtag/adwords/active' => true])->isConsentModeActive());
    }

    public function testDefaultsDenyEverySignalWithoutDefiningWindowGtag(): void
    {
        $script = $this->config([])->getDefaultsScript();
        $this->assertStringContainsString(
            "gtag('consent', 'default', {\"analytics_storage\":\"denied\",\"ad_storage\":\"denied\",\"ad_user_data\":\"denied\",\"ad_personalization\":\"denied\",\"wait_for_update\":500});",
            $script
        );
        $this->assertStringContainsString("gtag('set', 'ads_data_redaction', true);", $script);
        // Magento's GA4 and Ads loaders only load gtag.js while window.gtag is undefined
        $this->assertStringNotContainsString('window.gtag', $script);
    }

    public function testSettingsCarrySignalsAndEachPurposesCookies(): void
    {
        $settings = json_decode($this->config([])->getConfigJson(), true);
        $this->assertSame(self::SIGNALS, $settings['signals']);
        $this->assertSame(['^_ga'], $settings['cookies']);
        $this->assertSame(['^_gcl_'], $settings['marketingCookies']);
    }
}
