<?php
declare(strict_types=1);

require __DIR__ . '/lib.php';

header('Referrer-Policy: same-origin');
header('X-Frame-Options: DENY');
header('Permissions-Policy: geolocation=(), camera=(), microphone=()');

$action = (string)($_GET['action'] ?? '');
$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));

try {
    if (!is_file(CONFIG_FILE)) {
        json_response([
            'ok' => false,
            'message' => 'Die Projektzentrale ist noch nicht eingerichtet.',
            'setupRequired' => true,
            'setupUrl' => './setup.php',
        ], 503);
    }

    if ($action === 'session' && $method === 'GET') {
        $user = session_user();
        json_response([
            'ok' => true,
            'session' => $user ? [
                'user' => [
                    'id' => (int)$user['id'],
                    'email' => $user['email'],
                    'name' => $user['name'],
                    'role' => $user['role'],
                ],
            ] : null,
        ]);
    }

    if ($action === 'login' && $method === 'POST') {
        start_secure_session();
        $now = time();
        $blockedUntil = (int)($_SESSION['login_blocked_until'] ?? 0);
        if ($blockedUntil > $now) {
            $remaining = max(1, $blockedUntil - $now);
            json_response(['ok' => false, 'message' => "Zu viele Fehlversuche. Bitte in {$remaining} Sekunden erneut versuchen."], 429);
        }

        $input = json_input();
        $email = strtolower(trim((string)($input['email'] ?? '')));
        $password = (string)($input['password'] ?? '');
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || $password === '') {
            json_response(['ok' => false, 'message' => 'E-Mail-Adresse und Passwort prüfen.'], 400);
        }

        $stmt = db()->prepare('SELECT id, email, name, role, active, password_hash FROM users WHERE email = ? LIMIT 1');
        $stmt->execute([$email]);
        $user = $stmt->fetch();
        $valid = $user && (int)$user['active'] === 1 && password_verify($password, (string)$user['password_hash']);

        if (!$valid) {
            $_SESSION['login_failures'] = (int)($_SESSION['login_failures'] ?? 0) + 1;
            if ($_SESSION['login_failures'] >= 5) {
                $_SESSION['login_blocked_until'] = $now + 300;
                $_SESSION['login_failures'] = 0;
            }
            usleep(350000);
            json_response(['ok' => false, 'message' => 'E-Mail-Adresse oder Passwort ist nicht korrekt.'], 401);
        }

        session_regenerate_id(true);
        $_SESSION['user_id'] = (int)$user['id'];
        $_SESSION['login_failures'] = 0;
        unset($_SESSION['login_blocked_until']);
        issue_auth_token((int)$user['id']);
        db()->prepare('UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = ?')->execute([(int)$user['id']]);

        json_response([
            'ok' => true,
            'session' => [
                'user' => [
                    'id' => (int)$user['id'],
                    'email' => $user['email'],
                    'name' => $user['name'],
                    'role' => $user['role'],
                ],
            ],
        ]);
    }

    if ($action === 'logout' && $method === 'POST') {
        clear_auth_token();
        start_secure_session();
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'] ?? '', (bool)$params['secure'], (bool)$params['httponly']);
        }
        session_destroy();
        json_response(['ok' => true]);
    }

    if ($action === 'state' && $method === 'GET') {
        require_user();
        $stmt = db()->prepare('SELECT data, updated_at FROM project_state WHERE id = ? LIMIT 1');
        $stmt->execute(['kinderverein-main']);
        $row = $stmt->fetch();
        json_response([
            'ok' => true,
            'data' => $row ? json_decode((string)$row['data'], true) : null,
            'updatedAt' => $row['updated_at'] ?? null,
        ]);
    }

    if ($action === 'state' && $method === 'PUT') {
        $user = require_user();
        if (($user['role'] ?? '') === 'viewer') {
            json_response(['ok' => false, 'message' => 'Dieser Zugang hat nur Leserechte.'], 403);
        }
        $input = json_input();
        $data = $input['data'] ?? null;
        if (!is_array($data)) json_response(['ok' => false, 'message' => 'Ungültiger Projektstand.'], 400);
        $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($json === false || strlen($json) > 1_800_000) {
            json_response(['ok' => false, 'message' => 'Projektstand ist zu groß.'], 413);
        }
        $stamp = gmdate('Y-m-d H:i:s.u');
        $sql = 'INSERT INTO project_state (id, data, updated_at, updated_by) VALUES (?, ?, ?, ?)'
            . ' ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = VALUES(updated_at), updated_by = VALUES(updated_by)';
        db()->prepare($sql)->execute(['kinderverein-main', $json, $stamp, (int)$user['id']]);
        json_response(['ok' => true, 'data' => $data, 'updatedAt' => $stamp]);
    }

    json_response(['ok' => false, 'message' => 'Unbekannte Anfrage.'], 404);
} catch (PDOException $e) {
    error_log('Kinderverein DB error: ' . $e->getMessage());
    json_response(['ok' => false, 'message' => 'Datenbankfehler. Bitte Administrator informieren.'], 500);
} catch (Throwable $e) {
    error_log('Kinderverein API error: ' . $e->getMessage());
    json_response(['ok' => false, 'message' => 'Serverfehler. Bitte Administrator informieren.'], 500);
}
