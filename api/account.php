<?php
declare(strict_types=1);

require_once __DIR__ . '/lib.php';

const MAIL_CONFIG_FILE = __DIR__ . '/private/mail.php';

function ensure_account_security_schema(): void {
    static $ready = false;
    if ($ready) return;

    $columns = db()->query("SHOW COLUMNS FROM users LIKE 'email_verified_at'")->fetchAll();
    if (!$columns) {
        db()->exec("ALTER TABLE users ADD COLUMN email_verified_at DATETIME NULL AFTER active");
        // Bestehende, bereits administrativ angelegte Konten gelten bei der Migration als bestätigt.
        db()->exec("UPDATE users SET email_verified_at = NOW() WHERE email_verified_at IS NULL");
    }

    db()->exec("CREATE TABLE IF NOT EXISTS account_tokens (
        token_hash CHAR(64) NOT NULL PRIMARY KEY,
        user_id BIGINT UNSIGNED NOT NULL,
        purpose VARCHAR(32) NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_account_tokens_user (user_id),
        INDEX idx_account_tokens_purpose (purpose),
        INDEX idx_account_tokens_expires (expires_at)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

    db()->exec('DELETE FROM account_tokens WHERE expires_at <= NOW()');
    $ready = true;
}

function mail_config(): array {
    if (!is_file(MAIL_CONFIG_FILE)) throw new RuntimeException('MAIL_NOT_CONFIGURED');
    $config = require MAIL_CONFIG_FILE;
    if (!is_array($config)) throw new RuntimeException('MAIL_NOT_CONFIGURED');
    return $config;
}

function app_public_url(): string {
    $scheme = is_https() ? 'https' : 'http';
    $host = (string)($_SERVER['HTTP_HOST'] ?? 'localhost');
    $script = str_replace('\\', '/', (string)($_SERVER['SCRIPT_NAME'] ?? '/api/index.php'));
    $base = preg_replace('~/api/[^/]+$~', '/', $script) ?: '/';
    return $scheme . '://' . $host . rtrim($base, '/');
}

function account_token_create(int $userId, string $purpose, int $hours): string {
    ensure_account_security_schema();
    db()->prepare('DELETE FROM account_tokens WHERE user_id = ? AND purpose = ?')->execute([$userId, $purpose]);
    $token = bin2hex(random_bytes(32));
    $hash = hash('sha256', $token);
    db()->prepare('INSERT INTO account_tokens (token_hash, user_id, purpose, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))')
        ->execute([$hash, $userId, $purpose, $hours]);
    return $token;
}

function account_token_user(string $token, string $purpose): ?array {
    ensure_account_security_schema();
    if (!preg_match('/^[a-f0-9]{64}$/', $token)) return null;
    $stmt = db()->prepare('SELECT u.id, u.email, u.name, u.role, u.active, u.email_verified_at '
        . 'FROM account_tokens t JOIN users u ON u.id = t.user_id '
        . 'WHERE t.token_hash = ? AND t.purpose = ? AND t.expires_at > NOW() LIMIT 1');
    $stmt->execute([hash('sha256', $token), $purpose]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function account_token_consume(string $token, string $purpose): void {
    db()->prepare('DELETE FROM account_tokens WHERE token_hash = ? AND purpose = ?')
        ->execute([hash('sha256', $token), $purpose]);
}

function smtp_read($socket): string {
    $response = '';
    while (($line = fgets($socket, 2048)) !== false) {
        $response .= $line;
        if (strlen($line) < 4 || $line[3] !== '-') break;
    }
    return $response;
}

function smtp_expect($socket, array $codes): string {
    $response = smtp_read($socket);
    $code = (int)substr($response, 0, 3);
    if (!in_array($code, $codes, true)) throw new RuntimeException('SMTP_ERROR_' . $code . ': ' . trim($response));
    return $response;
}

function smtp_write($socket, string $line, array $codes): void {
    fwrite($socket, $line . "\r\n");
    smtp_expect($socket, $codes);
}

function send_portal_mail(string $to, string $subject, string $text): void {
    $config = mail_config();
    $host = (string)($config['host'] ?? 'smtp.strato.de');
    $port = (int)($config['port'] ?? 465);
    $user = (string)($config['user'] ?? '');
    $password = (string)($config['password'] ?? '');
    $from = (string)($config['from'] ?? $user);
    $fromName = (string)($config['from_name'] ?? 'WeKiB');
    if ($user === '' || $password === '' || !filter_var($from, FILTER_VALIDATE_EMAIL)) throw new RuntimeException('MAIL_NOT_CONFIGURED');

    $errno = 0; $errstr = '';
    $socket = @stream_socket_client('ssl://' . $host . ':' . $port, $errno, $errstr, 15, STREAM_CLIENT_CONNECT);
    if (!$socket) throw new RuntimeException('SMTP_CONNECT_FAILED: ' . $errstr);
    stream_set_timeout($socket, 15);

    try {
        smtp_expect($socket, [220]);
        smtp_write($socket, 'EHLO ' . ($_SERVER['SERVER_NAME'] ?? 'wekib.local'), [250]);
        smtp_write($socket, 'AUTH LOGIN', [334]);
        smtp_write($socket, base64_encode($user), [334]);
        smtp_write($socket, base64_encode($password), [235]);
        smtp_write($socket, 'MAIL FROM:<' . $from . '>', [250]);
        smtp_write($socket, 'RCPT TO:<' . $to . '>', [250, 251]);
        smtp_write($socket, 'DATA', [354]);

        $safeSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
        $safeName = '=?UTF-8?B?' . base64_encode($fromName) . '?=';
        $body = str_replace(["\r\n", "\r"], "\n", $text);
        $body = preg_replace('/^\./m', '..', $body) ?? $body;
        $headers = [
            'From: ' . $safeName . ' <' . $from . '>',
            'To: <' . $to . '>',
            'Subject: ' . $safeSubject,
            'Date: ' . date(DATE_RFC2822),
            'Message-ID: <' . bin2hex(random_bytes(12)) . '@' . ($_SERVER['SERVER_NAME'] ?? 'wekib.local') . '>',
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: 8bit',
        ];
        fwrite($socket, implode("\r\n", $headers) . "\r\n\r\n" . str_replace("\n", "\r\n", $body) . "\r\n.\r\n");
        smtp_expect($socket, [250]);
        @fwrite($socket, "QUIT\r\n");
    } finally {
        fclose($socket);
    }
}

function send_verification_mail(int $userId, string $email, string $name): void {
    $token = account_token_create($userId, 'verify', 24);
    $link = app_public_url() . '/api/verify.php?token=' . rawurlencode($token);
    $text = "Hallo {$name},\n\nbitte bestätige deine E-Mail-Adresse für das WeKiB-Portal:\n\n{$link}\n\nDer Link ist 24 Stunden gültig.\n\nViele Grüße\nWeKiB";
    send_portal_mail($email, 'E-Mail-Adresse für WeKiB bestätigen', $text);
}

function send_password_reset_mail(int $userId, string $email, string $name): void {
    $token = account_token_create($userId, 'reset', 2);
    $link = app_public_url() . '/api/reset.php?token=' . rawurlencode($token);
    $text = "Hallo {$name},\n\nüber diesen Link kannst du ein neues Passwort für dein WeKiB-Konto vergeben:\n\n{$link}\n\nDer Link ist 2 Stunden gültig. Wenn du die Änderung nicht angefordert hast, kannst du diese E-Mail ignorieren.\n\nViele Grüße\nWeKiB";
    send_portal_mail($email, 'WeKiB-Passwort zurücksetzen', $text);
}
