import { cp, mkdir, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'

const root = new URL('..', import.meta.url)
await rm(new URL('../dist-strato/', import.meta.url), { recursive: true, force: true })

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const build = spawnSync(command, ['vite', 'build', '--mode', 'strato', '--base=./', '--outDir', 'dist-strato'], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_BACKEND_MODE: 'php',
    VITE_API_URL: './api/index.php',
  },
})

if (build.status !== 0) process.exit(build.status || 1)
await mkdir(new URL('../dist-strato/api/', import.meta.url), { recursive: true })
await cp(new URL('../api/', import.meta.url), new URL('../dist-strato/api/', import.meta.url), { recursive: true })
