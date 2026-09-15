<?php
declare(strict_types=1);

require __DIR__ . '/lib.php';
require __DIR__ . '/account.php';

header('Referrer-Policy: same-origin');
header('X-Frame-Options: DENY');
header('X-Content-Type-Options: nosniff');

function page(string $body): never {
    $home = htmlspecialchars(app_public_url(), ENT_QUOTES, 'UTF-8');
    echo '<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bestätigungs-Mail · WeKiB</title><style>body{font-family:Inter,system-ui,sans-serif;background:#f6f4f8;color:#241f2c;margin:0;min-height:100vh;display:grid;place-items:center}.card{width:min(92vw,520px);background:white;border:1px solid #e7e1eb;padding:32px;box-shadow:0 18px 60px rgba(38,25,50,.08)}h1{margin:0 0 10px;font-size:28px}p{line-height:1.6;color:#655c6f}label{display:grid;gap:7px;margin:18px 0;font-weight:600}input{font:inherit;padding:13px 14px;border:1px solid #d9d1df}.btn{padding:13px 18px;border:0;background:#6e3aa8;color:white;font:inherit;font-weight:700;cursor:pointer}</style></head><body><main class="card">' . $body . '<p><a href="' . $home . '">Zurück zu WeKiB</a></p></main></body></html>';
    exit;
}

ensure_account_security_schema();
$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if ($method === 'POST') {
    start_secure_session();
    $now = time();
    $last = (int)($_SESSION['verify_mail_last'] ?? 0);
    if ($last && ($now - $last) < 60) page('<h1>Bitte kurz warten</h1><p>Eine neue Bestätigungs-Mail kann nach einer Minute erneut angefordert werden.</p>');
    $_SESSION['verify_mail_last'] = $now;

    $email = strtolower(trim((string)($_POST['email'] ?? '')));
    if (filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $stmt = db()->prepare('SELECT id, email, name, active, email_verified_at FROM users WHERE email = ? LIMIT 1');
        $stmt->execute([$email]);
        $user = $stmt->fetch();
        if ($user && (int)$user['active'] === 1 && empty($user['email_verified_at'])) {
            try { send_verification_mail((int)$user['id'], (string)$user['email'], (string)$user['name']); }
            catch (Throwable $e) { error_log('WeKiB resend verification failed: ' . $e->getMessage()); }
        }
    }
    page('<h1>E-Mail prüfen</h1><p>Wenn ein noch nicht bestätigtes Konto zu dieser Adresse existiert, wurde eine neue Bestätigungs-Mail versendet.</p>');
}

page('<h1>Bestätigungs-Mail erneut senden</h1><p>Gib die E-Mail-Adresse deines WeKiB-Kontos ein.</p><form method="post"><label>E-Mail-Adresse<input type="email" name="email" required autocomplete="email"></label><button class="btn" type="submit">Bestätigungs-Mail senden</button></form>');
