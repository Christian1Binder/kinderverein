from pathlib import Path
import json
import re

ROOT = Path('.')

def write(path, content):
    p = ROOT / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding='utf-8')


def replace(path, old, new, required=True):
    p = ROOT / path
    s = p.read_text(encoding='utf-8')
    if old not in s:
        if required:
            raise SystemExit(f'Pattern not found in {path}: {old[:80]}')
        return
    p.write_text(s.replace(old, new, 1), encoding='utf-8')


def unlink(path):
    p = ROOT / path
    if p.exists():
        p.unlink()

# ---------------------------------------------------------------------------
# Repository cleanup: remove one-off migrations, legacy Pages/Supabase files.
# ---------------------------------------------------------------------------
for path in [
    '.github/workflows/apply-permissions-uploads-word.yml',
    '.github/workflows/apply-portal-levels.yml',
    '.github/workflows/apply-portal-v4.yml',
    '.github/workflows/patch-admin-backend.yml',
    '.github/workflows/patch-document-hub.yml',
    '.github/workflows/patch-email-auth.yml',
    '.github/workflows/patch-finalized-documents.yml',
    '.github/workflows/patch-portal-levels-v2.yml',
    '.github/workflows/patch-portal-levels.yml',
    '.github/workflows/deploy-pages.yml',
    'scripts/apply-file-explorer.py',
    'scripts/apply-member-portal-ux.py',
    'scripts/apply-permissions-uploads-word.py',
    'scripts/apply-portal-v4.py',
    'scripts/apply-preview-poll-admin.py',
    'scripts/apply-scanner-and-fixes.py',
    'scripts/apply_portal_levels.py',
    'scripts/patch-document-hub.py',
    'scripts/restore-source.mjs',
    '.deploy/portal-levels-trigger.txt',
    '.nojekyll',
    'index.source.html',
    'src/App.jsx',
    'supabase/schema.sql',
    'assets/index-ChwrJET4.js',
    'assets/index-Cp9Ww6mO.css',
]:
    unlink(path)

# ---------------------------------------------------------------------------
# Single Vite entry + clean build pipeline.
# ---------------------------------------------------------------------------
write('index.html', '''<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#010219" />
    <meta name="description" content="WeKiB – gemeinnütziger Bildungsträger in Gründung für Betreuung, Ganztag, Bildung und Jugendhilfe." />
    <meta name="color-scheme" content="light dark" />
    <title>WeKiB · Bildung und Betreuung</title>
    <style>
      body[data-app-env="lab"]::after{content:"LAB · TESTUMGEBUNG";position:fixed;right:14px;bottom:14px;z-index:99999;padding:7px 11px;border-radius:999px;background:#010219;color:#fff;font:700 10px/1 Inter,system-ui,sans-serif;letter-spacing:.08em;box-shadow:0 10px 30px rgba(1,2,25,.22);pointer-events:none}
    </style>
  </head>
  <body data-app-env="%VITE_APP_ENV%">
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
''')

write('scripts/build-strato.mjs', '''import { cp, mkdir, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'

const root = new URL('..', import.meta.url)
await rm(new URL('../dist-strato/', import.meta.url), { recursive: true, force: true })

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const build = spawnSync(command, ['vite', 'build', '--mode', 'strato', '--base=./', '--outDir', 'dist-strato'], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_BACKEND_MODE: 'php',
    VITE_API_URL: './api/index.php',
  },
})

if (build.status !== 0) process.exit(build.status || 1)
await mkdir(new URL('../dist-strato/api/', import.meta.url), { recursive: true })
await cp(new URL('../api/', import.meta.url), new URL('../dist-strato/api/', import.meta.url), { recursive: true })
''')

pkg_path = ROOT / 'package.json'
pkg = json.loads(pkg_path.read_text(encoding='utf-8'))
pkg['scripts'] = {
    'dev': 'vite',
    'build': 'vite build',
    'build:strato': 'node scripts/build-strato.mjs',
    'preview': 'vite preview',
}
pkg_path.write_text(json.dumps(pkg, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

write('vite.config.js', '''import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/',
})
''')

write('.env.example', '''# Lokal läuft WeKiB standardmäßig im Demo-/Local-Storage-Modus.
# Der STRATO-Build setzt VITE_BACKEND_MODE=php und VITE_API_URL automatisch.
# Für lokale Tests des PHP-Backends können die Werte bei Bedarf gesetzt werden:
# VITE_BACKEND_MODE=php
# VITE_API_URL=http://localhost/api/index.php
''')

write('.gitignore', '''node_modules
dist
dist-strato
.env
.env.local
.DS_Store
api/private/config.php
api/private/mail.php
api/private/uploads/
''')

write('src/main.jsx', '''import React from 'react'
import ReactDOM from 'react-dom/client'
import PortalRoot from './PortalRoot.jsx'
import './v2.css'
import './production.css'
import './portal-v4.css'
import './file-explorer.css'
import './document-scanner.css'
import './preview-polls.css'
import './airportr-theme.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PortalRoot />
  </React.StrictMode>,
)
''')

# ---------------------------------------------------------------------------
# Public portal cleanup + navigation fixes.
# ---------------------------------------------------------------------------
p = ROOT / 'src/PortalRoot.jsx'
s = p.read_text(encoding='utf-8')
s = re.sub(
    r"import \{\n  ArrowRight, BookOpen, Building2, CheckCircle2, ChevronRight, GraduationCap,\n  LockKeyhole, Menu, Moon, ShieldCheck, Sparkles, Sun, UserPlus, Users, X,\n\} from 'lucide-react'",
    "import { ArrowRight, Menu, Moon, ShieldCheck, Sun, X } from 'lucide-react'",
    s,
)
s = s.replace("      setAuthUrl('')\n      setAuthUrl('')\n      onAuthenticated(session)", "      setAuthUrl('')\n      onAuthenticated(session)")
s = s.replace("onClick={() => { setMode('login'); setMessage('') }}", "onClick={() => { setMode('login'); setMessage(''); setAuthUrl('login') }}")
s = s.replace("onClick={() => { setMode('register'); setMessage('') }}", "onClick={() => { setMode('register'); setMessage(''); setAuthUrl('register') }}")
s = re.sub(r"\nfunction Offer\([\s\S]*?\nfunction Level\([\s\S]*?\n}\s*$", "\n", s)
p.write_text(s, encoding='utf-8')

# ---------------------------------------------------------------------------
# CMS blocks: real anchors for public navigation, editable from the CMS.
# ---------------------------------------------------------------------------
write('src/PortalBlocks.jsx', '''import { ArrowRight, Download, Image as ImageIcon, Info, Quote, Sparkles } from 'lucide-react'
import { projectImageUrl, publicImageUrl } from './lib/projectStore.js'

export const DEFAULT_PUBLIC_BLOCKS = [
  { id: 'pub-hero', anchor: 'start', type: 'hero', audience: 'public', eyebrow: 'WEKIB · IN GRÜNDUNG', title: 'Gute Betreuung schafft Freiraum.', text: 'Wir bauen einen gemeinnützigen Bildungsträger auf, der Kinder und Jugendliche verlässlich begleitet, Entwicklung ermöglicht und Schule mit starken Betreuungsangeboten ergänzt.', buttonLabel: 'WeKiB kennenlernen', buttonHref: '#ueber-uns' },
  { id: 'pub-intro', anchor: 'ueber-uns', type: 'text', audience: 'public', eyebrow: 'ÜBER UNS', title: 'Ein Träger, der Betreuung als Bildungsraum versteht.', text: 'WeKiB entsteht aus der Praxis heraus. Unser Ziel ist ein professioneller, verlässlicher und moderner Träger für schulische Betreuung, Ganztagsangebote, Ferienangebote und weitere Bildungs- und Jugendhilfeformate.' },
  { id: 'pub-cards', anchor: 'angebote', type: 'cards', audience: 'public', eyebrow: 'ANGEBOTE', title: 'Was wir aufbauen', cards: [
    { title: 'Ganztag & Betreuung', text: 'Offene Ganztagsangebote, Mittags- und Nachmittagsbetreuung mit klaren pädagogischen Strukturen.' },
    { title: 'Bildung & Entwicklung', text: 'Angebote, die Selbstständigkeit, Gemeinschaft, Beteiligung und individuelle Entwicklung fördern.' },
    { title: 'Ferien & Projekte', text: 'Ferienbetreuung, Workshops und ergänzende Bildungsangebote für Kinder und Jugendliche.' },
  ]},
  { id: 'pub-stats', anchor: 'gruendung', type: 'stats', audience: 'public', items: [{ value: '100%', label: 'pädagogischer Anspruch' }, { value: 'offen', label: 'für mehrere Standorte' }, { value: 'gemeinsam', label: 'mit Schulen & Kommunen' }] },
  { id: 'pub-cta', anchor: 'kontakt', type: 'cta', audience: 'public', title: 'Ein Konto öffnet den erweiterten WeKiB-Bereich.', text: 'Registrierte Nutzer erhalten zunächst einen Lesebereich mit allgemeinen Informationen. Interne Arbeitsbereiche werden ausschließlich durch Administratoren freigeschaltet.', buttonLabel: 'Konto erstellen', action: 'register' },
]

export const DEFAULT_MEMBER_BLOCKS = [
  { id: 'member-welcome', type: 'hero', audience: 'member', eyebrow: 'MEIN WEKIB', title: 'Willkommen im erweiterten WeKiB-Bereich.', text: 'Hier stellen wir registrierten Nutzerinnen und Nutzern zusätzliche Informationen bereit. Dieser Bereich ist grundsätzlich lesend; Arbeitsbereiche erscheinen erst nach ausdrücklicher Freigabe.' },
  { id: 'member-notice', type: 'notice', audience: 'member', title: 'Dein Zugang ist ein Lesezugang', text: 'Du kannst allgemeine Inhalte ansehen. Gründungsunterlagen, Vorstandsunterlagen, CMS und Administration bleiben geschützt.' },
  { id: 'member-faq', type: 'faq', audience: 'member', title: 'Häufige Fragen', items: [{ q: 'Wie bekomme ich Zugang zur Gründung?', a: 'Ein Administrator ordnet dein Konto der Gründung zu und vergibt die benötigten Rechte.' }, { q: 'Kann ich Inhalte verändern?', a: 'Nicht mit dem normalen Basiszugang. Bearbeitungsrechte werden separat vergeben.' }] },
]

const DEFAULT_ANCHORS = {
  'pub-hero': 'start', 'pub-intro': 'ueber-uns', 'pub-cards': 'angebote', 'pub-stats': 'gruendung', 'pub-cta': 'kontakt',
}

export function PortalBlocks({ blocks = [], mode = 'public', onAction }) {
  if (!blocks?.length) return null
  return <div className={`portal-blocks portal-blocks-${mode}`}>{blocks.map((block) => <PortalBlock key={block.id} block={block} mode={mode} onAction={onAction} />)}</div>
}

function imageUrl(block, mode) {
  if (!block?.imageId) return ''
  return mode === 'public' ? publicImageUrl(block.imageId) : projectImageUrl(block.imageId)
}

function sectionId(block, mode) {
  if (mode !== 'public') return block.anchor || undefined
  return block.anchor || DEFAULT_ANCHORS[block.id] || undefined
}

function PortalBlock({ block, mode, onAction }) {
  const id = sectionId(block, mode)
  if (block.type === 'hero') return <section className="pb-section pb-hero" id={id}><div className="pb-copy">{block.eyebrow && <span className="pb-eyebrow"><Sparkles size={14} />{block.eyebrow}</span>}<h1>{block.title}</h1>{block.text && <p>{block.text}</p>}{(block.buttonLabel || block.action) && <PortalButton block={block} onAction={onAction} />}</div>{block.imageId ? <img className="pb-hero-image" src={imageUrl(block, mode)} alt={block.imageAlt || ''} /> : <div className="pb-hero-art"><span>W</span></div>}</section>
  if (block.type === 'text') return <section className="pb-section pb-text" id={id}><div>{block.eyebrow && <span className="pb-eyebrow">{block.eyebrow}</span>}<h2>{block.title}</h2></div><div><p>{block.text}</p></div></section>
  if (block.type === 'image') return <section className="pb-section pb-image" id={id}>{block.imageId ? <img src={imageUrl(block, mode)} alt={block.imageAlt || block.title || ''} /> : <div className="pb-image-placeholder"><ImageIcon size={30} /></div>}<div>{block.eyebrow && <span className="pb-eyebrow">{block.eyebrow}</span>}<h2>{block.title}</h2><p>{block.text}</p></div></section>
  if (block.type === 'cards') return <section className="pb-section pb-stack" id={id}><div className="pb-heading">{block.eyebrow && <span className="pb-eyebrow">{block.eyebrow}</span>}<h2>{block.title}</h2>{block.text && <p>{block.text}</p>}</div><div className="pb-card-grid">{(block.cards || []).map((card, i) => <article key={`${block.id}-${i}`}><span>{String(i + 1).padStart(2, '0')}</span><h3>{card.title}</h3><p>{card.text}</p></article>)}</div></section>
  if (block.type === 'stats') return <section className="pb-section pb-stats" id={id}>{(block.items || []).map((item, i) => <div key={`${block.id}-${i}`}><strong>{item.value}</strong><span>{item.label}</span></div>)}</section>
  if (block.type === 'notice') return <section className="pb-section pb-notice" id={id}><Info size={22} /><div><h3>{block.title}</h3><p>{block.text}</p></div></section>
  if (block.type === 'quote') return <section className="pb-section pb-quote" id={id}><Quote size={30} /><blockquote>{block.text}</blockquote>{block.caption && <span>{block.caption}</span>}</section>
  if (block.type === 'faq') return <section className="pb-section pb-stack" id={id}><div className="pb-heading"><h2>{block.title || 'Häufige Fragen'}</h2></div><div className="pb-faq">{(block.items || []).map((item, i) => <details key={`${block.id}-${i}`}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div></section>
  if (block.type === 'links') return <section className="pb-section pb-stack" id={id}><div className="pb-heading"><h2>{block.title}</h2></div><div className="pb-links">{(block.items || []).map((item, i) => <a key={`${block.id}-${i}`} href={item.href || '#'} target={item.external ? '_blank' : undefined} rel={item.external ? 'noreferrer' : undefined}><span><strong>{item.label}</strong>{item.text && <small>{item.text}</small>}</span><ArrowRight size={17} /></a>)}</div></section>
  if (block.type === 'cta') return <section className="pb-section pb-cta" id={id}><div><h2>{block.title}</h2><p>{block.text}</p></div><PortalButton block={block} onAction={onAction} /></section>
  if (block.type === 'spacer') return <div className={`pb-spacer ${block.size || 'medium'}`} id={id} />
  return null
}

function PortalButton({ block, onAction }) {
  if (block.action) return <button className="portal-primary" onClick={() => onAction?.(block.action)}>{block.buttonLabel || 'Weiter'} <ArrowRight size={16} /></button>
  if (block.buttonHref) return <a className="portal-primary" href={block.buttonHref}>{block.buttonLabel || 'Weiter'} <ArrowRight size={16} /></a>
  if (block.downloadHref) return <a className="portal-primary" href={block.downloadHref}><Download size={16} /> {block.buttonLabel || 'Herunterladen'}</a>
  return null
}
''')

p = ROOT / 'src/PortalCms.jsx'
s = p.read_text(encoding='utf-8')
s = s.replace("const base = { id: uid(), type, audience }", "const base = { id: uid(), type, audience, anchor: '' }")
needle = "  return <>\n    {common &&"
if needle in s:
    s = s.replace(needle, "  return <>\n    {block.audience === 'public' && <label>Sprungmarke / URL-Anker<input value={block.anchor || ''} onChange={(e)=>onChange({anchor:e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-|-$/g,'')})} placeholder=\"z. B. angebote\" /></label>}\n    {common &&", 1)
p.write_text(s, encoding='utf-8')

# ---------------------------------------------------------------------------
# App cleanup and naming consistency.
# ---------------------------------------------------------------------------
p = ROOT / 'src/AppV2.jsx'
s = p.read_text(encoding='utf-8')
s = re.sub(r"(import Link from '@tiptap/extension-link'\n)(?:\s*\n){2,}", r"\1\n", s, count=1)
s = s.replace('<div><strong>{project.settings.brandName || \'WeKiB\'}</strong><span>Gründungsplattform</span></div>', '<div><strong>{project.settings.brandName || \'WeKiB\'}</strong><span>Portal · Gründung & Verein</span></div>')
s = s.replace('<p className="eyebrow">WEKIB · GRÜNDUNG</p>', '<p className="eyebrow">WEKIB · PORTAL</p>')
s = s.replace('Gemeinsam gestalten.<br />Sauber gründen.', 'Gemeinsam organisieren.<br />Verlässlich handeln.')
s = s.replace('Die interne Arbeitsplattform für Gründungsmitglieder, Dokumente, Entscheidungen und den gemeinsamen Fahrplan.', 'Der geschützte Arbeitsbereich für Gründung, Vorstand, Dokumente, Entscheidungen und Vereinsorganisation.')
s = re.sub(r'\n{4,}', '\n\n', s)
p.write_text(s, encoding='utf-8')

p = ROOT / 'src/data/seed.js'
s = p.read_text(encoding='utf-8')
s = s.replace("projectName: 'Kinderverein · Gründung e.V.'", "projectName: 'WeKiB e.V. · Gründung'")
s = s.replace("subtitle: 'Projektzentrale für Aufbau, Gemeinnützigkeit und Trägerfähigkeit'", "subtitle: 'Portal für Gründung, Vereinsorganisation und Trägerfähigkeit'")
p.write_text(s, encoding='utf-8')

# ---------------------------------------------------------------------------
# Backend cleanup + image authorization hardening.
# ---------------------------------------------------------------------------
p = ROOT / 'api/access.php'
s = p.read_text(encoding='utf-8')
s = s.replace("'cms_manage','finance_manage','finance_manage'", "'cms_manage','finance_manage'")
s = s.replace("""    $permissions = portal_permissions_for_state($state, $user);
    if (!$access['board'] || empty($permissions['finance_manage'])) $state['finance'] = ['transactions'=>[], 'budgets'=>[], 'files'=>[], 'accounts'=>[]];

    $permissions = portal_permissions_for_state($state, $user);
    if (!$access['board'] || empty($permissions['finance_manage'])) $state['finance'] = ['transactions'=>[], 'budgets'=>[], 'files'=>[], 'accounts'=>[]];
""", """    $permissions = portal_permissions_for_state($state, $user);
    if (!$access['board'] || empty($permissions['finance_manage'])) $state['finance'] = ['transactions'=>[], 'budgets'=>[], 'files'=>[], 'accounts'=>[]];
""")
old = """function portal_file_scope(array $state, string $id): string {
    foreach (($state['files'] ?? []) as $file) {
        if (is_array($file) && (string)($file['id'] ?? '') === $id) return (string)($file['scope'] ?? 'foundation');
    }
    return 'foundation';
}
"""
new = """function portal_file_scope(array $state, string $id): string {
    foreach (($state['files'] ?? []) as $file) {
        if (is_array($file) && (string)($file['id'] ?? '') === $id) return (string)($file['scope'] ?? 'foundation');
    }
    foreach (($state['settings']['publicBlocks'] ?? []) as $block) {
        if (is_array($block) && (string)($block['imageId'] ?? '') === $id) return 'public-cms';
    }
    foreach (($state['settings']['memberBlocks'] ?? []) as $block) {
        if (is_array($block) && (string)($block['imageId'] ?? '') === $id) return 'member-cms';
    }
    foreach (($state['polls'] ?? []) as $poll) {
        if (!is_array($poll)) continue;
        foreach (($poll['options'] ?? []) as $option) {
            if (!is_array($option) || (string)($option['imageId'] ?? '') !== $id) continue;
            $scope = (string)($poll['scope'] ?? 'foundation');
            if ($scope === 'member') return 'member-cms';
            if ($scope === 'board') return 'board';
            return 'foundation';
        }
    }
    return 'foundation';
}
"""
if old not in s:
    raise SystemExit('portal_file_scope block not found')
s = s.replace(old, new, 1)
p.write_text(s, encoding='utf-8')

write('api/image.php', '''<?php
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
    header('Content-Disposition: inline; filename="image"; filename*=UTF-8\\'\\'' . rawurlencode((string)$row['original_name']));
    header('Cache-Control: private, max-age=3600');
    readfile($path);
    exit;
} catch (Throwable $e) {
    error_log('WeKiB image error: ' . $e->getMessage());
    http_response_code(500);
    exit('Bild konnte nicht geladen werden.');
}
''')

p = ROOT / 'api/lib.php'
s = p.read_text(encoding='utf-8')
s = s.replace("""    $expires = time() + AUTH_LIFETIME;
    $expiresSql = gmdate('Y-m-d H:i:s', $expires);
    db()->prepare('INSERT INTO auth_sessions (token_hash, user_id, expires_at, last_used_at) VALUES (?, ?, ?, NOW())')
        ->execute([$hash, $userId, $expiresSql]);
""", """    $expires = time() + AUTH_LIFETIME;
    db()->prepare('INSERT INTO auth_sessions (token_hash, user_id, expires_at, last_used_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 12 HOUR), NOW())')
        ->execute([$hash, $userId]);
""")
p.write_text(s, encoding='utf-8')

# ---------------------------------------------------------------------------
# Final visual layer inspired by the referenced Airportr redesign.
# ---------------------------------------------------------------------------
write('src/airportr-theme.css', r'''/* WeKiB design system — inspired by Airportr's airy lavender/navy visual language. */
:root{
  --bg:#efeff7;--surface:#fff;--surface-2:#f8f8fc;--surface-3:#e9e8f3;--text:#010219;--muted:#74748f;
  --line:#dfdeeb;--line-strong:#cbc9dc;--purple:#5957d8;--purple-2:#706cf1;--purple-soft:#e8e6fa;--purple-deep:#091a55;
  --accent:#5957d8;--border:#dfdeeb;--card:#fff;--input:#fafafe;--shadow:0 24px 70px rgba(9,26,85,.10);
  --radius:22px;--radius-sm:14px;--portal-bg:#edebf5;--portal-surface:#fff;--portal-text:#010219;--portal-muted:#74748f;
  --portal-line:#dedce9;--portal-purple:#5957d8;--portal-purple-deep:#091a55;--portal-purple-soft:#dedbf2;
}
html[data-theme="dark"]{
  --bg:#080a18;--surface:#111427;--surface-2:#171a31;--surface-3:#20243f;--text:#f5f4fb;--muted:#aaa8bf;
  --line:#292d4a;--line-strong:#3a3f63;--purple:#8985ff;--purple-2:#a09cff;--purple-soft:#292b50;--purple-deep:#cbd2ff;
  --accent:#8985ff;--border:#292d4a;--card:#111427;--input:#171a31;--shadow:0 24px 80px rgba(0,0,0,.35);
  --portal-bg:#080a18;--portal-surface:#111427;--portal-text:#f5f4fb;--portal-muted:#aaa8bf;--portal-line:#292d4a;
  --portal-purple:#8985ff;--portal-purple-deep:#d9ddff;--portal-purple-soft:#20243f;
}
html{scroll-behavior:smooth}body{background:radial-gradient(circle at 82% 7%,rgba(89,87,216,.10),transparent 28%),var(--bg)}
::selection{background:color-mix(in srgb,var(--purple) 25%,transparent)}
button,a,input,textarea,select{transition:border-color .18s ease,background .18s ease,color .18s ease,box-shadow .18s ease,transform .18s ease}
.primary-btn,.portal-primary{border-radius:999px!important;background:linear-gradient(135deg,var(--purple),var(--purple-2))!important;box-shadow:0 10px 26px rgba(89,87,216,.22)!important;padding:11px 17px!important}
.primary-btn:hover,.portal-primary:hover{transform:translateY(-1px);box-shadow:0 14px 32px rgba(89,87,216,.28)!important}
.secondary-btn,.portal-secondary{border-radius:999px!important;background:color-mix(in srgb,var(--surface) 90%,transparent)!important;border-color:var(--line)!important}
.icon-btn{border-radius:12px!important}.page-header h1{font-size:clamp(32px,4vw,48px);letter-spacing:-.055em}.page-header>div>p:not(.eyebrow){font-size:14px;line-height:1.65}.eyebrow{color:var(--purple)!important}
.card,.metric-card,.poll-card,.profile-card,.task-card,.file-browser,.folder-list,.editor-shell,.kanban-column,.admin-user,.finance-metric,.cms-block-card,.cms-palette{border-radius:20px!important;border-color:var(--line)!important;box-shadow:0 9px 34px rgba(9,26,85,.045)}
input,textarea,select,.quick-add input,.form-row input,.form-grid input,.form-grid textarea,.account-form input,.account-form select,.profile-form input,.profile-form textarea,.comment-form input,.comments input{border-radius:13px!important;background:var(--input)!important}

/* Public website */
.public-site{background:radial-gradient(circle at 76% 12%,rgba(65,81,179,.18),transparent 23%),linear-gradient(180deg,#edebf5 0%,#f7f7fb 56%,#edebf5 100%);color:#010219}
html[data-theme="dark"] .public-site{background:radial-gradient(circle at 76% 12%,rgba(89,87,216,.18),transparent 25%),var(--portal-bg);color:var(--portal-text)}
.public-header{height:84px;margin:0;padding:0 clamp(20px,5vw,72px);background:rgba(1,2,25,.96)!important;border:0!important;color:#fff;box-shadow:0 12px 42px rgba(1,2,25,.16)}
.public-brand{color:#fff!important}.public-brand>span{width:42px;height:42px;border-radius:13px;background:linear-gradient(145deg,#7772ef,#4d4bbb);box-shadow:0 12px 28px rgba(89,87,216,.35)}
.public-brand small{color:#a9aac3!important}.public-nav{gap:8px}.public-nav a{color:#b8b9ce!important;padding:9px 13px;border-radius:999px}.public-nav a:hover{background:rgba(255,255,255,.08);color:#fff!important}.portal-login-link{color:#fff!important;padding:10px 13px;border-radius:999px}.public-header .icon-btn{background:rgba(255,255,255,.06)!important;border-color:rgba(255,255,255,.10)!important;color:#fff!important}
.portal-blocks-public{padding:24px 0 70px}.portal-blocks-public .pb-section{max-width:1360px}.portal-blocks-public .pb-hero{position:relative;isolation:isolate;min-height:650px;margin:0 auto;padding:clamp(48px,7vw,94px);border-radius:36px;overflow:hidden;background:radial-gradient(circle at 78% 28%,rgba(65,81,179,.26),transparent 28%),linear-gradient(135deg,#f8f7fd 0%,#dddaf0 100%);box-shadow:0 34px 90px rgba(9,26,85,.10)}
.portal-blocks-public .pb-hero:before{content:"";position:absolute;z-index:-1;width:430px;height:430px;border:1px solid rgba(9,26,85,.12);border-radius:45% 55% 58% 42%;right:-80px;top:-110px;transform:rotate(22deg)}
.portal-blocks-public .pb-hero:after{content:"";position:absolute;z-index:-1;width:170px;height:170px;border-radius:50%;right:28%;bottom:-70px;background:linear-gradient(145deg,#4151b3,#b2a9cf);filter:blur(2px);opacity:.45}
.portal-blocks-public .pb-copy h1{font-size:clamp(54px,7.5vw,112px);line-height:.9;letter-spacing:-.07em;max-width:880px;color:#010219}.portal-blocks-public .pb-copy p{font-size:clamp(17px,1.6vw,21px);color:#5f607b;max-width:690px}.portal-blocks-public .pb-eyebrow{color:#4151b3}.portal-blocks-public .pb-hero-art{position:relative;border:0;border-radius:34px;overflow:hidden;background:linear-gradient(145deg,#091a55,#4151b3 58%,#b2a9cf);box-shadow:0 32px 70px rgba(9,26,85,.24);transform:rotate(2deg)}
.portal-blocks-public .pb-hero-art:before,.portal-blocks-public .pb-hero-art:after{content:"";position:absolute;border-radius:50%;border:1px solid rgba(255,255,255,.28)}.portal-blocks-public .pb-hero-art:before{inset:11%}.portal-blocks-public .pb-hero-art:after{inset:26%;background:rgba(255,255,255,.08)}.portal-blocks-public .pb-hero-art span{z-index:1;color:#fff;text-shadow:0 18px 44px rgba(0,0,0,.22)}
.portal-blocks-public .pb-section:not(.pb-hero){padding-top:100px;padding-bottom:100px}.portal-blocks-public .pb-heading h2,.portal-blocks-public .pb-text h2,.portal-blocks-public .pb-image h2,.portal-blocks-public .pb-cta h2{font-size:clamp(42px,5.6vw,78px);color:#010219}.portal-blocks-public .pb-text p,.portal-blocks-public .pb-image p,.portal-blocks-public .pb-heading p,.portal-blocks-public .pb-cta p{color:#6c6d87}
.portal-blocks-public .pb-card-grid{gap:18px}.portal-blocks-public .pb-card-grid article{border:0;border-radius:26px;background:#fff;box-shadow:0 18px 50px rgba(9,26,85,.07);min-height:300px;padding:34px}.portal-blocks-public .pb-card-grid article>span{display:inline-grid;place-items:center;width:42px;height:42px;border-radius:50%;background:#edebf5;color:#4151b3;font-weight:800}.portal-blocks-public .pb-card-grid h3{font-size:26px;margin-top:62px}
.portal-blocks-public .pb-stats{gap:18px}.portal-blocks-public .pb-stats>div{border:0;border-radius:26px;background:#091a55;color:#fff;padding:36px;box-shadow:0 20px 48px rgba(9,26,85,.14)}.portal-blocks-public .pb-stats strong{font-size:clamp(30px,4vw,52px)}.portal-blocks-public .pb-stats span{color:#bfc4df}
.portal-blocks-public .pb-cta{margin-top:34px;padding:64px clamp(34px,6vw,80px)!important;border:0!important;border-radius:32px;background:#010219;color:#fff;box-shadow:0 30px 70px rgba(1,2,25,.16)}.portal-blocks-public .pb-cta h2{color:#fff!important}.portal-blocks-public .pb-cta p{color:#b9bad0!important}
.public-footer{background:#010219;color:#fff;border:0!important;min-height:150px;border-radius:30px 30px 0 0;padding-inline:clamp(20px,5vw,72px)}.public-footer p{color:#a9aac3}.public-footer button{color:#fff}.portal-auth-card{border:0!important;border-radius:28px!important;padding:34px;box-shadow:0 42px 110px rgba(1,2,25,.35)}.portal-modal-close{border-radius:11px}.portal-auth-tabs button{border-radius:12px 12px 0 0}.portal-auth-form input{border-radius:14px!important;padding:14px 15px}.portal-auth-brand>span{border-radius:13px}
html[data-theme="dark"] .portal-blocks-public .pb-copy h1,html[data-theme="dark"] .portal-blocks-public .pb-heading h2,html[data-theme="dark"] .portal-blocks-public .pb-text h2,html[data-theme="dark"] .portal-blocks-public .pb-image h2{color:#f5f4fb}.html{}
html[data-theme="dark"] .portal-blocks-public .pb-hero{background:radial-gradient(circle at 78% 28%,rgba(89,87,216,.28),transparent 28%),linear-gradient(135deg,#14172c,#202442)}html[data-theme="dark"] .portal-blocks-public .pb-copy h1{color:#fff}html[data-theme="dark"] .portal-blocks-public .pb-copy p{color:#aaa8bf}html[data-theme="dark"] .portal-blocks-public .pb-card-grid article{background:#111427;color:#f5f4fb}

/* Internal portal */
@media(min-width:901px){.sidebar{inset:12px auto 12px 12px;width:244px;border:0!important;border-radius:28px;background:linear-gradient(180deg,#010219 0%,#071139 100%)!important;box-shadow:0 26px 70px rgba(1,2,25,.22);padding:24px 14px 18px}.main-area{margin-left:268px}.sidebar .brand{padding-left:8px}.sidebar .brand-mark{border-radius:12px}.nav-item{border-radius:13px;padding:11px 12px}.nav-item.active{background:rgba(122,116,239,.20)!important;box-shadow:none!important}.nav-item.active:before{display:none}.sidebar-foot{border-color:rgba(255,255,255,.09)}}
.topbar{height:76px;background:color-mix(in srgb,var(--bg) 78%,transparent)!important;backdrop-filter:blur(24px) saturate(145%);border-bottom:1px solid color-mix(in srgb,var(--line) 70%,transparent)!important;padding-inline:clamp(18px,3vw,38px)}.global-search-wrap>input{border-radius:999px!important;background:color-mix(in srgb,var(--surface) 82%,transparent)!important;padding-block:11px}.env-badge{border-radius:999px!important;background:#010219!important;color:#fff!important;border:0!important;padding:7px 10px}.content-frame{max-width:1510px;padding-top:42px}
.hero-panel{min-height:330px;border:0!important;border-radius:30px!important;background:radial-gradient(circle at 82% 24%,rgba(65,81,179,.25),transparent 28%),linear-gradient(135deg,#faf9ff,#dddaf0)!important;color:#010219!important;box-shadow:0 30px 80px rgba(9,26,85,.09)!important;padding:46px 50px}.hero-panel:before{width:430px;height:430px;border-color:rgba(9,26,85,.10)!important;border-radius:50%;transform:none;right:-130px;top:-190px}.hero-panel:after{background:radial-gradient(circle,rgba(65,81,179,.28),transparent 70%)}.hero-panel h2{font-size:clamp(36px,4vw,54px);color:#010219}.hero-panel p:not(.eyebrow){color:#64657e!important;font-size:14px}.hero-panel .secondary-btn{background:rgba(255,255,255,.70)!important;border-color:rgba(9,26,85,.10)!important;color:#010219!important}.hero-phase{border-color:rgba(9,26,85,.12)!important}.hero-phase span,.hero-phase small{color:#696b86!important}.hero-phase strong{color:#010219}
html[data-theme="dark"] .hero-panel{background:radial-gradient(circle at 82% 24%,rgba(89,87,216,.25),transparent 28%),linear-gradient(135deg,#15182d,#202440)!important;color:#fff!important}html[data-theme="dark"] .hero-panel h2,html[data-theme="dark"] .hero-phase strong{color:#fff}html[data-theme="dark"] .hero-panel p:not(.eyebrow),html[data-theme="dark"] .hero-phase span,html[data-theme="dark"] .hero-phase small{color:#aaa8bf!important}html[data-theme="dark"] .hero-panel .secondary-btn{background:rgba(255,255,255,.07)!important;color:#fff!important;border-color:rgba(255,255,255,.10)!important}
.metric-grid{gap:14px}.metric-card{padding:22px}.metric-card strong{font-size:29px}.dashboard-layout{gap:18px}.card{padding:24px}.card-head h3{font-size:15px}.kanban{gap:16px}.kanban-column{padding:13px;background:color-mix(in srgb,var(--surface) 72%,var(--bg))}.task-card{border:0!important;box-shadow:0 10px 30px rgba(9,26,85,.05)}
.documents-layout{gap:18px}.doc-list{border-radius:22px!important;box-shadow:0 18px 48px rgba(9,26,85,.05)}.doc-list-item{border-radius:13px!important}.doc-list-item.active{background:var(--purple-soft)!important;color:var(--text)!important}.editor-shell{overflow:hidden}.editor-toolbar{background:color-mix(in srgb,var(--surface-2) 86%,transparent);padding:12px;border-bottom:1px solid var(--line)}.rich-editor .ProseMirror{padding:32px!important}
.explorer-shell{border-radius:24px!important;overflow:hidden;box-shadow:0 20px 54px rgba(9,26,85,.06)}.explorer-tree{background:color-mix(in srgb,var(--surface-2) 90%,var(--surface))!important}.tree-root,.tree-node{border-radius:11px!important}.tree-root.active,.tree-node.active{background:var(--purple-soft)!important;color:var(--purple)!important}.explorer-row{border-radius:12px}.explorer-row:hover{background:var(--surface-2)}.explorer-menu{border-radius:15px!important;box-shadow:0 20px 50px rgba(1,2,25,.18)!important}
.poll-card,.visual-poll-builder{border:0!important;box-shadow:0 16px 45px rgba(9,26,85,.06)!important}.poll-option-image img{border-radius:15px}.poll-options button{border-radius:15px!important}.poll-options button.selected{border-color:var(--purple)!important;box-shadow:0 0 0 2px color-mix(in srgb,var(--purple) 15%,transparent)}
.admin-tabs,.cms-audience-tabs,.cms-member-tabs,.finance-tabs{padding:5px;border-radius:999px;background:var(--surface-3);width:max-content;max-width:100%;overflow:auto}.admin-tabs button,.cms-audience-tabs button,.cms-member-tabs button,.finance-tabs button{border-radius:999px!important;border:0!important;background:transparent!important}.admin-tabs button.active,.cms-audience-tabs button.active,.cms-member-tabs button.active,.finance-tabs button.active{background:var(--surface)!important;color:var(--text)!important;box-shadow:0 6px 18px rgba(9,26,85,.08)!important}.admin-summary-grid>div{border-radius:20px!important;border:0!important;box-shadow:0 12px 34px rgba(9,26,85,.05)}.permission-card{border-radius:16px!important}.permission-card.enabled{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--purple) 36%,transparent)}
.cms-builder{gap:24px}.cms-palette,.cms-block-card{border-radius:20px!important}.cms-palette button{border-radius:13px!important}.cms-preview{border-radius:24px!important}.finance-metric{border:0!important;box-shadow:0 13px 34px rgba(9,26,85,.05)}.finance-layout>.card{border-radius:22px!important}
.scan-modal{border-radius:26px!important;border:0!important}.scan-preview{border-radius:18px!important}.scan-add,.scan-thumb,.scan-tools button,.text-btn{border-radius:12px!important}.modal-card,.onboarding{border-radius:24px!important}
.view-as-control{border-radius:999px!important;background:var(--surface-3)!important;padding:5px!important}.view-as-control select{border-radius:999px!important}

@media(max-width:980px){.public-header{height:74px}.public-nav{top:74px;background:#010219!important;border:0!important}.public-nav a{color:#fff!important}.portal-blocks-public{padding:14px 14px 54px}.portal-blocks-public .pb-hero{border-radius:28px;min-height:auto}.portal-blocks-public .pb-hero-art{min-height:360px}.portal-blocks-public .pb-section:not(.pb-hero){padding-top:72px;padding-bottom:72px}}
@media(max-width:700px){.content-frame{padding:26px 16px 92px}.page-header{align-items:flex-start;flex-direction:column}.page-header .header-actions{width:100%;overflow:auto;padding-bottom:3px}.hero-panel{padding:30px 24px;min-height:390px;border-radius:24px!important}.hero-panel h2{font-size:38px}.hero-phase{width:100%;border-left:0;border-top:1px solid rgba(9,26,85,.12);padding:17px 0 0}.metric-grid{grid-template-columns:1fr 1fr}.portal-blocks-public .pb-copy h1{font-size:54px}.portal-blocks-public .pb-hero{padding:38px 24px}.portal-blocks-public .pb-hero-art{display:grid!important;min-height:300px}.portal-blocks-public .pb-card-grid{grid-template-columns:1fr}.portal-blocks-public .pb-stats{grid-template-columns:1fr}.portal-blocks-public .pb-cta{padding:38px 26px!important}.public-footer{border-radius:24px 24px 0 0}.cms-audience-tabs,.cms-member-tabs{width:100%}.admin-tabs{width:100%}}
@media(max-width:500px){.metric-grid{grid-template-columns:1fr}.portal-blocks-public .pb-copy h1{font-size:47px}.portal-blocks-public .pb-hero-art{min-height:250px}.public-brand>span{width:38px;height:38px}.portal-auth-card{border-radius:22px!important}.hero-panel h2{font-size:34px}}
''')

# ---------------------------------------------------------------------------
# Workflows: three durable workflows only, reproducible npm ci, protected data.
# ---------------------------------------------------------------------------
for workflow in ['.github/workflows/build-strato.yml', '.github/workflows/deploy-lab.yml', '.github/workflows/deploy-production.yml']:
    p = ROOT / workflow
    s = p.read_text(encoding='utf-8')
    s = s.replace("      - 'index.source.html'", "      - 'index.html'")
    s = s.replace('run: npm install', 'run: npm ci')
    s = s.replace('--exclude-glob api/private/config.php dist-strato/', '--exclude-glob api/private/config.php --exclude-glob api/private/mail.php --exclude-glob api/private/uploads/** dist-strato/')
    p.write_text(s, encoding='utf-8')

write('README.md', '''# WeKiB Portal

Gemeinsames Portal für die Gründung und spätere Organisation von WeKiB als gemeinnützigem Bildungsträger für Betreuung, Ganztag, Bildung und Jugendhilfe.

## Portalebenen

- **Öffentlich:** Homepage, Angebote, Informationen und Registrierung.
- **Mein WeKiB:** erweiterter Lesebereich für bestätigte, selbst registrierte Konten.
- **Gründung:** Aufgaben, Dokumente, Dateien, Termine, Umfragen, Entscheidungen und Aktivitäten.
- **Vorstand:** geschützter Vorstandsbereich; der Schatzmeister hat eine zusätzliche Finanzverwaltung.
- **CMS:** Baukasten für öffentliche und registrierte Inhalte sowie Mitgliederumfragen und Auswertung.
- **Administration:** Konten, Rollen und individuelle Sonderrechte.

Neue selbst registrierte Konten erhalten standardmäßig ausschließlich den Lesebereich. Interne Bereiche und Bearbeitungsrechte werden explizit administrativ freigeschaltet.

## Wichtige Funktionen

- STRATO-Login mit E-Mail-Bestätigung und Passwort-Reset
- rollen- und rechtebasierte Portalnavigation
- Vorschau als Besucher, registrierter Nutzer, Gründungsmitglied oder Vorstand
- Deep Links für Portal-Unterseiten
- hierarchischer Datei-Explorer mit Unterordnern, Mehrfach- und Ordnerupload
- mobiler Dokumentenscanner mit Mehrseitigkeit, Bearbeitung, PDF und OCR
- DOCX-Import und umfangreicher TipTap-Dokumenteditor mit Listen, Einrückung und Tabellen
- Finalisierung von Dokumenten in die Dateiablage
- Bild- und Textumfragen; Mitgliederumfragen mit einer Stimme pro Konto
- CMS mit Inhaltsbausteinen und Bildern
- Schatzmeisterbereich für Buchungen, Budgets und Finanzdateien
- responsives Light-/Dark-Design

## Technik

- React 18 + Vite
- PHP-Backend auf STRATO
- MySQL/MariaDB auf STRATO
- TipTap, Mammoth, jsPDF und Tesseract.js
- GitHub Actions für Build, LAB-Deployment und kontrollierte PROD-Promotion

## Lokal starten

```bash
npm ci
npm run dev
```

Lokal wird ohne Backend-Konfiguration ein Demo-Modus mit Local Storage verwendet.

## STRATO

```bash
npm run build:strato
```

Der STRATO-Build erzwingt das PHP-Backend und erzeugt `dist-strato/`. Details zu LAB/PROD und serverseitigen Konfigurationsdateien stehen in `STRATO_DEPLOYMENT.md`.

## Quellstruktur

- `src/` – Portal, CMS, Editor, Dateien, Scanner und Finanzverwaltung
- `api/` – Authentifizierung, Rechte, Dateien, E-Mail-Verifikation und Projektzustand
- `scripts/build-strato.mjs` – reproduzierbarer STRATO-Build
- `.github/workflows/` – ausschließlich dauerhafte Build-/Deployment-Workflows

Der spätere OGTS-Trägerwechsel bleibt fachlich eine separate Projektphase und wird nicht mit der rechtlichen Vereinsgründung vermischt.
''')

write('STRATO_DEPLOYMENT.md', '''# STRATO: LAB und PROD

WeKiB läuft als React/Vite-Frontend mit PHP-Backend und MySQL/MariaDB auf STRATO. GitHub enthält Quellcode und Build-/Deployment-Logik, aber keine produktiven Zugangsdaten.

## Umgebungen

### LAB

- `http://betruungmachtschule.binder-lab.com/`
- eigener Webordner und eigene Datenbank
- automatische Veröffentlichung relevanter Änderungen auf `main`
- sichtbarer LAB-Hinweis im Frontend

### PROD

- eigener Webordner und eigene Datenbank
- keine automatische Veröffentlichung normaler Commits
- veröffentlicht wird ausschließlich eine ausdrücklich ausgewählte, im LAB geprüfte Commit-SHA

LAB und PROD dürfen niemals dieselbe Datenbank verwenden.

## Dauerhafte GitHub-Workflows

- **Build STRATO package:** reproduzierbarer Build ohne Veröffentlichung
- **Deploy LAB to STRATO:** Build + automatische LAB-Übertragung
- **Deploy tested version to PROD:** kontrollierte Promotion einer exakten getesteten Commit-SHA

`.deploy/production-source.txt` bleibt solange `NOT_SET`, bis bewusst eine getestete Version für PROD freigegeben wird.

## Server-only Dateien

Diese Daten gehören ausschließlich auf den jeweiligen STRATO-Webspace und werden nicht aus GitHub deployed:

- `api/private/config.php` – Datenbank und App-Key
- `api/private/mail.php` – STRATO-SMTP-Zugang
- `api/private/uploads/` – hochgeladene Nutzdateien

Die Deployment-Workflows schließen diese Pfade ausdrücklich aus.

## GitHub Secrets

LAB: `STRATO_LAB_HOST`, `STRATO_LAB_USER`, `STRATO_LAB_PASSWORD`, `STRATO_LAB_REMOTE_PATH`

PROD: `STRATO_PROD_HOST`, `STRATO_PROD_USER`, `STRATO_PROD_PASSWORD`, `STRATO_PROD_REMOTE_PATH`

## Erstinstallation

Nach dem ersten Upload `api/setup.php` im jeweiligen Ziel öffnen und dort die Datenbank sowie das erste Admin-Konto einrichten. Die SMTP-Konfiguration wird anschließend über die geschützte Mail-Setup-Seite auf STRATO hinterlegt.

## Arbeitsablauf

1. Änderungen nach `main` bringen.
2. Automatischen LAB-Build und SFTP-Deploy prüfen.
3. Funktionen im LAB mit Testdaten testen.
4. Erst nach Freigabe die exakte getestete Commit-SHA als PROD-Quelle setzen.
5. PROD-Workflow kontrollieren.

## Sicherheit

Solange die LAB-Seite nur über HTTP erreichbar ist, keine sensiblen Kinder-, Personal-, Vertrags- oder echten Finanzdaten einpflegen. Für den späteren Echtbetrieb ist HTTPS erforderlich. Datenbank-, Mail- und SFTP-Passwörter niemals in GitHub oder Quellcode ablegen.
''')

# Self-clean the temporary migration scaffolding. The running workflow remains valid.
unlink('.github/workflows/cleanup-redesign.yml')
unlink('.maintenance/cleanup-redesign.py')

print('Cleanup and redesign applied.')
