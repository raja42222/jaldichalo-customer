import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL      || 'https://zjozftsvrvwzewxwonaj.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_o6_pVp2xLoDNrGsUBoeRjw_Gb8yuAAL'

/* ================================================================
   CUSTOM STORAGE — localStorage + cookie dual write
   
   Problem: PWA apps sometimes lose localStorage on tab/app close.
   Solution: Write session to BOTH localStorage AND cookie.
   On read: try localStorage first, fall back to cookie.
   This makes session survive:
   - Tab close and reopen
   - App minimize and restore  
   - Background kill on Android
   - iOS Safari PWA "Add to Home Screen"
================================================================ */
const COOKIE_NAME = 'jc_sb_session'
const COOKIE_DAYS = 7

function setCookie(value) {
  try {
    const expires = new Date(Date.now() + COOKIE_DAYS * 864e5).toUTCString()
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(value)};expires=${expires};path=/;SameSite=Strict`
  } catch {}
}

function getCookie() {
  try {
    const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`))
    return match ? decodeURIComponent(match[1]) : null
  } catch { return null }
}

function delCookie() {
  try {
    document.cookie = `${COOKIE_NAME}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`
  } catch {}
}

// Custom storage adapter — dual write to localStorage + cookie
const dualStorage = {
  getItem(key) {
    // Try localStorage first
    try {
      const v = localStorage.getItem(key)
      if (v) return v
    } catch {}
    // Fallback: cookie
    try {
      const c = getCookie()
      if (c) {
        const obj = JSON.parse(c)
        if (obj?.key === key) return obj.value
      }
    } catch {}
    return null
  },
  setItem(key, value) {
    // Write to localStorage
    try { localStorage.setItem(key, value) } catch {}
    // Also write to cookie as backup
    try { setCookie(JSON.stringify({ key, value })) } catch {}
  },
  removeItem(key) {
    try { localStorage.removeItem(key) } catch {}
    delCookie()
  }
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken:   true,   // Auto-renew JWT before expiry (every ~50 min)
    persistSession:     true,   // Never lose session on app close
    detectSessionInUrl: true,   // Handle Google OAuth redirect
    storage:            dualStorage,  // Dual localStorage + cookie
    storageKey:         'jc_session',
    flowType:           'implicit',
    debug:              false,
  },
  realtime: {
    params: { eventsPerSecond: 10 },
    reconnectDelay: 2000,
  },
  global: {
    fetch: (url, options) => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 20000)
      return fetch(url, { ...options, signal: controller.signal })
        .finally(() => clearTimeout(timer))
    }
  }
})

export async function doSignOut() {
  try { await supabase.auth.signOut() } catch {}
  // Clear all app keys
  const keys = ['jc_session', 'jc_profile_v4', 'jc_recent_v4', 'jc_last_pos', 'jc_device_id']
  keys.forEach(k => { try { localStorage.removeItem(k) } catch {} })
  delCookie()
}
