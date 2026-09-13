<?php
declare(strict_types=1);

const CONFIG_FILE = __DIR__ . '/private/config.php';
const AUTH_COOKIE = 'kinderverein_auth';
const AUTH_LIFETIME = 43200; // 12 Stunden

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
    if (!is_file(CONFIG_FILE)) {
        throw new RuntimeException('SETUP_REQUIRED');
    }
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
    db()->exec('DELETE FROM auth_sessions WHERE expires_at <= NOW()');
    $token = bin2hex(random_bytes(32));
    $hash = hash('sha256', $token);
    $expires = time() + AUTH_LIFETIME;
    $expiresSql = gmdate('Y-m-d H:i:s', $expires);
    db()->prepare('INSERT INTO auth_sessions (token_hash, user_id, expires_at, last_used_at) VALUES (?, ?, ?, NOW())')
        ->execute([$hash, $userId, $expiresSql]);
    setcookie(AUTH_COOKIE, $token, auth_cookie_options($expires));
    $_COOKIE[AUTH_COOKIE] = $token;
}

function clear_auth_token(): void {
    $token = (string)($_COOKIE[AUTH_COOKIE] ?? '');
    if ($token !== '') {
        try {
            ensure_auth_sessions_table();
            db()->prepare('DELETE FROM auth_sessions WHERE token_hash = ?')->execute([hash('sha256', $token)]);
        } catch (Throwable) {
            // Logout soll auch funktionieren, wenn die DB kurz nicht erreichbar ist.
        }
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
        } catch (Throwable) {
            // Danach noch den bisherigen PHP-Session-Fallback versuchen.
        }
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
