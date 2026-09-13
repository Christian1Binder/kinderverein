<?php
declare(strict_types=1);

require __DIR__ . '/lib.php';

header('Content-Type: text/html; charset=utf-8');
header('X-Frame-Options: DENY');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');

$errors = [];
$success = false;
$configDir = __DIR__ . '/private';

if (is_file(CONFIG_FILE)) {
    $success = true;
}

if (!$success && ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $host = trim((string)($_POST['db_host'] ?? ''));
    $name = trim((string)($_POST['db_name'] ?? ''));
    $user = trim((string)($_POST['db_user'] ?? ''));
    $password = (string)($_POST['db_password'] ?? '');
    $adminName = trim((string)($_POST['admin_name'] ?? ''));
    $adminEmail = strtolower(trim((string)($_POST['admin_email'] ?? '')));
    $adminPassword = (string)($_POST['admin_password'] ?? '');

    if ($host === '' || $name === '' || $user === '' || $password === '') $errors[] = 'Bitte alle Datenbankfelder ausfüllen.';
    if ($adminName === '') $errors[] = 'Bitte deinen Namen eingeben.';
    if (!filter_var($adminEmail, FILTER_VALIDATE_EMAIL)) $errors[] = 'Bitte eine gültige Admin-E-Mail-Adresse eingeben.';
    if (strlen($adminPassword) < 12) $errors[] = 'Das Admin-Passwort muss mindestens 12 Zeichen lang sein.';

    if (!$errors) {
        try {
            $pdo = new PDO("mysql:host={$host};dbname={$name};charset=utf8mb4", $user, $password, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);

            $pdo->exec("CREATE TABLE IF NOT EXISTS users (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(190) NOT NULL UNIQUE,
                name VARCHAR(190) NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                role VARCHAR(20) NOT NULL DEFAULT 'member',
                active TINYINT(1) NOT NULL DEFAULT 1,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_login_at DATETIME NULL,
                INDEX idx_users_active (active)
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

            $pdo->exec("CREATE TABLE IF NOT EXISTS project_state (
                id VARCHAR(64) NOT NULL PRIMARY KEY,
                data LONGTEXT NOT NULL,
                updated_at DATETIME(6) NOT NULL,
                updated_by BIGINT UNSIGNED NULL,
                INDEX idx_project_updated (updated_at)
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

            $stmt = $pdo->prepare('SELECT id FROM users WHERE email = ? LIMIT 1');
            $stmt->execute([$adminEmail]);
            $existing = $stmt->fetch();
            $hash = password_hash($adminPassword, PASSWORD_DEFAULT);
            if ($existing) {
                $pdo->prepare("UPDATE users SET name = ?, password_hash = ?, role = 'admin', active = 1, updated_at = NOW() WHERE id = ?")
                    ->execute([$adminName, $hash, (int)$existing['id']]);
            } else {
                $pdo->prepare("INSERT INTO users (email, name, password_hash, role, active) VALUES (?, ?, ?, 'admin', 1)")
                    ->execute([$adminEmail, $adminName, $hash]);
            }

            if (!is_dir($configDir) && !mkdir($configDir, 0750, true) && !is_dir($configDir)) {
                throw new RuntimeException('Konfigurationsordner konnte nicht erstellt werden.');
            }
            $config = [
                'db' => [
                    'host' => $host,
                    'name' => $name,
                    'user' => $user,
                    'password' => $password,
                ],
                'installed_at' => gmdate('c'),
                'app_key' => bin2hex(random_bytes(32)),
            ];
            $php = "<?php\nreturn " . var_export($config, true) . ";\n";
            if (file_put_contents(CONFIG_FILE, $php, LOCK_EX) === false) {
                throw new RuntimeException('config.php konnte nicht geschrieben werden.');
            }
            @chmod(CONFIG_FILE, 0640);
            $success = true;
        } catch (Throwable $e) {
            error_log('Kinderverein setup error: ' . $e->getMessage());
            $errors[] = 'Einrichtung fehlgeschlagen. Prüfe Server, Datenbankname, Benutzername und Passwort. Technische Details stehen im Server-Log.';
        }
    }
}

function h(string $value): string { return htmlspecialchars($value, ENT_QUOTES, 'UTF-8'); }
?>
<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kinderverein · Einrichtung</title>
<style>
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f5f5f8;color:#171729}.wrap{max-width:760px;margin:0 auto;padding:40px 20px 80px}.card{background:white;border:1px solid #e6e6ee;border-radius:24px;padding:28px;box-shadow:0 18px 50px rgba(30,30,60,.08)}.brand{display:flex;align-items:center;gap:12px;font-weight:800;margin-bottom:24px}.mark{display:grid;place-items:center;width:42px;height:42px;border-radius:14px;background:#17152e;color:#fff}.eyebrow{font-size:.78rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#6f6a91}h1{font-size:clamp(2rem,6vw,3.2rem);line-height:1.02;margin:10px 0 12px}p{color:#66647a;line-height:1.6}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}label{display:grid;gap:7px;font-weight:700;font-size:.92rem}input{width:100%;padding:13px 14px;border:1px solid #d9d8e4;border-radius:12px;font:inherit}input:focus{outline:3px solid #ebe8ff;border-color:#7768db}.section{margin-top:26px;padding-top:24px;border-top:1px solid #ecebf1}.btn{width:100%;margin-top:24px;border:0;border-radius:13px;padding:14px 18px;background:#17152e;color:white;font:inherit;font-weight:800;cursor:pointer}.notice{padding:14px 16px;border-radius:14px;margin:16px 0}.error{background:#fff0f0;color:#9a2d2d}.ok{background:#eefaf1;color:#27623b}.hint{font-size:.88rem}.value-hint{font-size:.78rem;color:#858298;font-weight:500}@media(max-width:620px){.grid{grid-template-columns:1fr}.card{padding:22px}.wrap{padding:20px 12px 60px}}
</style>
</head>
<body><main class="wrap"><div class="card">
<div class="brand"><span class="mark">K</span><span>Kinderverein · Projektzentrale</span></div>
<?php if ($success): ?>
<span class="eyebrow">Einrichtung abgeschlossen</span><h1>Die Datenbank ist verbunden.</h1>
<div class="notice ok">Dein Admin-Konto wurde eingerichtet. Die Setup-Seite ist jetzt automatisch gesperrt.</div>
<p>Du kannst dich jetzt auf der Projektseite mit deiner Admin-E-Mail-Adresse und deinem Passwort anmelden.</p>
<p><a href="../">Zur Projektzentrale</a> · <a href="users.php">Benutzer verwalten</a></p>
<?php else: ?>
<span class="eyebrow">Einmalige Einrichtung</span><h1>STRATO-Datenbank verbinden</h1>
<p>Die Zugangsdaten werden ausschließlich auf deinem STRATO-Webspace in einer geschützten PHP-Konfigurationsdatei gespeichert und nicht an GitHub übertragen.</p>
<?php foreach ($errors as $error): ?><div class="notice error"><?=h($error)?></div><?php endforeach; ?>
<form method="post" autocomplete="off">
<div class="section"><h2>Datenbank</h2><div class="grid">
<label>Server / Host<input required name="db_host" value="<?=h((string)($_POST['db_host'] ?? ''))?>"><span class="value-hint">STRATO: Datenbank → 3 Punkte → Details → Server</span></label>
<label>Datenbankname<input required name="db_name" value="<?=h((string)($_POST['db_name'] ?? ''))?>"><span class="value-hint">meist dbs…</span></label>
<label>Benutzername<input required name="db_user" value="<?=h((string)($_POST['db_user'] ?? ''))?>"><span class="value-hint">meist dbu…</span></label>
<label>Datenbank-Passwort<input required type="password" name="db_password"><span class="value-hint">das beim Anlegen vergebene Passwort</span></label>
</div></div>
<div class="section"><h2>Erstes Admin-Konto</h2><div class="grid">
<label>Name<input required name="admin_name" value="<?=h((string)($_POST['admin_name'] ?? ''))?>"></label>
<label>E-Mail-Adresse<input required type="email" name="admin_email" value="<?=h((string)($_POST['admin_email'] ?? ''))?>"></label>
<label style="grid-column:1/-1">Passwort<input required minlength="12" type="password" name="admin_password"><span class="value-hint">mindestens 12 Zeichen</span></label>
</div></div>
<button class="btn" type="submit">Projektzentrale einrichten</button>
<p class="hint">Bitte diese Seite nur über HTTPS öffnen.</p>
</form>
<?php endif; ?>
</div></main></body></html>
