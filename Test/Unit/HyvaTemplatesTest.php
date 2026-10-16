<?php
declare(strict_types=1);

namespace CommerceKings\ConsentGoogleTag\Test\Unit;

use CommerceKings\ConsentGoogleTag\ViewModel\Config;
use Magento\Framework\DataObject;
use Magento\Framework\Escaper;
use Magento\Framework\View\Element\Template;
use Magento\GoogleAnalytics\Block\Ga as Ua;
use Magento\GoogleGtag\Block\Ga;
use Magento\GoogleGtag\ViewModel\Adwords;
use PHPUnit\Framework\TestCase;

class HyvaTemplatesTest extends TestCase
{
    /** Our view model, passed to the Hyvä templates as block argument "ck_google" (Anonymize IP on). */
    private function google(): Config
    {
        $google = $this->createStub(Config::class);
        $google->method('isIpAnonymized')->willReturn(true);
        return $google;
    }

    private function render(string $name, object $block): string
    {
        $escaper = $this->createPartialMock(Escaper::class, ['escapeXssInUrl']);
        $escaper->expects($name === 'scripts' ? $this->exactly(4) : $this->never())
            ->method('escapeXssInUrl')->willReturnArgument(0);
        ob_start();
        try {
            include dirname(__DIR__, 2) . '/view/frontend/templates/hyva/' . $name . '.phtml';
            return (string)ob_get_contents();
        } finally {
            ob_end_clean();
        }
    }

    private function payload(string $html, string $kind): array
    {
        $document = new \DOMDocument();
        @$document->loadHTML($html);
        $scripts = $document->getElementsByTagName('script');
        self::assertCount(1, $scripts, 'one data node and no executable inline loader');
        self::assertSame('application/json', $scripts[0]->getAttribute('type'));
        self::assertSame($kind, $scripts[0]->getAttribute('data-ck-google-tag'));
        self::assertFalse($scripts[0]->hasAttribute('src'));
        return json_decode($scripts[0]->textContent, true, flags: JSON_THROW_ON_ERROR);
    }

    public function testGaUsesMagentoTrackingDataAndEscapesScriptClosingTags(): void
    {
        $data = ['googleAnalyticsAvailable' => true, 'pageTrackingData' => ['measurementId' => 'G-TEST'],
            'ordersTrackingData' => ['products' => [['item_name' => '</script><script>alert(1)</script>']]]];
        $block = $this->createStub(Ga::class);
        $block->method('getAnalyticsData')->willReturn(json_encode($data));
        $block->method('getData')->willReturnCallback(fn ($key) => $key === 'ck_google' ? $this->google() : null);
        self::assertSame($data + ['anonymizeIp' => true], $this->payload($this->render('ga', $block), 'ga4'));
    }

    public function testGaRendersNothingWhenDisabledOrMissingAnId(): void
    {
        foreach ([[], ['googleAnalyticsAvailable' => false, 'pageTrackingData' => ['measurementId' => 'G-TEST']],
            ['googleAnalyticsAvailable' => true, 'pageTrackingData' => ['measurementId' => '']]] as $data) {
            $block = $this->createStub(Ga::class);
            $block->method('getAnalyticsData')->willReturn(json_encode($data));
            self::assertSame('', trim($this->render('ga', $block)));
        }
    }

    public function testUaUsesTheNativeAccountPageAndOrderData(): void
    {
        $block = $this->createStub(Ua::class);
        $block->method('getConfig')->willReturn('UA-TEST');
        $block->method('getPageTrackingData')->willReturn(['accountId' => 'UA-TEST']);
        $block->method('getOrdersTrackingData')->willReturn(['orders' => [['id' => 'test-order']]]);
        self::assertSame(['pageTrackingData' => ['accountId' => 'UA-TEST'],
            'ordersTrackingData' => ['orders' => [['id' => 'test-order']]]], $this->payload($this->render('ua', $block), 'ua'));
    }

    public function testUaRendersNothingWithoutAnAccount(): void
    {
        $block = $this->createStub(Ua::class);
        $block->method('getConfig')->willReturn('');
        self::assertSame('', trim($this->render('ua', $block)));
    }

    public function testAdsUsesTheNativeIdAndLimitsConversionsToTheSuccessHandle(): void
    {
        $ads = $this->createStub(Adwords::class);
        $ads->method('isGoogleAdwordsConfigurable')->willReturn(true);
        $ads->method('isGoogleAdwordsActive')->willReturn(true);
        $ads->method('getConversionId')->willReturn('AW-TEST');
        $ads->method('getConversionLabel')->willReturn('purchase</script>');
        foreach ([false, true] as $conversion) {
            $block = new DataObject(['use_conversion_label' => $conversion, 'view_model' => $ads, 'ck_google' => $this->google()]);
            $data = $this->payload($this->render('ads', $block), 'ads');
            self::assertSame(['conversionId' => 'AW-TEST', 'conversionLabel' => $conversion ? 'purchase</script>' : '',
                'anonymizeIp' => true], $data);
        }
    }

    public function testAdsRendersNothingWhenDisabledOrMissingAnId(): void
    {
        foreach ([[false, true, 'AW-TEST'], [true, false, 'AW-TEST'], [true, true, '']] as [$configurable, $active, $id]) {
            $ads = $this->createStub(Adwords::class);
            $ads->method('isGoogleAdwordsConfigurable')->willReturn($configurable);
            $ads->method('isGoogleAdwordsActive')->willReturn($active);
            $ads->method('getConversionId')->willReturn($id);
            self::assertSame('', trim($this->render('ads', new DataObject(['view_model' => $ads, 'ck_google' => $this->google()]))));
        }
    }

    public function testHyvaLoadsOnlyOrderedExternalConsentScripts(): void
    {
        $block = $this->createStub(Template::class);
        $block->method('getViewFileUrl')->willReturnCallback(fn ($asset) => 'https://shop.test/static/' . $asset);
        $html = $this->render('scripts', $block);
        $document = new \DOMDocument();
        @$document->loadHTML($html);
        $names = [];
        foreach ($document->getElementsByTagName('script') as $script) {
            self::assertTrue($script->hasAttribute('defer'));
            self::assertSame('', trim($script->textContent));
            $names[] = basename($script->getAttribute('src'));
        }
        self::assertSame(['consent-mode-core.js', 'analytics-core.js', 'ads-core.js', 'hyva.js'], $names);
    }
}
