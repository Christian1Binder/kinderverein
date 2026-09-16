<?php
declare(strict_types=1);

const CONFIG_FILE = __DIR__ . '/private/config.php';
const AUTH_COOKIE = 'kinderverein_auth';
const AUTH_LIFETIME = 43200;
const UPLOAD_DIR = __DIR__ . '/private/uploads';

function is_https(): bool {
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
}

function start_secure_session(): void {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    session_name('kinderverein_session');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => is_https(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    ini_set('session.use_strict_mode', '1');
    session_start();
}

function app_config(): array {
    if (!is_file(CONFIG_FILE)) throw new RuntimeException('SETUP_REQUIRED');
    $config = require CONFIG_FILE;
    if (!is_array($config)) throw new RuntimeException('INVALID_CONFIG');
    return $config;
}

function db(): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;
    $config = app_config();
    $db = $config['db'] ?? [];
    $host = (string)($db['host'] ?? '');
    $name = (string)($db['name'] ?? '');
    $user = (string)($db['user'] ?? '');
    $pass = (string)($db['password'] ?? '');
    if ($host === '' || $name === '' || $user === '') throw new RuntimeException('INVALID_CONFIG');
    $dsn = "mysql:host={$host};dbname={$name};charset=utf8mb4";
    $pdo = new PDO($dsn, $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    return $pdo;
}

function ensure_auth_sessions_table(): void {
    static $ready = false;
    if ($ready) return;
    db()->exec("CREATE TABLE IF NOT EXISTS auth_sessions (
        token_hash CHAR(64) NOT NULL PRIMARY KEY,
        user_id BIGINT UNSIGNED NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_used_at DATETIME NULL,
        INDEX idx_auth_user (user_id),
        INDEX idx_auth_expires (expires_at)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    $ready = true;
}

function ensure_project_files_table(): void {
    static $ready = false;
    if ($ready) return;
    db()->exec("CREATE TABLE IF NOT EXISTS project_files (
        id CHAR(36) NOT NULL PRIMARY KEY,
        storage_name VARCHAR(120) NOT NULL UNIQUE,
        original_name VARCHAR(255) NOT NULL,
        mime VARCHAR(160) NOT NULL,
        size_bytes BIGINT UNSIGNED NOT NULL,
        uploaded_by BIGINT UNSIGNED NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        active TINYINT(1) NOT NULL DEFAULT 1,
        INDEX idx_project_files_user (uploaded_by),
        INDEX idx_project_files_active (active)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    if (!is_dir(UPLOAD_DIR) && !mkdir(UPLOAD_DIR, 0750, true) && !is_dir(UPLOAD_DIR)) {
        throw new RuntimeException('UPLOAD_DIR_FAILED');
    }
    $denyFile = UPLOAD_DIR . '/.htaccess';
    if (!is_file($denyFile)) @file_put_contents($denyFile, "Require all denied\nDeny from all\n");
    $ready = true;
}

function auth_cookie_options(int $expires): array {
    return [
        'expires' => $expires,
        'path' => '/',
        'secure' => is_https(),
        'httponly' => true,
        'samesite' => 'Lax',
    ];
}

function issue_auth_token(int $userId): void {
    ensure_auth_sessions_table();

    // Sobald die E-Mail-Verifikation installiert ist, dürfen unbestätigte Selbstregistrierungen keine Sitzung erhalten.
    try {
        $column = db()->query("SHOW COLUMNS FROM users LIKE 'email_verified_at'")->fetch();
        if ($column) {
            $stmt = db()->prepare('SELECT email_verified_at FROM users WHERE id = ? LIMIT 1');
            $stmt->execute([$userId]);
            $row = $stmt->fetch();
            if ($row && empty($row['email_verified_at'])) {
                start_secure_session();
                unset($_SESSION['user_id']);
                setcookie(AUTH_COOKIE, '', auth_cookie_options(time() - 3600));
                unset($_COOKIE[AUTH_COOKIE]);
                json_response([
                    'ok' => false,
                    'code' => 'EMAIL_NOT_VERIFIED',
                    'message' => 'Bitte bestätige zuerst deine E-Mail-Adresse. Du kannst dir den Bestätigungslink erneut zusenden lassen.',
                ], 403);
            }
        }
    } catch (Throwable $e) {
        error_log('WeKiB verification gate failed: ' . $e->getMessage());
    }

    db()->exec('DELETE FROM auth_sessions WHERE expires_at <= NOW()');
    $token = bin2hex(random_bytes(32));
    $hash = hash('sha256', $token);
    $expires = time() + AUTH_LIFETIME;
    db()->prepare('INSERT INTO auth_sessions (token_hash, user_id, expires_at, last_used_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 12 HOUR), NOW())')
        ->execute([$hash, $userId]);
    setcookie(AUTH_COOKIE, $token, auth_cookie_options($expires));
    $_COOKIE[AUTH_COOKIE] = $token;
}

function clear_auth_token(): void {
    $token = (string)($_COOKIE[AUTH_COOKIE] ?? '');
    if ($token !== '') {
        try {
            ensure_auth_sessions_table();
            db()->prepare('DELETE FROM auth_sessions WHERE token_hash = ?')->execute([hash('sha256', $token)]);
        } catch (Throwable) {}
    }
    setcookie(AUTH_COOKIE, '', auth_cookie_options(time() - 3600));
    unset($_COOKIE[AUTH_COOKIE]);
}

function json_response(array $payload, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, private');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function json_input(): array {
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') return [];
    if (strlen($raw) > 2_000_000) json_response(['ok' => false, 'message' => 'Anfrage ist zu groß.'], 413);
    $data = json_decode($raw, true);
    if (!is_array($data)) json_response(['ok' => false, 'message' => 'Ungültige Anfrage.'], 400);
    return $data;
}

function session_user(): ?array {
    $token = (string)($_COOKIE[AUTH_COOKIE] ?? '');
    if ($token !== '') {
        try {
            ensure_auth_sessions_table();
            $stmt = db()->prepare(
                'SELECT u.id, u.email, u.name, u.role, u.active '
                . 'FROM auth_sessions s JOIN users u ON u.id = s.user_id '
                . 'WHERE s.token_hash = ? AND s.expires_at > NOW() LIMIT 1'
            );
            $stmt->execute([hash('sha256', $token)]);
            $user = $stmt->fetch();
            if ($user && (int)$user['active'] === 1) {
                db()->prepare('UPDATE auth_sessions SET last_used_at = NOW() WHERE token_hash = ?')
                    ->execute([hash('sha256', $token)]);
                return $user;
            }
            clear_auth_token();
        } catch (Throwable) {}
    }

    start_secure_session();
    $id = $_SESSION['user_id'] ?? null;
    if (!$id) return null;
    try {
        $stmt = db()->prepare('SELECT id, email, name, role, active FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([(int)$id]);
        $user = $stmt->fetch();
        if (!$user || !(int)$user['active']) {
            unset($_SESSION['user_id']);
            return null;
        }
        return $user;
    } catch (Throwable) {
        return null;
    }
}

function require_user(): array {
    $user = session_user();
    if (!$user) json_response(['ok' => false, 'message' => 'Bitte erneut anmelden.'], 401);
    return $user;
}

function require_admin(): array {
    $user = require_user();
    if (($user['role'] ?? '') !== 'admin') json_response(['ok' => false, 'message' => 'Keine Berechtigung.'], 403);
    return $user;
}

function uuid_v4(): string {
    $data = random_bytes(16);
    $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
    $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}

function csrf_token(): string {
    $token = (string)($_COOKIE[AUTH_COOKIE] ?? '');
    if ($token !== '') {
        $config = app_config();
        $key = (string)($config['app_key'] ?? '');
        if ($key !== '') return hash_hmac('sha256', 'csrf|' . $token, $key);
    }
    start_secure_session();
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(32));
    return (string)$_SESSION['csrf'];
}

function verify_csrf(string $token): bool {
    $authToken = (string)($_COOKIE[AUTH_COOKIE] ?? '');
    if ($authToken !== '') {
        $config = app_config();
        $key = (string)($config['app_key'] ?? '');
        if ($key === '') return false;
        $expected = hash_hmac('sha256', 'csrf|' . $authToken, $key);
        return hash_equals($expected, $token);
    }
    start_secure_session();
    return isset($_SESSION['csrf']) && hash_equals((string)$_SESSION['csrf'], $token);
}
