import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { supabase, doSignOut } from '../lib/supabase'

/* ================================================================
   AUTH CONTEXT  —  Customer (Passenger) App
   
   Session persistence strategy (fixes the 6-sec logout bug):
   1. On mount: read profile cache IMMEDIATELY (no loading flash)
   2. Validate session in background (never block UI)
   3. Handle ALL Supabase auth events incl. TOKEN_REFRESHED
   4. If session exists but profile fetch fails → use cache
   5. If session null AND cache stale → clear and show login
   
   Supabase auth events we handle:
   - INITIAL_SESSION   : app load, session restored from storage
   - SIGNED_IN        : OTP verify, OAuth callback
   - TOKEN_REFRESHED  : background token refresh (every 50 min)
   - SIGNED_OUT       : explicit logout
   - USER_UPDATED     : phone/email change
================================================================ */

const AuthCtx     = createContext(null)
const PROFILE_KEY = 'jc_profile_v4'
const SESSION_KEY = 'jc_session'
const PROFILE_TTL = 30 * 24 * 60 * 60 * 1000   // 30 days
const REFRESH_GAP = 60 * 1000                    // 1 min — don't re-fetch too often

const cache = {
  read() {
    try {
      const raw = localStorage.getItem(PROFILE_KEY)
      if (!raw) return null
      const p = JSON.parse(raw)
      if (Date.now() - p.ts > PROFILE_TTL) { localStorage.removeItem(PROFILE_KEY); return null }
      return p
    } catch { return null }
  },
  write(data, userId) {
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify({
        data, role: 'passenger', userId, ts: Date.now()
      }))
    } catch {}
  },
  clear() {
    try {
      [PROFILE_KEY, 'jc_profile_v3', 'jc_profile_v2', 'jc_recent_v4'].forEach(k =>
        localStorage.removeItem(k)
      )
    } catch {}
  },
  hasValidSession() {
    // Check if Supabase has a stored session token
    try {
      const raw = localStorage.getItem(SESSION_KEY)
      if (!raw) return false
      const s = JSON.parse(raw)
      // Check if access token exists and not expired
      const exp = s?.expires_at || s?.session?.expires_at || 0
      return Date.now() / 1000 < exp + 60  // 60s grace
    } catch { return false }
  }
}

export function AuthProvider({ children }) {
  // Read cache synchronously — zero loading flash for returning users
  const cached         = cache.read()
  const hasStoredToken = cache.hasValidSession()

  const [profile,   setProfile]   = useState(cached?.data || null)
  // Only show loading if we have no cached data AND have a stored token to validate
  const [loading,   setLoading]   = useState(!cached?.data && hasStoredToken)
  const [oauthUser, setOauthUser] = useState(null)

  const directSetAt  = useRef(0)
  const lastFetchAt  = useRef(0)
  const mounted      = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const fetchProfile = useCallback(async (userId, force = false) => {
    if (!userId) return null
    // Throttle: don't fetch more than once per minute unless forced
    if (!force && Date.now() - lastFetchAt.current < REFRESH_GAP) return 'cached'
    lastFetchAt.current = Date.now()

    try {
      const { data: ps, error } = await supabase
        .from('passengers').select('*').eq('id', userId).maybeSingle()
      if (!mounted.current) return null
      if (ps) {
        cache.write(ps, userId)
        setProfile(ps)
        setOauthUser(null)
        setLoading(false)
        return 'passenger'
      }
      if (error) throw error
    } catch {
      // Network error or DB error — use cache if available
      if (!mounted.current) return null
      const c = cache.read()
      if (c && c.userId === userId) {
        setProfile(c.data)
        setLoading(false)
        return 'passenger'
      }
    }
    return null
  }, [])

  useEffect(() => {
    // Safety net: never show loading spinner > 8 seconds
    const fallback = setTimeout(() => {
      if (!mounted.current) return
      const c = cache.read()
      if (c) { setProfile(c.data); setLoading(false) }
      else setLoading(false)
    }, 8000)

    // Listen to ALL Supabase auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted.current) return
      clearTimeout(fallback)

      switch (event) {
        case 'INITIAL_SESSION': {
          // Called once on app load with whatever session is in storage
          if (!session?.user) {
            // No session — if we have a profile cache, clear it (session truly expired)
            // But first check: maybe token just needs refresh
            const c = cache.read()
            if (c) {
              // Keep showing cached profile for now, try silent refresh
              setLoading(false)
            } else {
              setProfile(null)
              setLoading(false)
            }
            return
          }
          // We have a session — restore profile
          const c = cache.read()
          if (c && c.userId === session.user.id) {
            // Cache hit — show immediately, refresh in background
            setProfile(c.data)
            setLoading(false)
            fetchProfile(session.user.id).catch(() => {})
          } else {
            // No cache — fetch profile
            const r = await fetchProfile(session.user.id, true)
            if (!mounted.current) return
            if (r === null) {
              // Profile not in DB yet (new OAuth user)
              if (session.user.app_metadata?.provider === 'google') {
                setOauthUser(session.user)
              }
              setLoading(false)
            }
          }
          break
        }

        case 'SIGNED_IN': {
          if (!session?.user) break
          // Skip if we just set profile directly (OTP verify flow)
          if (Date.now() - directSetAt.current < 30000) { setLoading(false); break }
          const c = cache.read()
          if (c && c.userId === session.user.id) { setLoading(false); break }
          const r = await fetchProfile(session.user.id, true)
          if (!mounted.current) return
          if (r === null) {
            if (session.user.app_metadata?.provider === 'google') setOauthUser(session.user)
            setLoading(false)
          }
          break
        }

        case 'TOKEN_REFRESHED': {
          // Token silently refreshed — session is still valid
          // Just ensure we're not stuck on loading
          if (!mounted.current) return
          setLoading(false)
          // Background refresh profile if needed
          if (session?.user) fetchProfile(session.user.id).catch(() => {})
          break
        }

        case 'USER_UPDATED': {
          if (session?.user) fetchProfile(session.user.id, true).catch(() => {})
          break
        }

        case 'SIGNED_OUT': {
          cache.clear()
          directSetAt.current = 0
          lastFetchAt.current = 0
          if (mounted.current) {
            setProfile(null)
            setOauthUser(null)
            setLoading(false)
          }
          break
        }

        default:
          break
      }
    })

    return () => {
      clearTimeout(fallback)
      subscription.unsubscribe()
    }
  }, [fetchProfile])

  const setProfileDirect = useCallback((data) => {
    if (!data) { setLoading(false); return }
    directSetAt.current = Date.now()
    lastFetchAt.current = Date.now()
    cache.write(data, data.id)
    setProfile(data)
    setOauthUser(null)
    setLoading(false)
  }, [])

  const refreshProfile = useCallback(async () => {
    lastFetchAt.current = 0  // force refresh
    const { data: { user } } = await supabase.auth.getUser()
    if (user) await fetchProfile(user.id, true)
  }, [fetchProfile])

  const signOut = useCallback(async () => {
    await doSignOut()
    cache.clear()
    directSetAt.current = 0
    lastFetchAt.current = 0
    if (mounted.current) {
      setProfile(null)
      setOauthUser(null)
      setLoading(false)
    }
  }, [])

  return (
    <AuthCtx.Provider value={{
      profile, role: 'passenger', loading, oauthUser,
      setProfileDirect, refreshProfile, signOut
    }}>
      {children}
    </AuthCtx.Provider>
  )
}

export const useAuth = () => useContext(AuthCtx)
