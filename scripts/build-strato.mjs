import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'

const root = new URL('..', import.meta.url)
const appPath = new URL('../src/App.jsx', import.meta.url)
const indexPath = new URL('../index.html', import.meta.url)
const indexSourcePath = new URL('../index.source.html', import.meta.url)

const originalApp = await readFile(appPath, 'utf8')
const originalIndex = await readFile(indexPath, 'utf8')
const sourceIndex = await readFile(indexSourcePath, 'utf8')
let source = originalApp

function replaceRequired(from, to, label) {
  if (!source.includes(from)) {
    throw new Error(`STRATO-Transformation fehlgeschlagen: ${label}`)
  }
  source = source.replace(from, to)
}

replaceRequired(
  "  const [authEmail, setAuthEmail] = useState('')\n  const [authMessage, setAuthMessage] = useState('')",
  "  const [authEmail, setAuthEmail] = useState('')\n  const [authPassword, setAuthPassword] = useState('')\n  const [authMessage, setAuthMessage] = useState('')",
  'Passwort-State',
)

replaceRequired(
  "      await signInWithEmail(authEmail)\n      setAuthMessage('Anmeldelink wurde versendet. Bitte E-Mail-Postfach prüfen.')",
  "      await signInWithEmail(authEmail, authPassword)",
  'Login-Aufruf',
)

replaceRequired(
  "  if (cloudEnabled && !session && !localPreview) {\n    return <AuthScreen email={authEmail} setEmail={setAuthEmail} message={authMessage} onSubmit={sendMagicLink} onLocal={() => { setLocalPreview(true); setSyncState('local') }} />\n  }",
  "  if (cloudEnabled && !session) {\n    return <AuthScreen email={authEmail} setEmail={setAuthEmail} password={authPassword} setPassword={setAuthPassword} message={authMessage} onSubmit={sendMagicLink} />\n  }",
  'Login-Screen',
)

replaceRequired(
  'function AuthScreen({ email, setEmail, message, onSubmit, onLocal }) {',
  'function AuthScreen({ email, setEmail, password, setPassword, message, onSubmit }) {',
  'Login-Parameter',
)

replaceRequired(
  '<p>Du erhältst einen sicheren Anmeldelink per E-Mail. Kein Passwort nötig.</p>',
  '<p>Melde dich mit deinem persönlichen Team-Zugang an.</p>',
  'Login-Hinweis',
)

replaceRequired(
  '<label>E-Mail-Adresse<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@beispiel.de" /></label>\n            <button className="btn btn--primary btn--full" type="submit">Anmeldelink senden <ArrowRight size={17} /></button>',
  '<label>E-Mail-Adresse<input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@beispiel.de" /></label>\n            <label>Passwort<input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Passwort" /></label>\n            <button className="btn btn--primary btn--full" type="submit">Anmelden <ArrowRight size={17} /></button>',
  'Passwort-Feld',
)

replaceRequired(
  '<p className="auth-hint">Zugänge werden über das verbundene Supabase-Projekt verwaltet.</p>\n          {onLocal && <button className="btn btn--ghost btn--full" onClick={onLocal} type="button">Lokale Vorschau öffnen</button>}',
  '<p className="auth-hint">Zugänge werden vom Projekt-Administrator verwaltet. Projektdaten liegen zentral in der STRATO-Datenbank.</p>',
  'Backend-Hinweis',
)

try {
  await writeFile(indexPath, sourceIndex)
  await writeFile(appPath, source)
  await rm(new URL('../dist-strato/', import.meta.url), { recursive: true, force: true })

  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  const build = spawnSync(command, ['vite', 'build', '--mode', 'strato', '--base=./', '--outDir', 'dist-strato'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, VITE_BACKEND_MODE: 'php', VITE_API_URL: './api/index.php' },
  })

  if (build.status !== 0) {
    process.exitCode = build.status || 1
  } else {
    await mkdir(new URL('../dist-strato/api/', import.meta.url), { recursive: true })
    await cp(new URL('../api/', import.meta.url), new URL('../dist-strato/api/', import.meta.url), { recursive: true })
  }
} finally {
  await writeFile(appPath, originalApp)
  await writeFile(indexPath, originalIndex)
}
