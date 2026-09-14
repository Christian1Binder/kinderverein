import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'

const root = new URL('..', import.meta.url)
const indexPath = new URL('../index.html', import.meta.url)
const sourceIndexPath = new URL('../index.source.html', import.meta.url)
const originalIndex = await readFile(indexPath, 'utf8')
const sourceIndex = await readFile(sourceIndexPath, 'utf8')

try {
  await writeFile(indexPath, sourceIndex)
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

  if (build.status !== 0) {
    process.exitCode = build.status || 1
  } else {
    await mkdir(new URL('../dist-strato/api/', import.meta.url), { recursive: true })
    await cp(new URL('../api/', import.meta.url), new URL('../dist-strato/api/', import.meta.url), { recursive: true })
  }
} finally {
  await writeFile(indexPath, originalIndex)
}
