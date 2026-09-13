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

const replacements = [
  [
    "  const [authEmail, setAuthEmail] = useState('')\n  const [authMessage, setAuthMessage] = useState('')",
    "  const [authEmail, setAuthEmail] = useState('')\n  const [authPassword, setAuthPassword] = useState('')\n  const [authMessage, setAuthMessage] = useState('')",
  ],
  [
    "  const sendMagicLink = async (event) => {\n    event.preventDefault()\n    try {\n      await signInWithEmail(authEmail)\n      setAuthMessage('Anmeldelink wurde versendet. Bitte E-Mail-Postfach prüfen.')\n    } catch (error) {\n      setAuthMessage(error.message)\n    }\n  }",
    "  const sendMagicLink = async (event) => {\n    event.preventDefault()\n    setAuthMessage('')\n    try {\n      await signInWithEmail(authEmail, authPassword)\n    } catch (error) {\n      setAuthMessage(error.message)\n    }\n  }",
  ],
  [
    "  if (cloudEnabled && !session && !localPreview) {\n    return <AuthScreen email={authEmail} setEmail={setAuthEmail} message={authMessage} onSubmit={sendMagicLink} onLocal={() => { setLocalPreview(true); setSyncState('local') }} />\n  }",
    "  if (cloudEnabled && !session) {\n    return <AuthScreen email={authEmail} setEmail={setAuthEmail} password={authPassword} setPassword={setAuthPassword} message={authMessage} onSubmit={sendMagicLink} />\n  }",
  [
    "function AuthScreen({ email, setEmail, message, onSubmit, onLocal }) {",
    "function AuthScreen({ email, setEmail, password, setPassword, message, onSubmit }) {",
  ],
  [
    "          <p>Du erhältst einen sicheren Anmeldelink per E-Mail. Kein Passwort nötig.</p>",
    "          <p>Melde dich mit deinem persönlichen Team-Zugang an.</p>",
  ],
  [
    "            <label>E-Mail-Adresse<input type=\"email\" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder=\"name@beispiel.de\" /></label>\n            <button className=\"btn btn--primary btn--full\" type=\"submit\">Anmeldelink senden <ArrowRight size={17} /></button>",
    "            <label>E-Mail-Adresse<input type=\"email\" autoComplete=\"username\" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder=\"name@beispiel.de\" /></label>\n            <label>Passwort<input type=\"password\" autoComplete=\"current-password\" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder=\"••••••••\" /></label>\n            <button className=\"btn btn--primary btn--full\" type=\"submit\">Anmelden <ArrowRight size={17} /></button>",
  ],
  [
    "          <p className=\"auth-hint\">Zugänge werden über das verbundene Supabase-Projekt verwaltet.</p>\n          {onLocal && <button className=\"btn btn--ghost btn--full\" onClick={onLocal} type=\"button\">Lokale Vorschau öffnen</button>}",
    "          <p className=\"auth-hint\">Zugänge werden vom Projekt-Administrator verwaltet. Projektdaten liegen zentral in der STRATO-Datenbank.</p>",
  ],
]

for (const [from, to] of replacements) {
  if (!source.includes(from)) throw new Error('STRATO-Transformation konnte eine erwartete Stelle in App.jsx nicht finden.')
  source = source.replace(from, to)
}

try {
  // GitHub Pages schreibt eine bereits kompilierte index.html in den Branch-Root.
  // Vite braucht für einen neuen Build jedoch immer den Quell-Einstieg mit /src/main.jsx.
  await writeFile(indexPath, sourceIndex)
  await writeFile(appPath, source)
  await rm(new URL('../dist-strato/', import.meta.url), { recursive: true, force: true })

  const build = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'build', '--mode', 'strato', '--base=./', '--outDir', 'dist-strato'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, VITE_BACKEND_MODE: 'php', VITE_API_URL: './api/index.php' },
  })

  if (build.status !== 0) process.exitCode = build.status || 1
  if (build.status === 0) {
    await mkdir(new URL('../dist-strato/api/', import.meta.url), { recursive: true })
    await cp(new URL('../api/', import.meta.url), new URL('../dist-strato/api/', import.meta.url), { recursive: true })
  }
} finally {
  // Repository-Zustand wiederherstellen: Pages-index.html und unveränderte App.jsx.
  await writeFile(appPath, originalApp)
  await writeFile(indexPath, originalIndex)
}
