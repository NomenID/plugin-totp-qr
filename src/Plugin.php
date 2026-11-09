<?php
/*
 * Copyright (c) 2025-2026 Yunyun (Wang Yaoze)
 * Licensed under the GNU General Public License, version 3 only, with
 * additional attribution terms in the NOTICE file.
 * Source: https://github.com/NomenID/plugin-totp-qr
 * Project: https://nomen.caellab.com/w/plugin-totp-qr
 */

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
