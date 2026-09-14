<?php
declare(strict_types=1);

require __DIR__ . '/lib.php';

header('Referrer-Policy: same-origin');
header('X-Frame-Options: DENY');
header('X-Content-Type-Options: nosniff');
header('Permissions-Policy: geolocation=(), camera=(), microphone=()');

if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'POST') {
    json_response(['ok' => false, 'message' => 'Methode nicht erlaubt.'], 405);
}

if (!is_file(CONFIG_FILE)) {
    json_response(['ok' => false, 'message' => 'Die Plattform ist noch nicht eingerichtet.'], 503);
}

start_secure_session();
$now = time();
$windowStart = (int)($_SESSION['register_window_start'] ?? 0);
$attempts = (int)($_SESSION['register_attempts'] ?? 0);
if ($windowStart === 0 || ($now - $windowStart) > 3600) {
    $windowStart = $now;
    $attempts = 0;
}
if ($attempts >= 5) {
    json_response(['ok' => false, 'message' => 'Zu viele Registrierungsversuche. Bitte später erneut versuchen.'], 429);
}
$_SESSION['register_window_start'] = $windowStart;
$_SESSION['register_attempts'] = $attempts + 1;

$input = json_input();
$name = trim((string)($input['name'] ?? ''));
$email = strtolower(trim((string)($input['email'] ?? '')));
$password = (string)($input['password'] ?? '');
$privacyAccepted = (bool)($input['privacyAccepted'] ?? false);

if ($name === '' || mb_strlen($name) < 2 || mb_strlen($name) > 120) {
    json_response(['ok' => false, 'message' => 'Bitte einen gültigen Namen eingeben.'], 400);
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 190) {
    json_response(['ok' => false, 'message' => 'Bitte eine gültige E-Mail-Adresse eingeben.'], 400);
}
if (strlen($password) < 12) {
    json_response(['ok' => false, 'message' => 'Das Passwort muss mindestens 12 Zeichen lang sein.'], 400);
}
if (!$privacyAccepted) {
    json_response(['ok' => false, 'message' => 'Bitte die Hinweise zur Kontonutzung bestätigen.'], 400);
}

try {
    $hash = password_hash($password, PASSWORD_DEFAULT);
    db()->beginTransaction();
    db()->prepare('INSERT INTO users (email, name, password_hash, role, active, updated_at) VALUES (?, ?, ?, ?, 1, NOW())')
        ->execute([$email, $name, $hash, 'member']);
    $id = (int)db()->lastInsertId();

    $stmt = db()->prepare('SELECT data FROM project_state WHERE id = ? LIMIT 1 FOR UPDATE');
    $stmt->execute(['kinderverein-main']);
    $row = $stmt->fetch();
    if ($row && is_string($row['data'] ?? null)) {
        $state = json_decode((string)$row['data'], true);
        if (is_array($state)) {
            if (!isset($state['profiles']) || !is_array($state['profiles'])) $state['profiles'] = [];
            $exists = false;
            foreach ($state['profiles'] as $profile) {
                if (strtolower((string)($profile['email'] ?? '')) === $email) { $exists = true; break; }
            }
            if (!$exists) {
                $state['profiles'][] = [
                    'email' => $email,
                    'displayName' => $name,
                    'kind' => 'member',
                    'visible' => false,
                    'area' => '',
                    'bio' => '',
                    'permissions' => new stdClass(),
                    'selfRegistered' => true,
                    'registeredAt' => gmdate('c'),
                ];
                $json = json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                if ($json !== false) {
                    db()->prepare('UPDATE project_state SET data = ?, updated_at = NOW(), updated_by = ? WHERE id = ?')
                        ->execute([$json, $id, 'kinderverein-main']);
                }
            }
        }
    }
    db()->commit();

    session_regenerate_id(true);
    $_SESSION['user_id'] = $id;
    $_SESSION['register_attempts'] = 0;
    issue_auth_token($id);

    json_response(['ok' => true, 'session' => ['user' => [
        'id' => $id,
        'email' => $email,
        'name' => $name,
        'role' => 'member',
    ]]], 201);
} catch (PDOException $e) {
    if (db()->inTransaction()) db()->rollBack();
    if ((string)$e->getCode() === '23000') {
        json_response(['ok' => false, 'message' => 'Für diese E-Mail-Adresse existiert bereits ein Konto.'], 409);
    }
    throw $e;
} catch (Throwable $e) {
    if (db()->inTransaction()) db()->rollBack();
    throw $e;
}
