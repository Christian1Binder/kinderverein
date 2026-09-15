from pathlib import Path
import json, runpy

# First apply the pending upload/Word/deny-by-default migration if it has not yet landed.
if Path('scripts/apply-permissions-uploads-word.py').exists() and 'mammoth' not in Path('package.json').read_text():
    runpy.run_path('scripts/apply-permissions-uploads-word.py')

# Dependencies for the expanded TipTap editor.
p = Path('package.json'); data = json.loads(p.read_text())
for name, version in {
    '@tiptap/core':'^2.11.5','@tiptap/extension-table':'^2.11.5','@tiptap/extension-table-row':'^2.11.5',
    '@tiptap/extension-table-header':'^2.11.5','@tiptap/extension-table-cell':'^2.11.5','@tiptap/extension-underline':'^2.11.5',
    '@tiptap/extension-text-align':'^2.11.5','@tiptap/extension-highlight':'^2.11.5','@tiptap/extension-link':'^2.11.5'
}.items(): data.setdefault('dependencies',{})[name]=version
p.write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n')

# Main CSS imports.
p=Path('src/main.jsx'); s=p.read_text()
if "./portal-v4.css" not in s: s=s.replace("import './production.css'", "import './production.css'\nimport './portal-v4.css'")
p.write_text(s)

# projectStore: public CMS loading, public image URL and scoped uploads.
p=Path('src/lib/projectStore.js'); s=p.read_text()
s=s.replace('export async function uploadProjectFile(file) {', "export async function uploadProjectFile(file, scope = 'foundation') {")
s=s.replace("  form.append('file', file)\n  const payload = await request('file-upload'", "  form.append('file', file)\n  form.append('scope', scope)\n  const payload = await request('file-upload'",1)
if 'export async function loadPublicContent()' not in s:
    marker='export function projectImageUrl(id) {'
    insert="""export async function loadPublicContent() {\n  if (!cloudEnabled) return null\n  const payload = await request('public-content')\n  return payload.blocks || null\n}\n\nexport function publicImageUrl(id) {\n  if (!cloudEnabled || !id) return '#'\n  return `${apiBase()}public-image.php?id=${encodeURIComponent(id)}`\n}\n\n"""
    s=s.replace(marker,insert+marker,1)
p.write_text(s)

# Public portal becomes CMS-driven.
p=Path('src/PortalRoot.jsx'); s=p.read_text()
if "PortalBlocks" not in s:
    s=s.replace("import AppV2 from './AppV2.jsx'", "import AppV2 from './AppV2.jsx'\nimport { PortalBlocks, DEFAULT_PUBLIC_BLOCKS } from './PortalBlocks.jsx'")
s=s.replace("import { accountUrl, cloudEnabled, getSession, onAuthChange, registerSelf, signInWithEmail } from './lib/projectStore.js'", "import { accountUrl, cloudEnabled, getSession, loadPublicContent, onAuthChange, registerSelf, signInWithEmail } from './lib/projectStore.js'")
needle="  const [register, setRegister] = useState({ name: '', email: '', password: '', password2: '', privacyAccepted: false })"
if needle in s and 'publicBlocks' not in s[s.index(needle):s.index(needle)+250]:
    s=s.replace(needle, needle+"\n  const [publicBlocks, setPublicBlocks] = useState(DEFAULT_PUBLIC_BLOCKS)",1)
    effect="""\n  useEffect(() => {\n    loadPublicContent().then((blocks) => { if (Array.isArray(blocks) && blocks.length) setPublicBlocks(blocks) }).catch(() => {})\n  }, [])\n"""
    pos=s.index("\n  useEffect(() => {\n    document.documentElement.dataset.theme", s.index(needle))
    s=s[:pos]+effect+s[pos:]
start=s.find('    <main>\n      <section className="public-hero"')
end=s.find('    </main>',start)
if start!=-1 and end!=-1:
    s=s[:start]+"    <main><PortalBlocks blocks={publicBlocks} mode=\"public\" onAction={openAuth} /></main>"+s[end+11:]
p.write_text(s)

# Admin: finance permission + proper CMS builder.
p=Path('src/AdminBackend.jsx'); s=p.read_text()
if "PortalCms" not in s: s=s.replace("import './admin.css'", "import './admin.css'\nimport PortalCms from './PortalCms.jsx'")
if "finance_manage" not in s:
    s=s.replace("  ['access_board', 'Bereich Vorstand', 'Öffnet den vertraulichen Vorstandsbereich.'],", "  ['access_board', 'Bereich Vorstand', 'Öffnet den vertraulichen Vorstandsbereich.'],\n  ['finance_manage', 'Schatzmeister / Finanzen', 'Darf den geschützten Finanzbereich, Buchungen, Budgets und Finanzdateien verwalten.'],")
s=s.replace("{tab === 'cms' && canCms && <CmsPanel project={project} mutate={mutate} />}", "{tab === 'cms' && canCms && <><PortalCms project={project} mutate={mutate} setToast={setToast} /><div style={{height:24}}/><CmsPanel project={project} mutate={mutate} /></>}")
p.write_text(s)

# Access model: add finance right, isolate finance data, and add secure file scope helper.
p=Path('api/access.php'); s=p.read_text()
s=s.replace("'decisions_manage','cms_manage'", "'decisions_manage','cms_manage','finance_manage'")
if "function portal_can_access_file" not in s:
    s += r'''

function portal_file_scope(array $state, string $id): string {
    foreach (($state['files'] ?? []) as $file) {
        if (is_array($file) && (string)($file['id'] ?? '') === $id) return (string)($file['scope'] ?? 'foundation');
    }
    return 'foundation';
}

function portal_can_access_file(array $user, string $id): bool {
    if (($user['role'] ?? '') === 'admin') return true;
    $stmt = db()->prepare('SELECT data FROM project_state WHERE id = ? LIMIT 1');
    $stmt->execute(['kinderverein-main']);
    $row = $stmt->fetch();
    $state = $row && is_string($row['data'] ?? null) ? json_decode((string)$row['data'], true) : [];
    if (!is_array($state)) $state = [];
    $scope = portal_file_scope($state, $id);
    $access = portal_access_for_state($state, $user);
    $permissions = portal_permissions_for_state($state, $user);
    if ($scope === 'treasury') return $access['board'] && !empty($permissions['finance_manage']);
    if ($scope === 'member-cms') return true;
    if ($scope === 'public-cms') return false;
    if ($scope === 'board') return $access['board'];
    return $access['foundation'];
}
'''
# filter finance unless finance permission
old="""    if (!$access['foundation'] && !$access['board']) {\n        $state['folders'] = [];"""
new="""    $permissions = portal_permissions_for_state($state, $user);\n    if (!$access['board'] || empty($permissions['finance_manage'])) $state['finance'] = ['transactions'=>[], 'budgets'=>[], 'files'=>[], 'accounts'=>[]];\n\n    if (!$access['foundation'] && !$access['board']) {\n        $state['folders'] = [];"""
s=s.replace(old,new,1)
# merge finance only with finance permission
marker="""    if ($access['cms'] && isset($incoming['settings']) && is_array($incoming['settings'])) {"""
if marker in s and "incoming['finance']" not in s[s.find('function merge_project_state_for_user'):]:
    s=s.replace(marker,"""    $permissions = portal_permissions_for_state($current, $user);\n    if ($access['board'] && !empty($permissions['finance_manage']) && isset($incoming['finance']) && is_array($incoming['finance'])) $current['finance'] = $incoming['finance'];\n\n"""+marker,1)
p.write_text(s)

# API: public CMS endpoint and scoped upload/download/delete rules.
p=Path('api/index.php'); s=p.read_text()
setup_marker="""    if ($action === 'session' && $method === 'GET') {"""
if "action === 'public-content'" not in s:
    public_block="""    if ($action === 'public-content' && $method === 'GET') {\n        $stmt = db()->prepare('SELECT data FROM project_state WHERE id = ? LIMIT 1');\n        $stmt->execute(['kinderverein-main']);\n        $row = $stmt->fetch();\n        $state = $row && is_string($row['data'] ?? null) ? json_decode((string)$row['data'], true) : [];\n        $blocks = is_array($state['settings']['publicBlocks'] ?? null) ? $state['settings']['publicBlocks'] : null;\n        json_response(['ok' => true, 'blocks' => $blocks]);\n    }\n\n"""
    s=s.replace(setup_marker,public_block+setup_marker,1)
# Replace upload permission lines with scope-aware logic.
old="""        $portalAccess = portal_access_for_user($user);\n        if (!$portalAccess['foundation'] && !$portalAccess['board'] && !$portalAccess['admin']) json_response(['ok' => false, 'message' => 'Keine Berechtigung für die interne Dateiablage.'], 403);\n        if (!portal_permission_for_user($user, 'files_manage')) json_response(['ok' => false, 'message' => 'Keine Upload-Berechtigung.'], 403);"""
new="""        $portalAccess = portal_access_for_user($user);\n        $scope = trim((string)($_POST['scope'] ?? 'foundation'));\n        $allowedUpload = ($user['role'] ?? '') === 'admin'\n            || ($scope === 'treasury' && $portalAccess['board'] && portal_permission_for_user($user, 'finance_manage'))\n            || (in_array($scope, ['public-cms','member-cms'], true) && portal_permission_for_user($user, 'cms_manage'))\n            || ($scope === 'board' && $portalAccess['board'] && portal_permission_for_user($user, 'files_manage'))\n            || ($scope === 'foundation' && $portalAccess['foundation'] && portal_permission_for_user($user, 'files_manage'));\n        if (!$allowedUpload) json_response(['ok' => false, 'message' => 'Keine Upload-Berechtigung für diesen Bereich.'], 403);"""
if old in s: s=s.replace(old,new,1)
# include scope in upload response
s=s.replace("'uploadedBy' => $user['name']]], 201);", "'uploadedBy' => $user['name'], 'scope' => $scope]], 201);",1)
# download gate
old="""        $portalAccess = portal_access_for_user($user);\n        if (!$portalAccess['foundation'] && !$portalAccess['board'] && !$portalAccess['admin']) { http_response_code(403); exit('Keine Berechtigung.'); }"""
new="""        $id = (string)($_GET['id'] ?? '');\n        if (!portal_can_access_file($user, $id)) { http_response_code(403); exit('Keine Berechtigung.'); }"""
if old in s: s=s.replace(old,new,1)
# avoid duplicate id assignment in download
s=s.replace("        $id = (string)($_GET['id'] ?? '');\n        $stmt = db()->prepare('SELECT storage_name", "        $stmt = db()->prepare('SELECT storage_name",1)
# delete gate scope
old="""        if (!portal_permission_for_user($user, 'files_manage') && ($user['role'] ?? '') !== 'admin') json_response(['ok' => false, 'message' => 'Keine Berechtigung zum Löschen von Dateien.'], 403);\n        ensure_project_files_table();\n        $input = json_input();\n        $id = (string)($input['id'] ?? '');"""
new="""        ensure_project_files_table();\n        $input = json_input();\n        $id = (string)($input['id'] ?? '');\n        if (($user['role'] ?? '') !== 'admin' && !portal_can_access_file($user, $id)) json_response(['ok' => false, 'message' => 'Keine Berechtigung zum Löschen dieser Datei.'], 403);"""
if old in s: s=s.replace(old,new,1)
p.write_text(s)

# AppV2: stronger editor, member read area, finance area.
p=Path('src/AppV2.jsx'); s=p.read_text()
# imports
s=s.replace("import Placeholder from '@tiptap/extension-placeholder'", "import Placeholder from '@tiptap/extension-placeholder'\nimport { Extension } from '@tiptap/core'\nimport Table from '@tiptap/extension-table'\nimport TableRow from '@tiptap/extension-table-row'\nimport TableHeader from '@tiptap/extension-table-header'\nimport TableCell from '@tiptap/extension-table-cell'\nimport Underline from '@tiptap/extension-underline'\nimport TextAlign from '@tiptap/extension-text-align'\nimport Highlight from '@tiptap/extension-highlight'\nimport Link from '@tiptap/extension-link'")
if "Treasurer" not in s: s=s.replace("import AdminBackend from './AdminBackend.jsx'", "import AdminBackend from './AdminBackend.jsx'\nimport Treasurer from './Treasurer.jsx'\nimport { PortalBlocks, DEFAULT_MEMBER_BLOCKS } from './PortalBlocks.jsx'")
# icons
s=s.replace("History, Italic, LayoutDashboard, List, LockKeyhole", "History, Italic, LayoutDashboard, List, ListOrdered, IndentIncrease, IndentDecrease, Table2, Rows3, Columns3, Underline as UnderlineIcon, Highlighter, AlignLeft, AlignCenter, AlignRight, LockKeyhole")
# finance normalize
needle="  p.milestones = Array.isArray(p.milestones) ? p.milestones : []\n  return p"
if needle in s: s=s.replace(needle,"  p.milestones = Array.isArray(p.milestones) ? p.milestones : []\n  p.finance = p.finance && typeof p.finance === 'object' ? { transactions: [], budgets: [], files: [], accounts: [], ...p.finance } : { transactions: [], budgets: [], files: [], accounts: [] }\n  return p",1)
# access finance
s=s.replace("cms_manage: false },", "cms_manage: false, finance_manage: false },")
# canFinance
s=s.replace("  const canCms = isAdmin || hasPermission(project, user, 'cms_manage')", "  const canCms = isAdmin || hasPermission(project, user, 'cms_manage')\n  const canFinance = isAdmin || (canBoard && hasPermission(project, user, 'finance_manage'))",1)
# board nav and route
old="{canBoard && <><div className=\"nav-section-label\">VORSTAND</div><button className={`nav-item ${page === 'board' ? 'active' : ''}`} onClick={() => go('board')}><LockKeyhole size={18} /><span>Vorstandsbereich</span></button></>}"
new="{canBoard && <><div className=\"nav-section-label\">VORSTAND</div><button className={`nav-item ${page === 'board' ? 'active' : ''}`} onClick={() => go('board')}><LockKeyhole size={18} /><span>Vorstandsbereich</span></button>{canFinance && <button className={`nav-item ${page === 'treasury' ? 'active' : ''}`} onClick={() => go('treasury')}><WalletCards size={18} /><span>Schatzmeister</span></button>}</>}"
if old in s:
    s=s.replace(old,new,1)
    s=s.replace("Target, Trash2, Undo2", "Target, Trash2, WalletCards, Undo2")
s=s.replace("{canBoard && page === 'board' && <BoardArea />}", "{canBoard && page === 'board' && <BoardArea canFinance={canFinance} go={go} />}\n          {canFinance && page === 'treasury' && <Treasurer project={project} user={user} mutate={mutate} setToast={setToast} />}",1)
# Member dashboard
start=s.find('function MemberDashboard('); end=s.find('\nfunction BoardArea(',start)
if start!=-1 and end!=-1:
    member=r'''function MemberDashboard({ user, profile, canBoard, canCms }) {
  const blocks = profile?.memberBlocks || DEFAULT_MEMBER_BLOCKS
  return <div className="page"><PageHeader eyebrow="MEIN WEKIB" title={`Willkommen, ${firstName(profile?.displayName || user.name || user.email)}`} description="Dein registrierter Lesebereich. Zusätzliche Arbeitsbereiche erscheinen nur nach Freigabe." />
    <PortalBlocks blocks={blocks} mode="member" />
  </div>
}
'''
    s=s[:start]+member+s[end:]
# BoardArea
start=s.find('function BoardArea('); end=s.find('\nfunction LoadingScreen()',start)
if start!=-1 and end!=-1:
    board=r'''function BoardArea({ canFinance, go }) {
  return <div className="page"><PageHeader eyebrow="VERTRAULICH" title="Vorstandsbereich" description="Geschützter Arbeitsraum für Vorstand und ausdrücklich berechtigte Personen." />
    <section className="metric-grid"><Metric label="Vorstand" value="geschützt" hint="eigener Arbeitsbereich" /><Metric label="Finanzen" value={canFinance ? 'freigeschaltet' : 'gesperrt'} hint="Schatzmeisterrecht erforderlich" /><Metric label="Dokumente" value="separat" hint="nicht für Gründung sichtbar" /><Metric label="Beschlüsse" value="geplant" hint="Vorstandsprotokolle & Beschlüsse" /></section>
    <section className="card" style={{marginTop:18}}><div className="card-head"><div><h3>Vorstandsverwaltung</h3><p>Hier bündeln wir künftig Vorstandsbeschlüsse, vertrauliche Unterlagen und Zuständigkeiten.</p></div>{canFinance && <button className="primary-btn" onClick={()=>go('treasury')}><WalletCards size={16}/> Finanzverwaltung öffnen</button>}</div></section>
  </div>
}
'''
    s=s[:start]+board+s[end:]
# editor extension definition
if 'const Indent = Extension.create' not in s:
    marker='const DEFAULT_LAYOUT = DASHBOARD_MODULES.map(([id]) => id)'
    ext=r'''
const Indent = Extension.create({
  name: 'indent',
  addGlobalAttributes() { return [{ types: ['paragraph','heading'], attributes: { indent: { default: 0, parseHTML: el => parseInt(el.getAttribute('data-indent') || '0',10), renderHTML: attrs => attrs.indent ? { 'data-indent': attrs.indent, style: `margin-left:${attrs.indent * 28}px` } : {} } } }] },
  addCommands() { return { indent: () => ({ commands, state }) => { const name=state.selection.$from.parent.type.name; const current=state.selection.$from.parent.attrs.indent||0; return ['paragraph','heading'].includes(name) ? commands.updateAttributes(name,{indent:Math.min(6,current+1)}) : false }, outdent: () => ({ commands, state }) => { const name=state.selection.$from.parent.type.name; const current=state.selection.$from.parent.attrs.indent||0; return ['paragraph','heading'].includes(name) ? commands.updateAttributes(name,{indent:Math.max(0,current-1)}) : false } } }
})

const editorExtensions = [StarterKit, Placeholder.configure({ placeholder: 'Gemeinsam formulieren …' }), Underline, Highlight, Link.configure({ openOnClick:false }), TextAlign.configure({ types:['heading','paragraph'] }), Table.configure({ resizable:true }), TableRow, TableHeader, TableCell, Indent]
'''
    s=s.replace(marker,marker+ext,1)
s=s.replace("useEditor({ extensions: [StarterKit, Placeholder.configure({ placeholder: 'Gemeinsam formulieren …' })], content: doc.content || '<p></p>', editable: canEdit })", "useEditor({ extensions: editorExtensions, content: doc.content || '<p></p>', editable: canEdit })")
# toolbar replacement
old_start=s.find('    <div className="editor-toolbar">', s.find('function DocumentEditor'))
old_end=s.find('    <EditorContent',old_start)
if old_start!=-1 and old_end!=-1:
    toolbar=r'''    <div className="editor-toolbar">
      <button disabled={!canEdit} className={editor?.isActive('bold') ? 'active' : ''} onClick={()=>editor?.chain().focus().toggleBold().run()}><Bold size={16}/></button>
      <button disabled={!canEdit} className={editor?.isActive('italic') ? 'active' : ''} onClick={()=>editor?.chain().focus().toggleItalic().run()}><Italic size={16}/></button>
      <button disabled={!canEdit} className={editor?.isActive('underline') ? 'active' : ''} onClick={()=>editor?.chain().focus().toggleUnderline().run()}><UnderlineIcon size={16}/></button>
      <button disabled={!canEdit} onClick={()=>editor?.chain().focus().toggleHighlight().run()}><Highlighter size={16}/></button><i className="toolbar-sep"/>
      <button disabled={!canEdit} onClick={()=>editor?.chain().focus().toggleHeading({level:2}).run()}><Heading2 size={16}/></button>
      <button disabled={!canEdit} onClick={()=>editor?.chain().focus().toggleBulletList().run()}><List size={16}/></button>
      <button disabled={!canEdit} onClick={()=>editor?.chain().focus().toggleOrderedList().run()}><ListOrdered size={16}/></button>
      <button disabled={!canEdit} title="Einrücken" onClick={()=>editor?.chain().focus().sinkListItem('listItem').run() || editor?.commands.indent()}><IndentIncrease size={16}/></button>
      <button disabled={!canEdit} title="Ausrücken" onClick={()=>editor?.chain().focus().liftListItem('listItem').run() || editor?.commands.outdent()}><IndentDecrease size={16}/></button><i className="toolbar-sep"/>
      <button disabled={!canEdit} onClick={()=>editor?.chain().focus().setTextAlign('left').run()}><AlignLeft size={16}/></button><button disabled={!canEdit} onClick={()=>editor?.chain().focus().setTextAlign('center').run()}><AlignCenter size={16}/></button><button disabled={!canEdit} onClick={()=>editor?.chain().focus().setTextAlign('right').run()}><AlignRight size={16}/></button><i className="toolbar-sep"/>
      <button disabled={!canEdit} title="Tabelle einfügen" onClick={()=>editor?.chain().focus().insertTable({rows:3,cols:3,withHeaderRow:true}).run()}><Table2 size={16}/></button>
      <button disabled={!canEdit || !editor?.isActive('table')} title="Zeile hinzufügen" onClick={()=>editor?.chain().focus().addRowAfter().run()}><Rows3 size={16}/></button>
      <button disabled={!canEdit || !editor?.isActive('table')} title="Spalte hinzufügen" onClick={()=>editor?.chain().focus().addColumnAfter().run()}><Columns3 size={16}/></button>
      <button disabled={!canEdit || !editor?.isActive('table')} title="Tabelle löschen" onClick={()=>editor?.chain().focus().deleteTable().run()}><Trash2 size={16}/></button><i className="toolbar-sep"/>
      <button disabled={!canEdit} onClick={()=>editor?.chain().focus().undo().run()}><Undo2 size={16}/></button><button disabled={!canEdit} onClick={()=>editor?.chain().focus().redo().run()}><Redo2 size={16}/></button>
    </div>
'''
    s=s[:old_start]+toolbar+s[old_end:]
p.write_text(s)

print('Portal v4 migration prepared')
