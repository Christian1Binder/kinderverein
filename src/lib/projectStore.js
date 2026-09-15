import { seedState } from '../data/seed.js'

const STORAGE_KEY = 'kinderverein-project-state-v1'
const backendMode = import.meta.env.VITE_BACKEND_MODE || 'local'
const apiUrl = import.meta.env.VITE_API_URL || './api/index.php'

export const cloudEnabled = backendMode === 'php'

const clone = (value) => JSON.parse(JSON.stringify(value))
const authListeners = new Set()
let lastRemoteStamp = null

function emitAuth(session) {
  authListeners.forEach((listener) => {
    try { listener(session) } catch (error) { console.error(error) }
  })
}

function apiBase() {
  return apiUrl.replace(/index\.php(?:\?.*)?$/, '')
}

export function accountUrl(page) {
  return `${apiBase()}${page}`
}

export function loadLocalState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return clone(seedState)
    return { ...clone(seedState), ...JSON.parse(raw) }
  } catch {
    return clone(seedState)
  }
}

export function saveLocalState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function resetLocalState() {
  localStorage.removeItem(STORAGE_KEY)
  return clone(seedState)
}

async function request(action, options = {}) {
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData
  const response = await fetch(`${apiUrl}?action=${encodeURIComponent(action)}`, {
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(!isForm && options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    cache: 'no-store',
    ...options,
  })

  let payload = null
  try {
    payload = await response.json()
  } catch {
    throw new Error('Das STRATO-Backend antwortet nicht korrekt.')
  }

  if (!response.ok || payload?.ok === false) {
    const error = new Error(payload?.message || `Serverfehler (${response.status})`)
    error.status = response.status
    error.code = payload?.code
    throw error
  }
  return payload
}

export async function getSession() {
  if (!cloudEnabled) return null
  try {
    const payload = await request('session')
    return payload.session || null
  } catch (error) {
    if (error.status === 503) return null
    throw error
  }
}

export function onAuthChange(callback) {
  authListeners.add(callback)
  return () => authListeners.delete(callback)
}

export async function signInWithEmail(email, password = '') {
  if (!cloudEnabled) throw new Error('Das gemeinsame STRATO-Backend ist nicht aktiv.')
  if (!password) throw new Error('Bitte Passwort eingeben.')
  const payload = await request('login', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
  })
  const session = payload.session || null
  emitAuth(session)
  return session
}

export async function registerSelf({ name, email, password, privacyAccepted }) {
  if (!cloudEnabled) throw new Error('Die Registrierung ist nur im STRATO-LAB verfügbar.')
  const response = await fetch(`${apiBase()}register.php`, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase(), password, privacyAccepted }),
  })
  let payload = null
  try { payload = await response.json() } catch { throw new Error('Die Registrierung konnte nicht verarbeitet werden.') }
  if (!response.ok || payload?.ok === false) {
    const error = new Error(payload?.message || `Registrierung fehlgeschlagen (${response.status})`)
    error.status = response.status
    throw error
  }
  return payload
}

export async function signOut() {
  if (!cloudEnabled) return
  await request('logout', { method: 'POST', body: JSON.stringify({}) })
  emitAuth(null)
}

export async function loadCloudState() {
  if (!cloudEnabled) return null
  const payload = await request('state')
  lastRemoteStamp = payload.updatedAt || null
  if (!payload.data) {
    const created = await saveCloudState(clone(seedState))
    return created
  }
  return payload.data
}

export async function saveCloudState(state) {
  if (!cloudEnabled) return state
  const payload = await request('state', {
    method: 'PUT',
    body: JSON.stringify({ data: state }),
  })
  lastRemoteStamp = payload.updatedAt || lastRemoteStamp
  return payload.data || state
}

export function subscribeCloudState(callback) {
  if (!cloudEnabled) return () => {}
  let stopped = false
  let busy = false
  const poll = async () => {
    if (stopped || busy) return
    busy = true
    try {
      const payload = await request('state')
      if (payload.updatedAt && payload.updatedAt !== lastRemoteStamp) {
        lastRemoteStamp = payload.updatedAt
        if (payload.data) callback(payload.data)
      }
    } catch (error) {
      if (error.status === 401) emitAuth(null)
      else console.error('Synchronisierung fehlgeschlagen', error)
    } finally {
      busy = false
    }
  }
  const timer = window.setInterval(poll, 4000)
  return () => {
    stopped = true
    window.clearInterval(timer)
  }
}

export async function listUserAccounts() {
  if (!cloudEnabled) return []
  const payload = await request('users')
  return payload.users || []
}

export async function createUserAccount(input) {
  if (!cloudEnabled) throw new Error('Benutzerkonten können nur im STRATO-LAB verwaltet werden.')
  const payload = await request('users', { method: 'POST', body: JSON.stringify(input) })
  return payload.user
}

export async function updateUserAccount(id, changes) {
  if (!cloudEnabled) throw new Error('Benutzerkonten können nur im STRATO-LAB verwaltet werden.')
  const payload = await request('users', { method: 'PATCH', body: JSON.stringify({ id, ...changes }) })
  return payload.user
}

export async function uploadProjectFile(file, scope = 'foundation') {
  if (!cloudEnabled) {
    return { id: `local-${Date.now()}`, name: file.name, size: file.size, mime: file.type || 'application/octet-stream', uploadedAt: new Date().toISOString(), uploadedBy: 'Demo' }
  }
  const form = new FormData()
  form.append('file', file)
  form.append('scope', scope)
  const payload = await request('file-upload', { method: 'POST', body: form })
  return payload.file
}

export function fileDownloadUrl(id) {
  if (!cloudEnabled) return '#'
  return `${apiUrl}?action=file-download&id=${encodeURIComponent(id)}`
}

export async function loadPublicContent() {
  if (!cloudEnabled) return null
  const payload = await request('public-content')
  return payload.blocks || null
}

export function publicImageUrl(id) {
  if (!cloudEnabled || !id) return '#'
  return `${apiBase()}public-image.php?id=${encodeURIComponent(id)}`
}

export function projectImageUrl(id) {
  if (!cloudEnabled || !id) return '#'
  return `${apiBase()}image.php?id=${encodeURIComponent(id)}`
}

export async function deleteProjectFile(id) {
  if (!cloudEnabled) return true
  await request('file-delete', { method: 'POST', body: JSON.stringify({ id }) })
  return true
}
