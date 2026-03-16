import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL      || 'https://lozejdisdkrqdfkmpifa.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_z_l8vKeB_qFV2Rz21dY7bg_0x27puzF'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken:   true,   // Auto-refresh before expiry
    persistSession:     true,   // Store session in localStorage
    detectSessionInUrl: true,   // Handle OAuth redirects
    storage:            localStorage,
    storageKey:         'jc_session',
    flowType:           'implicit',
    debug:              false,
  },
  realtime: {
    params: { eventsPerSecond: 10 },
    reconnectDelay:   2000,     // Reconnect after 2s if realtime drops
  },
  global: {
    fetch: (url, options) => {
      // Add timeout to all Supabase HTTP calls (prevents hanging on slow networks)
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 15000)  // 15s timeout
      return fetch(url, { ...options, signal: controller.signal })
        .finally(() => clearTimeout(timer))
    }
  }
})

export async function doSignOut() {
  try { await supabase.auth.signOut() } catch {}
  const keys = ['jc_profile_v4', 'jc_recent_v4', 'jc_last_pos', 'jc_device_id']
  keys.forEach(k => { try { localStorage.removeItem(k) } catch {} })
}
