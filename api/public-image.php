<?php
declare(strict_types=1);
require __DIR__ . '/lib.php';

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');

function collect_public_image_ids(array $blocks): array {
    $ids = [];
    foreach ($blocks as $block) {
        if (!is_array($block)) continue;
        $id = trim((string)($block['imageId'] ?? ''));
        if ($id !== '') $ids[$id] = true;
    }
    return array_keys($ids);
}

try {
    $id = trim((string)($_GET['id'] ?? ''));
    if ($id === '') { http_response_code(400); exit('Bild-ID fehlt.'); }

    $stmt = db()->prepare('SELECT data FROM project_state WHERE id = ? LIMIT 1');
    $stmt->execute(['kinderverein-main']);
    $row = $stmt->fetch();
    $state = $row && is_string($row['data'] ?? null) ? json_decode((string)$row['data'], true) : [];
    $blocks = is_array($state['settings']['publicBlocks'] ?? null) ? $state['settings']['publicBlocks'] : [];
    if (!in_array($id, collect_public_image_ids($blocks), true)) { http_response_code(403); exit('Bild ist nicht öffentlich freigegeben.'); }

    ensure_project_files_table();
    $q = db()->prepare('SELECT storage_name, original_name, mime, size_bytes FROM project_files WHERE id = ? AND active = 1 LIMIT 1');
    $q->execute([$id]);
    $file = $q->fetch();
    if (!$file) { http_response_code(404); exit('Bild nicht gefunden.'); }
    $mime = (string)$file['mime'];
    if (!str_starts_with($mime, 'image/')) { http_response_code(415); exit('Datei ist kein Bild.'); }
    $path = UPLOAD_DIR . '/' . basename((string)$file['storage_name']);
    if (!is_file($path)) { http_response_code(404); exit('Bild nicht gefunden.'); }

    header('Content-Type: ' . $mime);
    header('Content-Length: ' . (string)$file['size_bytes']);
    header('Content-Disposition: inline; filename="image"; filename*=UTF-8\'\'' . rawurlencode((string)$file['original_name']));
    header('Cache-Control: public, max-age=900');
    readfile($path);
    exit;
} catch (Throwable $e) {
    error_log('WeKiB public image error: ' . $e->getMessage());
    http_response_code(500);
    exit('Bild konnte nicht geladen werden.');
}
