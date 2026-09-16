from pathlib import Path


def replace_once(text, old, new, label):
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f'{label}: pattern not found')
    return text.replace(old, new, 1)

# --- AppV2: role preview selector + read-only simulated views ---
p = Path('src/AppV2.jsx')
s = p.read_text()
s = s.replace("import { PortalBlocks, DEFAULT_MEMBER_BLOCKS } from './PortalBlocks.jsx'", "import { PortalBlocks, DEFAULT_MEMBER_BLOCKS, DEFAULT_PUBLIC_BLOCKS } from './PortalBlocks.jsx'", 1)

if 'function portalViewFromUrl()' not in s:
    marker = "function portalPageFromUrl() {\n"
    helper = """function portalViewFromUrl() {\n  const value = new URL(window.location.href).searchParams.get('view') || 'own'\n  return ['own','visitor','registered','founder','board'].includes(value) ? value : 'own'\n}\nfunction writePortalView(view) {\n  const url = new URL(window.location.href)\n  if (!view || view === 'own') url.searchParams.delete('view')\n  else url.searchParams.set('view', view)\n  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)\n}\n\n"""
    s = s.replace(marker, helper + marker, 1)

s = replace_once(s, "  const [page, setPage] = useState(() => portalPageFromUrl())\n", "  const [page, setPage] = useState(() => portalPageFromUrl())\n  const [viewMode, setViewMode] = useState(() => portalViewFromUrl())\n", 'preview state')
s = replace_once(s, "    const onPopState = () => setPage(portalPageFromUrl())\n", "    const onPopState = () => { setPage(portalPageFromUrl()); setViewMode(portalViewFromUrl()) }\n", 'preview popstate')

s = replace_once(s, "  const canFinance = isAdmin || (canBoard && hasPermission(project, user, 'finance_manage'))\n", "  const canFinance = isAdmin || (canBoard && hasPermission(project, user, 'finance_manage'))\n  const canPreview = isAdmin || kind === 'founder'\n  const previewMode = canPreview ? viewMode : 'own'\n", 'preview capability')

old = """          <div className=\"top-actions\">\n            <div className=\"env-badge\">LAB</div>"""
new = """          <div className=\"top-actions\">\n            {canPreview && <label className=\"view-as-control\"><span>Ansicht als</span><select value={previewMode} onChange={(e) => { setViewMode(e.target.value); writePortalView(e.target.value) }}><option value=\"own\">Eigene Ansicht</option><option value=\"visitor\">Besucher</option><option value=\"registered\">Registrierter Nutzer</option><option value=\"founder\">Gründungsmitglied</option><option value=\"board\">Vorstand</option></select></label>}\n            <div className=\"env-badge\">LAB</div>"""
s = replace_once(s, old, new, 'preview selector')

start = """        <div className=\"content-frame\">\n          {page === 'dashboard' && (canFoundation ? <Dashboard project={project} user={user} mutate={mutate} go={go} /> : <MemberDashboard project={project} user={user} profile={profile} mutate={mutate} setToast={setToast} canBoard={canBoard} canCms={canCms} />)}"""
new_start = """        <div className=\"content-frame\">\n          {previewMode !== 'own' ? <PortalRolePreview mode={previewMode} project={project} user={user} /> : <>\n          {page === 'dashboard' && (canFoundation ? <Dashboard project={project} user={user} mutate={mutate} go={go} /> : <MemberDashboard project={project} user={user} profile={profile} mutate={mutate} setToast={setToast} canBoard={canBoard} canCms={canCms} />)}"""
s = replace_once(s, start, new_start, 'preview content start')
end = """          {page === 'profile' && <Profile project={project} user={user} mutate={mutate} />}\n        </div>"""
new_end = """          {page === 'profile' && <Profile project={project} user={user} mutate={mutate} />}\n          </>}\n        </div>"""
s = replace_once(s, end, new_end, 'preview content end')
s = s.replace("      {!onboardingDone && <Onboarding", "      {previewMode === 'own' && !onboardingDone && <Onboarding", 1)

if 'function PortalRolePreview(' not in s:
    marker = "function MemberDashboard({ project, user, profile, mutate, setToast, canBoard, canCms }) {"
    component = r'''function PortalRolePreview({ mode, project, user }) {
  const noop = () => {}
  const fakeRegistered = { ...user, email: 'preview-registriert@wekib.invalid', name: 'Testnutzer', role: 'member' }
  const fakeFounder = { ...user, email: 'preview-gruendung@wekib.invalid', name: 'Gründungsmitglied', role: 'member' }
  const nav = mode === 'visitor' ? ['Startseite','Über uns','Angebote','Kontakt','Anmelden']
    : mode === 'registered' ? ['Mein WeKiB','Profil']
    : mode === 'founder' ? ['Mein WeKiB','Aufgaben','Dokumente','Dateien','Umfragen','Termine','Mitglieder','Entscheidungen','Aktivität','Profil']
    : ['Mein WeKiB','Vorstandsbereich','Schatzmeister*','Profil']
  return <div className="portal-role-preview">
    <div className="preview-banner"><Eye size={16}/><div><strong>Vorschau: {mode === 'visitor' ? 'Besucher' : mode === 'registered' ? 'Registrierter Nutzer' : mode === 'founder' ? 'Gründungsmitglied' : 'Vorstand'}</strong><span>Nur Vorschau – Änderungen und Abstimmungen sind in dieser simulierten Ansicht deaktiviert.</span></div></div>
    <div className="preview-nav">{nav.map((label) => <span key={label}>{label}</span>)}</div>
    {mode === 'visitor' && <div className="preview-public"><PortalBlocks blocks={project.settings?.publicBlocks?.length ? project.settings.publicBlocks : DEFAULT_PUBLIC_BLOCKS} mode="public" /></div>}
    {mode === 'registered' && <MemberDashboard project={project} user={fakeRegistered} profile={{ displayName: 'Testnutzer', kind: 'member' }} mutate={noop} setToast={noop} canBoard={false} canCms={false} />}
    {mode === 'founder' && <Dashboard project={project} user={fakeFounder} mutate={noop} go={noop} />}
    {mode === 'board' && <BoardArea canFinance={true} go={noop} />}
  </div>
}

'''
    s = s.replace(marker, component + marker, 1)
p.write_text(s)

# --- CMS: separate member content and poll analytics ---
p = Path('src/PortalCms.jsx')
s = p.read_text()
if "MemberPollAdmin" not in s:
    s = s.replace("import PollsWithImages from './PollsWithImages.jsx'", "import PollsWithImages from './PollsWithImages.jsx'\nimport MemberPollAdmin from './MemberPollAdmin.jsx'", 1)
s = replace_once(s, "  const [audience, setAudience] = useState('public')\n", "  const [audience, setAudience] = useState('public')\n  const [memberSection, setMemberSection] = useState('content')\n", 'member section state')
old_tabs = """    <div className=\"cms-audience-tabs\">\n      <button className={audience === 'public' ? 'active' : ''} onClick={() => setAudience('public')}>Öffentliche Website</button>\n      <button className={audience === 'member' ? 'active' : ''} onClick={() => setAudience('member')}>Registrierter Lesebereich</button>\n      <button onClick={() => setPreview(!preview)}><Eye size={15} /> {preview ? 'Editor' : 'Vorschau'}</button>\n    </div>"""
new_tabs = """    <div className=\"cms-audience-tabs\">\n      <button className={audience === 'public' ? 'active' : ''} onClick={() => setAudience('public')}>Öffentliche Website</button>\n      <button className={audience === 'member' ? 'active' : ''} onClick={() => setAudience('member')}>Registrierter Lesebereich</button>\n      <button onClick={() => setPreview(!preview)}><Eye size={15} /> {preview ? 'Editor' : 'Vorschau'}</button>\n    </div>\n    {audience === 'member' && <div className=\"cms-member-tabs\"><button className={memberSection === 'content' ? 'active' : ''} onClick={() => setMemberSection('content')}>Inhalte & Umfragen</button><button className={memberSection === 'analytics' ? 'active' : ''} onClick={() => { setMemberSection('analytics'); setPreview(false) }}>Umfragen & Auswertung</button></div>}"""
s = replace_once(s, old_tabs, new_tabs, 'member cms tabs')
s = s.replace("    {preview ? <div className=\"cms-preview\">", "    {(audience !== 'member' || memberSection === 'content') && (preview ? <div className=\"cms-preview\">", 1)
s = s.replace("    </div>}\n    {audience === 'member' && !preview && user && <section className=\"cms-member-polls\">", "    </div>)}\n    {audience === 'member' && memberSection === 'content' && !preview && user && <section className=\"cms-member-polls\">", 1)
s = s.replace("</section>}\n  </div>\n}", "</section>}\n    {audience === 'member' && memberSection === 'analytics' && user && <MemberPollAdmin project={project} mutate={mutate} setToast={setToast} />}\n  </div>\n}", 1)
p.write_text(s)

# --- Member poll result visibility ---
p = Path('src/PollsWithImages.jsx')
s = p.read_text()
if 'const resultsVisibility' not in s:
    s = s.replace("  const hasImages = options.some((option) => option.imageId || option.imageDataUrl)\n", "  const hasImages = options.some((option) => option.imageId || option.imageDataUrl)\n  const resultsVisibility = poll.resultsVisibility || 'after-vote'\n  const canSeeResults = (poll.scope || 'foundation') !== 'member' || resultsVisibility === 'always' || (resultsVisibility === 'after-vote' && myVotes.length > 0) || (resultsVisibility === 'after-close' && poll.status !== 'open')\n", 1)
    s = s.replace("        const percent = total ? Math.round((count / total) * 100) : 0", "        const percent = canSeeResults && total ? Math.round((count / total) * 100) : 0", 1)
    s = s.replace("<b>{percent}%</b>", "<b>{canSeeResults ? `${percent}%` : '—'}</b>", 1)
    s = s.replace("<div className=\"visual-poll-footer\"><span><Users size={13} /> {total} {total === 1 ? 'Stimme' : 'Stimmen'}</span>", "<div className=\"visual-poll-footer\"><span><Users size={13} /> {canSeeResults ? `${total} ${total === 1 ? 'Stimme' : 'Stimmen'}` : 'Ergebnis noch verborgen'}</span>", 1)
p.write_text(s)

# --- CSS ---
p = Path('src/preview-polls.css')
p.write_text(r'''
.view-as-control{display:flex;align-items:center;gap:8px;padding:5px 8px;border:1px solid var(--border);border-radius:8px;background:var(--surface)}
.view-as-control span{font-size:11px;font-weight:700;color:var(--muted);white-space:nowrap}.view-as-control select{border:0;background:transparent;color:var(--text);font:inherit;font-size:12px;font-weight:650;outline:none}
.preview-banner{display:flex;gap:10px;align-items:center;padding:12px 14px;margin-bottom:12px;border:1px solid var(--border);background:var(--surface);border-radius:8px}.preview-banner div{display:flex;flex-direction:column;gap:2px}.preview-banner span{font-size:12px;color:var(--muted)}
.preview-nav{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:14px}.preview-nav span{padding:6px 9px;border:1px solid var(--border);border-radius:999px;background:var(--surface);font-size:11px;font-weight:650;color:var(--muted)}
.preview-public{overflow:hidden;border-radius:8px}.cms-member-tabs{display:flex;gap:8px;margin:12px 0 18px}.cms-member-tabs button{padding:9px 12px;border:1px solid var(--border);border-radius:7px;background:var(--surface);color:var(--text);font-weight:650}.cms-member-tabs button.active{background:var(--text);color:var(--surface)}
.member-poll-admin{display:grid;gap:14px}.member-poll-admin-intro{display:flex;align-items:center;justify-content:space-between;gap:18px}.member-poll-admin-intro h3{margin:4px 0}.member-poll-admin-intro p{margin:0;color:var(--muted)}.member-poll-admin-metric{display:grid;grid-template-columns:auto auto;gap:2px 8px;align-items:center}.member-poll-admin-metric strong{font-size:24px}.member-poll-admin-metric span{grid-column:1/-1;font-size:11px;color:var(--muted)}
.member-poll-admin-list{display:grid;gap:10px}.member-poll-admin-card{padding:0;overflow:hidden}.member-poll-admin-head{width:100%;display:flex;justify-content:space-between;align-items:center;text-align:left;padding:14px;border:0;background:transparent;color:var(--text)}.member-poll-admin-head>div{display:grid;grid-template-columns:auto 1fr;gap:5px 10px;align-items:center}.member-poll-admin-head strong{font-size:14px}.member-poll-admin-head small{grid-column:2;color:var(--muted)}.member-poll-admin-body{border-top:1px solid var(--border);padding:14px}.member-poll-admin-toolbar{display:flex;align-items:end;gap:10px;flex-wrap:wrap;margin-bottom:14px}.member-poll-admin-toolbar label{display:flex;flex-direction:column;gap:5px;font-size:11px;color:var(--muted)}.member-poll-admin-toolbar select{min-width:190px;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text)}
.member-poll-results{display:grid;gap:10px}.member-poll-result{display:grid;grid-template-columns:62px 1fr;gap:10px;align-items:center}.member-poll-result img,.member-poll-result-placeholder{width:62px;height:48px;object-fit:cover;border:1px solid var(--border);border-radius:6px;background:var(--surface-2);display:grid;place-items:center}.member-poll-result>div:last-child{display:grid;gap:4px}.member-poll-result span{font-size:11px;color:var(--muted)}.member-poll-result i{height:5px;border-radius:999px;background:var(--surface-2);overflow:hidden}.member-poll-result i b{display:block;height:100%;background:currentColor}.member-poll-privacy{display:flex;gap:7px;align-items:center;margin-top:13px;padding-top:12px;border-top:1px solid var(--border);font-size:11px;color:var(--muted)}.member-poll-empty{display:flex;gap:8px;align-items:center}.member-poll-empty span{color:var(--muted)}
@media(max-width:760px){.view-as-control span{display:none}.view-as-control select{max-width:150px}.member-poll-admin-intro{align-items:flex-start}.member-poll-admin-toolbar{align-items:stretch;flex-direction:column}.member-poll-admin-toolbar select{width:100%}.member-poll-admin-head>div{grid-template-columns:1fr}.member-poll-admin-head small{grid-column:auto}}
''')

p = Path('src/main.jsx')
s = p.read_text()
if "./preview-polls.css" not in s:
    s += "\nimport './preview-polls.css'\n"
p.write_text(s)

print('Role preview and member poll analytics applied')
