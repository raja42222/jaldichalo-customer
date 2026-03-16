import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { supabase, doSignOut } from '../lib/supabase'

/* ================================================================
   AUTH CONTEXT v3 — Customer App
   
   FIXES vs previous version:
   
   FIX 1: Removed hasValidSession() — unreliable because Supabase v2
          internal storage key format is unpredictable.
   
   FIX 2: Profile cache is ALWAYS shown immediately on mount.
          loading=false by default if cache exists.
          → Zero re-login flash for returning users.
   
   FIX 3: INITIAL_SESSION with no session → KEEP cached profile.
          Only clear profile on explicit SIGNED_OUT event.
          Reason: INITIAL_SESSION null can mean "token refresh in progress"
          not necessarily "user is logged out".
   
   FIX 4: Supabase storageKey uses our dualStorage (localStorage+cookie)
          so session survives PWA background kill on Android/iOS.
   
   FIX 5: fetchProfile failure → NEVER clear profile if cache exists.
          Show stale cache rather than force login.
   
   SESSION FLOW:
   Login → JWT in dualStorage (localStorage + cookie)
   App open → cache read synchronously → profile shown INSTANTLY
   Background → Supabase autoRefreshToken silently renews JWT
   7 days later → token expires → only then OTP needed again
================================================================ */

const AuthCtx     = createContext(null)
const PROFILE_KEY = 'jc_profile_v4'
const PROFILE_TTL = 30 * 24 * 60 * 60 * 1000  // 30 days
const REFETCH_GAP = 5 * 60 * 1000              // Re-fetch profile every 5 min max

/* -- Profile cache ----------------------------------------------- */
const cache = {
  read() {
    try {
      const raw = localStorage.getItem(PROFILE_KEY)
      if (!raw) return null
      const p = JSON.parse(raw)
      if (!p?.data || !p?.ts) return null
      if (Date.now() - p.ts > PROFILE_TTL) { localStorage.removeItem(PROFILE_KEY); return null }
      return p
    } catch { return null }
  },
  write(data, userId) {
    if (!data || !userId) return
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify({ data, userId, ts: Date.now() }))
    } catch {}
  },
  clear() {
    try {
      ['jc_profile_v4', 'jc_profile_v3', 'jc_profile_v2', 'jc_recent_v4']
        .forEach(k => localStorage.removeItem(k))
    } catch {}
  }
}

/* -- Provider ---------------------------------------------------- */
export function AuthProvider({ children }) {
  // ★ KEY FIX: Read cache SYNCHRONOUSLY before first render.
  //   If cache exists → show profile IMMEDIATELY, loading=false.
  //   User sees their home screen with ZERO delay.
  const initCache = cache.read()

  const [profile,   setProfile]   = useState(initCache?.data || null)
  const [loading,   setLoading]   = useState(false)  // ★ Always false — no spinner by default
  const [oauthUser, setOauthUser] = useState(null)

  const mounted      = useRef(true)
  const lastFetchAt  = useRef(0)
  const directSetAt  = useRef(0)
  const sessionReady = useRef(false)  // Has INITIAL_SESSION fired?

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  /* -- Fetch profile from DB ----------------------------------- */
  const fetchProfile = useCallback(async (userId, force = false) => {
    if (!userId || !mounted.current) return null

    // Throttle unless forced
    if (!force && Date.now() - lastFetchAt.current < REFETCH_GAP) return 'throttled'
    lastFetchAt.current = Date.now()

    try {
      const { data, error } = await supabase
        .from('passengers')
        .select('*')
        .eq('id', userId)
        .maybeSingle()

      if (!mounted.current) return null

      if (data) {
        cache.write(data, userId)
        setProfile(data)
        setOauthUser(null)
        setLoading(false)
        return 'ok'
      }

      if (error) throw error
      // data is null (no row yet) — keep existing profile/cache
      return null

    } catch (err) {
      if (!mounted.current) return null
      // ★ KEY FIX: On network error, use cache. NEVER force login.
      const c = cache.read()
      if (c?.userId === userId) {
        setProfile(c.data)
        setLoading(false)
        return 'cache'
      }
      return null
    }
  }, [])

  /* -- Auth state listener -------------------------------------- */
  useEffect(() => {
    // ★ Safety valve: if INITIAL_SESSION takes > 12s, use cache
    const safetyTimer = setTimeout(() => {
      if (!mounted.current || sessionReady.current) return
      sessionReady.current = true
      const c = cache.read()
      if (c) { setProfile(c.data); setLoading(false) }
      else { setLoading(false) }
    }, 12000)

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted.current) return

        switch (event) {

          /* -- App open / tab focus --------------------------- */
          case 'INITIAL_SESSION': {
            clearTimeout(safetyTimer)
            sessionReady.current = true

            if (!session?.user) {
              // ★ KEY FIX: No active session, but we may have cached profile.
              // DO NOT clear profile here — let user stay logged in from cache.
              // Supabase will fire SIGNED_OUT explicitly if refresh fails.
              const c = cache.read()
              if (c) {
                // Keep showing cached profile. Supabase may still be refreshing.
                setProfile(c.data)
                setLoading(false)
              } else {
                // Truly no session and no cache → show login
                setProfile(null)
                setLoading(false)
              }
              return
            }

            // Session exists — restore profile
            const c = cache.read()
            if (c?.userId === session.user.id) {
              // ★ Instant: show cached profile right away
              setProfile(c.data)
              setLoading(false)
              // Background refresh (don't await)
              fetchProfile(session.user.id).catch(() => {})
            } else {
              // New user or cache mismatch — fetch from DB
              const res = await fetchProfile(session.user.id, true)
              if (!mounted.current) return
              if (res === null) {
                // No profile row yet → this is a new Google OAuth user
                if (session.user.app_metadata?.provider === 'google') {
                  setOauthUser(session.user)
                }
                setLoading(false)
              }
            }
            break
          }

          /* -- OTP verify / OAuth callback -------------------- */
          case 'SIGNED_IN': {
            if (!session?.user) break
            // If we just set profile directly (OTP flow), skip re-fetch
            if (Date.now() - directSetAt.current < 30000) break
            const c = cache.read()
            if (c?.userId === session.user.id) {
              setProfile(c.data); setLoading(false); break
            }
            const res = await fetchProfile(session.user.id, true)
            if (!mounted.current) return
            if (res === null) {
              if (session.user.app_metadata?.provider === 'google') {
                setOauthUser(session.user)
              }
              setLoading(false)
            }
            break
          }

          /* -- Background token refresh (every ~50 min) ------- */
          case 'TOKEN_REFRESHED': {
            // ★ Session is valid — just ensure loading is cleared
            setLoading(false)
            if (session?.user) {
              fetchProfile(session.user.id).catch(() => {})
            }
            break
          }

          /* -- Profile change --------------------------------- */
          case 'USER_UPDATED': {
            if (session?.user) fetchProfile(session.user.id, true).catch(() => {})
            break
          }

          /* -- ★ ONLY clear profile on EXPLICIT sign out ------ */
          case 'SIGNED_OUT': {
            clearTimeout(safetyTimer)
            cache.clear()
            directSetAt.current  = 0
            lastFetchAt.current  = 0
            if (mounted.current) {
              setProfile(null)
              setOauthUser(null)
              setLoading(false)
            }
            break
          }

          default: break
        }
      }
    )

    return () => {
      clearTimeout(safetyTimer)
      subscription.unsubscribe()
    }
  }, [fetchProfile])

  /* -- Called after OTP verify or profile save ------------------ */
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
    lastFetchAt.current = 0
    const { data: { user } } = await supabase.auth.getUser()
    if (user) await fetchProfile(user.id, true)
  }, [fetchProfile])

  const signOut = useCallback(async () => {
    cache.clear()
    directSetAt.current = 0
    lastFetchAt.current = 0
    if (mounted.current) {
      setProfile(null)
      setOauthUser(null)
      setLoading(false)
    }
    // Sign out from Supabase (fires SIGNED_OUT event)
    await doSignOut()
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
