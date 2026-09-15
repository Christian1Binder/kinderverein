<?php
declare(strict_types=1);

require __DIR__ . '/lib.php';
require __DIR__ . '/account.php';

header('Referrer-Policy: same-origin');
header('X-Frame-Options: DENY');
header('X-Content-Type-Options: nosniff');

function page(string $title, string $body): never {
    $home = htmlspecialchars(app_public_url(), ENT_QUOTES, 'UTF-8');
    echo '<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' . htmlspecialchars($title, ENT_QUOTES, 'UTF-8') . '</title><style>body{font-family:Inter,system-ui,sans-serif;background:#f6f4f8;color:#241f2c;margin:0;min-height:100vh;display:grid;place-items:center}.card{width:min(92vw,520px);background:white;border:1px solid #e7e1eb;padding:32px;box-shadow:0 18px 60px rgba(38,25,50,.08)}h1{margin:0 0 10px;font-size:28px}p{line-height:1.6;color:#655c6f}label{display:grid;gap:7px;margin:18px 0;font-weight:600}input{font:inherit;padding:13px 14px;border:1px solid #d9d1df;background:white}.btn{display:inline-flex;align-items:center;justify-content:center;padding:13px 18px;border:0;background:#6e3aa8;color:white;font:inherit;font-weight:700;cursor:pointer;text-decoration:none}.secondary{background:#eee8f3;color:#493a55}.msg{padding:12px 14px;background:#f2edf6;margin:14px 0}.actions{display:flex;gap:10px;flex-wrap:wrap}</style></head><body><main class="card">' . $body . '<p><a href="' . $home . '">Zurück zu WeKiB</a></p></main></body></html>';
    exit;
}

ensure_account_security_schema();
$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
$token = strtolower(trim((string)($_GET['token'] ?? $_POST['token'] ?? '')));

if ($method === 'POST' && isset($_POST['email'])) {
    start_secure_session();
    $now = time();
    $last = (int)($_SESSION['reset_mail_last'] ?? 0);
    if ($last && ($now - $last) < 60) page('Passwort zurücksetzen', '<h1>Bitte kurz warten</h1><p>Eine neue Anfrage ist nach einer Minute wieder möglich.</p>');
    $_SESSION['reset_mail_last'] = $now;

    $email = strtolower(trim((string)$_POST['email']));
    if (filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $stmt = db()->prepare('SELECT id, email, name, active, email_verified_at FROM users WHERE email = ? LIMIT 1');
        $stmt->execute([$email]);
        $user = $stmt->fetch();
        if ($user && (int)$user['active'] === 1 && !empty($user['email_verified_at'])) {
            try { send_password_reset_mail((int)$user['id'], (string)$user['email'], (string)$user['name']); }
            catch (Throwable $e) { error_log('WeKiB reset mail failed: ' . $e->getMessage()); }
        }
    }
    page('Passwort zurücksetzen', '<h1>E-Mail prüfen</h1><p>Wenn zu dieser Adresse ein bestätigtes WeKiB-Konto existiert, wurde ein Link zum Zurücksetzen des Passworts versendet.</p>');
}

if ($method === 'POST' && isset($_POST['password'])) {
    $password = (string)$_POST['password'];
    $password2 = (string)($_POST['password2'] ?? '');
    if (strlen($password) < 12) page('Neues Passwort', '<h1>Passwort zu kurz</h1><p>Bitte verwende mindestens 12 Zeichen.</p>');
    if ($password !== $password2) page('Neues Passwort', '<h1>Passwörter stimmen nicht überein</h1><p>Bitte versuche es erneut.</p>');
    $user = account_token_user($token, 'reset');
    if (!$user) page('Link ungültig', '<h1>Link abgelaufen</h1><p>Der Link ist ungültig oder nicht mehr gültig. Fordere bitte einen neuen Link an.</p><div class="actions"><a class="btn secondary" href="reset.php">Neuen Link anfordern</a></div>');
    db()->prepare('UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?')->execute([password_hash($password, PASSWORD_DEFAULT), (int)$user['id']]);
    db()->prepare('DELETE FROM auth_sessions WHERE user_id = ?')->execute([(int)$user['id']]);
    account_token_consume($token, 'reset');
    page('Passwort geändert', '<h1>Passwort geändert</h1><p>Dein neues Passwort ist gespeichert. Du kannst dich jetzt im WeKiB-Portal anmelden.</p>');
}

if ($token !== '') {
    $user = account_token_user($token, 'reset');
    if (!$user) page('Link ungültig', '<h1>Link abgelaufen</h1><p>Der Link ist ungültig oder nicht mehr gültig.</p><div class="actions"><a class="btn secondary" href="reset.php">Neuen Link anfordern</a></div>');
    $safeToken = htmlspecialchars($token, ENT_QUOTES, 'UTF-8');
    page('Neues Passwort', '<h1>Neues Passwort vergeben</h1><p>Das neue Passwort muss mindestens 12 Zeichen lang sein.</p><form method="post"><input type="hidden" name="token" value="' . $safeToken . '"><label>Neues Passwort<input type="password" name="password" minlength="12" required autocomplete="new-password"></label><label>Passwort wiederholen<input type="password" name="password2" minlength="12" required autocomplete="new-password"></label><button class="btn" type="submit">Passwort speichern</button></form>');
}

page('Passwort zurücksetzen', '<h1>Passwort vergessen?</h1><p>Gib deine E-Mail-Adresse ein. Falls ein bestätigtes Konto existiert, senden wir dir einen zeitlich begrenzten Link.</p><form method="post"><label>E-Mail-Adresse<input type="email" name="email" required autocomplete="email"></label><button class="btn" type="submit">Reset-Link senden</button></form>');
