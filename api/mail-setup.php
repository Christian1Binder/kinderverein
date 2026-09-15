<?php
declare(strict_types=1);

require __DIR__ . '/lib.php';
require __DIR__ . '/account.php';

header('Referrer-Policy: same-origin');
header('X-Frame-Options: DENY');
header('X-Content-Type-Options: nosniff');

$admin = require_admin();
start_secure_session();
$config = is_file(MAIL_CONFIG_FILE) ? require MAIL_CONFIG_FILE : [];
if (!is_array($config)) $config = [];
$message = '';
$error = '';

if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) === 'POST') {
    $csrf = (string)($_POST['csrf'] ?? '');
    if (!verify_csrf($csrf)) {
        $error = 'Sitzung abgelaufen. Bitte Seite neu laden.';
    } else {
        $host = trim((string)($_POST['host'] ?? 'smtp.strato.de'));
        $port = (int)($_POST['port'] ?? 465);
        $user = strtolower(trim((string)($_POST['user'] ?? '')));
        $password = (string)($_POST['password'] ?? '');
        $from = strtolower(trim((string)($_POST['from'] ?? $user)));
        $fromName = trim((string)($_POST['from_name'] ?? 'WeKiB'));
        if ($password === '' && isset($config['password'])) $password = (string)$config['password'];

        if ($host === '' || $port < 1 || $port > 65535 || !filter_var($user, FILTER_VALIDATE_EMAIL) || !filter_var($from, FILTER_VALIDATE_EMAIL) || $password === '') {
            $error = 'Bitte alle SMTP-Daten vollständig eingeben.';
        } else {
            $newConfig = ['host' => $host, 'port' => $port, 'user' => $user, 'password' => $password, 'from' => $from, 'from_name' => $fromName ?: 'WeKiB'];
            if (!is_dir(dirname(MAIL_CONFIG_FILE))) @mkdir(dirname(MAIL_CONFIG_FILE), 0750, true);
            $php = "<?php\nreturn " . var_export($newConfig, true) . ";\n";
            if (file_put_contents(MAIL_CONFIG_FILE, $php, LOCK_EX) === false) {
                $error = 'Die Mail-Konfiguration konnte nicht gespeichert werden.';
            } else {
                @chmod(MAIL_CONFIG_FILE, 0640);
                $config = $newConfig;
                if (!empty($_POST['test'])) {
                    try {
                        send_portal_mail((string)$admin['email'], 'WeKiB Mail-Test', "Die STRATO-Mailanbindung des WeKiB-Portals funktioniert.\n\nDiese Nachricht wurde über die hinterlegten SMTP-Daten versendet.");
                        $message = 'Einstellungen gespeichert. Testmail wurde an dein Admin-Konto gesendet.';
                    } catch (Throwable $e) {
                        error_log('WeKiB mail test failed: ' . $e->getMessage());
                        $error = 'Einstellungen gespeichert, aber die Testmail ist fehlgeschlagen. Prüfe E-Mail-Adresse, Passwort und STRATO-Postfach.';
                    }
                } else {
                    $message = 'Mail-Einstellungen gespeichert.';
                }
            }
        }
    }
}

function h(string $value): string { return htmlspecialchars($value, ENT_QUOTES, 'UTF-8'); }
$csrf = csrf_token();
$host = (string)($config['host'] ?? 'smtp.strato.de');
$port = (int)($config['port'] ?? 465);
$user = (string)($config['user'] ?? '');
$from = (string)($config['from'] ?? $user);
$fromName = (string)($config['from_name'] ?? 'WeKiB');
$hasPassword = !empty($config['password']);
?><!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WeKiB · Mail einrichten</title>
<style>body{font-family:Inter,system-ui,sans-serif;background:#f6f4f8;color:#241f2c;margin:0;min-height:100vh}.wrap{max-width:760px;margin:48px auto;padding:0 20px}.card{background:#fff;border:1px solid #e6dfeb;padding:30px;box-shadow:0 16px 50px rgba(40,27,50,.08)}h1{margin-top:0}p{line-height:1.6;color:#655c6f}.grid{display:grid;grid-template-columns:1fr 160px;gap:14px}.full{grid-column:1/-1}label{display:grid;gap:7px;font-weight:650}input{font:inherit;padding:12px 13px;border:1px solid #d9d0df}.btns{display:flex;gap:10px;flex-wrap:wrap;margin-top:22px}button,a.btn{font:inherit;font-weight:700;padding:12px 16px;border:0;background:#6e3aa8;color:white;text-decoration:none;cursor:pointer}.secondary{background:#eee8f3!important;color:#493a55!important}.msg{padding:12px 14px;background:#edf6ef;color:#315a38;margin-bottom:16px}.err{padding:12px 14px;background:#faeeee;color:#7d3030;margin-bottom:16px}.note{padding:14px;background:#f4f0f7;margin-top:20px}@media(max-width:620px){.grid{grid-template-columns:1fr}.full{grid-column:auto}}</style></head>
<body><main class="wrap"><div class="card"><p>ADMINISTRATION · E-MAIL</p><h1>STRATO-Mail anbinden</h1><p>Diese Zugangsdaten werden ausschließlich auf dem STRATO-Webspace in <code>api/private/mail.php</code> gespeichert und nicht in GitHub abgelegt.</p>
<?php if ($message): ?><div class="msg"><?=h($message)?></div><?php endif; ?><?php if ($error): ?><div class="err"><?=h($error)?></div><?php endif; ?>
<form method="post"><input type="hidden" name="csrf" value="<?=h($csrf)?>"><div class="grid">
<label>SMTP-Server<input name="host" required value="<?=h($host)?>"></label>
<label>Port<input name="port" type="number" required value="<?=h((string)$port)?>"></label>
<label class="full">STRATO E-Mail-Adresse / Benutzername<input name="user" type="email" required value="<?=h($user)?>" placeholder="portal@deinedomain.de"></label>
<label class="full">E-Mail-Passwort<input name="password" type="password" <?=$hasPassword ? '' : 'required'?> placeholder="<?=$hasPassword ? 'Leer lassen, um vorhandenes Passwort beizubehalten' : 'Passwort des STRATO-Postfachs'?>"></label>
<label class="full">Absenderadresse<input name="from" type="email" required value="<?=h($from)?>"></label>
<label class="full">Absendername<input name="from_name" required value="<?=h($fromName)?>"></label>
</div><div class="btns"><button type="submit">Speichern</button><button type="submit" name="test" value="1" class="secondary">Speichern & Testmail senden</button><a class="btn secondary" href="../">Zurück zum Portal</a></div></form>
<div class="note"><strong>Voreinstellung für STRATO:</strong> smtp.strato.de · Port 465 · SSL/TLS. Als Benutzername wird die vollständige STRATO-E-Mail-Adresse verwendet.</div>
</div></main></body></html>
