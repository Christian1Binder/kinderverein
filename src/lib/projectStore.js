import { createClient } from '@supabase/supabase-js'
import { seedState } from '../data/seed.js'

const STORAGE_KEY = 'kinderverein-project-state-v1'
const PROJECT_ID = 'kinderverein-main'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY
export const cloudEnabled = Boolean(supabaseUrl && supabaseKey)
export const supabase = cloudEnabled ? createClient(supabaseUrl, supabaseKey) : null

const clone = (value) => JSON.parse(JSON.stringify(value))

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

export async function getSession() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session
}

export function onAuthChange(callback) {
  if (!supabase) return () => {}
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session))
  return () => data.subscription.unsubscribe()
}

export async function signInWithEmail(email) {
  if (!supabase) throw new Error('Cloud-Modus ist nicht konfiguriert.')
  const redirectTo = window.location.origin + window.location.pathname
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: {
      emailRedirectTo: redirectTo,
      // Produktivbetrieb: Nur bereits angelegte/eingeladene Teamkonten duerfen sich anmelden.
      shouldCreateUser: false,
    },
  })
  if (error) throw error
}

export async function signOut() {
  if (!supabase) return
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function loadCloudState() {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('project_state')
    .select('data, updated_at')
    .eq('id', PROJECT_ID)
    .maybeSingle()

  if (error) throw error
  if (!data) {
    const initial = clone(seedState)
    const created = await saveCloudState(initial)
    return created
  }
  return data.data
}

export async function saveCloudState(state) {
  if (!supabase) return state
  const payload = {
    id: PROJECT_ID,
    data: state,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('project_state')
    .upsert(payload, { onConflict: 'id' })
    .select('data')
    .single()
  if (error) throw error
  return data.data
}

export function subscribeCloudState(callback) {
  if (!supabase) return () => {}
  const channel = supabase
    .channel('kinderverein-project-state')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'project_state', filter: `id=eq.${PROJECT_ID}` },
      (payload) => {
        const next = payload.new?.data
        if (next) callback(next)
      },
    )
    .subscribe()
  return () => supabase.removeChannel(channel)
}
