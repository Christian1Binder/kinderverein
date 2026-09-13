<?php
declare(strict_types=1);
require __DIR__ . '/lib.php';
start_secure_session();
$user = session_user();
if (!$user || ($user['role'] ?? '') !== 'admin') {
    http_response_code(403);
    exit('Nur für angemeldete Administratoren.');
}
$pdo = db();
$message = '';
$error = '';
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $token = (string)($_POST['csrf'] ?? '');
    if (!verify_csrf($token)) {
        $error = 'Sicherheitsprüfung fehlgeschlagen.';
    } else {
        $action = (string)($_POST['do'] ?? '');
        try {
            if ($action === 'create') {
                $email = strtolower(trim((string)($_POST['email'] ?? '')));
                $name = trim((string)($_POST['name'] ?? ''));
                $password = (string)($_POST['password'] ?? '');
                $role = in_array($_POST['role'] ?? '', ['admin','member','viewer'], true) ? (string)$_POST['role'] : 'member';
                if (!filter_var($email, FILTER_VALIDATE_EMAIL) || $name === '' || strlen($password) < 12) throw new RuntimeException('Bitte gültige Daten eingeben; Passwort mindestens 12 Zeichen.');
                $stmt = $pdo->prepare('INSERT INTO users (email,name,password_hash,role,active) VALUES (?,?,?,?,1)');
                $stmt->execute([$email,$name,password_hash($password,PASSWORD_DEFAULT),$role]);
                $message = 'Benutzer wurde angelegt.';
            } elseif ($action === 'toggle') {
                $id = (int)($_POST['id'] ?? 0);
                if ($id === (int)$user['id']) throw new RuntimeException('Das eigene Admin-Konto kann hier nicht deaktiviert werden.');
                $pdo->prepare('UPDATE users SET active = IF(active=1,0,1), updated_at=NOW() WHERE id=?')->execute([$id]);
                $message = 'Status wurde geändert.';
            } elseif ($action === 'password') {
                $id = (int)($_POST['id'] ?? 0);
                $password = (string)($_POST['password'] ?? '');
                if (strlen($password) < 12) throw new RuntimeException('Passwort mindestens 12 Zeichen.');
                $pdo->prepare('UPDATE users SET password_hash=?, updated_at=NOW() WHERE id=?')->execute([password_hash($password,PASSWORD_DEFAULT),$id]);
                $message = 'Passwort wurde geändert.';
            }
        } catch (Throwable $e) {
            $error = $e->getMessage();
        }
    }
}
$users = $pdo->query('SELECT id,email,name,role,active,last_login_at FROM users ORDER BY name,email')->fetchAll();
function h2(string $v): string { return htmlspecialchars($v, ENT_QUOTES, 'UTF-8'); }
$csrf = csrf_token();
?>
<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Benutzerverwaltung</title><style>
body{font-family:system-ui,-apple-system,sans-serif;background:#f5f5f8;color:#171729;margin:0}.wrap{max-width:1000px;margin:auto;padding:30px 16px}.card{background:#fff;border:1px solid #e6e6ee;border-radius:20px;padding:22px;margin-bottom:18px}h1{margin:.2em 0}.grid{display:grid;grid-template-columns:2fr 2fr 1.4fr 1fr auto;gap:10px;align-items:end}input,select,button{font:inherit;padding:11px 12px;border-radius:10px;border:1px solid #d9d8e4}button{cursor:pointer;background:#17152e;color:#fff;border:0;font-weight:700}label{display:grid;gap:6px;font-size:.85rem;font-weight:700}.row{display:grid;grid-template-columns:1.3fr 1.6fr .8fr .7fr 1.6fr;gap:10px;padding:12px 0;border-top:1px solid #eee;align-items:center}.muted{color:#777}.ok{color:#27623b}.err{color:#9a2d2d}.inline{display:flex;gap:8px}.inline input{min-width:0}@media(max-width:760px){.grid,.row{grid-template-columns:1fr}.row{padding:18px 0}.inline{flex-wrap:wrap}}
</style></head><body><main class="wrap"><p><a href="../">← Projektzentrale</a></p><div class="card"><small>Administration</small><h1>Benutzer verwalten</h1><p class="muted">Admin = Vollzugriff, Mitarbeiter = lesen & bearbeiten, Lesen = nur ansehen.</p><?php if($message):?><p class="ok"><?=h2($message)?></p><?php endif;?><?php if($error):?><p class="err"><?=h2($error)?></p><?php endif;?>
<form method="post" class="grid"><input type="hidden" name="csrf" value="<?=h2($csrf)?>"><input type="hidden" name="do" value="create"><label>Name<input required name="name"></label><label>E-Mail<input required type="email" name="email"></label><label>Passwort<input required minlength="12" type="password" name="password"></label><label>Rolle<select name="role"><option value="member">Mitarbeiter</option><option value="viewer">Lesen</option><option value="admin">Admin</option></select></label><button>Anlegen</button></form></div>
<div class="card"><h2>Konten</h2><?php foreach($users as $u):?><div class="row"><strong><?=h2($u['name'])?></strong><span><?=h2($u['email'])?></span><span><?=h2($u['role'])?></span><span><?=((int)$u['active']===1?'aktiv':'gesperrt')?></span><div class="inline"><form method="post"><input type="hidden" name="csrf" value="<?=h2($csrf)?>"><input type="hidden" name="do" value="toggle"><input type="hidden" name="id" value="<?=(int)$u['id']?>"><button type="submit"><?=((int)$u['active']===1?'Sperren':'Aktivieren')?></button></form><form method="post" class="inline"><input type="hidden" name="csrf" value="<?=h2($csrf)?>"><input type="hidden" name="do" value="password"><input type="hidden" name="id" value="<?=(int)$u['id']?>"><input required minlength="12" type="password" name="password" placeholder="Neues Passwort"><button type="submit">Setzen</button></form></div></div><?php endforeach;?></div></main></body></html>
