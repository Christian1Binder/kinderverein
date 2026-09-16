<?php
declare(strict_types=1);

require __DIR__ . '/access.php';

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');

try {
    $user = require_user();
    ensure_project_files_table();

    $id = trim((string)($_GET['id'] ?? ''));
    if ($id === '') {
        http_response_code(400);
        exit('Bild-ID fehlt.');
    }
    if (!portal_can_access_file($user, $id)) {
        http_response_code(403);
        exit('Keine Berechtigung.');
    }

    $stmt = db()->prepare('SELECT storage_name, original_name, mime, size_bytes FROM project_files WHERE id = ? AND active = 1 LIMIT 1');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) {
        http_response_code(404);
        exit('Bild nicht gefunden.');
    }

    $mime = (string)$row['mime'];
    if (!str_starts_with($mime, 'image/')) {
        http_response_code(415);
        exit('Datei ist kein Bild.');
    }

    $path = UPLOAD_DIR . '/' . basename((string)$row['storage_name']);
    if (!is_file($path)) {
        http_response_code(404);
        exit('Bild nicht gefunden.');
    }

    header('Content-Type: ' . $mime);
    header('Content-Length: ' . (string)$row['size_bytes']);
    header('Content-Disposition: inline; filename="image"; filename*=UTF-8\'\'' . rawurlencode((string)$row['original_name']));
    header('Cache-Control: private, max-age=3600');
    readfile($path);
    exit;
} catch (Throwable $e) {
    error_log('WeKiB image error: ' . $e->getMessage());
    http_response_code(500);
    exit('Bild konnte nicht geladen werden.');
}
