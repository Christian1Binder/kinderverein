from pathlib import Path
import re


def replace_once(text, old, new, label):
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f'{label}: pattern not found')
    return text.replace(old, new, 1)

# --- Polls: reusable scope, member polls, one vote per account, CMS image scope ---
p = Path('src/PollsWithImages.jsx')
s = p.read_text()
s = replace_once(
    s,
    "export default function PollsWithImages({ project, user, mutate, setToast, canCreate = true }) {",
    "export default function PollsWithImages({ project, user, mutate, setToast, canCreate = true, scope = 'foundation', uploadScope = 'foundation', embedded = false, heading = 'Umfragen', intro = 'Text oder Bild: Varianten direkt miteinander vergleichen und transparent abstimmen.' }) {",
    'poll signature'
)
s = replace_once(
    s,
    "            const meta = await uploadProjectFile(option.file)",
    "            const meta = await uploadProjectFile(option.file, uploadScope)",
    'poll upload scope'
)
s = replace_once(
    s,
    "        multiple,\n        createdBy:",
    "        multiple: scope === 'member' ? false : multiple,\n        scope,\n        createdBy:",
    'poll scope on create'
)
s = replace_once(
    s,
    "        <label className=\"poll-switch\"><span><strong>Mehrfachauswahl</strong><small>Mitglieder dürfen mehrere Varianten auswählen.</small></span><input type=\"checkbox\" checked={multiple} onChange={(e) => setMultiple(e.target.checked)} /></label>",
    "        {scope !== 'member' && <label className=\"poll-switch\"><span><strong>Mehrfachauswahl</strong><small>Mitglieder dürfen mehrere Varianten auswählen.</small></span><input type=\"checkbox\" checked={multiple} onChange={(e) => setMultiple(e.target.checked)} /></label>}",
    'member single vote builder'
)
# insert visible polls before return
needle = "  return <div className=\"page polls-v3\">"
if "const visiblePolls" not in s:
    s = s.replace(needle, "  const visiblePolls = project.polls.filter((poll) => (poll.scope || 'foundation') === scope)\n\n  return <div className={embedded ? 'polls-v3 polls-embedded' : 'page polls-v3'}>", 1)
else:
    s = s.replace(needle, "  return <div className={embedded ? 'polls-v3 polls-embedded' : 'page polls-v3'}>", 1)
s = s.replace("<div><p className=\"eyebrow\">GEMEINSAM ENTSCHEIDEN</p><h1>Umfragen</h1><p>Text oder Bild: Varianten direkt miteinander vergleichen und transparent abstimmen.</p></div>", "<div><p className=\"eyebrow\">GEMEINSAM ENTSCHEIDEN</p><h1>{heading}</h1><p>{intro}</p></div>", 1)
s = s.replace("    <div className=\"poll-grid\">{project.polls.length ? project.polls.map((poll) => <PollCard key={poll.id} poll={poll} user={user} mutate={mutate} />) : <div className=\"card poll-empty\"><VoteEmpty /></div>}</div>", "    <div className=\"poll-grid\">{visiblePolls.length ? visiblePolls.map((poll) => <PollCard key={poll.id} poll={poll} user={user} mutate={mutate} />) : <div className=\"card poll-empty\"><VoteEmpty /></div>}</div>", 1)
s = s.replace("  }, `Stimme bei „${poll.title}“ aktualisiert`)", "  })", 1)
p.write_text(s)

# --- CMS: silent autosaves + member poll builder ---
p = Path('src/PortalCms.jsx')
s = p.read_text()
if "PollsWithImages" not in s:
    s = s.replace("import { projectImageUrl, uploadProjectFile } from './lib/projectStore.js'", "import { projectImageUrl, uploadProjectFile } from './lib/projectStore.js'\nimport PollsWithImages from './PollsWithImages.jsx'", 1)
s = s.replace("export default function PortalCms({ project, mutate, setToast }) {", "export default function PortalCms({ project, user, mutate, setToast }) {", 1)
s = s.replace("  }, `${audience === 'public' ? 'Öffentliche Website' : 'Mitgliederbereich'} im CMS geändert`)", "  })", 1)
old_end = "    </div>}\n  </div>\n}"
new_end = "    </div>}\n    {audience === 'member' && !preview && user && <section className=\"cms-member-polls\"><PollsWithImages project={project} user={user} mutate={mutate} setToast={setToast} canCreate scope=\"member\" uploadScope=\"member-cms\" embedded heading=\"Umfragen im Mitgliederbereich\" intro=\"Erstelle Abstimmungen für registrierte Nutzer. Pro Konto ist bei diesen Umfragen genau eine Stimme möglich; Bilder je Antwortoption sind erlaubt.\" /></section>}\n  </div>\n}"
if "cms-member-polls" not in s:
    s = replace_once(s, old_end, new_end, 'cms member polls')
p.write_text(s)

# --- Admin passes current user to CMS ---
p = Path('src/AdminBackend.jsx')
s = p.read_text()
s = s.replace("<PortalCms project={project} mutate={mutate} setToast={setToast} />", "<PortalCms project={project} user={user} mutate={mutate} setToast={setToast} />", 1)
p.write_text(s)

# --- Public login/register: password-manager friendly semantics and stable auth URLs ---
p = Path('src/PortalRoot.jsx')
s = p.read_text()
# open auth state from URL
if "const authParam" not in s:
    target = "  const [publicBlocks, setPublicBlocks] = useState(DEFAULT_PUBLIC_BLOCKS)\n"
    insert = """  const [publicBlocks, setPublicBlocks] = useState(DEFAULT_PUBLIC_BLOCKS)\n\n  useEffect(() => {\n    const authParam = new URL(window.location.href).searchParams.get('auth')\n    if (authParam === 'login' || authParam === 'register') {\n      setMode(authParam)\n      setAuthOpen(true)\n    }\n  }, [])\n"""
    s = replace_once(s, target, insert, 'auth query init')
# helpers / URL updates
old = """  const openAuth = (nextMode) => {\n    setMode(nextMode)\n    setMessage('')\n    setAuthOpen(true)\n    setMenu(false)\n  }\n"""
new = """  const setAuthUrl = (nextMode = '') => {\n    const url = new URL(window.location.href)\n    if (nextMode) url.searchParams.set('auth', nextMode)\n    else url.searchParams.delete('auth')\n    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)\n  }\n\n  const openAuth = (nextMode) => {\n    setMode(nextMode)\n    setMessage('')\n    setAuthOpen(true)\n    setMenu(false)\n    setAuthUrl(nextMode)\n  }\n\n  const closeAuth = () => {\n    setAuthOpen(false)\n    setAuthUrl('')\n  }\n"""
s = replace_once(s, old, new, 'auth URL helpers')
s = s.replace("      onAuthenticated(session)", "      setAuthUrl('')\n      onAuthenticated(session)", 1)
s = s.replace("setMode('login')\n      setLogin", "setMode('login')\n      setAuthUrl('login')\n      setLogin", 1)
s = s.replace("onMouseDown={() => setAuthOpen(false)}", "onMouseDown={closeAuth}", 1)
s = s.replace("onClick={() => setAuthOpen(false)}", "onClick={closeAuth}", 1)
# forms + names
s = s.replace("<form className=\"portal-auth-form\" onSubmit={submitLogin}>", "<form className=\"portal-auth-form\" method=\"post\" action=\"?auth=login\" autoComplete=\"on\" onSubmit={submitLogin}>", 1)
s = s.replace("<label>E-Mail-Adresse<input type=\"email\" required autoComplete=\"username\" value={login.email}", "<label htmlFor=\"wekib-login-email\">E-Mail-Adresse<input id=\"wekib-login-email\" name=\"username\" type=\"email\" inputMode=\"email\" required autoComplete=\"username\" value={login.email}", 1)
s = s.replace("<label>Passwort<input type=\"password\" required autoComplete=\"current-password\" value={login.password}", "<label htmlFor=\"wekib-login-password\">Passwort<input id=\"wekib-login-password\" name=\"password\" type=\"password\" required autoComplete=\"current-password\" value={login.password}", 1)
s = s.replace("</form> : <form className=\"portal-auth-form\" onSubmit={submitRegister}>", "</form> : <form className=\"portal-auth-form\" method=\"post\" action=\"?auth=register\" autoComplete=\"on\" onSubmit={submitRegister}>", 1)
s = s.replace("<label>Name<input required minLength=\"2\" value={register.name}", "<label htmlFor=\"wekib-register-name\">Name<input id=\"wekib-register-name\" name=\"name\" autoComplete=\"name\" required minLength=\"2\" value={register.name}", 1)
s = s.replace("<label>E-Mail-Adresse<input type=\"email\" required autoComplete=\"email\" value={register.email}", "<label htmlFor=\"wekib-register-email\">E-Mail-Adresse<input id=\"wekib-register-email\" name=\"email\" type=\"email\" inputMode=\"email\" required autoComplete=\"email\" value={register.email}", 1)
s = s.replace("<label>Passwort <small>mindestens 12 Zeichen</small><input type=\"password\" required minLength=\"12\" autoComplete=\"new-password\" value={register.password}", "<label htmlFor=\"wekib-register-password\">Passwort <small>mindestens 12 Zeichen</small><input id=\"wekib-register-password\" name=\"new-password\" type=\"password\" required minLength=\"12\" autoComplete=\"new-password\" value={register.password}", 1)
s = s.replace("<label>Passwort wiederholen<input type=\"password\" required minLength=\"12\" autoComplete=\"new-password\" value={register.password2}", "<label htmlFor=\"wekib-register-password2\">Passwort wiederholen<input id=\"wekib-register-password2\" name=\"new-password-confirmation\" type=\"password\" required minLength=\"12\" autoComplete=\"new-password\" value={register.password2}", 1)
p.write_text(s)

# --- Backend: members can read member polls and only change their own single vote; CMS can manage them ---
p = Path('api/access.php')
s = p.read_text()
s = s.replace("'finance_manage','finance_manage'", "'finance_manage'")
old = """function filter_scope_items(array $items, bool $allowFoundation, bool $allowBoard): array {\n    if (!$allowFoundation && !$allowBoard) return [];\n    return array_values(array_filter($items, static function ($item) use ($allowFoundation, $allowBoard): bool {\n        if (!is_array($item)) return false;\n        $scope = (string)($item['scope'] ?? 'foundation');\n        if ($scope === 'board') return $allowBoard;\n        if ($scope === 'public' || $scope === 'member') return true;\n        return $allowFoundation;\n    }));\n}\n"""
new = """function filter_scope_items(array $items, bool $allowFoundation, bool $allowBoard): array {\n    return array_values(array_filter($items, static function ($item) use ($allowFoundation, $allowBoard): bool {\n        if (!is_array($item)) return false;\n        $scope = (string)($item['scope'] ?? 'foundation');\n        if ($scope === 'public' || $scope === 'member') return true;\n        if ($scope === 'board') return $allowBoard;\n        return $allowFoundation;\n    }));\n}\n"""
s = replace_once(s, old, new, 'scope filter')
s = s.replace("        $state['polls'] = [];", "        $state['polls'] = filter_scope_items(is_array($state['polls'] ?? null) ? $state['polls'] : [], false, false);", 1)
# remove duplicate finance filter block if still doubled
s = s.replace("""    $permissions = portal_permissions_for_state($state, $user);\n    if (!$access['board'] || empty($permissions['finance_manage'])) $state['finance'] = ['transactions'=>[], 'budgets'=>[], 'files'=>[], 'accounts'=>[]];\n\n    $permissions = portal_permissions_for_state($state, $user);\n    if (!$access['board'] || empty($permissions['finance_manage'])) $state['finance'] = ['transactions'=>[], 'budgets'=>[], 'files'=>[], 'accounts'=>[]];\n""", """    $permissions = portal_permissions_for_state($state, $user);\n    if (!$access['board'] || empty($permissions['finance_manage'])) $state['finance'] = ['transactions'=>[], 'budgets'=>[], 'files'=>[], 'accounts'=>[]];\n""", 1)
# add merge helpers before merge_project_state_for_user
marker = "function merge_project_state_for_user(array $current, array $incoming, array $user): array {"
if "function merge_member_poll_votes" not in s:
    helpers = r'''function merge_member_poll_votes(array $currentPolls, array $incomingPolls, array $user): array {
    $email = strtolower((string)($user['email'] ?? ''));
    if ($email === '') return $currentPolls;
    $incomingById = [];
    foreach ($incomingPolls as $poll) if (is_array($poll) && isset($poll['id'])) $incomingById[(string)$poll['id']] = $poll;

    foreach ($currentPolls as &$poll) {
        if (!is_array($poll) || (string)($poll['scope'] ?? 'foundation') !== 'member' || (string)($poll['status'] ?? 'open') !== 'open') continue;
        $incomingPoll = $incomingById[(string)($poll['id'] ?? '')] ?? null;
        if (!is_array($incomingPoll)) continue;
        $selectedId = null;
        foreach (($incomingPoll['options'] ?? []) as $option) {
            if (!is_array($option)) continue;
            $votes = is_array($option['votes'] ?? null) ? $option['votes'] : [];
            foreach ($votes as $voteEmail) {
                if (strtolower((string)$voteEmail) === $email) { $selectedId = (string)($option['id'] ?? ''); break 2; }
            }
        }
        foreach ($poll['options'] as &$option) {
            if (!is_array($option)) continue;
            $votes = is_array($option['votes'] ?? null) ? $option['votes'] : [];
            $votes = array_values(array_filter($votes, static fn($voteEmail): bool => strtolower((string)$voteEmail) !== $email));
            if ($selectedId !== null && (string)($option['id'] ?? '') === $selectedId) $votes[] = $email;
            $option['votes'] = array_values(array_unique($votes));
        }
        unset($option);
    }
    unset($poll);
    return $currentPolls;
}

function merge_member_polls_for_cms(array $currentPolls, array $incomingPolls): array {
    $protected = array_values(array_filter($currentPolls, static fn($poll): bool => !is_array($poll) || (string)($poll['scope'] ?? 'foundation') !== 'member'));
    $member = array_values(array_filter($incomingPolls, static fn($poll): bool => is_array($poll) && (string)($poll['scope'] ?? 'foundation') === 'member'));
    return array_merge($member, $protected);
}

'''
    s = s.replace(marker, helpers + marker, 1)
# insert vote merge after onboarding merge
needle = """    if (isset($incoming['onboarding'][$email])) {\n        if (!isset($current['onboarding']) || !is_array($current['onboarding'])) $current['onboarding'] = [];\n        $current['onboarding'][$email] = $incoming['onboarding'][$email];\n    }\n\n"""
if "merge_member_poll_votes" in s and "$current['polls'] = merge_member_poll_votes" not in s:
    s = s.replace(needle, needle + "    $current['polls'] = merge_member_poll_votes(is_array($current['polls'] ?? null) ? $current['polls'] : [], is_array($incoming['polls'] ?? null) ? $incoming['polls'] : [], $user);\n\n", 1)
# CMS full member poll management
cms_marker = """    if ($access['cms'] && isset($incoming['settings']) && is_array($incoming['settings'])) {\n        $current['settings'] = $incoming['settings'];\n    }\n"""
cms_new = """    if ($access['cms']) {\n        if (isset($incoming['settings']) && is_array($incoming['settings'])) $current['settings'] = $incoming['settings'];\n        if (isset($incoming['polls']) && is_array($incoming['polls'])) $current['polls'] = merge_member_polls_for_cms(is_array($current['polls'] ?? null) ? $current['polls'] : [], $incoming['polls']);\n    }\n"""
s = replace_once(s, cms_marker, cms_new, 'cms member poll merge')
p.write_text(s)

# --- App: URL routing, richer member dashboard, useful activity feed ---
p = Path('src/AppV2.jsx')
s = p.read_text()
# helper functions after fmtDateTime
helper_anchor = "const fmtDateTime = (value) => value ? new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—'\n"
if "function importantActivities" not in s:
    helper = r'''
const PORTAL_PAGES = new Set(['dashboard','tasks','documents','files','polls','calendar','members','decisions','activity','board','treasury','studio','admin','profile'])
function portalPageFromUrl() {
  const value = new URL(window.location.href).searchParams.get('portal') || 'dashboard'
  return PORTAL_PAGES.has(value) ? value : 'dashboard'
}
function writePortalUrl(page, replace = false) {
  const url = new URL(window.location.href)
  url.searchParams.delete('auth')
  url.searchParams.delete('verification')
  if (!page || page === 'dashboard') url.searchParams.delete('portal')
  else url.searchParams.set('portal', page)
  const next = `${url.pathname}${url.search}${url.hash}`
  window.history[replace ? 'replaceState' : 'pushState']({}, '', next)
}
function isImportantActivity(text = '') {
  const value = String(text).trim()
  if (!value) return false
  if (/CMS geändert|Stimme bei|Profil aktualisiert|Einführung abgeschlossen|Dashboard-Anordnung geändert|Kommentar zu|Status von/i.test(value)) return false
  return /angelegt|erstellt|hochgeladen|finalisiert|gelöscht|entfernt|gestartet|dokumentiert|freigegeben|entzogen|gesperrt|verschoben|umbenannt|bestätigt/i.test(value)
}
function importantActivities(items = []) {
  const seen = new Set()
  return items.filter((item) => isImportantActivity(item?.text)).filter((item) => {
    const date = item?.createdAt ? new Date(item.createdAt) : null
    const bucket = date && !Number.isNaN(date.getTime()) ? Math.floor(date.getTime() / (15 * 60 * 1000)) : 0
    const key = `${item?.actor || ''}|${item?.text || ''}|${bucket}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
'''
    s = s.replace(helper_anchor, helper_anchor + helper, 1)
s = s.replace("  const [page, setPage] = useState('dashboard')", "  const [page, setPage] = useState(() => portalPageFromUrl())", 1)
# popstate effect after theme effect block
if "window.addEventListener('popstate'" not in s:
    anchor = """  useEffect(() => {\n    document.documentElement.dataset.theme = theme\n    localStorage.setItem('wekib-theme', theme)\n  }, [theme])\n"""
    addition = anchor + """\n  useEffect(() => {\n    const onPopState = () => setPage(portalPageFromUrl())\n    window.addEventListener('popstate', onPopState)\n    return () => window.removeEventListener('popstate', onPopState)\n  }, [])\n"""
    s = replace_once(s, anchor, addition, 'popstate route')
# mutate activity filtering/dedupe
old = """      if (activityText) {\n        next.activities.unshift({ id: uid('act'), text: activityText, actor: user?.name || user?.email || 'Nutzer', createdAt: nowIso(), kind: 'user' })\n        next.activities = next.activities.slice(0, 160)\n      }\n"""
new = """      if (isImportantActivity(activityText)) {\n        const actor = user?.name || user?.email || 'Nutzer'\n        const latest = next.activities?.[0]\n        const duplicate = latest && latest.text === activityText && latest.actor === actor && (Date.now() - new Date(latest.createdAt || 0).getTime()) < 10 * 60 * 1000\n        if (!duplicate) next.activities.unshift({ id: uid('act'), text: activityText, actor, createdAt: nowIso(), kind: 'user' })\n        next.activities = next.activities.slice(0, 120)\n      }\n"""
s = replace_once(s, old, new, 'activity filter')
# route authorization effect before login/logout functions
route_anchor = """  const login = async (event) => {\n"""
if "const allowed = target === 'dashboard'" not in s:
    route_effect = """  useEffect(() => {\n    if (!project || !user) return\n    const target = page\n    const isAdminUser = user.role === 'admin'\n    const kind = memberKind(project, user)\n    const foundation = isAdminUser || kind === 'founder' || hasPermission(project, user, 'access_foundation')\n    const board = isAdminUser || hasPermission(project, user, 'access_board')\n    const cms = isAdminUser || hasPermission(project, user, 'cms_manage')\n    const finance = isAdminUser || (board && hasPermission(project, user, 'finance_manage'))\n    const allowed = target === 'dashboard' || target === 'profile' ||\n      (['tasks','documents','files','polls','calendar','members','decisions','activity'].includes(target) && foundation) ||\n      (target === 'board' && board) || (target === 'treasury' && finance) ||\n      (target === 'studio' && cms) || (target === 'admin' && isAdminUser)\n    if (!allowed) { setPage('dashboard'); writePortalUrl('dashboard', true) }\n  }, [page, project, user])\n\n"""
    s = s.replace(route_anchor, route_effect + route_anchor, 1)
# go writes URL
old_go = """  const go = (target) => {\n    setPage(target)\n    setSidebarOpen(false)\n    setSearch('')\n  }\n"""
new_go = """  const go = (target) => {\n    setPage(target)\n    writePortalUrl(target)\n    setSidebarOpen(false)\n    setSearch('')\n  }\n"""
s = replace_once(s, old_go, new_go, 'go routing')
# member dashboard props and poll section
s = s.replace("<MemberDashboard user={user} profile={profile} canBoard={canBoard} canCms={canCms} />", "<MemberDashboard project={project} user={user} profile={profile} mutate={mutate} setToast={setToast} canBoard={canBoard} canCms={canCms} />", 1)
old_member = """function MemberDashboard({ user, profile, canBoard, canCms }) {\n  const blocks = profile?.memberBlocks || DEFAULT_MEMBER_BLOCKS\n  return <div className=\"page\"><PageHeader eyebrow=\"MEIN WEKIB\" title={`Willkommen, ${firstName(profile?.displayName || user.name || user.email)}`} description=\"Dein registrierter Lesebereich. Zusätzliche Arbeitsbereiche erscheinen nur nach Freigabe.\" />\n    <PortalBlocks blocks={blocks} mode=\"member\" />\n  </div>\n}\n"""
new_member = """function MemberDashboard({ project, user, profile, mutate, setToast, canBoard, canCms }) {\n  const blocks = project.settings?.memberBlocks?.length ? project.settings.memberBlocks : (profile?.memberBlocks || DEFAULT_MEMBER_BLOCKS)\n  return <div className=\"page member-dashboard\"><PageHeader eyebrow=\"MEIN WEKIB\" title={`Willkommen, ${firstName(profile?.displayName || user.name || user.email)}`} description=\"Dein erweiterter Lesebereich mit Neuigkeiten und Abstimmungen. Interne Arbeitsbereiche erscheinen ausschließlich nach Freigabe.\" />\n    <PortalBlocks blocks={blocks} mode=\"member\" />\n    <section className=\"member-polls-section\"><PollsWithImages project={project} user={user} mutate={mutate} setToast={setToast} canCreate={false} scope=\"member\" embedded heading=\"Mitglieder-Umfragen\" intro=\"Stimme zu aktuellen Themen ab. Pro registriertem Konto ist je Umfrage genau eine Stimme möglich.\" /></section>\n  </div>\n}\n"""
s = replace_once(s, old_member, new_member, 'member dashboard')
# activity views
s = s.replace("<Timeline items={project.activities.slice(0, 5)} />", "<Timeline items={importantActivities(project.activities).slice(0, 5)} />", 1)
s = s.replace("function ActivityPage({ project }) { return <div className=\"page narrow\"><PageHeader eyebrow=\"TRANSPARENZ\" title=\"Aktivitätsverlauf\" description=\"Wer hat wann etwas im gemeinsamen Projekt verändert?\" /><section className=\"card\"><Timeline items={project.activities} /></section></div> }", "function ActivityPage({ project }) { const items = importantActivities(project.activities); return <div className=\"page narrow\"><PageHeader eyebrow=\"TRANSPARENZ\" title=\"Wichtige Änderungen\" description=\"Nur relevante Projektänderungen – keine Autosaves, Klicks oder wiederholten CMS-Zwischenstände.\" /><section className=\"card\"><Timeline items={items} /></section></div> }", 1)
# member onboarding copy
s = s.replace("['Willkommen bei WeKiB', 'Du wurdest für die Mitarbeit an der Gründung eingeladen.'],\n    ['Dein Arbeitsbereich', 'Du siehst gemeinsame Informationen und kannst eigene Dokumente verwalten.'],\n    ['Gemeinsam transparent', 'Kommentare, Umfragen und Termine halten alle auf demselben Stand.'],", "['Willkommen bei WeKiB', 'Dein Konto öffnet den erweiterten registrierten Bereich.'],\n    ['Mein WeKiB', 'Hier liest du aktuelle Informationen und kannst an freigegebenen Mitglieder-Umfragen teilnehmen.'],\n    ['Weitere Bereiche', 'Gründung, Vorstand, CMS oder Administration werden nur nach ausdrücklicher Freigabe sichtbar.'],", 1)
# internal fallback login fields password manager semantics
s = s.replace("<form onSubmit={onSubmit} className=\"login-form\">", "<form onSubmit={onSubmit} className=\"login-form\" method=\"post\" action=\"?auth=login\" autoComplete=\"on\">", 1)
s = s.replace("<label>E-Mail-Adresse<input type=\"email\" autoComplete=\"username\" required value={email}", "<label htmlFor=\"wekib-internal-email\">E-Mail-Adresse<input id=\"wekib-internal-email\" name=\"username\" type=\"email\" inputMode=\"email\" autoComplete=\"username\" required value={email}", 1)
s = s.replace("<label>Passwort<input type=\"password\" autoComplete=\"current-password\" required value={password}", "<label htmlFor=\"wekib-internal-password\">Passwort<input id=\"wekib-internal-password\" name=\"password\" type=\"password\" autoComplete=\"current-password\" required value={password}", 1)
p.write_text(s)

# --- Styling for embedded member/CMS polls ---
p = Path('src/polls.css')
s = p.read_text()
if '.polls-embedded' not in s:
    s += """\n.polls-embedded{margin-top:22px}.polls-embedded>.page-header{margin-bottom:16px}.polls-embedded>.page-header h1{font-size:clamp(1.35rem,2vw,1.8rem)}.member-polls-section{margin-top:26px}.cms-member-polls{margin-top:28px;padding-top:24px;border-top:1px solid var(--border,#e6e3ea)}\n"""
p.write_text(s)

print('Member portal UX migration prepared')
