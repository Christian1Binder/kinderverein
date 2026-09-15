from pathlib import Path
import json

# package.json: browser-side DOCX import
p = Path('package.json')
data = json.loads(p.read_text())
data.setdefault('dependencies', {})['mammoth'] = '^1.8.0'
p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')

# Admin defaults must be deny-by-default.
p = Path('src/AdminBackend.jsx')
s = p.read_text()
s = s.replace("const [form, setForm] = useState({ name: '', email: '', password: '', role: 'member', kind: 'founder' })", "const [form, setForm] = useState({ name: '', email: '', password: '', role: 'member', kind: 'member' })")
s = s.replace("setForm({ name: '', email: '', password: '', role: 'member', kind: 'founder' })", "setForm({ name: '', email: '', password: '', role: 'member', kind: 'member' })")
p.write_text(s)

# Legacy admin page must no longer imply that member = edit rights.
p = Path('api/users.php')
s = p.read_text()
s = s.replace('Admin = Vollzugriff, Mitarbeiter = lesen & bearbeiten, Lesen = nur ansehen.', 'Admin = Vollzugriff. Standardzugang = keine internen Sonderrechte; diese werden im Portal-Admin gezielt vergeben. Lesen = nur ansehen.')
s = s.replace('<option value="member">Mitarbeiter</option>', '<option value="member">Standardzugang</option>')
p.write_text(s)

# Harden server-side permission model.
p = Path('api/access.php')
s = p.read_text()
insert_after = """function portal_access_for_state(array $state, array $user): array {\n"""
if 'function portal_permissions_for_state' not in s:
    marker = """function sanitize_profiles_for_user(array $profiles, array $user): array {"""
    helper = r'''function portal_permissions_for_state(array $state, array $user): array {
    $keys = ['access_foundation','access_board','documents_edit','documents_finalize','files_manage','tasks_manage','polls_create','calendar_manage','decisions_manage','cms_manage'];
    if (($user['role'] ?? '') === 'admin') return array_fill_keys($keys, true);
    if (($user['role'] ?? '') === 'viewer') return array_fill_keys($keys, false);

    $profile = portal_profile_for_user($state, $user);
    $kind = (string)($profile['kind'] ?? 'member');
    $defaults = array_fill_keys($keys, false);
    if ($kind === 'founder') {
        foreach (['access_foundation','documents_edit','documents_finalize','files_manage','tasks_manage','polls_create','calendar_manage','decisions_manage'] as $key) $defaults[$key] = true;
    }
    $overrides = is_array($profile['permissions'] ?? null) ? $profile['permissions'] : [];
    foreach ($keys as $key) if (array_key_exists($key, $overrides)) $defaults[$key] = (bool)$overrides[$key];
    return $defaults;
}

function portal_permission_for_user(array $user, string $key): bool {
    if (($user['role'] ?? '') === 'admin') return true;
    $stmt = db()->prepare('SELECT data FROM project_state WHERE id = ? LIMIT 1');
    $stmt->execute(['kinderverein-main']);
    $row = $stmt->fetch();
    $state = $row && is_string($row['data'] ?? null) ? json_decode((string)$row['data'], true) : [];
    $permissions = portal_permissions_for_state(is_array($state) ? $state : [], $user);
    return !empty($permissions[$key]);
}

'''
    if marker not in s:
        raise SystemExit('access marker missing')
    s = s.replace(marker, helper + marker, 1)

old = r'''    if ($access['foundation'] || $access['board']) {
        foreach (['tasks','documents','files','events','decisions','polls','activities','messages','phases','milestones'] as $key) {
            $current[$key] = merge_scoped_section(
                is_array($current[$key] ?? null) ? $current[$key] : [],
                is_array($incoming[$key] ?? null) ? $incoming[$key] : [],
                $access['board']
            );
        }
        if (isset($incoming['folders']) && is_array($incoming['folders'])) $current['folders'] = $incoming['folders'];
    }

    if ($access['cms'] && isset($incoming['settings']) && is_array($incoming['settings'])) {
'''
new = r'''    if ($access['foundation'] || $access['board']) {
        $permissions = portal_permissions_for_state($current, $user);
        $sectionPermission = [
            'tasks' => 'tasks_manage',
            'documents' => 'documents_edit',
            'files' => 'files_manage',
            'events' => 'calendar_manage',
            'decisions' => 'decisions_manage',
        ];
        foreach ($sectionPermission as $key => $permission) {
            if (!empty($permissions[$permission])) {
                $current[$key] = merge_scoped_section(
                    is_array($current[$key] ?? null) ? $current[$key] : [],
                    is_array($incoming[$key] ?? null) ? $incoming[$key] : [],
                    $access['board']
                );
            }
        }
        // Abstimmen darf der Gründungsbereich; Erstellen/Verwalten bleibt zusätzlich in der UI eingeschränkt.
        if ($access['foundation'] && isset($incoming['polls']) && is_array($incoming['polls'])) {
            $current['polls'] = merge_scoped_section(is_array($current['polls'] ?? null) ? $current['polls'] : [], $incoming['polls'], $access['board']);
        }
        if (!empty($permissions['files_manage']) && isset($incoming['folders']) && is_array($incoming['folders'])) $current['folders'] = $incoming['folders'];
    }

    if ($access['cms'] && isset($incoming['settings']) && is_array($incoming['settings'])) {
'''
if old not in s:
    raise SystemExit('merge block missing')
s = s.replace(old, new, 1)
p.write_text(s)

# Enforce file permission in backend upload/delete.
p = Path('api/index.php')
s = p.read_text()
needle = """        $portalAccess = portal_access_for_user($user);\n        if (!$portalAccess['foundation'] && !$portalAccess['board'] && !$portalAccess['admin']) json_response(['ok' => false, 'message' => 'Keine Berechtigung für die interne Dateiablage.'], 403);\n        if (!isset($_FILES['file'])"""
replace = """        $portalAccess = portal_access_for_user($user);\n        if (!$portalAccess['foundation'] && !$portalAccess['board'] && !$portalAccess['admin']) json_response(['ok' => false, 'message' => 'Keine Berechtigung für die interne Dateiablage.'], 403);\n        if (!portal_permission_for_user($user, 'files_manage')) json_response(['ok' => false, 'message' => 'Keine Upload-Berechtigung.'], 403);\n        if (!isset($_FILES['file'])"""
if needle in s:
    s = s.replace(needle, replace, 1)

old_delete = """    if ($action === 'file-delete' && $method === 'POST') {\n        $user = require_user();\n        ensure_project_files_table();"""
new_delete = """    if ($action === 'file-delete' && $method === 'POST') {\n        $user = require_user();\n        if (!portal_permission_for_user($user, 'files_manage') && ($user['role'] ?? '') !== 'admin') json_response(['ok' => false, 'message' => 'Keine Berechtigung zum Löschen von Dateien.'], 403);\n        ensure_project_files_table();"""
if old_delete in s:
    s = s.replace(old_delete, new_delete, 1)
p.write_text(s)

# Frontend: strict edit permission, multiple files/folders, DOCX -> editor import.
p = Path('src/AppV2.jsx')
s = p.read_text()
if "from 'mammoth'" not in s:
    s = s.replace("import Placeholder from '@tiptap/extension-placeholder'", "import Placeholder from '@tiptap/extension-placeholder'\nimport * as mammoth from 'mammoth'")

s = s.replace("return hasPermission(project, user, 'documents_edit') || doc.createdByEmail === user?.email", "return hasPermission(project, user, 'documents_edit') || (doc.scope === 'personal' && doc.createdByEmail === user?.email)")

# Documents permissions and multi upload.
s = s.replace("  const [busy, setBusy] = useState(false)\n  const uploadRef = useRef(null)", "  const [busy, setBusy] = useState(false)\n  const uploadRef = useRef(null)\n  const canCreate = hasPermission(project, user, 'documents_edit')\n  const canUpload = hasPermission(project, user, 'files_manage')", 1)
s = s.replace("    if (user.role === 'viewer') return\n    const doc =", "    if (!canCreate) return\n    const doc =", 1)
old_upload = r'''  const upload = async (file) => {
    if (!file || user.role === 'viewer') return
    setBusy(true)
    try {
      const meta = await uploadProjectFile(file)
      const folderId = project.folders.find((folder) => folder.id === 'folder-gruendung')?.id || project.folders[0]?.id || ''
      mutate((p) => p.files.unshift({ ...meta, folderId, source: 'documents' }), `Dokument „${file.name}“ hochgeladen`)
      setSelectedKey(`file:${meta.id}`)
      setToast?.('Dokument hochgeladen')
    } catch (error) {
      setToast?.(error.message || 'Upload fehlgeschlagen')
    } finally {
      setBusy(false)
      if (uploadRef.current) uploadRef.current.value = ''
    }
  }
'''
new_upload = r'''  const upload = async (fileList) => {
    const files = Array.from(fileList || [])
    if (!files.length || !canUpload) return
    setBusy(true)
    try {
      const folderId = project.folders.find((folder) => folder.id === 'folder-gruendung')?.id || project.folders[0]?.id || ''
      const uploaded = []
      for (const file of files) uploaded.push({ ...(await uploadProjectFile(file)), folderId, source: 'documents' })
      mutate((p) => { p.files.unshift(...uploaded) }, `${uploaded.length} Dokument${uploaded.length === 1 ? '' : 'e'} hochgeladen`)
      if (uploaded[0]) setSelectedKey(`file:${uploaded[0].id}`)
      setToast?.(`${uploaded.length} Dokument${uploaded.length === 1 ? '' : 'e'} hochgeladen`)
    } catch (error) {
      setToast?.(error.message || 'Upload fehlgeschlagen')
    } finally {
      setBusy(false)
      if (uploadRef.current) uploadRef.current.value = ''
    }
  }
'''
if old_upload not in s:
    raise SystemExit('documents upload block missing')
s = s.replace(old_upload, new_upload, 1)
old_header = '''action={<div className="header-actions">{user.role !== 'viewer' && <label className={`secondary-btn ${busy ? 'disabled' : ''}`}><Upload size={16} /> {busy ? 'Lädt …' : 'Hochladen'}<input ref={uploadRef} hidden type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.rtf" onChange={(e) => upload(e.target.files?.[0])} /></label>}{user.role !== 'viewer' && <button className="primary-btn" onClick={createDoc}><Plus size={16} /> Dokument erstellen</button>}</div>}'''
new_header = '''action={<div className="header-actions">{canUpload && <label className={`secondary-btn ${busy ? 'disabled' : ''}`}><Upload size={16} /> {busy ? 'Lädt …' : 'Dateien hochladen'}<input ref={uploadRef} hidden type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.rtf" onChange={(e) => upload(e.target.files)} /></label>}{canCreate && <button className="primary-btn" onClick={createDoc}><Plus size={16} /> Dokument erstellen</button>}</div>}'''
if old_header not in s:
    raise SystemExit('documents header missing')
s = s.replace(old_header, new_header, 1)
s = s.replace("<UploadedDocumentPanel key={selected.item.id} file={selected.item} user={user} mutate={mutate}", "<UploadedDocumentPanel key={selected.item.id} file={selected.item} user={user} project={project} mutate={mutate}", 1)

# Replace uploaded document panel with DOCX import capability.
start = s.index('function UploadedDocumentPanel(')
end = s.index('\nfunction Files(', start)
panel = r'''function UploadedDocumentPanel({ file, user, project, mutate, setToast, setSelectedKey }) {
  const [importing, setImporting] = useState(false)
  const canDelete = hasPermission(project, user, 'files_manage')
  const canImportWord = hasPermission(project, user, 'documents_edit') && /\.docx$/i.test(file.name || '')
  const remove = async () => {
    if (!canDelete || !window.confirm(`„${file.name}“ wirklich löschen?`)) return
    try {
      await deleteProjectFile(file.id)
      mutate((p) => { p.files = p.files.filter((item) => item.id !== file.id) }, `Dokument „${file.name}“ gelöscht`)
      setSelectedKey(null)
      setToast?.('Dokument gelöscht')
    } catch (error) {
      setToast?.(error.message || 'Dokument konnte nicht gelöscht werden.')
    }
  }
  const importWord = async () => {
    if (!canImportWord || importing) return
    setImporting(true)
    try {
      const response = await fetch(fileDownloadUrl(file.id), { credentials: 'same-origin', cache: 'no-store' })
      if (!response.ok) throw new Error('Word-Datei konnte nicht geladen werden.')
      const arrayBuffer = await response.arrayBuffer()
      const result = await mammoth.convertToHtml({ arrayBuffer })
      const title = (file.name || 'Word-Dokument').replace(/\.docx$/i, '')
      const doc = { id: uid('doc'), title, category: 'Importierte Word-Dokumente', status: 'in_progress', owner: user.name || user.email, content: result.value || '<p></p>', versions: [], comments: [], createdByEmail: user.email, createdByName: user.name || user.email, createdAt: nowIso(), updatedAt: nowIso(), updatedBy: user.name || user.email, sourceFileId: file.id, sourceFileName: file.name }
      mutate((p) => p.documents.unshift(doc), `Word-Dokument „${file.name}“ zur Bearbeitung importiert`)
      setSelectedKey(`doc:${doc.id}`)
      setToast?.(result.messages?.length ? 'Word-Dokument importiert – komplexe Formatierungen bitte prüfen.' : 'Word-Dokument ist jetzt bearbeitbar.')
    } catch (error) { setToast?.(error.message || 'Word-Import fehlgeschlagen.') } finally { setImporting(false) }
  }

  return <section className="editor-shell uploaded-document-panel"><div className="editor-top"><div><strong className="uploaded-document-title">{file.name}</strong><span>Hochgeladen {file.uploadedAt ? `· ${fmtDateTime(file.uploadedAt)}` : ''}</span></div><div className="editor-actions"><a className="primary-btn" href={fileDownloadUrl(file.id)}><Download size={16} /> Herunterladen</a>{canImportWord && <button className="secondary-btn" disabled={importing} onClick={importWord}><FileText size={16} /> {importing ? 'Importiert …' : 'In Editor bearbeiten'}</button>}{canDelete && <button className="secondary-btn" onClick={remove}><Trash2 size={16} /> Löschen</button>}</div></div><div className="uploaded-document-body"><div className="uploaded-document-icon"><FileText size={34} /></div><div><p className="eyebrow">HOCHGELADENE DATEI</p><h2>{file.name}</h2><p>{formatBytes(file.size)}{file.mime ? ` · ${file.mime}` : ''}{file.uploadedBy ? ` · von ${file.uploadedBy}` : ''}</p>{/\.doc$/i.test(file.name || '') && <p>Ältere .doc-Dateien können nicht direkt importiert werden. Bitte vorher als .docx speichern.</p>}{file.relativePath && <p>Ursprünglicher Pfad: {file.relativePath}</p>}</div></div></section>
}
'''
s = s[:start] + panel + s[end:]

# Replace Files component upload controls with multiple file + folder upload.
start = s.index('function Files(')
end = s.index('\nfunction Calendar(', start)
old_files_component = s[start:end]
# Keep existing rendering after helper definitions but replace component wholesale for reliability.
files_component = r'''function Files({ project, user, mutate, setToast }) {
  const canManage = hasPermission(project, user, 'files_manage')
  const [folderId, setFolderId] = useState(project.folders[0]?.id || '')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef(null)
  const folderInputRef = useRef(null)

  const uploadMany = async (fileList, fromFolder = false) => {
    const files = Array.from(fileList || [])
    if (!files.length || !canManage) return
    setBusy(true)
    try {
      let targetFolderId = folderId
      let rootName = ''
      if (fromFolder) {
        rootName = (files[0]?.webkitRelativePath || '').split('/')[0] || 'Hochgeladener Ordner'
        const existing = project.folders.find((f) => f.name === rootName)
        targetFolderId = existing?.id || uid('folder')
      }
      const uploaded = []
      for (const file of files) {
        const meta = await uploadProjectFile(file)
        uploaded.push({ ...meta, folderId: targetFolderId, relativePath: file.webkitRelativePath || '' })
      }
      mutate((p) => {
        if (fromFolder && !p.folders.some((f) => f.id === targetFolderId)) p.folders.push({ id: targetFolderId, name: rootName })
        p.files.unshift(...uploaded)
      }, fromFolder ? `Ordner „${rootName}“ mit ${uploaded.length} Dateien hochgeladen` : `${uploaded.length} Datei${uploaded.length === 1 ? '' : 'en'} hochgeladen`)
      if (fromFolder) setFolderId(targetFolderId)
      setToast(fromFolder ? `Ordner „${rootName}“ hochgeladen` : `${uploaded.length} Datei${uploaded.length === 1 ? '' : 'en'} hochgeladen`)
    } catch (error) { setToast(error.message) } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
      if (folderInputRef.current) folderInputRef.current.value = ''
    }
  }
  const remove = async (file) => {
    if (!canManage || !window.confirm(`„${file.name}“ wirklich löschen?`)) return
    try { await deleteProjectFile(file.id); mutate((p) => { p.files = p.files.filter((f) => f.id !== file.id) }, `Datei „${file.name}“ gelöscht`) } catch (error) { setToast(error.message) }
  }
  const addFolder = () => { if (!canManage) return; const name = window.prompt('Name des neuen Ordners'); if (name?.trim()) mutate((p) => p.folders.push({ id: uid('folder'), name: name.trim() }), `Ordner „${name.trim()}“ angelegt`) }
  const files = project.files.filter((f) => f.folderId === folderId)
  return <div className="page"><PageHeader eyebrow="GEMEINSAME ABLAGE" title="Dateien" description="Ordnerstruktur für Gründungsunterlagen, Anlagen und externe Dokumente." action={canManage ? <div className="header-actions"><button className="secondary-btn" onClick={addFolder}><Plus size={16} /> Neuer Ordner</button><label className={`secondary-btn ${busy ? 'disabled' : ''}`}><Upload size={16} /> Dateien<input ref={inputRef} hidden type="file" multiple onChange={(e) => uploadMany(e.target.files, false)} /></label><label className={`primary-btn ${busy ? 'disabled' : ''}`}><Folder size={16} /> {busy ? 'Lädt …' : 'Ordner hochladen'}<input ref={folderInputRef} hidden type="file" multiple webkitdirectory="" directory="" onChange={(e) => uploadMany(e.target.files, true)} /></label></div> : null} />
    <div className="files-layout"><aside className="folder-list">{project.folders.map((folder) => <button className={folder.id === folderId ? 'active' : ''} key={folder.id} onClick={() => setFolderId(folder.id)}><Folder size={17} /><span>{folder.name}</span><b>{project.files.filter((f) => f.folderId === folder.id).length}</b></button>)}</aside><section className="file-browser"><div className="file-head"><strong>{project.folders.find((f) => f.id === folderId)?.name}</strong><span>{files.length} Dateien</span></div>{files.length ? files.map((file) => <div className="file-row" key={file.id}><FileText size={19} /><div><strong>{file.name}</strong><span>{file.relativePath || `${formatBytes(file.size)} · ${file.uploadedBy || 'Team'}`}</span></div><a className="icon-btn" href={fileDownloadUrl(file.id)} title="Herunterladen"><Download size={16} /></a>{canManage && <button className="icon-btn" onClick={() => remove(file)} title="Löschen"><Trash2 size={16} /></button>}</div>) : <EmptyState text="In diesem Ordner liegen noch keine Dateien." />}</section></div>
  </div>
}
'''
s = s[:start] + files_component + s[end:]
p.write_text(s)

print('Migration prepared successfully')
