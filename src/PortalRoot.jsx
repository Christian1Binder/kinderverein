import { useEffect, useState } from 'react'
import {
  ArrowRight, BookOpen, Building2, CheckCircle2, ChevronRight, GraduationCap,
  LockKeyhole, Menu, Moon, ShieldCheck, Sparkles, Sun, UserPlus, Users, X,
} from 'lucide-react'
import AppV2 from './AppV2.jsx'
import { accountUrl, cloudEnabled, getSession, onAuthChange, registerSelf, signInWithEmail } from './lib/projectStore.js'
import './portal.css'

export default function PortalRoot() {
  const [session, setSession] = useState(null)
  const [ready, setReady] = useState(!cloudEnabled)

  useEffect(() => {
    if (!cloudEnabled) return undefined
    let active = true
    getSession().then((next) => {
      if (!active) return
      setSession(next)
      setReady(true)
    }).catch(() => {
      if (!active) return
      setReady(true)
    })
    const unsubscribe = onAuthChange((next) => setSession(next))
    return () => { active = false; unsubscribe() }
  }, [])

  if (!cloudEnabled) return <AppV2 />
  if (!ready) return <div className="portal-loading"><div className="portal-logo">W</div><span>WeKiB wird geladen …</span></div>
  if (session) return <AppV2 />
  return <PublicPortal onAuthenticated={setSession} />
}

function PublicPortal({ onAuthenticated }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('wekib-theme') || 'light')
  const [menu, setMenu] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [mode, setMode] = useState('login')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [login, setLogin] = useState({ email: '', password: '' })
  const [register, setRegister] = useState({ name: '', email: '', password: '', password2: '', privacyAccepted: false })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('wekib-theme', theme)
  }, [theme])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const verification = params.get('verification')
    if (!verification) return
    setAuthOpen(true)
    setMode('login')
    setMessage(verification === 'success'
      ? 'E-Mail-Adresse bestätigt. Du kannst dich jetzt anmelden.'
      : verification === 'invalid'
        ? 'Der Bestätigungslink ist ungültig oder abgelaufen. Bitte fordere einen neuen an.'
        : 'Die E-Mail-Bestätigung konnte nicht abgeschlossen werden.')
    window.history.replaceState({}, '', window.location.pathname + window.location.hash)
  }, [])

  const openAuth = (nextMode) => {
    setMode(nextMode)
    setMessage('')
    setAuthOpen(true)
    setMenu(false)
  }

  const submitLogin = async (event) => {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    try {
      const session = await signInWithEmail(login.email, login.password)
      onAuthenticated(session)
    } catch (error) {
      setMessage(error.message)
    } finally { setBusy(false) }
  }

  const submitRegister = async (event) => {
    event.preventDefault()
    setMessage('')
    if (register.password !== register.password2) return setMessage('Die beiden Passwörter stimmen nicht überein.')
    setBusy(true)
    try {
      const result = await registerSelf(register)
      setMode('login')
      setLogin({ email: register.email, password: '' })
      setRegister({ name: '', email: '', password: '', password2: '', privacyAccepted: false })
      setMessage(result.message || 'Konto angelegt. Bitte bestätige deine E-Mail-Adresse über den Link in deinem Postfach.')
    } catch (error) {
      setMessage(error.message)
    } finally { setBusy(false) }
  }

  return <div className="public-site">
    <header className="public-header">
      <a className="public-brand" href="#start"><span>W</span><div><strong>WeKiB</strong><small>Bildung · Betreuung · Gemeinschaft</small></div></a>
      <nav className={menu ? 'public-nav open' : 'public-nav'}>
        <a href="#ueber-uns" onClick={() => setMenu(false)}>Über uns</a>
        <a href="#angebote" onClick={() => setMenu(false)}>Angebote</a>
        <a href="#gruendung" onClick={() => setMenu(false)}>Gründung</a>
        <a href="#kontakt" onClick={() => setMenu(false)}>Kontakt</a>
      </nav>
      <div className="public-actions">
        <button className="icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title="Darstellung wechseln">{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
        <button className="portal-login-link" onClick={() => openAuth('login')}>Anmelden</button>
        <button className="portal-primary" onClick={() => openAuth('register')}>Konto erstellen <ArrowRight size={16} /></button>
        <button className="icon-btn public-menu-btn" onClick={() => setMenu(!menu)}>{menu ? <X size={20} /> : <Menu size={20} />}</button>
      </div>
    </header>

    <main>
      <section className="public-hero" id="start">
        <div className="hero-noise" />
        <div className="public-hero-copy">
          <span className="public-kicker"><Sparkles size={15} /> WEKIB · IN GRÜNDUNG</span>
          <h1>Gute Betreuung<br />schafft <em>Freiraum.</em></h1>
          <p>Wir bauen einen gemeinnützigen Bildungsträger auf, der Kinder und Jugendliche verlässlich begleitet, Entwicklung ermöglicht und Schule mit starken Betreuungsangeboten ergänzt.</p>
          <div className="public-hero-actions"><a className="portal-primary big" href="#ueber-uns">WeKiB kennenlernen <ChevronRight size={18} /></a><button className="portal-secondary big" onClick={() => openAuth('login')}>Zum Portal</button></div>
          <div className="public-trust"><span><CheckCircle2 size={15} /> gemeinnützig ausgerichtet</span><span><CheckCircle2 size={15} /> pädagogisch professionell</span><span><CheckCircle2 size={15} /> offen für mehrere Standorte</span></div>
        </div>
        <div className="public-hero-visual">
          <div className="hero-card hero-card-main"><span>UNSER ANSPRUCH</span><strong>Betreuung, die Kinder stärkt.</strong><p>Verlässlich im Alltag. Offen für Entwicklung. Professionell organisiert.</p></div>
          <div className="hero-card hero-card-small one"><GraduationCap size={21} /><span>Bildung</span></div>
          <div className="hero-card hero-card-small two"><Users size={21} /><span>Gemeinschaft</span></div>
          <div className="hero-orbit" />
        </div>
      </section>

      <section className="public-section public-intro" id="ueber-uns">
        <div className="section-label">01 · ÜBER UNS</div>
        <div className="section-copy"><h2>Ein Träger, der Betreuung<br />als Bildungsraum versteht.</h2><p>WeKiB entsteht aus der Praxis heraus. Unser Ziel ist ein professioneller, verlässlicher und moderner Träger für schulische Betreuung, Ganztagsangebote, Ferienangebote und weitere Bildungs- und Jugendhilfeformate.</p></div>
      </section>

      <section className="public-section" id="angebote">
        <div className="section-label">02 · WAS WIR AUFBAUEN</div>
        <div className="public-offer-grid">
          <Offer icon={Building2} number="01" title="Ganztag & Betreuung" text="Offene Ganztagsangebote, Mittags- und Nachmittagsbetreuung mit klaren pädagogischen Strukturen." />
          <Offer icon={BookOpen} number="02" title="Bildung & Entwicklung" text="Angebote, die Selbstständigkeit, Gemeinschaft, Beteiligung und individuelle Entwicklung fördern." />
          <Offer icon={Sparkles} number="03" title="Ferien & Projekte" text="Ferienbetreuung, Workshops und ergänzende Bildungsangebote für Kinder und Jugendliche." />
        </div>
      </section>

      <section className="public-section public-foundation" id="gruendung">
        <div className="foundation-copy"><span className="public-kicker">TRANSPARENT AUFGEBAUT</span><h2>Von der Gründung<br />zum professionellen Träger.</h2><p>Die rechtliche und organisatorische Gründung von WeKiB wird strukturiert vorbereitet. Gründungsmitglieder arbeiten im geschützten Portal gemeinsam an Satzung, Aufgaben, Dokumenten, Abstimmungen und Terminen.</p><button className="portal-secondary light" onClick={() => openAuth('login')}><LockKeyhole size={16} /> Geschützten Bereich öffnen</button></div>
        <div className="portal-levels">
          <Level depth="01" title="Öffentlich" text="Informationen für alle Besucher" active />
          <Level depth="02" title="Mein WeKiB" text="Persönliches Konto & Profil" />
          <Level depth="03" title="Gründung" text="Arbeitsraum für Gründungsmitglieder" />
          <Level depth="04" title="Vorstand" text="Vertrauliche Vorstandsbereiche" />
          <Level depth="05" title="CMS & Admin" text="Inhalte, Benutzer und Berechtigungen" />
        </div>
      </section>

      <section className="public-section public-cta" id="kontakt"><div><span className="public-kicker">MITGESTALTEN</span><h2>Ein Konto ist der Einstieg ins WeKiB-Portal.</h2><p>Registrierte Nutzer starten mit einem persönlichen Basiszugang. Weitere Bereiche werden gezielt durch Administratoren freigeschaltet.</p></div><button className="portal-primary big" onClick={() => openAuth('register')}><UserPlus size={18} /> Kostenlos registrieren</button></section>
    </main>

    <footer className="public-footer"><div className="public-brand"><span>W</span><div><strong>WeKiB</strong><small>Verein in Gründung</small></div></div><p>Bildung · Betreuung · Gemeinschaft</p><button onClick={() => openAuth('login')}>Portal</button></footer>

    {authOpen && <div className="portal-modal-backdrop" onMouseDown={() => setAuthOpen(false)}><div className="portal-auth-card" onMouseDown={(e) => e.stopPropagation()}>
      <button className="portal-modal-close" onClick={() => setAuthOpen(false)}><X size={19} /></button>
      <div className="portal-auth-brand"><span>W</span><div><strong>WeKiB Portal</strong><small>{mode === 'login' ? 'Willkommen zurück' : 'Dein persönlicher Zugang'}</small></div></div>
      <div className="portal-auth-tabs"><button className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setMessage('') }}>Anmelden</button><button className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setMessage('') }}>Registrieren</button></div>
      {mode === 'login' ? <form className="portal-auth-form" onSubmit={submitLogin}>
        <label>E-Mail-Adresse<input type="email" required autoComplete="username" value={login.email} onChange={(e) => setLogin({ ...login, email: e.target.value })} /></label>
        <label>Passwort<input type="password" required autoComplete="current-password" value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} /></label>
        <div className="portal-account-links"><a href={accountUrl('reset.php')}>Passwort vergessen?</a><a href={accountUrl('resend.php')}>Bestätigungs-Mail erneut senden</a></div>
        <button className="portal-primary full" disabled={busy}>{busy ? 'Anmeldung läuft …' : 'Anmelden'} <ArrowRight size={16} /></button>
      </form> : <form className="portal-auth-form" onSubmit={submitRegister}>
        <label>Name<input required minLength="2" value={register.name} onChange={(e) => setRegister({ ...register, name: e.target.value })} /></label>
        <label>E-Mail-Adresse<input type="email" required autoComplete="email" value={register.email} onChange={(e) => setRegister({ ...register, email: e.target.value })} /></label>
        <label>Passwort <small>mindestens 12 Zeichen</small><input type="password" required minLength="12" autoComplete="new-password" value={register.password} onChange={(e) => setRegister({ ...register, password: e.target.value })} /></label>
        <label>Passwort wiederholen<input type="password" required minLength="12" autoComplete="new-password" value={register.password2} onChange={(e) => setRegister({ ...register, password2: e.target.value })} /></label>
        <label className="portal-check"><input type="checkbox" required checked={register.privacyAccepted} onChange={(e) => setRegister({ ...register, privacyAccepted: e.target.checked })} /><span>Ich möchte ein WeKiB-Portal-Konto anlegen. Interne Bereiche werden erst nach Freigabe durch einen Administrator sichtbar.</span></label>
        <button className="portal-primary full" disabled={busy}>{busy ? 'Konto wird erstellt …' : 'Konto erstellen'} <ArrowRight size={16} /></button>
      </form>}
      {message && <div className="portal-auth-message">{message}</div>}
      <div className="portal-security"><ShieldCheck size={15} /><span>Neue Konten erhalten zunächst nur den Basiszugang. Sonderrechte vergibt ausschließlich die Administration.</span></div>
    </div></div>}
  </div>
}

function Offer({ icon: Icon, number, title, text }) {
  return <article className="public-offer"><span>{number}</span><Icon size={24} /><h3>{title}</h3><p>{text}</p><i /></article>
}

function Level({ depth, title, text, active = false }) {
  return <div className={active ? 'portal-level active' : 'portal-level'}><span>{depth}</span><div><strong>{title}</strong><small>{text}</small></div><ChevronRight size={17} /></div>
}
