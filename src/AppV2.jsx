import { useEffect, useMemo, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import {
  Activity, ArrowDown, ArrowUp, Bell, Bold, CalendarDays, Check, CheckSquare2,
  ChevronRight, Circle, Download, Eye, EyeOff, FileText, Folder, Gavel, Heading2,
  History, Italic, LayoutDashboard, List, LockKeyhole, LogOut, Menu, MessageSquare,
  Moon, Plus, Save, Search, Settings2, Shield, SlidersHorizontal, Sparkles, Sun,
  Target, Trash2, Undo2, Redo2, Upload, UserCircle, Users, Vote, X,
} from 'lucide-react'
import {
  cloudEnabled, createUserAccount, deleteProjectFile, fileDownloadUrl, getSession,
  listUserAccounts, loadCloudState, loadLocalState, onAuthChange, saveCloudState,
  saveLocalState, signInWithEmail, signOut, subscribeCloudState, updateUserAccount,
  uploadProjectFile,
} from './lib/projectStore.js'
import PollsWithImages from './PollsWithImages.jsx'

const NAV = [
  ['dashboard', 'Übersicht', LayoutDashboard],
  ['tasks', 'Aufgaben', CheckSquare2],
  ['documents', 'Dokumente', FileText],
  ['files', 'Dateien', Folder],
  ['polls', 'Umfragen', Vote],
  ['calendar', 'Termine', CalendarDays],
  ['members', 'Mitglieder', Users],
  ['decisions', 'Entscheidungen', Gavel],
  ['activity', 'Aktivität', Activity],
]

const DASHBOARD_MODULES = [
  ['hero', 'Willkommen & Fokus'],
  ['progress', 'Gründungsfortschritt'],
  ['tasks', 'Offene Aufgaben'],
  ['documents', 'Dokumentenstatus'],
  ['polls', 'Laufende Umfragen'],
  ['calendar', 'Nächste Termine'],
  ['activity', 'Letzte Aktivitäten'],
]

const DEFAULT_LAYOUT = DASHBOARD_MODULES.map(([id]) => id)
const nowIso = () => new Date().toISOString()
const uid = (prefix = 'id') => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const clone = (value) => JSON.parse(JSON.stringify(value))
const stripHtml = (html = '') => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
const fmtDate = (value) => value ? new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)) : '—'
const fmtDateTime = (value) => value ? new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—'

function normalizeProject(input = {}) {
  const p = clone(input)
  p.meta = { projectName: 'WeKiB e.V. · Gründung', subtitle: 'Gemeinsam einen starken Bildungsträger aufbauen', location: 'Langenzenn · Bayern', ...(p.meta || {}) }
  p.settings = {
    brandName: 'WeKiB',
    dashboardLayout: DEFAULT_LAYOUT,
    hiddenDashboardModules: [],
    ...(p.settings || {}),
  }
  if (!Array.isArray(p.settings.dashboardLayout) || !p.settings.dashboardLayout.length) p.settings.dashboardLayout = DEFAULT_LAYOUT
  p.tasks = Array.isArray(p.tasks) ? p.tasks.map((t) => ({ comments: [], ...t })) : []
  p.documents = Array.isArray(p.documents) ? p.documents.map((d) => ({
    content: '', versions: [], comments: [], createdByEmail: '', createdByName: '', createdAt: nowIso(), updatedAt: null, updatedBy: '', ...d,
  })) : []
  p.folders = Array.isArray(p.folders) && p.folders.length ? p.folders : [
    { id: 'folder-gruendung', name: 'Gründung' },
    { id: 'folder-satzung', name: 'Satzung & Recht' },
    { id: 'folder-finanzamt', name: 'Finanzamt' },
    { id: 'folder-organisation', name: 'Organisation' },
  ]
  p.files = Array.isArray(p.files) ? p.files : []
  p.events = Array.isArray(p.events) ? p.events : []
  p.decisions = Array.isArray(p.decisions) ? p.decisions : []
  p.polls = Array.isArray(p.polls) ? p.polls : []
  p.profiles = Array.isArray(p.profiles) ? p.profiles : []
  p.onboarding = p.onboarding && typeof p.onboarding === 'object' ? p.onboarding : {}
  p.activities = Array.isArray(p.activities) ? p.activities : []
  p.messages = Array.isArray(p.messages) ? p.messages : []
  p.phases = Array.isArray(p.phases) ? p.phases : []
  p.milestones = Array.isArray(p.milestones) ? p.milestones : []
  return p
}

function getProfile(project, user) {
  if (!project || !user) return null
  return project.profiles.find((p) => p.email?.toLowerCase() === user.email?.toLowerCase()) || null
}

function memberKind(project, user) {
  if (user?.role === 'admin') return 'admin'
  return getProfile(project, user)?.kind || 'founder'
}

function canEditDocument(project, user, doc) {
  const kind = memberKind(project, user)
  if (user?.role === 'viewer') return false
  return user?.role === 'admin' || kind === 'founder' || doc.createdByEmail === user?.email
}

function AppV2() {
  const [project, setProject] = useState(null)
  const [session, setSession] = useState(null)
  const [ready, setReady] = useState(false)
  const [page, setPage] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [theme, setTheme] = useState(() => localStorage.getItem('wekib-theme') || 'light')
  const [search, setSearch] = useState('')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [toast, setToast] = useState('')
  const skipNextSave = useRef(false)

  const user = session?.user || (!cloudEnabled ? { id: 0, email: 'demo@wekib.local', name: 'Demo Admin', role: 'admin' } : null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('wekib-theme', theme)
  }, [theme])

  useEffect(() => {
    let mounted = true
    const boot = async () => {
      try {
        if (cloudEnabled) {
          const s = await getSession()
          if (!mounted) return
          setSession(s)
          if (s) setProject(normalizeProject(await loadCloudState()))
        } else {
          setSession({ user: { id: 0, email: 'demo@wekib.local', name: 'Demo Admin', role: 'admin' } })
          setProject(normalizeProject(loadLocalState()))
        }
      } catch (error) {
        setAuthMessage(error.message)
      } finally {
        if (mounted) setReady(true)
      }
    }
    boot()
    return () => { mounted = false }
  }, [])

  useEffect(() => onAuthChange(async (nextSession) => {
    setSession(nextSession)
    if (nextSession) {
      setProject(normalizeProject(await loadCloudState()))
    } else setProject(null)
  }), [])

  useEffect(() => {
    if (!ready || !project || !user) return undefined
    if (skipNextSave.current) {
      skipNextSave.current = false
      return undefined
    }
    const timer = window.setTimeout(async () => {
      try {
        if (cloudEnabled) await saveCloudState(project)
        else saveLocalState(project)
      } catch (error) {
        setToast(`Speichern fehlgeschlagen: ${error.message}`)
      }
    }, 500)
    return () => window.clearTimeout(timer)
  }, [project, ready, user])

  useEffect(() => {
    if (!cloudEnabled || !session || !ready) return undefined
    return subscribeCloudState((remote) => {
      skipNextSave.current = true
      setProject(normalizeProject(remote))
    })
  }, [session, ready])

  useEffect(() => {
    if (!toast) return undefined
    const t = window.setTimeout(() => setToast(''), 3200)
    return () => window.clearTimeout(t)
  }, [toast])

  const mutate = (recipe, activityText = '') => {
    setProject((current) => {
      const next = normalizeProject(current)
      recipe(next)
      next.meta.lastUpdated = nowIso()
      if (activityText) {
        next.activities.unshift({ id: uid('act'), text: activityText, actor: user?.name || user?.email || 'Nutzer', createdAt: nowIso(), kind: 'user' })
        next.activities = next.activities.slice(0, 160)
      }
      return next
    })
  }

  const login = async (event) => {
    event.preventDefault()
    setAuthMessage('')
    try {
      await signInWithEmail(authEmail, authPassword)
    } catch (error) {
      setAuthMessage(error.message)
    }
  }

  const logout = async () => {
    await signOut()
    setSession(null)
    setProject(null)
  }

  if (!ready) return <LoadingScreen />
  if (cloudEnabled && !session) return <LoginScreen email={authEmail} setEmail={setAuthEmail} password={authPassword} setPassword={setAuthPassword} message={authMessage} onSubmit={login} theme={theme} setTheme={setTheme} />
  if (!project || !user) return <LoadingScreen />

  const profile = getProfile(project, user)
  const kind = memberKind(project, user)
  const onboardingDone = project.onboarding[user.email]?.done

  const searchResults = buildSearchResults(project, search)

  const go = (target) => {
    setPage(target)
    setSidebarOpen(false)
    setSearch('')
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? 'is-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">W</div>
          <div><strong>{project.settings.brandName || 'WeKiB'}</strong><span>Gründungsplattform</span></div>
        </div>
        <nav className="nav-stack">
          {NAV.map(([id, label, Icon]) => (
            <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => go(id)}><Icon size={18} /><span>{label}</span></button>
          ))}
          {user.role === 'admin' && <button className={`nav-item ${page === 'studio' ? 'active' : ''}`} onClick={() => go('studio')}><SlidersHorizontal size={18} /><span>Studio</span></button>}
        </nav>
        <div className="sidebar-foot">
          <button className={`profile-chip ${page === 'profile' ? 'active' : ''}`} onClick={() => go('profile')}>
            <Avatar name={profile?.displayName || user.name || user.email} />
            <div><strong>{profile?.displayName || user.name || 'Profil'}</strong><span>{kindLabel(kind)}</span></div>
          </button>
          <button className="icon-btn" title="Abmelden" onClick={logout}><LogOut size={18} /></button>
        </div>
      </aside>
      {sidebarOpen && <button className="sidebar-scrim" onClick={() => setSidebarOpen(false)} aria-label="Menü schließen" />}

      <main className="main-area">
        <header className="topbar">
          <button className="icon-btn mobile-menu" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>
          <div className="global-search-wrap">
            <Search size={18} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Dokumente, Aufgaben, Dateien durchsuchen …" />
            {search && <button className="search-clear" onClick={() => setSearch('')}><X size={16} /></button>}
            {search && <SearchPalette results={searchResults} onSelect={(result) => { go(result.page); if (result.docId) sessionStorage.setItem('wekib-open-doc', result.docId); if (result.fileId) sessionStorage.setItem('wekib-open-file', result.fileId) }} />}
          </div>
          <div className="top-actions">
            <div className="env-badge">LAB</div>
            <button className="icon-btn" title="Darstellung wechseln" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
            <button className="icon-btn"><Bell size={18} /></button>
          </div>
        </header>

        <div className="content-frame">
          {page === 'dashboard' && <Dashboard project={project} user={user} mutate={mutate} go={go} />}
          {page === 'tasks' && <Tasks project={project} user={user} mutate={mutate} />}
          {page === 'documents' && <Documents project={project} user={user} mutate={mutate} setToast={setToast} />}
          {page === 'files' && <Files project={project} user={user} mutate={mutate} setToast={setToast} />}
          {page === 'polls' && <PollsWithImages project={project} user={user} mutate={mutate} setToast={setToast} />}
          {page === 'calendar' && <Calendar project={project} user={user} mutate={mutate} />}
          {page === 'members' && <Members project={project} user={user} mutate={mutate} setToast={setToast} />}
          {page === 'decisions' && <Decisions project={project} user={user} mutate={mutate} />}
          {page === 'activity' && <ActivityPage project={project} />}
          {page === 'studio' && user.role === 'admin' && <Studio project={project} mutate={mutate} />}
          {page === 'profile' && <Profile project={project} user={user} mutate={mutate} />}
        </div>
      </main>

      {!onboardingDone && <Onboarding project={project} user={user} mutate={mutate} kind={kind} />}
      {toast && <div className="toast"><Check size={17} />{toast}</div>}
    </div>
  )
}

function LoadingScreen() {
  return <div className="loading-screen"><div className="brand-mark large">W</div><span>Projektzentrale wird geladen …</span></div>
}

function LoginScreen({ email, setEmail, password, setPassword, message, onSubmit, theme, setTheme }) {
  return <div className="login-shell">
    <button className="login-theme icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
    <div className="login-panel">
      <div className="brand-mark large">W</div>
      <p className="eyebrow">WEKIB · GRÜNDUNG</p>
      <h1>Gemeinsam gestalten.<br />Sauber gründen.</h1>
      <p className="lead">Die interne Arbeitsplattform für Gründungsmitglieder, Dokumente, Entscheidungen und den gemeinsamen Fahrplan.</p>
      <form onSubmit={onSubmit} className="login-form">
        <label>E-Mail-Adresse<input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Passwort<input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <button className="primary-btn" type="submit">Anmelden <ChevronRight size={18} /></button>
        {message && <div className="form-message">{message}</div>}
      </form>
      <p className="microcopy"><LockKeyhole size={14} /> Geschützter LAB-Zugang · Daten werden zentral auf STRATO gespeichert.</p>
    </div>
    <div className="login-art"><div className="art-grid" /><div className="art-copy"><Sparkles size={22} /><span>Von der Idee<br />zum tragfähigen<br />Bildungsträger.</span></div></div>
  </div>
}

function PageHeader({ eyebrow, title, description, action }) {
  return <div className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</div>
}

function Dashboard({ project, user, mutate, go }) {
  const layout = project.settings.dashboardLayout || DEFAULT_LAYOUT
  const hidden = project.settings.hiddenDashboardModules || []
  const activePhase = project.phases.find((p) => p.status === 'active') || project.phases[0]
  const todo = project.tasks.filter((t) => t.status !== 'done')
  const openPolls = project.polls.filter((p) => p.status === 'open')
  const upcoming = [...project.events].filter((e) => !e.date || new Date(e.date) >= new Date(new Date().toDateString())).sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(0, 4)
  const completeDocs = project.documents.filter((d) => d.status === 'done').length
  const progress = project.documents.length ? Math.round((completeDocs / project.documents.length) * 100) : 0

  const modules = {
    hero: <section className="hero-panel" key="hero"><div><p className="eyebrow">GUTEN TAG, {firstName(user.name || user.email).toUpperCase()}</p><h2>Heute bringen wir WeKiB<br />einen Schritt weiter.</h2><p>{activePhase?.description || 'Alle Gründungsschritte an einem Ort.'}</p><div className="hero-actions"><button className="primary-btn" onClick={() => go('tasks')}>Offene Aufgaben <ChevronRight size={17} /></button><button className="secondary-btn" onClick={() => go('documents')}>Dokumente öffnen</button></div></div><div className="hero-phase"><span>AKTUELLE PHASE</span><strong>{activePhase?.title || 'Gründung'}</strong><small>{activePhase?.milestone}</small></div></section>,
    progress: <section className="metric-grid" key="progress"><Metric label="Dokumente bereit" value={`${completeDocs}/${project.documents.length}`} hint={`${progress}% vollständig`} /><Metric label="Offene Aufgaben" value={todo.length} hint="im Gründungsplan" /><Metric label="Laufende Umfragen" value={openPolls.length} hint="Entscheidungen offen" /><Metric label="Nächster Meilenstein" value={fmtDate(project.milestones.find((m) => m.status === 'active')?.date || project.milestones[0]?.date)} hint={project.milestones.find((m) => m.status === 'active')?.title || project.milestones[0]?.title || '—'} /></section>,
    tasks: <DashboardCard key="tasks" title="Was jetzt wichtig ist" action={<button onClick={() => go('tasks')}>Alle Aufgaben</button>}><div className="stack-list">{todo.slice(0, 5).map((task) => <div className="list-row" key={task.id}><button className="status-dot" onClick={() => mutate((p) => { const t = p.tasks.find((x) => x.id === task.id); t.status = t.status === 'done' ? 'todo' : 'done' }, `${task.title} aktualisiert`)}><Circle size={17} /></button><div><strong>{task.title}</strong><span>{task.owner} · {fmtDate(task.due)}</span></div><PriorityBadge value={task.priority} /></div>)}</div></DashboardCard>,
    documents: <DashboardCard key="documents" title="Gründungsunterlagen" action={<button onClick={() => go('documents')}>Dokumentenraum</button>}><div className="doc-progress"><div className="progress-ring" style={{ '--progress': `${progress * 3.6}deg` }}><span>{progress}%</span></div><div><strong>{completeDocs} Dokumente abgeschlossen</strong><p>{project.documents.filter((d) => d.status === 'in_progress').length} befinden sich aktuell in Bearbeitung.</p></div></div></DashboardCard>,
    polls: <DashboardCard key="polls" title="Entscheidungen brauchen Stimmen" action={<button onClick={() => go('polls')}>Umfragen</button>}><div className="stack-list">{openPolls.length ? openPolls.slice(0, 3).map((poll) => <div className="list-row" key={poll.id}><Vote size={18} /><div><strong>{poll.title}</strong><span>endet {fmtDate(poll.closes)}</span></div></div>) : <EmptyState compact text="Aktuell keine offene Umfrage." />}</div></DashboardCard>,
    calendar: <DashboardCard key="calendar" title="Nächste Termine" action={<button onClick={() => go('calendar')}>Kalender</button>}><div className="stack-list">{upcoming.length ? upcoming.map((event) => <div className="calendar-row" key={event.id}><div className="date-tile"><strong>{new Date(event.date).getDate()}</strong><span>{new Intl.DateTimeFormat('de-DE', { month: 'short' }).format(new Date(event.date))}</span></div><div><strong>{event.title}</strong><span>{event.time || 'ganztägig'} · {event.category || 'Termin'}</span></div></div>) : <EmptyState compact text="Noch keine Termine eingetragen." />}</div></DashboardCard>,
    activity: <DashboardCard key="activity" title="Was sich zuletzt bewegt hat" action={<button onClick={() => go('activity')}>Verlauf</button>}><Timeline items={project.activities.slice(0, 5)} /></DashboardCard>,
  }

  return <div className="page"><PageHeader eyebrow="PROJEKTZENTRALE" title="Übersicht" description="Dein persönlicher Blick auf die Gründung von WeKiB e.V." /><div className="dashboard-layout">{layout.filter((id) => !hidden.includes(id)).map((id) => modules[id]).filter(Boolean)}</div></div>
}

function Metric({ label, value, hint }) { return <div className="metric-card"><span>{label}</span><strong>{value}</strong><small>{hint}</small></div> }
function DashboardCard({ title, action, children }) { return <section className="card"><div className="card-head"><h3>{title}</h3>{action}</div>{children}</section> }
function PriorityBadge({ value }) { return <span className={`priority ${value || 'medium'}`}>{value === 'high' ? 'hoch' : value === 'low' ? 'niedrig' : 'mittel'}</span> }

function Tasks({ project, user, mutate }) {
  const [newTitle, setNewTitle] = useState('')
  const columns = [['todo', 'Offen'], ['doing', 'In Arbeit'], ['done', 'Erledigt']]
  const add = (e) => { e.preventDefault(); if (!newTitle.trim()) return; mutate((p) => p.tasks.unshift({ id: uid('task'), title: newTitle.trim(), status: 'todo', priority: 'medium', owner: user.name || user.email, due: '', tags: [], comments: [] }), `Aufgabe „${newTitle.trim()}“ angelegt`); setNewTitle('') }
  return <div className="page"><PageHeader eyebrow="ARBEITSFLUSS" title="Aufgaben" description="Kanban für alles, was bis zur Gründung erledigt werden muss." action={<form className="quick-add" onSubmit={add}><input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Neue Aufgabe …" /><button className="primary-btn"><Plus size={16} /> Anlegen</button></form>} />
    <div className="kanban">{columns.map(([status, label]) => <section className="kanban-column" key={status}><div className="kanban-head"><span>{label}</span><b>{project.tasks.filter((t) => t.status === status).length}</b></div>{project.tasks.filter((t) => t.status === status).map((task) => <TaskCard key={task.id} task={task} mutate={mutate} user={user} />)}</section>)}</div>
  </div>
}

function TaskCard({ task, mutate, user }) {
  const [comment, setComment] = useState('')
  const nextStatus = task.status === 'todo' ? 'doing' : task.status === 'doing' ? 'done' : 'todo'
  return <article className="task-card"><div className="task-top"><PriorityBadge value={task.priority} /><button className="icon-btn mini" onClick={() => mutate((p) => { p.tasks = p.tasks.filter((t) => t.id !== task.id) }, `Aufgabe „${task.title}“ entfernt`)}><Trash2 size={14} /></button></div><h4>{task.title}</h4><p>{task.owner || 'Nicht zugewiesen'} {task.due ? `· ${fmtDate(task.due)}` : ''}</p><div className="task-foot"><button onClick={() => mutate((p) => { p.tasks.find((t) => t.id === task.id).status = nextStatus }, `Status von „${task.title}“ geändert`)}>{task.status === 'done' ? 'Wieder öffnen' : 'Weiter'} <ChevronRight size={14} /></button><span><MessageSquare size={14} /> {task.comments?.length || 0}</span></div><details className="comments"><summary>Kommentare</summary><div className="comment-list">{(task.comments || []).map((c) => <div key={c.id}><strong>{c.author}</strong><span>{c.text}</span></div>)}</div><form onSubmit={(e) => { e.preventDefault(); if (!comment.trim()) return; mutate((p) => p.tasks.find((t) => t.id === task.id).comments.push({ id: uid('c'), author: user.name || user.email, email: user.email, text: comment.trim(), createdAt: nowIso() }), `Kommentar zu „${task.title}“ hinzugefügt`); setComment('') }}><input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Kommentar …" /></form></details></article>
}

function Documents({ project, user, mutate, setToast }) {
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

function Files({ project, user, mutate, setToast }) {
  const [folderId, setFolderId] = useState(project.folders[0]?.id || '')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef(null)
  const upload = async (file) => {
    if (!file) return
    setBusy(true)
    try {
      const meta = await uploadProjectFile(file)
      mutate((p) => p.files.unshift({ ...meta, folderId }), `Datei „${file.name}“ hochgeladen`)
      setToast('Datei hochgeladen')
    } catch (error) { setToast(error.message) } finally { setBusy(false); if (inputRef.current) inputRef.current.value = '' }
  }
  const remove = async (file) => {
    if (!window.confirm(`„${file.name}“ wirklich löschen?`)) return
    try { await deleteProjectFile(file.id); mutate((p) => { p.files = p.files.filter((f) => f.id !== file.id) }, `Datei „${file.name}“ gelöscht`) } catch (error) { setToast(error.message) }
  }
  const addFolder = () => { const name = window.prompt('Name des neuen Ordners'); if (name?.trim()) mutate((p) => p.folders.push({ id: uid('folder'), name: name.trim() }), `Ordner „${name.trim()}“ angelegt`) }
  const files = project.files.filter((f) => f.folderId === folderId)
  return <div className="page"><PageHeader eyebrow="GEMEINSAME ABLAGE" title="Dateien" description="Ordnerstruktur für Gründungsunterlagen, Anlagen und externe Dokumente." action={<div className="header-actions"><button className="secondary-btn" onClick={addFolder}><Plus size={16} /> Ordner</button><label className={`primary-btn ${busy ? 'disabled' : ''}`}><Upload size={16} /> {busy ? 'Lädt …' : 'Hochladen'}<input ref={inputRef} hidden type="file" onChange={(e) => upload(e.target.files?.[0])} /></label></div>} />
    <div className="files-layout"><aside className="folder-list">{project.folders.map((folder) => <button className={folder.id === folderId ? 'active' : ''} key={folder.id} onClick={() => setFolderId(folder.id)}><Folder size={17} /><span>{folder.name}</span><b>{project.files.filter((f) => f.folderId === folder.id).length}</b></button>)}</aside><section className="file-browser"><div className="file-head"><strong>{project.folders.find((f) => f.id === folderId)?.name}</strong><span>{files.length} Dateien</span></div>{files.length ? files.map((file) => <div className="file-row" key={file.id}><div className="file-icon"><FileText size={19} /></div><div><strong>{file.name}</strong><span>{formatBytes(file.size)} · {file.uploadedBy || user.name} · {fmtDateTime(file.uploadedAt)}</span></div><a className="icon-btn" href={fileDownloadUrl(file.id)} title="Herunterladen"><Download size={17} /></a><button className="icon-btn" onClick={() => remove(file)}><Trash2 size={16} /></button></div>) : <EmptyState text="Dieser Ordner ist noch leer." />}</section></div>
  </div>
}

function Polls({ project, user, mutate }) {
  const [showNew, setShowNew] = useState(false)
  const [title, setTitle] = useState('')
  const [options, setOptions] = useState('Ja\nNein')
  const create = (e) => { e.preventDefault(); const opts = options.split('\n').map((x) => x.trim()).filter(Boolean); if (!title.trim() || opts.length < 2) return; mutate((p) => p.polls.unshift({ id: uid('poll'), title: title.trim(), description: '', status: 'open', closes: '', multiple: false, createdBy: user.email, options: opts.map((label) => ({ id: uid('opt'), label, votes: [] })) }), `Umfrage „${title.trim()}“ gestartet`); setTitle(''); setShowNew(false) }
  return <div className="page"><PageHeader eyebrow="GEMEINSAM ENTSCHEIDEN" title="Umfragen" description="Transparente Meinungsbilder und Entscheidungen im Gründungskreis." action={<button className="primary-btn" onClick={() => setShowNew(!showNew)}><Plus size={16} /> Umfrage</button>} />{showNew && <form className="card form-grid" onSubmit={create}><label>Titel<input value={title} onChange={(e) => setTitle(e.target.value)} /></label><label>Antworten · eine pro Zeile<textarea value={options} onChange={(e) => setOptions(e.target.value)} /></label><button className="primary-btn">Starten</button></form>}<div className="poll-grid">{project.polls.map((poll) => <PollCard key={poll.id} poll={poll} user={user} mutate={mutate} />)}</div></div>
}

function PollCard({ poll, user, mutate }) {
  const total = poll.options.reduce((n, o) => n + o.votes.length, 0)
  const myVote = poll.options.find((o) => o.votes.includes(user.email))?.id
  return <article className="poll-card"><div className="poll-head"><span className={`status-pill ${poll.status}`}>{poll.status === 'open' ? 'offen' : 'beendet'}</span>{poll.closes && <small>bis {fmtDate(poll.closes)}</small>}</div><h3>{poll.title}</h3><p>{poll.description}</p><div className="poll-options">{poll.options.map((option) => { const percent = total ? Math.round((option.votes.length / total) * 100) : 0; return <button key={option.id} disabled={poll.status !== 'open'} className={myVote === option.id ? 'selected' : ''} onClick={() => mutate((p) => { const target = p.polls.find((x) => x.id === poll.id); target.options.forEach((o) => { o.votes = o.votes.filter((v) => v !== user.email) }); target.options.find((o) => o.id === option.id).votes.push(user.email) }, `Stimme bei „${poll.title}“ abgegeben`)}><span>{option.label}</span><b>{percent}%</b><i style={{ width: `${percent}%` }} /></button> })}</div><small>{total} abgegebene Stimmen</small></article>
}

function Calendar({ project, user, mutate }) {
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ title: '', date: '', time: '', category: 'Gründung' })
  const events = [...project.events].sort((a, b) => String(a.date).localeCompare(String(b.date)))
  const add = (e) => { e.preventDefault(); if (!form.title || !form.date) return; mutate((p) => p.events.push({ id: uid('event'), ...form, createdBy: user.email }), `Termin „${form.title}“ angelegt`); setForm({ title: '', date: '', time: '', category: 'Gründung' }); setShowNew(false) }
  return <div className="page"><PageHeader eyebrow="ZEIT & FRISTEN" title="Termine" description="Gründungsversammlung, Fristen, Abstimmungen und externe Termine im Blick." action={<div className="header-actions"><button className="secondary-btn" onClick={() => downloadIcs(events, 'wekib-gruendung.ics')}><Download size={16} /> iCal exportieren</button><button className="primary-btn" onClick={() => setShowNew(!showNew)}><Plus size={16} /> Termin</button></div>} />{showNew && <form className="card form-row" onSubmit={add}><input placeholder="Titel" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /><input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /><button className="primary-btn">Speichern</button></form>}<div className="timeline-calendar">{events.length ? events.map((event) => <article key={event.id}><div className="date-tile large"><strong>{new Date(event.date).getDate()}</strong><span>{new Intl.DateTimeFormat('de-DE', { month: 'short' }).format(new Date(event.date))}</span></div><div><span className="eyebrow">{event.category}</span><h3>{event.title}</h3><p>{event.time || 'Ganztägig'} {event.notes ? `· ${event.notes}` : ''}</p></div><button className="icon-btn" title="Als iCal" onClick={() => downloadIcs([event], `${safeFile(event.title)}.ics`)}><Download size={17} /></button></article>) : <EmptyState text="Noch keine Termine angelegt." />}</div></div>
}

function Members({ project, user, mutate, setToast }) {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'member', kind: 'founder' })
  const isAdmin = user.role === 'admin'

  const refresh = async () => {
    if (!isAdmin || !cloudEnabled) return
    setLoading(true)
    try { setAccounts(await listUserAccounts()) } catch (e) { setToast(e.message) } finally { setLoading(false) }
  }
  useEffect(() => { refresh() }, [isAdmin])

  const create = async (e) => {
    e.preventDefault()
    try {
      const account = await createUserAccount(form)
      mutate((p) => {
        if (!p.profiles.some((x) => x.email === form.email.toLowerCase())) p.profiles.push({ email: form.email.toLowerCase(), displayName: form.name, kind: form.kind, visible: true, area: '', bio: '' })
      }, `Zugang für ${form.name} angelegt`)
      setAccounts((a) => [account, ...a]); setShowNew(false); setForm({ name: '', email: '', password: '', role: 'member', kind: 'founder' }); setToast('Benutzerzugang angelegt')
    } catch (e2) { setToast(e2.message) }
  }

  const profiles = project.profiles.filter((p) => p.visible || isAdmin || p.email === user.email)
  return <div className="page"><PageHeader eyebrow="GRÜNDUNGSKREIS" title="Mitglieder & Zugänge" description="Nur die Informationen, die für die gemeinsame Gründung wirklich relevant sind." action={isAdmin && <button className="primary-btn" onClick={() => setShowNew(!showNew)}><Plus size={16} /> Zugang anlegen</button>} />
    {showNew && <form className="card account-form" onSubmit={create}><label>Name<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label><label>E-Mail<input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label><label>Startpasswort<input required minLength="12" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label><label>Art<select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}><option value="founder">Gründungsmitglied</option><option value="member">Normaler Nutzer</option></select></label><label>Zugriffsrecht<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="member">Bearbeiten</option><option value="viewer">Nur lesen</option><option value="admin">Admin</option></select></label><button className="primary-btn">Zugang erstellen</button></form>}
    <section className="member-grid">{profiles.length ? profiles.map((profile) => <ProfileCard key={profile.email} profile={profile} project={project} user={user} mutate={mutate} />) : <EmptyState text="Profile werden sichtbar, sobald Mitglieder ihre Angaben vervollständigen." />}</section>
    {isAdmin && cloudEnabled && <section className="card account-table"><div className="card-head"><h3>Technische Zugänge</h3><button onClick={refresh}>{loading ? 'Lädt …' : 'Aktualisieren'}</button></div>{accounts.map((acc) => <div className="account-row" key={acc.id}><Avatar name={acc.name} /><div><strong>{acc.name}</strong><span>{acc.email}</span></div><select value={acc.role} onChange={async (e) => { try { const next = await updateUserAccount(acc.id, { role: e.target.value }); setAccounts((list) => list.map((x) => x.id === acc.id ? next : x)) } catch (err) { setToast(err.message) } }}><option value="admin">Admin</option><option value="member">Bearbeiten</option><option value="viewer">Nur lesen</option></select><button className={`status-pill ${acc.active ? 'open' : 'closed'}`} onClick={async () => { try { const next = await updateUserAccount(acc.id, { active: !acc.active }); setAccounts((list) => list.map((x) => x.id === acc.id ? next : x)) } catch (err) { setToast(err.message) } }}>{acc.active ? 'aktiv' : 'gesperrt'}</button></div>)}</section>}
  </div>
}

function ProfileCard({ profile, project, user, mutate }) {
  const canAdmin = user.role === 'admin'
  return <article className="profile-card"><div className="profile-top"><Avatar name={profile.displayName || profile.email} large /><span className={`status-pill ${profile.kind === 'founder' ? 'open' : ''}`}>{kindLabel(profile.kind)}</span></div><h3>{profile.displayName || profile.email}</h3><p>{profile.area || 'Noch kein Verantwortungsbereich angegeben.'}</p>{profile.bio && <blockquote>{profile.bio}</blockquote>}<div className="profile-meta"><span>{profile.email === user.email || canAdmin ? profile.email : 'E-Mail ausgeblendet'}</span>{canAdmin && <button className="icon-btn" onClick={() => mutate((p) => { const x = p.profiles.find((z) => z.email === profile.email); x.visible = !x.visible }, `Profilsichtbarkeit von ${profile.displayName || profile.email} geändert`)}>{profile.visible ? <Eye size={16} /> : <EyeOff size={16} />}</button>}</div></article>
}

function Profile({ project, user, mutate }) {
  const current = getProfile(project, user) || { email: user.email, displayName: user.name || '', kind: user.role === 'admin' ? 'admin' : 'founder', visible: true, area: '', bio: '' }
  const [form, setForm] = useState(current)
  const save = (e) => { e.preventDefault(); mutate((p) => { const index = p.profiles.findIndex((x) => x.email === user.email); const next = { ...form, email: user.email }; if (index >= 0) p.profiles[index] = next; else p.profiles.push(next) }, 'Eigenes Profil aktualisiert') }
  return <div className="page narrow"><PageHeader eyebrow="MEIN BEREICH" title="Profil" description="Du entscheidest, welche Angaben für den Gründungskreis sichtbar sind." /><form className="card profile-form" onSubmit={save}><div className="profile-preview"><Avatar name={form.displayName || user.email} large /><div><strong>{form.displayName || user.email}</strong><span>{kindLabel(form.kind)}</span></div></div><label>Anzeigename<input value={form.displayName || ''} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></label><label>Verantwortungsbereich<input value={form.area || ''} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="z. B. Finanzen, Satzung, Pädagogik" /></label><label>Kurzvorstellung<textarea value={form.bio || ''} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="Optional – kurz und relevant für die Zusammenarbeit." /></label><label className="switch-row"><span><strong>Profil im Mitgliederbereich anzeigen</strong><small>Admins können dein Profil weiterhin verwalten.</small></span><input type="checkbox" checked={form.visible !== false} onChange={(e) => setForm({ ...form, visible: e.target.checked })} /></label><button className="primary-btn"><Save size={16} /> Profil speichern</button></form></div>
}

function Decisions({ project, user, mutate }) {
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ title: '', decision: '', date: new Date().toISOString().slice(0, 10) })
  const add = (e) => { e.preventDefault(); if (!form.title || !form.decision) return; mutate((p) => p.decisions.unshift({ id: uid('decision'), ...form, author: user.name || user.email, createdAt: nowIso() }), `Entscheidung „${form.title}“ dokumentiert`); setShowNew(false); setForm({ title: '', decision: '', date: new Date().toISOString().slice(0, 10) }) }
  return <div className="page"><PageHeader eyebrow="NACHVOLLZIEHBAR ENTSCHEIDEN" title="Entscheidungsregister" description="Was wurde wann und warum beschlossen? Eine klare Spur durch die Gründungsphase." action={<button className="primary-btn" onClick={() => setShowNew(!showNew)}><Plus size={16} /> Entscheidung</button>} />{showNew && <form className="card form-grid" onSubmit={add}><label>Titel<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label><label>Entscheidung<textarea value={form.decision} onChange={(e) => setForm({ ...form, decision: e.target.value })} /></label><label>Datum<input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label><button className="primary-btn">Dokumentieren</button></form>}<div className="decision-list">{project.decisions.length ? project.decisions.map((d) => <article className="card decision" key={d.id}><div className="decision-index"><Gavel size={18} /></div><div><span>{fmtDate(d.date)} · {d.author}</span><h3>{d.title}</h3><p>{d.decision}</p></div></article>) : <EmptyState text="Noch keine Entscheidung dokumentiert." />}</div></div>
}

function ActivityPage({ project }) { return <div className="page narrow"><PageHeader eyebrow="TRANSPARENZ" title="Aktivitätsverlauf" description="Wer hat wann etwas im gemeinsamen Projekt verändert?" /><section className="card"><Timeline items={project.activities} /></section></div> }
function Timeline({ items }) { return <div className="timeline">{items.length ? items.map((item) => <div key={item.id}><i /><div><strong>{item.text}</strong><span>{item.actor ? `${item.actor} · ` : ''}{fmtDateTime(item.createdAt)}</span></div></div>) : <EmptyState compact text="Noch keine Aktivität." />}</div> }

function Studio({ project, mutate }) {
  const layout = project.settings.dashboardLayout || DEFAULT_LAYOUT
  const hidden = project.settings.hiddenDashboardModules || []
  const move = (id, direction) => mutate((p) => { const arr = [...p.settings.dashboardLayout]; const i = arr.indexOf(id); const j = i + direction; if (j >= 0 && j < arr.length) [arr[i], arr[j]] = [arr[j], arr[i]]; p.settings.dashboardLayout = arr }, 'Dashboard-Anordnung geändert')
  return <div className="page narrow"><PageHeader eyebrow="ADMIN · CMS" title="Studio" description="Baue das Dashboard selbst zusammen und bestimme, welche Module sichtbar sind." /><section className="card studio-card"><div className="studio-intro"><Settings2 size={20} /><div><strong>Dashboard-Komposition</strong><span>Reihenfolge und Sichtbarkeit gelten für alle Mitglieder.</span></div></div>{layout.map((id, index) => { const found = DASHBOARD_MODULES.find(([x]) => x === id); if (!found) return null; return <div className="module-row" key={id}><div><strong>{found[1]}</strong><span>{id}</span></div><button className="icon-btn" disabled={index === 0} onClick={() => move(id, -1)}><ArrowUp size={16} /></button><button className="icon-btn" disabled={index === layout.length - 1} onClick={() => move(id, 1)}><ArrowDown size={16} /></button><button className={`visibility-toggle ${hidden.includes(id) ? '' : 'on'}`} onClick={() => mutate((p) => { const h = p.settings.hiddenDashboardModules || []; p.settings.hiddenDashboardModules = h.includes(id) ? h.filter((x) => x !== id) : [...h, id] }, `${found[1]} ${hidden.includes(id) ? 'eingeblendet' : 'ausgeblendet'}`)}>{hidden.includes(id) ? <EyeOff size={16} /> : <Eye size={16} />}{hidden.includes(id) ? 'Aus' : 'Sichtbar'}</button></div> })}</section><section className="card form-grid"><h3>Marke</h3><label>Kurzname<input value={project.settings.brandName || 'WeKiB'} onChange={(e) => mutate((p) => { p.settings.brandName = e.target.value })} /></label><label>Projekt-Untertitel<input value={project.meta.subtitle || ''} onChange={(e) => mutate((p) => { p.meta.subtitle = e.target.value })} /></label></section></div>
}

function Onboarding({ project, user, mutate, kind }) {
  const steps = kind === 'admin' ? [
    ['Willkommen im Cockpit', 'Du verwaltest Struktur, Zugänge und den gemeinsamen Arbeitsraum.'],
    ['Studio & Module', 'Unter „Studio“ stellst du das Dashboard für den Gründungskreis zusammen.'],
    ['Zugänge', 'Unter „Mitglieder“ legst du Gründungsmitglieder und weitere Nutzer an.'],
  ] : kind === 'founder' ? [
    ['Willkommen im Gründungskreis', 'Du kannst gemeinsame Dokumente bearbeiten, abstimmen und Aufgaben übernehmen.'],
    ['Dokumente gemeinsam entwickeln', 'Jede gespeicherte Fassung erhält eine Version mit deinem Namen.'],
    ['Dein Profil', 'Halte nur Angaben fest, die für die gemeinsame Gründung relevant sind.'],
  ] : [
    ['Willkommen bei WeKiB', 'Du wurdest für die Mitarbeit an der Gründung eingeladen.'],
    ['Dein Arbeitsbereich', 'Du siehst gemeinsame Informationen und kannst eigene Dokumente verwalten.'],
    ['Gemeinsam transparent', 'Kommentare, Umfragen und Termine halten alle auf demselben Stand.'],
  ]
  const [step, setStep] = useState(0)
  const done = () => mutate((p) => { p.onboarding[user.email] = { done: true, completedAt: nowIso(), kind } }, 'Einführung abgeschlossen')
  return <div className="modal-backdrop"><div className="onboarding"><div className="onboarding-mark"><Sparkles size={22} /></div><p className="eyebrow">SCHRITT {step + 1} VON {steps.length}</p><h2>{steps[step][0]}</h2><p>{steps[step][1]}</p><div className="onboarding-dots">{steps.map((_, i) => <i key={i} className={i === step ? 'active' : ''} />)}</div><div className="onboarding-actions">{step > 0 && <button className="secondary-btn" onClick={() => setStep(step - 1)}>Zurück</button>}<button className="primary-btn" onClick={() => step === steps.length - 1 ? done() : setStep(step + 1)}>{step === steps.length - 1 ? 'Loslegen' : 'Weiter'} <ChevronRight size={17} /></button></div></div></div>
}

function SearchPalette({ results, onSelect }) { return <div className="search-palette">{results.length ? results.slice(0, 8).map((r) => <button key={`${r.type}-${r.id}`} onClick={() => onSelect(r)}><span className="search-type">{r.type}</span><div><strong>{r.title}</strong><small>{r.subtitle}</small></div><ChevronRight size={15} /></button>) : <div className="no-results">Keine Treffer</div>}</div> }

function buildSearchResults(project, query) {
  const q = query.trim().toLowerCase(); if (!q) return []
  const out = []
  project.documents.forEach((d) => { if (`${d.title} ${d.category} ${stripHtml(d.content)}`.toLowerCase().includes(q)) out.push({ type: 'Dokument', id: d.id, title: d.title, subtitle: d.category, page: 'documents', docId: d.id }) })
  project.tasks.forEach((t) => { if (`${t.title} ${t.owner}`.toLowerCase().includes(q)) out.push({ type: 'Aufgabe', id: t.id, title: t.title, subtitle: t.owner, page: 'tasks' }) })
  project.files.forEach((f) => { if (f.name?.toLowerCase().includes(q)) out.push({ type: 'Datei', id: f.id, title: f.name, subtitle: project.folders.find((x) => x.id === f.folderId)?.name || 'Upload', page: 'documents', fileId: f.id }) })
  project.decisions.forEach((d) => { if (`${d.title} ${d.decision}`.toLowerCase().includes(q)) out.push({ type: 'Entscheidung', id: d.id, title: d.title, subtitle: d.decision.slice(0, 80), page: 'decisions' }) })
  project.profiles.forEach((p) => { if (`${p.displayName} ${p.area}`.toLowerCase().includes(q)) out.push({ type: 'Mitglied', id: p.email, title: p.displayName || p.email, subtitle: p.area, page: 'members' }) })
  return out
}

function Avatar({ name = '', large = false }) { const initials = name.split(/\s|@/).filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase()).join('') || 'W'; return <span className={`avatar ${large ? 'large' : ''}`}>{initials}</span> }
function EmptyState({ text, compact = false }) { return <div className={`empty-state ${compact ? 'compact' : ''}`}><Sparkles size={18} /><span>{text}</span></div> }
function statusLabel(status) { return ({ open: 'offen', in_progress: 'in Arbeit', done: 'fertig', locked: 'gesperrt' }[status] || status || 'offen') }
function kindLabel(kind) { return ({ admin: 'Administrator', founder: 'Gründungsmitglied', member: 'Mitarbeit', viewer: 'Lesen' }[kind] || 'Mitglied') }
function firstName(name = '') { return name.split(/[\s@]/)[0] || 'Team' }
function formatBytes(bytes = 0) { if (!bytes) return '0 KB'; const units = ['B', 'KB', 'MB', 'GB']; const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 3); return `${(bytes / (1024 ** i)).toFixed(i ? 1 : 0)} ${units[i]}` }
function safeFile(value = 'termin') { return value.toLowerCase().replace(/[^a-z0-9äöüß]+/gi, '-').replace(/^-|-$/g, '') || 'termin' }
function icsEscape(value = '') { return String(value).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;') }
function downloadIcs(events, filename) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//WeKiB//Gruendung//DE', 'CALSCALE:GREGORIAN']
  events.forEach((event) => { if (!event.date) return; const date = event.date.replaceAll('-', ''); const time = event.time ? event.time.replace(':', '') + '00' : ''; lines.push('BEGIN:VEVENT', `UID:${event.id}@wekib`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`, time ? `DTSTART:${date}T${time}` : `DTSTART;VALUE=DATE:${date}`, `SUMMARY:${icsEscape(event.title)}`, event.notes ? `DESCRIPTION:${icsEscape(event.notes)}` : '', 'END:VEVENT') })
  lines.push('END:VCALENDAR')
  const blob = new Blob([lines.filter(Boolean).join('\r\n')], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url)
}

export default AppV2