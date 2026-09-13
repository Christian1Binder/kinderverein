import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, ArrowRight, BadgeCheck, BarChart3, Bell, CalendarDays, Check, CheckCircle2,
  ChevronDown, ChevronRight, CircleDot, ClipboardCheck, Clock3, Cloud, CloudOff,
  FileText, Flag, FolderKanban, Gauge, Home, LayoutDashboard, ListChecks, LockKeyhole,
  LogOut, Menu, MessageCircle, Milestone, MoreHorizontal, PanelLeftClose, Plus, RefreshCw,
  Search, Send, Settings, ShieldCheck, Sparkles, Target, Trash2, UserPlus, Users, Vote,
  X, Zap
} from 'lucide-react'
import { seedState } from './data/seed.js'
import {
  cloudEnabled, getSession, loadCloudState, loadLocalState, onAuthChange, resetLocalState,
  saveCloudState, saveLocalState, signInWithEmail, signOut, subscribeCloudState,
} from './lib/projectStore.js'

const NAV = [
  { id: 'overview', label: 'Übersicht', icon: LayoutDashboard },
  { id: 'timeline', label: 'Zeitstrahl', icon: CalendarDays },
  { id: 'milestones', label: 'Meilensteine', icon: Flag },
  { id: 'tasks', label: 'Aufgaben', icon: ListChecks },
  { id: 'votes', label: 'Abstimmungen', icon: Vote },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'documents', label: 'Unterlagen', icon: FileText },
]

const MOBILE_NAV = [
  { id: 'overview', label: 'Start', icon: Home },
  { id: 'timeline', label: 'Plan', icon: CalendarDays },
  { id: 'tasks', label: 'Aufgaben', icon: ListChecks },
  { id: 'votes', label: 'Abstimmen', icon: Vote },
  { id: 'more', label: 'Mehr', icon: MoreHorizontal },
]

const statusLabel = {
  active: 'In Arbeit', planned: 'Geplant', done: 'Erledigt', locked: 'Gesperrt',
  todo: 'Offen', doing: 'In Arbeit', in_progress: 'In Arbeit', open: 'Offen', closed: 'Beendet',
}

const priorityLabel = { high: 'Hoch', medium: 'Mittel', low: 'Niedrig' }
const documentStatusLabel = { open: 'Offen', in_progress: 'In Arbeit', done: 'Erledigt', locked: 'Gesperrt' }

const dateFmt = (value, withYear = true) => {
  if (!value) return '—'
  return new Intl.DateTimeFormat('de-DE', withYear ? { day: '2-digit', month: 'short', year: 'numeric' } : { day: '2-digit', month: 'short' }).format(new Date(`${value}T12:00:00`))
}

const dateTimeFmt = (value) => new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
const uid = (prefix = 'id') => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '??'

function App() {
  const [project, setProject] = useState(() => loadLocalState())
  const [activeView, setActiveView] = useState('overview')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileMenu, setMobileMenu] = useState(false)
  const [modal, setModal] = useState(null)
  const [session, setSession] = useState(null)
  const [cloudLoading, setCloudLoading] = useState(cloudEnabled)
  const [syncState, setSyncState] = useState(cloudEnabled ? 'checking' : 'local')
  const [authEmail, setAuthEmail] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [localPreview, setLocalPreview] = useState(false)
  const remoteHydrated = useRef(false)

  useEffect(() => {
    if (!cloudEnabled) return
    let unsubState = () => {}
    const unsubAuth = onAuthChange(async (nextSession) => {
      setSession(nextSession)
      if (!nextSession) {
        setCloudLoading(false)
        setSyncState('offline')
        return
      }
      try {
        setCloudLoading(true)
        const remote = await loadCloudState()
        if (remote) {
          remoteHydrated.current = true
          setProject(remote)
          saveLocalState(remote)
        }
        setSyncState('synced')
        unsubState = subscribeCloudState((next) => {
          remoteHydrated.current = true
          setProject(next)
          saveLocalState(next)
          setSyncState('synced')
        })
      } catch (error) {
        console.error(error)
        setSyncState('error')
      } finally {
        setCloudLoading(false)
      }
    })
    getSession().then(async (initialSession) => {
      setSession(initialSession)
      if (initialSession) {
        try {
          const remote = await loadCloudState()
          if (remote) {
            remoteHydrated.current = true
            setProject(remote)
            saveLocalState(remote)
          }
          setSyncState('synced')
          unsubState = subscribeCloudState((next) => {
            remoteHydrated.current = true
            setProject(next)
            saveLocalState(next)
            setSyncState('synced')
          })
        } catch (error) {
          console.error(error)
          setSyncState('error')
        }
      } else {
        setSyncState('offline')
      }
      setCloudLoading(false)
    })
    return () => { unsubAuth(); unsubState() }
  }, [])

  const actor = session?.user?.email || 'Lokaler Nutzer'

  const persist = async (next) => {
    saveLocalState(next)
    if (!cloudEnabled || !session) return
    setSyncState('syncing')
    try {
      await saveCloudState(next)
      setSyncState('synced')
    } catch (error) {
      console.error(error)
      setSyncState('error')
    }
  }

  const commit = (recipe, activityText) => {
    setProject((current) => {
      const next = structuredClone(current)
      recipe(next)
      next.meta.lastUpdated = new Date().toISOString()
      if (activityText) {
        next.activities = [
          { id: uid('activity'), text: activityText, createdAt: new Date().toISOString(), kind: 'update' },
          ...(next.activities || []),
        ].slice(0, 40)
      }
      persist(next)
      return next
    })
  }

  const navigate = (id) => {
    setActiveView(id)
    setMobileMenu(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const sendMagicLink = async (event) => {
    event.preventDefault()
    try {
      await signInWithEmail(authEmail)
      setAuthMessage('Anmeldelink wurde versendet. Bitte E-Mail-Postfach prüfen.')
    } catch (error) {
      setAuthMessage(error.message)
    }
  }

  if (cloudLoading) return <LoadingScreen />

  if (cloudEnabled && !session && !localPreview) {
    return <AuthScreen email={authEmail} setEmail={setAuthEmail} message={authMessage} onSubmit={sendMagicLink} onLocal={() => { setLocalPreview(true); setSyncState('local') }} />
  }

  const props = { project, commit, setModal, navigate, actor }

  return (
    <div className="app-shell">
      <Sidebar open={sidebarOpen} active={activeView} navigate={navigate} onCollapse={() => setSidebarOpen((v) => !v)} project={project} />
      <main className={sidebarOpen ? 'main main--sidebar' : 'main main--compact'}>
        <Topbar
          project={project}
          active={activeView}
          syncState={syncState}
          cloud={cloudEnabled && Boolean(session) && !localPreview}
          onMenu={() => setMobileMenu(true)}
          onQuickAdd={() => setModal({ type: 'task', mode: 'create' })}
          onSignOut={cloudEnabled && session ? signOut : null}
        />
        <div className="content-wrap">
          {activeView === 'overview' && <Overview {...props} />}
          {activeView === 'timeline' && <Timeline {...props} />}
          {activeView === 'milestones' && <Milestones {...props} />}
          {activeView === 'tasks' && <Tasks {...props} />}
          {activeView === 'votes' && <Votes {...props} />}
          {activeView === 'team' && <Team {...props} />}
          {activeView === 'documents' && <Documents {...props} />}
          {activeView === 'more' && <MoreView {...props} />}
        </div>
      </main>

      <MobileNav active={activeView} navigate={navigate} />
      <MobileDrawer open={mobileMenu} onClose={() => setMobileMenu(false)} active={activeView} navigate={navigate} project={project} />
      {modal && <EntityModal modal={modal} project={project} commit={commit} close={() => setModal(null)} />}
    </div>
  )
}

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="brand-mark brand-mark--large">K</div>
      <RefreshCw className="spin" size={24} />
      <p>Projektzentrale wird geladen …</p>
    </div>
  )
}

function AuthScreen({ email, setEmail, message, onSubmit, onLocal }) {
  return (
    <div className="auth-shell">
      <div className="auth-visual">
        <div className="auth-orb auth-orb--one" />
        <div className="auth-orb auth-orb--two" />
        <div className="auth-copy">
          <div className="brand-row"><div className="brand-mark">K</div><span>Kinderverein</span></div>
          <span className="eyebrow">Gemeinsam gründen. Klar entscheiden.</span>
          <h1>Eine Projektzentrale für den ganzen Weg zum Träger.</h1>
          <p>Meilensteine, Aufgaben, Abstimmungen und Unterlagen in einem gemeinsamen Workspace – live synchronisiert für das ganze Gründungsteam.</p>
          <div className="auth-feature-grid">
            <Feature icon={Flag} text="15 Projektphasen" />
            <Feature icon={Vote} text="Team-Abstimmungen" />
            <Feature icon={Users} text="Klare Rollen" />
            <Feature icon={ShieldCheck} text="Sicherer Zugang" />
          </div>
        </div>
      </div>
      <div className="auth-panel">
        <div className="auth-card">
          <span className="eyebrow">Team-Login</span>
          <h2>Willkommen zurück</h2>
          <p>Du erhältst einen sicheren Anmeldelink per E-Mail. Kein Passwort nötig.</p>
          <form onSubmit={onSubmit} className="form-stack">
            <label>E-Mail-Adresse<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@beispiel.de" /></label>
            <button className="btn btn--primary btn--full" type="submit">Anmeldelink senden <ArrowRight size={17} /></button>
          </form>
          {message && <div className="notice">{message}</div>}
          <p className="auth-hint">Zugänge werden über das verbundene Supabase-Projekt verwaltet.</p>
          {onLocal && <button className="btn btn--ghost btn--full" onClick={onLocal} type="button">Lokale Vorschau öffnen</button>}
        </div>
      </div>
    </div>
  )
}

function Feature({ icon: Icon, text }) {
  return <div className="auth-feature"><Icon size={19} /><span>{text}</span></div>
}

function Sidebar({ open, active, navigate, onCollapse, project }) {
  return (
    <aside className={open ? 'sidebar' : 'sidebar sidebar--collapsed'}>
      <div className="sidebar-top">
        <button className="brand" onClick={() => navigate('overview')}>
          <span className="brand-mark">K</span>
          {open && <span className="brand-copy"><strong>Kinderverein</strong><small>Projektzentrale</small></span>}
        </button>
        <button className="icon-btn sidebar-collapse" onClick={onCollapse} aria-label="Seitenleiste ein-/ausklappen"><PanelLeftClose size={18} /></button>
      </div>
      <nav className="sidebar-nav">
        {NAV.map(({ id, label, icon: Icon }) => (
          <button key={id} className={active === id ? 'nav-item active' : 'nav-item'} onClick={() => navigate(id)} title={!open ? label : undefined}>
            <Icon size={19} /><span>{label}</span>{open && id === 'votes' && <span className="nav-dot" />}
          </button>
        ))}
      </nav>
      <div className="sidebar-spacer" />
      <div className="sidebar-project-card">
        <span className="mini-label">Projektstatus</span>
        {open && <><strong>{getProjectProgress(project)}% Gesamtfortschritt</strong><Progress value={getProjectProgress(project)} /><small>Nächster großer Gate: M1</small></>}
        {!open && <Gauge size={20} />}
      </div>
    </aside>
  )
}

function Topbar({ project, active, syncState, cloud, onMenu, onQuickAdd, onSignOut }) {
  const current = NAV.find((item) => item.id === active)?.label || (active === 'more' ? 'Mehr' : 'Projekt')
  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="icon-btn mobile-only" onClick={onMenu}><Menu size={22} /></button>
        <div><span className="topbar-kicker">{project.meta.location}</span><h1>{current}</h1></div>
      </div>
      <div className="topbar-actions">
        <div className={`sync-pill sync-pill--${syncState}`} title={cloud ? 'Cloud-Synchronisierung aktiv' : 'Daten werden lokal gespeichert'}>
          {cloud ? <Cloud size={15} /> : <CloudOff size={15} />}
          <span>{syncState === 'syncing' ? 'Synchronisiert …' : cloud ? 'Live' : 'Lokal'}</span>
        </div>
        <button className="btn btn--primary quick-add" onClick={onQuickAdd}><Plus size={17} /><span>Aufgabe</span></button>
        {onSignOut && <button className="icon-btn desktop-only" onClick={onSignOut} title="Abmelden"><LogOut size={18} /></button>}
      </div>
    </header>
  )
}

function MobileNav({ active, navigate }) {
  return (
    <nav className="mobile-nav">
      {MOBILE_NAV.map(({ id, label, icon: Icon }) => (
        <button key={id} className={active === id || (id === 'more' && ['milestones', 'team', 'documents'].includes(active)) ? 'active' : ''} onClick={() => navigate(id)}>
          <Icon size={21} /><span>{label}</span>
        </button>
      ))}
    </nav>
  )
}

function MobileDrawer({ open, onClose, active, navigate, project }) {
  if (!open) return null
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="mobile-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head"><div className="brand-row"><div className="brand-mark">K</div><span>Kinderverein</span></div><button className="icon-btn" onClick={onClose}><X size={20} /></button></div>
        <div className="drawer-project"><span className="mini-label">Fortschritt</span><strong>{getProjectProgress(project)}%</strong><Progress value={getProjectProgress(project)} /></div>
        <nav>{NAV.map(({ id, label, icon: Icon }) => <button key={id} className={active === id ? 'nav-item active' : 'nav-item'} onClick={() => navigate(id)}><Icon size={19} /><span>{label}</span></button>)}</nav>
      </aside>
    </div>
  )
}

function Overview({ project, commit, setModal, navigate, actor }) {
  const progress = getProjectProgress(project)
  const openTasks = project.tasks.filter((t) => t.status !== 'done')
  const activePhase = project.phases.find((p) => p.status === 'active') || project.phases.find((p) => p.status === 'planned')
  const nextMilestones = [...project.milestones].filter((m) => m.status !== 'done').sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3)
  const openPoll = project.polls.find((p) => p.status === 'open')
  const readyDocs = project.documents.filter((d) => d.status === 'done').length

  return (
    <div className="page-stack">
      <section className="hero-card">
        <div className="hero-copy">
          <div className="eyebrow-row"><span className="eyebrow">Projektmasterplan 1.0</span><span className="status-pill status-pill--active"><CircleDot size={13} /> Phase 1 läuft</span></div>
          <h2>Vom Gründungskreis zum professionellen Bildungsträger.</h2>
          <p>Alle Entscheidungen, Termine und Verantwortlichkeiten an einem Ort. Aktuell liegt der Fokus auf Vereinsname und Grundkonzept.</p>
          <div className="hero-actions"><button className="btn btn--light" onClick={() => navigate('timeline')}>Zeitstrahl ansehen <ArrowRight size={16} /></button><button className="btn btn--glass" onClick={() => navigate('votes')}><Vote size={16} /> Abstimmen</button></div>
        </div>
        <div className="hero-progress">
          <ProgressRing value={progress} />
          <div><span>Gesamtfortschritt</span><strong>{progress}%</strong><small>Ziel: Träger-ready bis April 2027</small></div>
        </div>
      </section>

      <section className="stat-grid">
        <StatCard icon={Target} label="Aktuelle Phase" value="01 / 15" detail={activePhase?.title} tone="violet" />
        <StatCard icon={ListChecks} label="Offene Aufgaben" value={openTasks.length} detail={`${project.tasks.filter((t) => t.status === 'doing').length} gerade in Arbeit`} tone="blue" />
        <StatCard icon={Flag} label="Nächster Meilenstein" value="M1" detail={dateFmt(project.milestones[0]?.date, false)} tone="amber" />
        <StatCard icon={ClipboardCheck} label="Unterlagen" value={`${readyDocs}/${project.documents.length}`} detail="fertiggestellt" tone="green" />
      </section>

      <section className="dashboard-grid">
        <div className="card span-7">
          <CardHead title="Nächste Meilensteine" subtitle="Die entscheidenden Gates der nächsten Wochen" action={<button className="text-btn" onClick={() => navigate('milestones')}>Alle ansehen <ChevronRight size={15} /></button>} />
          <div className="milestone-list compact-list">
            {nextMilestones.map((m, index) => <MilestoneRow key={m.id} milestone={m} index={index} onClick={() => setModal({ type: 'milestone', mode: 'edit', item: m })} />)}
          </div>
        </div>
        <div className="card span-5">
          <CardHead title="Aktuelle Entscheidung" subtitle="Gemeinsam statt im Chat-Verlauf verloren" icon={Vote} />
          {openPoll ? <PollMini poll={openPoll} onOpen={() => navigate('votes')} /> : <EmptyState icon={Vote} title="Keine offene Abstimmung" text="Lege eine neue Team-Abstimmung an." action={() => setModal({ type: 'poll', mode: 'create' })} />}
        </div>

        <div className="card span-7">
          <CardHead title="Aufgaben im Fokus" subtitle="Was jetzt als Nächstes erledigt werden muss" action={<button className="text-btn" onClick={() => navigate('tasks')}>Board öffnen <ChevronRight size={15} /></button>} />
          <div className="task-focus-list">
            {openTasks.slice(0, 5).map((task) => <TaskFocus key={task.id} task={task} phase={project.phases.find((p) => p.id === task.phaseId)} onEdit={() => setModal({ type: 'task', mode: 'edit', item: task })} onDone={() => commit((next) => { const item = next.tasks.find((t) => t.id === task.id); item.status = 'done' }, `Aufgabe „${task.title}“ erledigt`)} />)}
          </div>
        </div>

        <div className="card span-5 collaboration-card">
          <CardHead title="Projektfeed" subtitle="Kurze Abstimmung im Team" icon={MessageCircle} />
          <MessageFeed project={project} commit={commit} actor={actor} />
        </div>
      </section>

      <section className="card">
        <CardHead title="Projektfahrplan" subtitle="Vom Namen bis zur Betriebsbereitschaft – der gesamte Weg auf einen Blick" action={<button className="text-btn" onClick={() => navigate('timeline')}>Detaillierter Zeitstrahl <ChevronRight size={15} /></button>} />
        <MiniRoadmap phases={project.phases} />
      </section>
    </div>
  )
}

function Timeline({ project, setModal }) {
  const min = new Date('2026-09-01T12:00:00').getTime()
  const max = new Date('2027-09-01T12:00:00').getTime()
  const span = max - min
  return (
    <div className="page-stack">
      <PageIntro eyebrow="Projektfahrplan" title="15 Phasen bis zum professionellen Träger" text="Die Gründung bleibt bewusst getrennt vom späteren OGTS-Trägerwechsel. Termine sind Planwerte; Behörden- und Registerlaufzeiten können abweichen." />
      <div className="timeline-summary">
        <SummaryPill icon={CalendarDays} label="Projektstart" value="13. Sep 2026" />
        <SummaryPill icon={BadgeCheck} label="Gründungsziel" value="Anfang Nov 2026" />
        <SummaryPill icon={Zap} label="Träger-ready" value="Frühjahr 2027" />
        <SummaryPill icon={LockKeyhole} label="OGTS-Wechsel" value="erst danach" />
      </div>
      <section className="card timeline-card">
        <div className="gantt-head desktop-only-grid"><span>Phase</span><div className="month-grid">{['Sep', 'Okt', 'Nov', 'Dez', 'Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug'].map((m) => <span key={m}>{m}</span>)}</div></div>
        <div className="gantt-list">
          {project.phases.map((p, idx) => {
            const left = Math.max(0, ((new Date(`${p.start}T12:00:00`).getTime() - min) / span) * 100)
            const width = Math.max(2.2, ((new Date(`${p.end}T12:00:00`).getTime() - new Date(`${p.start}T12:00:00`).getTime()) / span) * 100)
            return (
              <button className={`gantt-row gantt-row--${p.status}`} key={p.id} onClick={() => setModal({ type: 'phase', mode: 'edit', item: p })}>
                <div className="gantt-info"><span className="phase-number">{String(idx + 1).padStart(2, '0')}</span><div><strong>{p.title}</strong><small>{dateFmt(p.start, false)} – {dateFmt(p.end, false)} · {p.owner}</small></div><StatusChip status={p.status} /></div>
                <div className="gantt-track"><div className={`gantt-bar gantt-bar--${p.status}`} style={{ left: `${left}%`, width: `${width}%` }}><span>{p.milestone.split(' · ')[0]}</span></div></div>
                <div className="gantt-mobile-meta"><span>{p.milestone}</span><ChevronRight size={17} /></div>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function Milestones({ project, setModal }) {
  return (
    <div className="page-stack">
      <PageIntro eyebrow="Gates & Entscheidungen" title="Meilensteine" text="Jeder Meilenstein markiert einen belastbaren Projektzustand. Bearbeite Termin, Status, Verantwortung und Notizen direkt im Board." action={<button className="btn btn--primary" onClick={() => setModal({ type: 'milestone', mode: 'create' })}><Plus size={17} /> Meilenstein</button>} />
      <div className="milestone-grid">
        {[...project.milestones].sort((a, b) => a.date.localeCompare(b.date)).map((m) => (
          <button key={m.id} className={`milestone-card milestone-card--${m.status}`} onClick={() => setModal({ type: 'milestone', mode: 'edit', item: m })}>
            <div className="milestone-card-top"><span className="milestone-code">{m.code}</span><StatusChip status={m.status} /></div>
            <h3>{m.title}</h3><p>{m.notes}</p>
            <div className="milestone-card-meta"><span><CalendarDays size={15} /> {dateFmt(m.date)}</span><span><Users size={15} /> {m.owner}</span></div>
          </button>
        ))}
        <button className="add-card" onClick={() => setModal({ type: 'milestone', mode: 'create' })}><span className="add-circle"><Plus size={22} /></span><strong>Meilenstein ergänzen</strong><small>Eigenen Gate oder Entscheidungstermin anlegen</small></button>
      </div>
    </div>
  )
}

function Tasks({ project, commit, setModal }) {
  const [query, setQuery] = useState('')
  const visible = project.tasks.filter((t) => t.title.toLowerCase().includes(query.toLowerCase()))
  const columns = [
    { id: 'todo', title: 'Offen', hint: 'Noch nicht begonnen' },
    { id: 'doing', title: 'In Arbeit', hint: 'Aktuell im Fokus' },
    { id: 'done', title: 'Erledigt', hint: 'Abgeschlossen' },
  ]
  const move = (taskId, status) => { if (!taskId) return; commit((next) => { const item = next.tasks.find((t) => t.id === taskId); if (item) item.status = status }, 'Aufgabenstatus aktualisiert') }
  return (
    <div className="page-stack">
      <PageIntro eyebrow="Operatives Board" title="Aufgaben" text="Vom Namenscheck bis zum Kinderschutzkonzept: Zuständigkeiten und Fälligkeiten bleiben sichtbar." action={<button className="btn btn--primary" onClick={() => setModal({ type: 'task', mode: 'create' })}><Plus size={17} /> Aufgabe</button>} />
      <div className="toolbar"><div className="search-box"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Aufgaben durchsuchen …" /></div><span className="toolbar-count">{visible.length} Aufgaben</span></div>
      <div className="kanban">
        {columns.map((column) => (
          <div className="kanban-column" key={column.id} onDragOver={(e) => e.preventDefault()} onDrop={(e) => move(e.dataTransfer.getData('text/task-id'), column.id)}>
            <div className="kanban-head"><div><strong>{column.title}</strong><small>{column.hint}</small></div><span>{visible.filter((t) => t.status === column.id).length}</span></div>
            <div className="kanban-stack">
              {visible.filter((t) => t.status === column.id).map((task) => (
                <article className="task-card" key={task.id} draggable onDragStart={(e) => e.dataTransfer.setData('text/task-id', task.id)}>
                  <div className="task-card-top"><span className={`priority priority--${task.priority}`}>{priorityLabel[task.priority]}</span><button className="icon-btn icon-btn--small" onClick={() => setModal({ type: 'task', mode: 'edit', item: task })}><MoreHorizontal size={17} /></button></div>
                  <h3>{task.title}</h3>
                  <div className="tag-row">{task.tags?.map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div>
                  <div className="task-card-meta"><span><CalendarDays size={14} /> {dateFmt(task.due, false)}</span><span className="avatar avatar--tiny">{initials(task.owner)}</span></div>
                  <select className="mobile-status-select" value={task.status} onChange={(e) => move(task.id, e.target.value)}><option value="todo">Offen</option><option value="doing">In Arbeit</option><option value="done">Erledigt</option></select>
                </article>
              ))}
              <button className="kanban-add" onClick={() => setModal({ type: 'task', mode: 'create', defaults: { status: column.id } })}><Plus size={16} /> Aufgabe hinzufügen</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Votes({ project, commit, setModal, actor }) {
  const vote = (pollId, optionId) => commit((next) => {
    const poll = next.polls.find((p) => p.id === pollId)
    if (!poll || poll.status !== 'open') return
    if (!poll.multiple) poll.options.forEach((option) => { option.votes = (option.votes || []).filter((v) => v !== actor) })
    const option = poll.options.find((o) => o.id === optionId)
    option.votes ||= []
    if (option.votes.includes(actor)) option.votes = option.votes.filter((v) => v !== actor)
    else option.votes.push(actor)
  }, 'Stimme in einer Abstimmung aktualisiert')

  return (
    <div className="page-stack">
      <PageIntro eyebrow="Gemeinsam entscheiden" title="Abstimmungen" text="Vereinsname, Termine, Varianten oder Prioritäten: Entscheidungen werden transparent vorbereitet und dokumentiert." action={<button className="btn btn--primary" onClick={() => setModal({ type: 'poll', mode: 'create' })}><Plus size={17} /> Abstimmung</button>} />
      <div className="poll-grid">
        {project.polls.map((poll) => {
          const total = poll.options.reduce((sum, o) => sum + (o.votes?.length || 0), 0)
          return (
            <article className="poll-card" key={poll.id}>
              <div className="poll-card-head"><div><StatusChip status={poll.status} /><h3>{poll.title}</h3></div><button className="icon-btn" onClick={() => setModal({ type: 'poll', mode: 'edit', item: poll })}><Settings size={17} /></button></div>
              <p>{poll.description}</p>
              <div className="poll-options">
                {poll.options.map((option) => {
                  const count = option.votes?.length || 0
                  const pct = total ? Math.round((count / total) * 100) : 0
                  const selected = option.votes?.includes(actor)
                  return <button disabled={poll.status !== 'open'} className={selected ? 'poll-option selected' : 'poll-option'} key={option.id} onClick={() => vote(poll.id, option.id)}><div className="poll-option-line"><span className="radio-dot">{selected && <Check size={13} />}</span><strong>{option.label}</strong><span>{count} {count === 1 ? 'Stimme' : 'Stimmen'} · {pct}%</span></div><div className="vote-bar"><div style={{ width: `${pct}%` }} /></div></button>
                })}
              </div>
              <div className="poll-footer"><span><Users size={15} /> {total} abgegebene Stimmen</span><span><Clock3 size={15} /> bis {dateFmt(poll.closes)}</span></div>
            </article>
          )
        })}
        <button className="add-card add-card--wide" onClick={() => setModal({ type: 'poll', mode: 'create' })}><span className="add-circle"><Plus size={22} /></span><strong>Neue Entscheidung vorbereiten</strong><small>Optionen anlegen, Team abstimmen lassen, Ergebnis sichtbar machen</small></button>
      </div>
    </div>
  )
}

function Team({ project, commit, setModal }) {
  return (
    <div className="page-stack">
      <PageIntro eyebrow="Zusammenarbeit" title="Team & Verantwortlichkeiten" text="Rollen, Verantwortungsbereiche und Kontaktinformationen des Gründungsteams. Personen können jederzeit ergänzt oder angepasst werden." action={<button className="btn btn--primary" onClick={() => setModal({ type: 'team', mode: 'create' })}><UserPlus size={17} /> Person</button>} />
      <div className="team-banner"><div><Sparkles size={20} /><div><strong>RACI-light für klare Zuständigkeiten</strong><span>Verantwortlich · Entscheidet · Beteiligt · Informiert – so bleibt klar, wer was tut.</span></div></div><span className="team-count">{project.team.filter((m) => m.active).length} aktiv</span></div>
      <div className="team-grid">
        {project.team.map((member) => (
          <article className={member.active ? 'team-card' : 'team-card team-card--pending'} key={member.id}>
            <div className="team-card-top"><div className="avatar avatar--large">{member.initials || initials(member.name)}</div><button className="icon-btn" onClick={() => setModal({ type: 'team', mode: 'edit', item: member })}><MoreHorizontal size={18} /></button></div>
            <h3>{member.name}</h3><span className="role-badge">{member.role}</span>
            <div className="team-detail"><span>Bereich</span><strong>{member.area}</strong></div>
            <div className="team-detail"><span>E-Mail</span><strong>{member.email || 'noch nicht hinterlegt'}</strong></div>
            <div className="team-status"><span className={member.active ? 'online-dot' : 'pending-dot'} />{member.active ? 'Aktiv im Projekt' : 'Rolle noch zu besetzen'}</div>
          </article>
        ))}
        <button className="add-card" onClick={() => setModal({ type: 'team', mode: 'create' })}><span className="add-circle"><UserPlus size={22} /></span><strong>Person hinzufügen</strong><small>Mit Rolle und Verantwortungsbereich</small></button>
      </div>
      <section className="card">
        <CardHead title="Verantwortungsmatrix" subtitle="Wer trägt in welchem Themenfeld die Hauptverantwortung?" />
        <div className="responsibility-list">
          {[
            ['Projektsteuerung', 'Projektleitung', 'Koordination, Termine, Unterlagen'], ['Vereinsführung', 'Vorstand', 'Rechtliche Entscheidungen & Vertretung'], ['Finanzen', 'Finanzverantwortung', 'Buchhaltung, Konto, Kalkulation'], ['Pädagogik', 'Pädagogische Leitung', 'Kinderschutz & Trägerkonzept'],
          ].map(([area, owner, scope]) => <div className="responsibility-row" key={area}><div className="responsibility-icon"><ShieldCheck size={18} /></div><div><strong>{area}</strong><span>{scope}</span></div><span className="owner-pill">{owner}</span></div>)}
        </div>
      </section>
    </div>
  )
}

function Documents({ project, commit }) {
  const updateStatus = (id, status) => commit((next) => { next.documents.find((d) => d.id === id).status = status }, 'Unterlagenstatus aktualisiert')
  const groups = Object.groupBy ? Object.groupBy(project.documents, (d) => d.category) : project.documents.reduce((acc, d) => ((acc[d.category] ||= []).push(d), acc), {})
  return (
    <div className="page-stack">
      <PageIntro eyebrow="Deliverables" title="Unterlagen & Nachweise" text="Die zentralen Projektergebnisse sind als Checkliste hinterlegt. So ist jederzeit sichtbar, was für Gründung und spätere Betriebsbereitschaft noch fehlt." />
      <div className="doc-progress-card"><div><span className="eyebrow">Dokumentenreife</span><strong>{project.documents.filter((d) => d.status === 'done').length} von {project.documents.length} abgeschlossen</strong></div><Progress value={Math.round((project.documents.filter((d) => d.status === 'done').length / project.documents.length) * 100)} /></div>
      <div className="doc-groups">
        {Object.entries(groups).map(([category, docs]) => <section className="card doc-group" key={category}><CardHead title={category} subtitle={`${docs.length} Unterlagen`} />{docs.map((doc) => <div className="doc-row" key={doc.id}><div className={`doc-icon doc-icon--${doc.status}`}>{doc.status === 'done' ? <CheckCircle2 size={19} /> : doc.status === 'locked' ? <LockKeyhole size={18} /> : <FileText size={18} />}</div><div className="doc-copy"><strong>{doc.title}</strong><span>{doc.owner}</span></div><select value={doc.status} disabled={doc.status === 'locked'} onChange={(e) => updateStatus(doc.id, e.target.value)}><option value="open">Offen</option><option value="in_progress">In Arbeit</option><option value="done">Erledigt</option>{doc.status === 'locked' && <option value="locked">Gesperrt</option>}</select></div>)}</section>)}
      </div>
    </div>
  )
}

function MoreView({ navigate, project }) {
  const items = [
    { id: 'milestones', label: 'Meilensteine', desc: `${project.milestones.length} Gates im Projekt`, icon: Flag },
    { id: 'team', label: 'Team & Rollen', desc: `${project.team.length} Rollen und Personen`, icon: Users },
    { id: 'documents', label: 'Unterlagen', desc: `${project.documents.length} Deliverables`, icon: FileText },
  ]
  return <div className="page-stack"><PageIntro eyebrow="Weitere Bereiche" title="Projektzentrale" text="Alle zusätzlichen Bereiche für Steuerung und Zusammenarbeit." /><div className="more-grid">{items.map(({ id, label, desc, icon: Icon }) => <button className="more-card" key={id} onClick={() => navigate(id)}><span className="more-icon"><Icon size={22} /></span><div><strong>{label}</strong><span>{desc}</span></div><ChevronRight size={19} /></button>)}</div></div>
}

function EntityModal({ modal, project, commit, close }) {
  const seed = getModalSeed(modal, project)
  const [form, setForm] = useState(seed)
  const type = modal.type
  const titleMap = { task: 'Aufgabe', milestone: 'Meilenstein', team: 'Teammitglied', phase: 'Projektphase', poll: 'Abstimmung' }
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))
  const collectionMap = { task: 'tasks', milestone: 'milestones', team: 'team', phase: 'phases', poll: 'polls' }
  const save = (e) => {
    e.preventDefault()
    const collection = collectionMap[type]
    commit((next) => {
      if (modal.mode === 'create') next[collection].push({ ...form, id: uid(type) })
      else {
        const index = next[collection].findIndex((item) => item.id === modal.item.id)
        next[collection][index] = { ...next[collection][index], ...form }
      }
    }, `${titleMap[type]} ${modal.mode === 'create' ? 'angelegt' : 'aktualisiert'}${form.title ? `: „${form.title}“` : ''}`)
    close()
  }
  const remove = () => {
    if (modal.mode !== 'edit') return
    commit((next) => { next[collectionMap[type]] = next[collectionMap[type]].filter((item) => item.id !== modal.item.id) }, `${titleMap[type]} entfernt`)
    close()
  }

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head"><div><span className="eyebrow">{modal.mode === 'create' ? 'Neu anlegen' : 'Bearbeiten'}</span><h2>{titleMap[type]}</h2></div><button className="icon-btn" onClick={close}><X size={20} /></button></div>
        <form onSubmit={save} className="modal-form">
          {type === 'task' && <TaskFields form={form} set={set} project={project} />}
          {type === 'milestone' && <MilestoneFields form={form} set={set} project={project} />}
          {type === 'team' && <TeamFields form={form} set={set} />}
          {type === 'phase' && <PhaseFields form={form} set={set} />}
          {type === 'poll' && <PollFields form={form} setForm={setForm} set={set} />}
          <div className="modal-actions">
            {modal.mode === 'edit' && <button type="button" className="btn btn--danger-ghost" onClick={remove}><Trash2 size={16} /> Entfernen</button>}
            <div className="modal-actions-right"><button type="button" className="btn btn--ghost" onClick={close}>Abbrechen</button><button type="submit" className="btn btn--primary"><Check size={16} /> Speichern</button></div>
          </div>
        </form>
      </div>
    </div>
  )
}

function getModalSeed(modal, project) {
  if (modal.mode === 'edit') return structuredClone(modal.item)
  if (modal.type === 'task') return { title: '', phaseId: project.phases.find((p) => p.status === 'active')?.id || project.phases[0]?.id, owner: 'Projektleitung', due: new Date().toISOString().slice(0, 10), status: modal.defaults?.status || 'todo', priority: 'medium', tags: [] }
  if (modal.type === 'milestone') return { code: `M${project.milestones.length + 1}`, title: '', date: new Date().toISOString().slice(0, 10), status: 'planned', owner: 'Projektleitung', phaseId: project.phases[0]?.id, notes: '' }
  if (modal.type === 'team') return { name: '', email: '', role: 'Verantwortlich', area: '', initials: '', active: true }
  if (modal.type === 'phase') return { title: '', start: '', end: '', status: 'planned', milestone: '', owner: '', description: '' }
  if (modal.type === 'poll') return { title: '', description: '', status: 'open', closes: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10), multiple: false, options: [{ id: uid('option'), label: '', votes: [] }, { id: uid('option'), label: '', votes: [] }] }
  return {}
}

function TaskFields({ form, set, project }) {
  return <><Field label="Titel"><input required value={form.title} onChange={(e) => set('title', e.target.value)} /></Field><div className="form-grid"><Field label="Phase"><select value={form.phaseId} onChange={(e) => set('phaseId', e.target.value)}>{project.phases.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></Field><Field label="Verantwortlich"><input value={form.owner} onChange={(e) => set('owner', e.target.value)} /></Field><Field label="Fällig am"><input type="date" value={form.due} onChange={(e) => set('due', e.target.value)} /></Field><Field label="Priorität"><select value={form.priority} onChange={(e) => set('priority', e.target.value)}><option value="high">Hoch</option><option value="medium">Mittel</option><option value="low">Niedrig</option></select></Field><Field label="Status"><select value={form.status} onChange={(e) => set('status', e.target.value)}><option value="todo">Offen</option><option value="doing">In Arbeit</option><option value="done">Erledigt</option></select></Field><Field label="Tags (Komma getrennt)"><input value={(form.tags || []).join(', ')} onChange={(e) => set('tags', e.target.value.split(',').map((t) => t.trim()).filter(Boolean))} /></Field></div></>
}

function MilestoneFields({ form, set, project }) {
  return <><div className="form-grid"><Field label="Code"><input value={form.code} onChange={(e) => set('code', e.target.value)} /></Field><Field label="Termin"><input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} /></Field></div><Field label="Titel"><input required value={form.title} onChange={(e) => set('title', e.target.value)} /></Field><div className="form-grid"><Field label="Status"><select value={form.status} onChange={(e) => set('status', e.target.value)}><option value="planned">Geplant</option><option value="active">In Arbeit</option><option value="done">Erledigt</option><option value="locked">Gesperrt</option></select></Field><Field label="Verantwortlich"><input value={form.owner} onChange={(e) => set('owner', e.target.value)} /></Field><Field label="Projektphase"><select value={form.phaseId} onChange={(e) => set('phaseId', e.target.value)}>{project.phases.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></Field></div><Field label="Notiz"><textarea rows="3" value={form.notes} onChange={(e) => set('notes', e.target.value)} /></Field></>
}

function TeamFields({ form, set }) {
  return <><Field label="Name"><input required value={form.name} onChange={(e) => { set('name', e.target.value); if (!form.initials) set('initials', initials(e.target.value)) }} /></Field><div className="form-grid"><Field label="E-Mail"><input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></Field><Field label="Rolle"><select value={form.role} onChange={(e) => set('role', e.target.value)}><option>Projektleitung</option><option>Entscheidung</option><option>Verantwortlich</option><option>Beteiligt</option><option>Informiert</option></select></Field><Field label="Verantwortungsbereich"><input value={form.area} onChange={(e) => set('area', e.target.value)} /></Field><Field label="Kürzel"><input maxLength="3" value={form.initials} onChange={(e) => set('initials', e.target.value.toUpperCase())} /></Field></div><label className="toggle-row"><input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} /><span>Aktiv im Projekt</span></label><div className="form-note"><UserPlus size={17} /><span>Das Hinzufügen hier pflegt die Projektrolle. Einen echten Cloud-Login erhält die Person über die Supabase-Authentifizierung.</span></div></>
}

function PhaseFields({ form, set }) {
  return <><Field label="Phasenname"><input required value={form.title} onChange={(e) => set('title', e.target.value)} /></Field><div className="form-grid"><Field label="Start"><input type="date" value={form.start} onChange={(e) => set('start', e.target.value)} /></Field><Field label="Ende"><input type="date" value={form.end} onChange={(e) => set('end', e.target.value)} /></Field><Field label="Status"><select value={form.status} onChange={(e) => set('status', e.target.value)}><option value="planned">Geplant</option><option value="active">In Arbeit</option><option value="done">Erledigt</option><option value="locked">Gesperrt</option></select></Field><Field label="Verantwortlich"><input value={form.owner} onChange={(e) => set('owner', e.target.value)} /></Field></div><Field label="Meilenstein"><input value={form.milestone} onChange={(e) => set('milestone', e.target.value)} /></Field><Field label="Beschreibung"><textarea rows="4" value={form.description} onChange={(e) => set('description', e.target.value)} /></Field></>
}

function PollFields({ form, setForm, set }) {
  const updateOption = (id, label) => setForm((f) => ({ ...f, options: f.options.map((o) => o.id === id ? { ...o, label } : o) }))
  const addOption = () => setForm((f) => ({ ...f, options: [...f.options, { id: uid('option'), label: '', votes: [] }] }))
  const removeOption = (id) => setForm((f) => ({ ...f, options: f.options.filter((o) => o.id !== id) }))
  return <><Field label="Frage / Titel"><input required value={form.title} onChange={(e) => set('title', e.target.value)} /></Field><Field label="Beschreibung"><textarea rows="2" value={form.description} onChange={(e) => set('description', e.target.value)} /></Field><div className="form-grid"><Field label="Status"><select value={form.status} onChange={(e) => set('status', e.target.value)}><option value="open">Offen</option><option value="closed">Beendet</option></select></Field><Field label="Abstimmung endet"><input type="date" value={form.closes} onChange={(e) => set('closes', e.target.value)} /></Field></div><Field label="Antwortoptionen"><div className="option-editor">{form.options.map((option, idx) => <div className="option-edit-row" key={option.id}><span>{idx + 1}</span><input required value={option.label} onChange={(e) => updateOption(option.id, e.target.value)} placeholder={`Option ${idx + 1}`} />{form.options.length > 2 && <button type="button" className="icon-btn icon-btn--small" onClick={() => removeOption(option.id)}><X size={16} /></button>}</div>)}<button type="button" className="text-btn" onClick={addOption}><Plus size={15} /> Option ergänzen</button></div></Field><label className="toggle-row"><input type="checkbox" checked={form.multiple} onChange={(e) => set('multiple', e.target.checked)} /><span>Mehrfachauswahl erlauben</span></label></>
}

function Field({ label, children }) { return <label className="field"><span>{label}</span>{children}</label> }

function MessageFeed({ project, commit, actor }) {
  const [text, setText] = useState('')
  const post = (e) => {
    e.preventDefault(); if (!text.trim()) return
    const message = text.trim()
    commit((next) => { next.messages = [{ id: uid('msg'), author: actor || 'Projektteam', text: message, createdAt: new Date().toISOString() }, ...(next.messages || [])].slice(0, 30) }, 'Neue Nachricht im Projektfeed')
    setText('')
  }
  return <div className="feed-wrap"><div className="message-list">{project.messages.slice(0, 4).map((msg) => <div className="message" key={msg.id}><div className="avatar avatar--small">{initials(msg.author)}</div><div><div className="message-meta"><strong>{msg.author}</strong><span>{dateTimeFmt(msg.createdAt)}</span></div><p>{msg.text}</p></div></div>)}</div><form className="message-compose" onSubmit={post}><input value={text} onChange={(e) => setText(e.target.value)} placeholder="Kurze Nachricht ans Team …" /><button className="send-btn" type="submit" aria-label="Senden"><Send size={17} /></button></form></div>
}

function PollMini({ poll, onOpen }) {
  const total = poll.options.reduce((sum, o) => sum + (o.votes?.length || 0), 0)
  return <div className="poll-mini"><div className="poll-mini-icon"><Vote size={22} /></div><h3>{poll.title}</h3><p>{poll.description}</p><div className="poll-mini-options">{poll.options.slice(0, 3).map((o) => <div key={o.id}><span>{o.label}</span><strong>{o.votes?.length || 0}</strong></div>)}</div><div className="poll-mini-footer"><span>{total} Stimmen · bis {dateFmt(poll.closes, false)}</span><button className="btn btn--soft" onClick={onOpen}>Jetzt abstimmen</button></div></div>
}

function MiniRoadmap({ phases }) {
  return <div className="mini-roadmap"><div className="roadmap-line" />{phases.slice(0, 8).map((p, i) => <div className={`roadmap-node roadmap-node--${p.status}`} key={p.id}><span>{i + 1}</span><div><strong>{p.title}</strong><small>{dateFmt(p.end, false)}</small></div></div>)}<div className="roadmap-more"><span>+{Math.max(0, phases.length - 8)}</span><small>weitere Phasen</small></div></div>
}

function MilestoneRow({ milestone, index, onClick }) {
  return <button className="milestone-row" onClick={onClick}><div className="milestone-index">{milestone.code}</div><div className="milestone-row-copy"><strong>{milestone.title}</strong><span>{milestone.owner}</span></div><div className="milestone-row-date"><strong>{dateFmt(milestone.date, false)}</strong><StatusChip status={milestone.status} /></div><ChevronRight size={17} /></button>
}

function TaskFocus({ task, phase, onEdit, onDone }) {
  return <div className="task-focus"><button className="check-btn" onClick={onDone}><Check size={15} /></button><div className="task-focus-copy" onClick={onEdit}><strong>{task.title}</strong><span>{phase?.title} · fällig {dateFmt(task.due, false)}</span></div><span className={`priority-dot priority-dot--${task.priority}`} /></div>
}

function CardHead({ title, subtitle, action, icon: Icon }) {
  return <div className="card-head"><div className="card-title-wrap">{Icon && <span className="card-head-icon"><Icon size={18} /></span>}<div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div></div>{action}</div>
}

function PageIntro({ eyebrow, title, text, action }) {
  return <div className="page-intro"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><p>{text}</p></div>{action}</div>
}

function StatCard({ icon: Icon, label, value, detail, tone }) {
  return <article className="stat-card"><span className={`stat-icon stat-icon--${tone}`}><Icon size={20} /></span><div><span className="stat-label">{label}</span><strong>{value}</strong><small>{detail}</small></div></article>
}

function SummaryPill({ icon: Icon, label, value }) { return <div className="summary-pill"><span><Icon size={18} /></span><div><small>{label}</small><strong>{value}</strong></div></div> }
function StatusChip({ status }) { return <span className={`status-chip status-chip--${status}`}>{statusLabel[status] || status}</span> }
function Progress({ value }) { return <div className="progress-track"><div style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div> }
function ProgressRing({ value }) { return <div className="progress-ring" style={{ '--progress': `${value * 3.6}deg` }}><div><strong>{value}%</strong><span>erledigt</span></div></div> }
function EmptyState({ icon: Icon, title, text, action }) { return <div className="empty-state"><span><Icon size={23} /></span><strong>{title}</strong><p>{text}</p>{action && <button className="btn btn--soft" onClick={action}>Anlegen</button>}</div> }
function getProjectProgress(project) { const done = project.milestones.filter((m) => m.status === 'done').length; const active = project.milestones.filter((m) => m.status === 'active').length; return Math.round(((done + active * 0.35) / Math.max(1, project.milestones.length)) * 100) }

export default App
