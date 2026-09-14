from pathlib import Path

path = Path('src/AppV2.jsx')
text = path.read_text(encoding='utf-8')

replacements = [
    (
        "  return user?.role === 'admin' || kind === 'founder' || doc.createdByEmail === user?.email",
        "  if (user?.role === 'viewer') return false\n  return user?.role === 'admin' || kind === 'founder' || doc.createdByEmail === user?.email",
    ),
    (
        "{page === 'documents' && <Documents project={project} user={user} mutate={mutate} />}",
        "{page === 'documents' && <Documents project={project} user={user} mutate={mutate} setToast={setToast} />}",
    ),
    (
        "{search && <SearchPalette results={searchResults} onSelect={(result) => { go(result.page); if (result.docId) sessionStorage.setItem('wekib-open-doc', result.docId) }} />}",
        "{search && <SearchPalette results={searchResults} onSelect={(result) => { go(result.page); if (result.docId) sessionStorage.setItem('wekib-open-doc', result.docId); if (result.fileId) sessionStorage.setItem('wekib-open-file', result.fileId) }} />}",
    ),
    (
        "  project.files.forEach((f) => { if (f.name?.toLowerCase().includes(q)) out.push({ type: 'Datei', id: f.id, title: f.name, subtitle: project.folders.find((x) => x.id === f.folderId)?.name || '', page: 'files' }) })",
        "  project.files.forEach((f) => { if (f.name?.toLowerCase().includes(q)) out.push({ type: 'Datei', id: f.id, title: f.name, subtitle: project.folders.find((x) => x.id === f.folderId)?.name || 'Upload', page: 'documents', fileId: f.id }) })",
    ),
]

for old, new in replacements:
    if old not in text:
        raise SystemExit(f'Expected source fragment not found: {old[:80]}')
    text = text.replace(old, new, 1)

start = text.index('function Documents(')
end = text.index('function Files(', start)
replacement = r'''function Documents({ project, user, mutate, setToast }) {
  const rememberedDoc = sessionStorage.getItem('wekib-open-doc')
  const rememberedFile = sessionStorage.getItem('wekib-open-file')
  const firstKey = rememberedDoc ? `doc:${rememberedDoc}` : rememberedFile ? `file:${rememberedFile}` : project.documents[0]?.id ? `doc:${project.documents[0].id}` : project.files[0]?.id ? `file:${project.files[0].id}` : null
  const [selectedKey, setSelectedKey] = useState(firstKey)
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const uploadRef = useRef(null)

  useEffect(() => {
    if (rememberedDoc) sessionStorage.removeItem('wekib-open-doc')
    if (rememberedFile) sessionStorage.removeItem('wekib-open-file')
  }, [])

  const entries = [
    ...project.documents.map((doc) => ({
      key: `doc:${doc.id}`,
      kind: 'document',
      item: doc,
      title: doc.title,
      subtitle: `${doc.category || 'Arbeitsdokument'} · ${statusLabel(doc.status)}`,
      search: `${doc.title} ${doc.category} ${stripHtml(doc.content)}`.toLowerCase(),
    })),
    ...project.files.map((file) => ({
      key: `file:${file.id}`,
      kind: 'file',
      item: file,
      title: file.name,
      subtitle: `Upload · ${formatBytes(file.size)}`,
      search: `${file.name} ${file.mime || ''}`.toLowerCase(),
    })),
  ]
  const visible = entries.filter((entry) => entry.search.includes(filter.trim().toLowerCase()))
  const selected = entries.find((entry) => entry.key === selectedKey) || entries[0] || null

  const createDoc = () => {
    if (user.role === 'viewer') return
    const doc = { id: uid('doc'), title: 'Neues Dokument', category: 'Eigene Dokumente', status: 'in_progress', owner: user.name || user.email, content: '<p></p>', versions: [], comments: [], createdByEmail: user.email, createdByName: user.name || user.email, createdAt: nowIso(), updatedAt: nowIso(), updatedBy: user.name || user.email }
    mutate((p) => p.documents.unshift(doc), 'Neues Dokument angelegt')
    setSelectedKey(`doc:${doc.id}`)
  }

  const upload = async (file) => {
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

  return <div className="page documents-page"><PageHeader eyebrow="ZENTRALER DOKUMENTENRAUM" title="Dokumente" description="Erstellte Arbeitsdokumente und hochgeladene Dateien gemeinsam an einem Ort – mit Up- und Download." action={<div className="header-actions">{user.role !== 'viewer' && <label className={`secondary-btn ${busy ? 'disabled' : ''}`}><Upload size={16} /> {busy ? 'Lädt …' : 'Hochladen'}<input ref={uploadRef} hidden type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.rtf" onChange={(e) => upload(e.target.files?.[0])} /></label>}{user.role !== 'viewer' && <button className="primary-btn" onClick={createDoc}><Plus size={16} /> Dokument erstellen</button>}</div>} />
    <div className="documents-summary"><span><strong>{project.documents.length}</strong> erstellte Dokumente</span><span><strong>{project.files.length}</strong> Uploads</span><span><strong>{entries.length}</strong> insgesamt</span></div>
    <div className="documents-layout"><aside className="doc-list"><div className="inline-search"><Search size={15} /><input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Dokumente & Uploads durchsuchen" /></div>{visible.length ? visible.map((entry) => <button key={entry.key} className={`doc-list-item ${selected?.key === entry.key ? 'active' : ''}`} onClick={() => setSelectedKey(entry.key)}>{entry.kind === 'document' ? <FileText size={17} /> : <Upload size={17} />}<div><strong>{entry.title}</strong><span>{entry.subtitle}</span></div></button>) : <EmptyState compact text="Keine passenden Dokumente gefunden." />}</aside>{selected?.kind === 'document' ? <DocumentEditor key={selected.item.id} doc={selected.item} user={user} project={project} mutate={mutate} /> : selected?.kind === 'file' ? <UploadedDocumentPanel key={selected.item.id} file={selected.item} user={user} mutate={mutate} setToast={setToast} setSelectedKey={setSelectedKey} /> : <EmptyState text="Noch keine Dokumente vorhanden." />}</div>
  </div>
}

function downloadEditableDocument(title, html) {
  const filename = `${safeFile(title || 'dokument')}.doc`
  const body = `<!doctype html><html><head><meta charset="utf-8"><title>${title || 'Dokument'}</title><style>body{font-family:Arial,sans-serif;line-height:1.6;margin:40px}h1,h2,h3{margin-top:1.4em}</style></head><body>${html || '<p></p>'}</body></html>`
  const blob = new Blob(['\ufeff', body], { type: 'application/msword;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function DocumentEditor({ doc, user, project, mutate }) {
  const canEdit = canEditDocument(project, user, doc)
  const [title, setTitle] = useState(doc.title)
  const [comment, setComment] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const editor = useEditor({ extensions: [StarterKit, Placeholder.configure({ placeholder: 'Gemeinsam formulieren …' })], content: doc.content || '<p></p>', editable: canEdit })

  useEffect(() => { if (editor && editor.getHTML() !== (doc.content || '<p></p>')) editor.commands.setContent(doc.content || '<p></p>') }, [doc.id])
  useEffect(() => { if (editor) editor.setEditable(canEdit) }, [canEdit, editor])

  const save = () => {
    const html = editor?.getHTML() || doc.content || ''
    mutate((p) => {
      const target = p.documents.find((d) => d.id === doc.id)
      if (!target) return
      if (target.content !== html || target.title !== title) target.versions.unshift({ id: uid('v'), content: target.content || '', title: target.title, author: user.name || user.email, email: user.email, createdAt: nowIso() })
      target.content = html
      target.title = title.trim() || 'Unbenanntes Dokument'
      target.updatedAt = nowIso()
      target.updatedBy = user.name || user.email
      target.status = target.status === 'open' ? 'in_progress' : target.status
    }, `Dokument „${title || doc.title}“ gespeichert`)
  }

  const restore = (version) => {
    if (!canEdit) return
    editor?.commands.setContent(version.content || '<p></p>')
    setTitle(version.title || doc.title)
  }

  const download = () => downloadEditableDocument(title || doc.title, editor?.getHTML() || doc.content || '')

  return <section className="editor-shell"><div className="editor-top"><div><input className="document-title" value={title} disabled={!canEdit} onChange={(e) => setTitle(e.target.value)} /><span>{canEdit ? `Bearbeitbar · zuletzt ${doc.updatedBy || 'noch nicht gespeichert'}` : 'Nur Lesen'}</span></div><div className="editor-actions"><button className="secondary-btn" onClick={download}><Download size={16} /> Download</button><button className="secondary-btn" onClick={() => setHistoryOpen(!historyOpen)}><History size={16} /> Versionen</button>{canEdit && <button className="primary-btn" onClick={save}><Save size={16} /> Speichern</button>}</div></div>
    <div className="editor-toolbar"><button disabled={!canEdit} className={editor?.isActive('bold') ? 'active' : ''} onClick={() => editor?.chain().focus().toggleBold().run()}><Bold size={16} /></button><button disabled={!canEdit} className={editor?.isActive('italic') ? 'active' : ''} onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic size={16} /></button><button disabled={!canEdit} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={16} /></button><button disabled={!canEdit} onClick={() => editor?.chain().focus().toggleBulletList().run()}><List size={16} /></button><span /><button disabled={!canEdit} onClick={() => editor?.chain().focus().undo().run()}><Undo2 size={16} /></button><button disabled={!canEdit} onClick={() => editor?.chain().focus().redo().run()}><Redo2 size={16} /></button></div>
    <EditorContent editor={editor} className="rich-editor" />
    <div className="editor-meta"><div><MessageSquare size={16} /><strong>Kommentare</strong></div><div className="comment-list">{doc.comments.map((c) => <div key={c.id}><strong>{c.author}</strong><span>{c.text}</span><small>{fmtDateTime(c.createdAt)}</small></div>)}</div>{canEdit && <form className="comment-form" onSubmit={(e) => { e.preventDefault(); if (!comment.trim()) return; mutate((p) => p.documents.find((d) => d.id === doc.id).comments.push({ id: uid('dc'), author: user.name || user.email, email: user.email, text: comment.trim(), createdAt: nowIso() }), `Kommentar zu „${doc.title}“ hinzugefügt`); setComment('') }}><input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Kommentar oder Hinweis ergänzen …" /><button className="secondary-btn">Senden</button></form>}</div>
    {historyOpen && <aside className="history-panel"><div className="history-head"><strong>Versionshistorie</strong><button className="icon-btn" onClick={() => setHistoryOpen(false)}><X size={17} /></button></div>{doc.versions.length ? doc.versions.map((v, i) => <button className="version-row" key={v.id} onClick={() => restore(v)}><span>Version {doc.versions.length - i}</span><strong>{v.author}</strong><small>{fmtDateTime(v.createdAt)}</small></button>) : <EmptyState compact text="Noch keine ältere Version." />}</aside>}
    </section>
}

function UploadedDocumentPanel({ file, user, mutate, setToast, setSelectedKey }) {
  const remove = async () => {
    if (!window.confirm(`„${file.name}“ wirklich löschen?`)) return
    try {
      await deleteProjectFile(file.id)
      mutate((p) => { p.files = p.files.filter((item) => item.id !== file.id) }, `Dokument „${file.name}“ gelöscht`)
      setSelectedKey(null)
      setToast?.('Dokument gelöscht')
    } catch (error) {
      setToast?.(error.message || 'Dokument konnte nicht gelöscht werden.')
    }
  }

  return <section className="editor-shell uploaded-document-panel"><div className="editor-top"><div><strong className="uploaded-document-title">{file.name}</strong><span>Hochgeladen {file.uploadedAt ? `· ${fmtDateTime(file.uploadedAt)}` : ''}</span></div><div className="editor-actions"><a className="primary-btn" href={fileDownloadUrl(file.id)}><Download size={16} /> Herunterladen</a>{user.role !== 'viewer' && <button className="secondary-btn" onClick={remove}><Trash2 size={16} /> Löschen</button>}</div></div><div className="uploaded-document-body"><div className="uploaded-document-icon"><FileText size={34} /></div><div><p className="eyebrow">HOCHGELADENE DATEI</p><h2>{file.name}</h2><p>{formatBytes(file.size)}{file.mime ? ` · ${file.mime}` : ''}{file.uploadedBy ? ` · von ${file.uploadedBy}` : ''}</p><a className="primary-btn" href={fileDownloadUrl(file.id)}><Download size={16} /> Originaldatei herunterladen</a></div></div></section>
}

'''

text = text[:start] + replacement + text[end:]
path.write_text(text, encoding='utf-8')

css = Path('src/production.css')
current = css.read_text(encoding='utf-8')
marker = '/* Dokumentenraum: Arbeitsdokumente + Uploads */'
if marker not in current:
    current += r'''

/* Dokumentenraum: Arbeitsdokumente + Uploads */
.documents-summary{display:flex;gap:8px;flex-wrap:wrap;margin:-10px 0 14px}.documents-summary span{display:inline-flex;gap:5px;align-items:center;background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:7px 10px;font-size:9px;color:var(--muted)}.documents-summary strong{font-size:11px;color:var(--text)}.uploaded-document-title{font-size:17px;letter-spacing:-.02em}.uploaded-document-body{min-height:390px;display:flex;align-items:center;justify-content:center;gap:22px;padding:42px;text-align:left}.uploaded-document-body>div:last-child{max-width:540px}.uploaded-document-body h2{font-size:25px;letter-spacing:-.035em;margin:7px 0}.uploaded-document-body p:not(.eyebrow){color:var(--muted);font-size:11px;line-height:1.6;margin:0 0 20px}.uploaded-document-icon{width:76px;height:76px;border-radius:12px;background:var(--purple-soft);color:var(--purple);display:grid;place-items:center;flex:none}.secondary-btn.disabled{opacity:.55;pointer-events:none}@media(max-width:600px){.documents-summary{margin-top:-4px}.uploaded-document-body{min-height:300px;padding:30px 20px;align-items:flex-start;flex-direction:column}.uploaded-document-body h2{font-size:21px}.documents-page .page-header .header-actions{grid-template-columns:1fr 1fr}.documents-page .editor-actions{display:grid;grid-template-columns:1fr 1fr}.documents-page .editor-actions .primary-btn:last-child{grid-column:1/-1}}
'''
    css.write_text(current, encoding='utf-8')

print('Document hub patch applied.')
