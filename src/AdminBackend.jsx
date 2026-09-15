import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDown, ArrowUp, Eye, EyeOff, KeyRound, Plus, RefreshCw, Save,
  Settings2, ShieldCheck, SlidersHorizontal, UserCog, Users,
} from 'lucide-react'
import { cloudEnabled, createUserAccount, listUserAccounts, updateUserAccount } from './lib/projectStore.js'
import './admin.css'

export const PERMISSIONS = [
  ['access_foundation', 'Bereich Gründung', 'Öffnet den internen Arbeitsraum für Gründungsmitglieder.'],
  ['access_board', 'Bereich Vorstand', 'Öffnet den vertraulichen Vorstandsbereich.'],
  ['documents_edit', 'Gemeinsame Dokumente bearbeiten', 'Darf gemeinsame Arbeitsdokumente verändern und Versionen speichern.'],
  ['documents_finalize', 'Dokumente finalisieren', 'Darf Arbeitsfassungen abschließen und in der Dateiablage archivieren.'],
  ['files_manage', 'Dateien & Ordner verwalten', 'Darf Dateien hochladen und Ordner für die gemeinsame Ablage anlegen.'],
  ['tasks_manage', 'Aufgaben verwalten', 'Darf Aufgaben anlegen, verschieben und abschließen.'],
  ['polls_create', 'Umfragen erstellen', 'Darf Text- und Bildumfragen veröffentlichen.'],
  ['calendar_manage', 'Termine verwalten', 'Darf Termine und Fristen anlegen.'],
  ['decisions_manage', 'Entscheidungen dokumentieren', 'Darf Einträge im Entscheidungsregister erstellen.'],
  ['cms_manage', 'CMS / Dashboard gestalten', 'Darf Aufbau und Inhalte der gemeinsamen Startseite konfigurieren.'],
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

const defaultPermissions = (kind, role) => {
  if (role === 'admin') return Object.fromEntries(PERMISSIONS.map(([id]) => [id, true]))
  if (role === 'viewer') return Object.fromEntries(PERMISSIONS.map(([id]) => [id, false]))
  if (kind === 'founder') return {
    access_foundation: true,
    access_board: false,
    documents_edit: true,
    documents_finalize: true,
    files_manage: true,
    tasks_manage: true,
    polls_create: true,
    calendar_manage: true,
    decisions_manage: true,
    cms_manage: false,
  }
  return Object.fromEntries(PERMISSIONS.map(([id]) => [id, false]))
}

function profileFor(project, account) {
  return project.profiles.find((p) => p.email?.toLowerCase() === account.email?.toLowerCase()) || {
    email: account.email,
    displayName: account.name,
    kind: account.role === 'admin' ? 'admin' : 'member',
    visible: true,
    area: '',
    bio: '',
    permissions: {},
  }
}

function effectivePermission(profile, account, key) {
  if (account.role === 'admin') return true
  if (Object.prototype.hasOwnProperty.call(profile.permissions || {}, key)) return Boolean(profile.permissions[key])
  return Boolean(defaultPermissions(profile.kind, account.role)[key])
}

function Avatar({ name = '' }) {
  const letters = name.split(/\s|@/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'W'
  return <span className="admin-avatar">{letters}</span>
}

export default function AdminBackend({ project, user, mutate, setToast, initialTab = null }) {
  const isAdmin = user.role === 'admin'
  const canCms = isAdmin || Boolean(project.profiles.find((p) => p.email === user.email)?.permissions?.cms_manage)
  const [tab, setTab] = useState(initialTab || (isAdmin ? 'users' : 'cms'))
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'member', kind: 'founder' })
  const [expanded, setExpanded] = useState(null)

  const refresh = async () => {
    if (!isAdmin || !cloudEnabled) return
    setLoading(true)
    try { setAccounts(await listUserAccounts()) } catch (error) { setToast?.(error.message) } finally { setLoading(false) }
  }

  useEffect(() => { refresh() }, [isAdmin])

  const create = async (event) => {
    event.preventDefault()
    try {
      const account = await createUserAccount(form)
      mutate((p) => {
        const email = form.email.trim().toLowerCase()
        if (!p.profiles.some((item) => item.email?.toLowerCase() === email)) {
          p.profiles.push({
            email,
            displayName: form.name.trim(),
            kind: form.role === 'admin' ? 'admin' : form.kind,
            visible: true,
            area: '',
            bio: '',
            permissions: {},
          })
        }
      }, `Benutzerzugang für ${form.name.trim()} angelegt`)
      setAccounts((current) => [account, ...current])
      setForm({ name: '', email: '', password: '', role: 'member', kind: 'founder' })
      setShowNew(false)
      setToast?.('Benutzerzugang angelegt')
    } catch (error) { setToast?.(error.message) }
  }

  const patchAccount = async (account, changes) => {
    try {
      const next = await updateUserAccount(account.id, changes)
      setAccounts((current) => current.map((item) => item.id === account.id ? { ...item, ...next } : item))
      setToast?.('Zugang aktualisiert')
    } catch (error) { setToast?.(error.message) }
  }

  const patchProfile = (account, recipe, activity = 'Berechtigungen aktualisiert') => {
    mutate((p) => {
      let profile = p.profiles.find((item) => item.email?.toLowerCase() === account.email?.toLowerCase())
      if (!profile) {
        profile = { email: account.email.toLowerCase(), displayName: account.name, kind: 'member', visible: true, area: '', bio: '', permissions: {} }
        p.profiles.push(profile)
      }
      profile.permissions ||= {}
      recipe(profile)
    }, activity)
  }

  const resetPassword = async (account) => {
    const password = window.prompt(`Neues Passwort für ${account.name}\nMindestens 12 Zeichen:`)
    if (!password) return
    if (password.length < 12) return setToast?.('Das Passwort muss mindestens 12 Zeichen lang sein.')
    await patchAccount(account, { password })
  }

  const userRows = useMemo(() => accounts.map((account) => ({ account, profile: profileFor(project, account) })), [accounts, project.profiles])

  return <div className="page admin-page">
    <div className="page-header admin-header">
      <div><p className="eyebrow">ADMINISTRATION</p><h1>Admin-Backend</h1><p>Konten, Rollen, Sonderrechte und die gemeinsame Plattform zentral verwalten.</p></div>
      {isAdmin && tab === 'users' && <button className="primary-btn" onClick={() => setShowNew((value) => !value)}><Plus size={16} /> Nutzer anlegen</button>}
    </div>

    <div className="admin-tabs">
      {isAdmin && <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}><Users size={17} /> Benutzer & Rechte</button>}
      {canCms && <button className={tab === 'cms' ? 'active' : ''} onClick={() => setTab('cms')}><SlidersHorizontal size={17} /> CMS & Dashboard</button>}
    </div>

    {tab === 'users' && isAdmin && <>
      <section className="admin-summary-grid">
        <div><Users size={18} /><span>Konten</span><strong>{accounts.length}</strong></div>
        <div><ShieldCheck size={18} /><span>Admins</span><strong>{accounts.filter((a) => a.role === 'admin' && a.active).length}</strong></div>
        <div><UserCog size={18} /><span>Gründungsmitglieder</span><strong>{userRows.filter(({ profile }) => profile.kind === 'founder').length}</strong></div>
        <div><Eye size={18} /><span>Sichtbare Profile</span><strong>{userRows.filter(({ profile }) => profile.visible !== false).length}</strong></div>
      </section>

      {showNew && <form className="card admin-create" onSubmit={create}>
        <div className="card-head"><div><h3>Neuen Zugang anlegen</h3><p>Das Startpasswort kann später jederzeit neu gesetzt werden.</p></div></div>
        <div className="admin-create-grid">
          <label>Name<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label>E-Mail<input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label>Startpasswort<input required minLength="12" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
          <label>Personengruppe<select value={form.kind} disabled={form.role === 'admin'} onChange={(e) => setForm({ ...form, kind: e.target.value })}><option value="founder">Gründungsmitglied</option><option value="member">Normaler Nutzer</option></select></label>
          <label>Grundrolle<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="member">Standardzugang</option><option value="viewer">Nur lesen</option><option value="admin">Administrator</option></select></label>
        </div>
        <div className="admin-create-actions"><button type="button" className="secondary-btn" onClick={() => setShowNew(false)}>Abbrechen</button><button className="primary-btn"><Plus size={16} /> Zugang erstellen</button></div>
      </form>}

      <section className="card admin-users-card">
        <div className="card-head"><div><h3>Benutzerverwaltung</h3><p>Grundrolle festlegen und darunter individuelle Sonderrechte vergeben.</p></div><button className="secondary-btn" onClick={refresh}><RefreshCw size={15} className={loading ? 'spin' : ''} /> Aktualisieren</button></div>
        <div className="admin-user-list">
          {userRows.map(({ account, profile }) => {
            const open = expanded === account.id
            return <article className={`admin-user ${open ? 'open' : ''}`} key={account.id}>
              <div className="admin-user-main">
                <Avatar name={account.name} />
                <div className="admin-user-copy"><strong>{account.name}</strong><span>{account.email}</span><small>{profile.area || (profile.kind === 'founder' ? 'Gründungsmitglied' : 'Nutzer')}</small></div>
                <label className="compact-field"><span>Grundrolle</span><select value={account.role} onChange={(e) => patchAccount(account, { role: e.target.value })}><option value="admin">Admin</option><option value="member">Standard</option><option value="viewer">Nur lesen</option></select></label>
                <button className={`status-pill ${account.active ? 'open' : 'closed'}`} onClick={() => patchAccount(account, { active: !account.active })}>{account.active ? 'aktiv' : 'gesperrt'}</button>
                <button className="secondary-btn admin-details-btn" onClick={() => setExpanded(open ? null : account.id)}><UserCog size={15} /> {open ? 'Schließen' : 'Rechte'}</button>
              </div>

              {open && <div className="admin-user-detail">
                <div className="admin-user-settings">
                  <label>Personengruppe<select value={profile.kind || 'member'} disabled={account.role === 'admin'} onChange={(e) => patchProfile(account, (p) => { p.kind = e.target.value }, `Personengruppe von ${account.name} geändert`)}><option value="founder">Gründungsmitglied</option><option value="member">Normaler Nutzer</option></select></label>
                  <label className="switch-row mini"><span><strong>Profil sichtbar</strong><small>Im Mitgliederbereich anzeigen</small></span><input type="checkbox" checked={profile.visible !== false} onChange={(e) => patchProfile(account, (p) => { p.visible = e.target.checked }, `Profilsichtbarkeit von ${account.name} geändert`)} /></label>
                  <button className="secondary-btn" onClick={() => resetPassword(account)}><KeyRound size={15} /> Passwort neu setzen</button>
                </div>

                <div className="permission-head"><div><strong>Sonderrechte</strong><span>Voreinstellungen der Personengruppe können hier individuell übersteuert werden.</span></div>{account.role === 'admin' && <span className="admin-full-access"><ShieldCheck size={14} /> Vollzugriff</span>}</div>
                <div className="permission-grid">
                  {PERMISSIONS.map(([key, label, description]) => {
                    const enabled = effectivePermission(profile, account, key)
                    const overridden = Object.prototype.hasOwnProperty.call(profile.permissions || {}, key)
                    return <label className={`permission-card ${enabled ? 'enabled' : ''}`} key={key}>
                      <span><strong>{label}</strong><small>{description}</small>{overridden && account.role !== 'admin' && <em>individuell gesetzt</em>}</span>
                      <input type="checkbox" disabled={account.role === 'admin'} checked={enabled} onChange={(e) => patchProfile(account, (p) => { p.permissions[key] = e.target.checked }, `${label} für ${account.name} ${e.target.checked ? 'freigegeben' : 'entzogen'}`)} />
                    </label>
                  })}
                </div>
              </div>}
            </article>
          })}
        </div>
      </section>
    </>}

    {tab === 'cms' && canCms && <CmsPanel project={project} mutate={mutate} />}
  </div>
}

function CmsPanel({ project, mutate }) {
  const layout = project.settings.dashboardLayout || DEFAULT_LAYOUT
  const hidden = project.settings.hiddenDashboardModules || []
  const move = (id, direction) => mutate((p) => {
    const arr = [...(p.settings.dashboardLayout || DEFAULT_LAYOUT)]
    const index = arr.indexOf(id)
    const next = index + direction
    if (next >= 0 && next < arr.length) [arr[index], arr[next]] = [arr[next], arr[index]]
    p.settings.dashboardLayout = arr
  }, 'Dashboard-Anordnung geändert')

  return <div className="admin-cms-grid">
    <section className="card studio-card">
      <div className="studio-intro"><Settings2 size={20} /><div><strong>Dashboard-Komposition</strong><span>Reihenfolge und Sichtbarkeit gelten für alle Mitglieder.</span></div></div>
      {layout.map((id, index) => {
        const found = DASHBOARD_MODULES.find(([value]) => value === id)
        if (!found) return null
        const isHidden = hidden.includes(id)
        return <div className="module-row" key={id}><div><strong>{found[1]}</strong><span>{id}</span></div><button className="icon-btn" disabled={index === 0} onClick={() => move(id, -1)}><ArrowUp size={16} /></button><button className="icon-btn" disabled={index === layout.length - 1} onClick={() => move(id, 1)}><ArrowDown size={16} /></button><button className={`visibility-toggle ${isHidden ? '' : 'on'}`} onClick={() => mutate((p) => { const h = p.settings.hiddenDashboardModules || []; p.settings.hiddenDashboardModules = h.includes(id) ? h.filter((value) => value !== id) : [...h, id] }, `${found[1]} ${isHidden ? 'eingeblendet' : 'ausgeblendet'}`)}>{isHidden ? <EyeOff size={16} /> : <Eye size={16} />}{isHidden ? 'Aus' : 'Sichtbar'}</button></div>
      })}
    </section>
    <section className="card admin-brand-form">
      <div className="studio-intro"><Save size={20} /><div><strong>Marke & Projekt</strong><span>Zentrale Bezeichnungen der Gründungsplattform.</span></div></div>
      <label>Kurzname<input value={project.settings.brandName || 'WeKiB'} onChange={(e) => mutate((p) => { p.settings.brandName = e.target.value })} /></label>
      <label>Projekt-Untertitel<input value={project.meta.subtitle || ''} onChange={(e) => mutate((p) => { p.meta.subtitle = e.target.value })} /></label>
    </section>
  </div>
}
