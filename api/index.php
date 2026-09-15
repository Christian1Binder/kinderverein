<?php
declare(strict_types=1);

require __DIR__ . '/lib.php';
require __DIR__ . '/access.php';

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
            'session' => $user ? ['user' => [
                'id' => (int)$user['id'],
                'email' => $user['email'],
                'name' => $user['name'],
                'role' => $user['role'],
            ]] : null,
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
        json_response(['ok' => true, 'session' => ['user' => [
            'id' => (int)$user['id'], 'email' => $user['email'], 'name' => $user['name'], 'role' => $user['role'],
        ]]]);
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
        $user = require_user();
        $stmt = db()->prepare('SELECT data, updated_at FROM project_state WHERE id = ? LIMIT 1');
        $stmt->execute(['kinderverein-main']);
        $row = $stmt->fetch();
        $data = $row ? json_decode((string)$row['data'], true) : null;
        if (is_array($data)) $data = filter_project_state_for_user($data, $user);
        json_response(['ok' => true, 'data' => $data, 'updatedAt' => $row['updated_at'] ?? null]);
    }

    if ($action === 'state' && $method === 'PUT') {
        $user = require_user();
        if (($user['role'] ?? '') === 'viewer') json_response(['ok' => false, 'message' => 'Dieser Zugang hat nur Leserechte.'], 403);
        $input = json_input();
        $data = $input['data'] ?? null;
        if (!is_array($data)) json_response(['ok' => false, 'message' => 'Ungültiger Projektstand.'], 400);
        if (($user['role'] ?? '') !== 'admin') {
            $stmtCurrent = db()->prepare('SELECT data FROM project_state WHERE id = ? LIMIT 1');
            $stmtCurrent->execute(['kinderverein-main']);
            $rowCurrent = $stmtCurrent->fetch();
            $currentData = $rowCurrent && is_string($rowCurrent['data'] ?? null) ? json_decode((string)$rowCurrent['data'], true) : [];
            $data = merge_project_state_for_user(is_array($currentData) ? $currentData : [], $data, $user);
        }
        $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($json === false || strlen($json) > 3_500_000) json_response(['ok' => false, 'message' => 'Projektstand ist zu groß.'], 413);
        $stamp = gmdate('Y-m-d H:i:s.u');
        $sql = 'INSERT INTO project_state (id, data, updated_at, updated_by) VALUES (?, ?, ?, ?)'
            . ' ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = VALUES(updated_at), updated_by = VALUES(updated_by)';
        db()->prepare($sql)->execute(['kinderverein-main', $json, $stamp, (int)$user['id']]);
        json_response(['ok' => true, 'data' => $data, 'updatedAt' => $stamp]);
    }

    if ($action === 'users' && $method === 'GET') {
        require_admin();
        $rows = db()->query('SELECT id, email, name, role, active, created_at, updated_at, last_login_at FROM users ORDER BY active DESC, name ASC')->fetchAll();
        $users = array_map(static fn(array $u): array => [
            'id' => (int)$u['id'], 'email' => $u['email'], 'name' => $u['name'], 'role' => $u['role'],
            'active' => (bool)$u['active'], 'createdAt' => $u['created_at'], 'updatedAt' => $u['updated_at'], 'lastLoginAt' => $u['last_login_at'],
        ], $rows);
        json_response(['ok' => true, 'users' => $users]);
    }

    if ($action === 'users' && $method === 'POST') {
        require_admin();
        $input = json_input();
        $name = trim((string)($input['name'] ?? ''));
        $email = strtolower(trim((string)($input['email'] ?? '')));
        $password = (string)($input['password'] ?? '');
        $role = (string)($input['role'] ?? 'member');
        if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) json_response(['ok' => false, 'message' => 'Name und gültige E-Mail-Adresse sind erforderlich.'], 400);
        if (strlen($password) < 12) json_response(['ok' => false, 'message' => 'Das Startpasswort muss mindestens 12 Zeichen lang sein.'], 400);
        if (!in_array($role, ['admin', 'member', 'viewer'], true)) $role = 'member';
        $hash = password_hash($password, PASSWORD_DEFAULT);
        try {
            db()->prepare('INSERT INTO users (email, name, password_hash, role, active, updated_at) VALUES (?, ?, ?, ?, 1, NOW())')->execute([$email, $name, $hash, $role]);
        } catch (PDOException $e) {
            if ((string)$e->getCode() === '23000') json_response(['ok' => false, 'message' => 'Für diese E-Mail-Adresse existiert bereits ein Zugang.'], 409);
            throw $e;
        }
        $id = (int)db()->lastInsertId();
        json_response(['ok' => true, 'user' => ['id' => $id, 'email' => $email, 'name' => $name, 'role' => $role, 'active' => true]], 201);
    }

    if ($action === 'users' && $method === 'PATCH') {
        $admin = require_admin();
        $input = json_input();
        $id = (int)($input['id'] ?? 0);
        if ($id <= 0) json_response(['ok' => false, 'message' => 'Ungültiger Benutzer.'], 400);
        $stmt = db()->prepare('SELECT id, email, name, role, active FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$id]);
        $current = $stmt->fetch();
        if (!$current) json_response(['ok' => false, 'message' => 'Benutzer nicht gefunden.'], 404);

        $name = array_key_exists('name', $input) ? trim((string)$input['name']) : (string)$current['name'];
        $email = array_key_exists('email', $input) ? strtolower(trim((string)$input['email'])) : (string)$current['email'];
        $role = array_key_exists('role', $input) ? (string)$input['role'] : (string)$current['role'];
        $active = array_key_exists('active', $input) ? ((bool)$input['active'] ? 1 : 0) : (int)$current['active'];
        if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) json_response(['ok' => false, 'message' => 'Name oder E-Mail-Adresse ist ungültig.'], 400);
        if (!in_array($role, ['admin', 'member', 'viewer'], true)) json_response(['ok' => false, 'message' => 'Ungültige Rolle.'], 400);
        if ($id === (int)$admin['id'] && ($active !== 1 || $role !== 'admin')) json_response(['ok' => false, 'message' => 'Du kannst deinem eigenen Konto hier nicht die Adminrechte entziehen oder es sperren.'], 400);

        $password = (string)($input['password'] ?? '');
        if ($password !== '' && strlen($password) < 12) json_response(['ok' => false, 'message' => 'Das neue Passwort muss mindestens 12 Zeichen lang sein.'], 400);
        if ($password !== '') {
            db()->prepare('UPDATE users SET email = ?, name = ?, role = ?, active = ?, password_hash = ?, updated_at = NOW() WHERE id = ?')
                ->execute([$email, $name, $role, $active, password_hash($password, PASSWORD_DEFAULT), $id]);
        } else {
            db()->prepare('UPDATE users SET email = ?, name = ?, role = ?, active = ?, updated_at = NOW() WHERE id = ?')
                ->execute([$email, $name, $role, $active, $id]);
        }
        json_response(['ok' => true, 'user' => ['id' => $id, 'email' => $email, 'name' => $name, 'role' => $role, 'active' => (bool)$active]]);
    }

    if ($action === 'file-upload' && $method === 'POST') {
        $user = require_user();
        if (($user['role'] ?? '') === 'viewer') json_response(['ok' => false, 'message' => 'Dieser Zugang hat keine Upload-Berechtigung.'], 403);
        $portalAccess = portal_access_for_user($user);
        if (!$portalAccess['foundation'] && !$portalAccess['board'] && !$portalAccess['admin']) json_response(['ok' => false, 'message' => 'Keine Berechtigung für die interne Dateiablage.'], 403);
        if (!isset($_FILES['file']) || !is_array($_FILES['file'])) json_response(['ok' => false, 'message' => 'Keine Datei empfangen.'], 400);
        $file = $_FILES['file'];
        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) json_response(['ok' => false, 'message' => 'Upload fehlgeschlagen.'], 400);
        $size = (int)($file['size'] ?? 0);
        if ($size <= 0 || $size > 25 * 1024 * 1024) json_response(['ok' => false, 'message' => 'Dateien dürfen maximal 25 MB groß sein.'], 413);
        $original = trim((string)($file['name'] ?? 'datei'));
        $ext = strtolower(pathinfo($original, PATHINFO_EXTENSION));
        $allowed = ['pdf','doc','docx','xls','xlsx','ppt','pptx','txt','md','rtf','jpg','jpeg','png','webp','zip'];
        if (!in_array($ext, $allowed, true)) json_response(['ok' => false, 'message' => 'Dieser Dateityp ist in der Gründungsablage nicht freigegeben.'], 400);
        ensure_project_files_table();
        $id = uuid_v4();
        $storage = bin2hex(random_bytes(20)) . '.' . $ext;
        $target = UPLOAD_DIR . '/' . $storage;
        if (!move_uploaded_file((string)$file['tmp_name'], $target)) throw new RuntimeException('UPLOAD_MOVE_FAILED');
        @chmod($target, 0640);
        $mime = 'application/octet-stream';
        if (function_exists('finfo_open')) {
            $fi = finfo_open(FILEINFO_MIME_TYPE);
            if ($fi) { $detected = finfo_file($fi, $target); if (is_string($detected) && $detected !== '') $mime = $detected; finfo_close($fi); }
        }
        db()->prepare('INSERT INTO project_files (id, storage_name, original_name, mime, size_bytes, uploaded_by, active) VALUES (?, ?, ?, ?, ?, ?, 1)')
            ->execute([$id, $storage, $original, $mime, $size, (int)$user['id']]);
        json_response(['ok' => true, 'file' => ['id' => $id, 'name' => $original, 'size' => $size, 'mime' => $mime, 'uploadedAt' => gmdate('c'), 'uploadedBy' => $user['name']]], 201);
    }

    if ($action === 'file-download' && $method === 'GET') {
        $user = require_user();
        $portalAccess = portal_access_for_user($user);
        if (!$portalAccess['foundation'] && !$portalAccess['board'] && !$portalAccess['admin']) { http_response_code(403); exit('Keine Berechtigung.'); }
        ensure_project_files_table();
        $id = (string)($_GET['id'] ?? '');
        $stmt = db()->prepare('SELECT storage_name, original_name, mime, size_bytes FROM project_files WHERE id = ? AND active = 1 LIMIT 1');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) { http_response_code(404); exit('Datei nicht gefunden.'); }
        $path = UPLOAD_DIR . '/' . basename((string)$row['storage_name']);
        if (!is_file($path)) { http_response_code(404); exit('Datei nicht gefunden.'); }
        header('Content-Type: ' . (string)$row['mime']);
        header('Content-Length: ' . (string)$row['size_bytes']);
        header('Content-Disposition: attachment; filename="download"; filename*=UTF-8\'\'' . rawurlencode((string)$row['original_name']));
        header('Cache-Control: private, no-store');
        readfile($path);
        exit;
    }

    if ($action === 'file-delete' && $method === 'POST') {
        $user = require_user();
        ensure_project_files_table();
        $input = json_input();
        $id = (string)($input['id'] ?? '');
        $stmt = db()->prepare('SELECT storage_name, uploaded_by FROM project_files WHERE id = ? AND active = 1 LIMIT 1');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) json_response(['ok' => false, 'message' => 'Datei nicht gefunden.'], 404);
        if (($user['role'] ?? '') !== 'admin' && (int)$row['uploaded_by'] !== (int)$user['id']) json_response(['ok' => false, 'message' => 'Du kannst nur eigene Uploads löschen.'], 403);
        db()->prepare('UPDATE project_files SET active = 0 WHERE id = ?')->execute([$id]);
        $path = UPLOAD_DIR . '/' . basename((string)$row['storage_name']);
        if (is_file($path)) @unlink($path);
        json_response(['ok' => true]);
    }

    json_response(['ok' => false, 'message' => 'Unbekannte Anfrage.'], 404);
} catch (PDOException $e) {
    error_log('Kinderverein DB error: ' . $e->getMessage());
    json_response(['ok' => false, 'message' => 'Datenbankfehler. Bitte Administrator informieren.'], 500);
} catch (Throwable $e) {
    error_log('Kinderverein API error: ' . $e->getMessage());
    json_response(['ok' => false, 'message' => 'Serverfehler. Bitte Administrator informieren.'], 500);
}
