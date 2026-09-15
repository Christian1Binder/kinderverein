<?php
declare(strict_types=1);

require __DIR__ . '/lib.php';
require __DIR__ . '/account.php';

header('Referrer-Policy: no-referrer');
header('X-Frame-Options: DENY');
header('X-Content-Type-Options: nosniff');

$token = strtolower(trim((string)($_GET['token'] ?? '')));
$target = app_public_url();

try {
    $user = account_token_user($token, 'verify');
    if (!$user) {
        header('Location: ' . $target . '/?verification=invalid');
        exit;
    }
    db()->prepare('UPDATE users SET email_verified_at = NOW(), updated_at = NOW() WHERE id = ?')->execute([(int)$user['id']]);
    account_token_consume($token, 'verify');
    header('Location: ' . $target . '/?verification=success');
    exit;
} catch (Throwable $e) {
    error_log('WeKiB verify failed: ' . $e->getMessage());
    header('Location: ' . $target . '/?verification=error');
    exit;
}
