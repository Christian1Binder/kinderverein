import { copyFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const source = resolve('index.source.html')
const target = resolve('index.html')

if (!existsSync(source)) {
  throw new Error('index.source.html fehlt. Der Vite-Quell-Einstieg kann nicht wiederhergestellt werden.')
}

copyFileSync(source, target)
console.log('index.html aus index.source.html wiederhergestellt.')
