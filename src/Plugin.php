<?php
namespace Nomen\Plugin\TotpQr;

use Nomen\Src\Plugins;

class Plugin
{
    public static function boot(): void
    {
        $path = (string)(parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH) ?: '');
        $isSettings = $path === '/settings' || str_starts_with($path, '/settings/');
        $isRecovery = $path === '/recovery/secure';

        if ($isSettings || $isRecovery) {
            Plugins::script('totp-qr', 'qr.js');
        }
    }
}
