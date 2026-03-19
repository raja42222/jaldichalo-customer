import React, { useState, useEffect, useRef, useCallback } from 'react'
import { supabase }          from '../lib/supabase'
import { useAuth }           from '../context/AuthContext'
import { reverseGeocode, getDistanceKm, getEtaMins, isRouteDeviation } from '../lib/geo'
import { computeETA, subscribeToNearbyDrivers, dispatchRide, RIDE_STATUS } from '../lib/etaService'
import { calculateFare, getCommissionBreakdown, fmtRsSymbol as fmtRs } from '../lib/fareEngine'
import { isDuplicateBooking, recordBooking, isValidRideTransition } from '../lib/security'

import { triggerRouteDeviationAlert, triggerLongStopAlert } from '../lib/safetyService'
import LocationSearch from '../components/LocationSearch'
import MapLocationPicker from '../components/MapLocationPicker'
import MapView        from '../components/MapView'
import ETAPanel       from '../components/ETAPanel'
import { SafetyBar, SafetyAlertToast, useSafetyAlerts, ReportModal } from '../components/SafetyPanel'
import CancelRideModal from '../components/CancelRideModal'
import { SkeletonMap, SkeletonDriverSearch, SkeletonFareRows } from '../components/Skeleton'

/* -- Back-button history helper -- */
function pushScreen(name) { window.history.pushState({ jcScreen: name }, '') }
function replaceScreen(name) { window.history.replaceState({ jcScreen: name }, '') }

const MenuIcon  = () => <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
const PhoneIcon = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.1a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.71a16 16 0 0 0 6.29 6.29l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
const ChatIcon  = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
const WaIcon    = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
const StarIcon  = ({ f }) => <svg width="14" height="14" viewBox="0 0 24 24" fill={f?'#F59E0B':'none'} stroke="#F59E0B" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
const SendIcon  = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
const LocIcon   = () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>
const BackIcon  = () => <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>

/* -- Offline banner ----------------------------------------- */
function useOnlineStatus() {
  const [online, setOnline] = React.useState(navigator.onLine)
  React.useEffect(() => {
    const on  = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online',  on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online',on); window.removeEventListener('offline',off) }
  }, [])
  return online
}
function OfflineBanner() {
  const online = useOnlineStatus()
  if (online) return null
  return (
    <div style={{ position:'fixed', top:0, left:0, right:0, zIndex:999, background:'#EF4444', color:'#fff', textAlign:'center', padding:'10px 16px', fontSize:13, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
      <span>📵</span> No internet connection — limited functionality
    </div>
  )
}

const MAX_KM         = 100
const LONG_STOP_MINS = 5
const ETA_REFRESH_MS = 15000
const GPS_CACHE_KEY  = 'jc_last_pos'
const SHEET_HEIGHT   = '32vh'
const BOTTOM_PAD     = 140

function saveGPS(lat, lng) { try { localStorage.setItem(GPS_CACHE_KEY, JSON.stringify({ lat, lng, ts: Date.now() })) } catch {} }
function loadGPS() { try { const d = JSON.parse(localStorage.getItem(GPS_CACHE_KEY)); return d && Date.now()-d.ts < 3600000 ? d : null } catch { return null } }

// Haptic feedback — feels tactile on supported devices
function haptic(type = 'light') {
  try {
    if (navigator.vibrate) {
      if (type === 'light')  navigator.vibrate(8)
      if (type === 'medium') navigator.vibrate(18)
      if (type === 'heavy')  navigator.vibrate([15,10,15])
      if (type === 'success')navigator.vibrate([10,5,10,5,30])
      if (type === 'error')  navigator.vibrate([40,20,40])
    }
  } catch {}
}

function getLocation(onGood, onFail) {
  if (!navigator.geolocation) {
    // Geolocation not supported — try cache
    const c = loadGPS(); c ? onGood(c.lat, c.lng) : onFail(); return
  }
  const ok = pos => {
    const { latitude:lat, longitude:lng, accuracy } = pos.coords
    saveGPS(lat, lng)
    onGood(lat, lng, accuracy)
  }
  // Attempt 1: High accuracy (GPS chip), 15s timeout, fresh fix
  navigator.geolocation.getCurrentPosition(ok,
    () => {
      // Attempt 2: High accuracy again but allow 10s cached fix
      navigator.geolocation.getCurrentPosition(ok,
        () => {
          // Attempt 3: Accept any accuracy — last resort
          navigator.geolocation.getCurrentPosition(ok,
            () => {
              // All failed — use cached GPS
              const c = loadGPS()
              if (c) { onGood(c.lat, c.lng, 9999); } else { onFail() }
            },
            { enableHighAccuracy:false, timeout:5000, maximumAge:300000 }
          )
        },
        { enableHighAccuracy:true, timeout:12000, maximumAge:10000 }
      )
    },
    { enableHighAccuracy:true, timeout:15000, maximumAge:0 }  // maximumAge:0 = always fresh
  )
}

const lerp = (a,b,t) => a+(b-a)*t
const DEMO_PICKUP = { id:'demo_p', short:'Esplanade, Kolkata', label:'Esplanade, Kolkata', lat:22.5636, lng:88.3511 }
const DEMO_DROP   = { id:'demo_d', short:'Howrah Railway Station', label:'Howrah Rly Stn', lat:22.5839, lng:88.3424 }

function makeDemoPath(sLat, sLng, pLat, pLng, steps = 30) {
  return Array.from({ length:steps+1 }, (_,i) => [lerp(sLat,pLat,i/steps), lerp(sLng,pLng,i/steps)])
}

export default function PassengerHome({ onMenu }) {
  const { profile } = useAuth()

  const [gps,         setGps]      = useState(() => { const c=loadGPS(); return c?[c.lat,c.lng]:null })
  const [gpsAddr,     setGpsAddr]  = useState('')
  const [pickup,      setPickup]   = useState(null)
  const [drop,        setDrop]     = useState(null)
  const [locMode,     setLocMode]  = useState(null)
  const [mapPickMode, setMapPickMode] = useState(null) // 'pickup'|'drop'|null
  const [distErr,     setDistErr]  = useState('')
  const [bookingFor,  setBookingFor] = useState({ type:'myself', phone:profile?.phone||'' })

  const [eta,         setEta]      = useState(null)
  const [selVehicle,  setSelV]     = useState('bike')
  const etaAbort   = useRef(null)
  const etaTimer   = useRef(null)

  const [rideState,   setRS]       = useState('idle')
  const [payMethod,   setPay]      = useState('cash')
  const [ride,        setRide]     = useState(null)
  const [driver,      setDriver]   = useState(null)
  const [loading,     setLoading]  = useState(false)
  const [dispatchMsg, setDispatchMsg] = useState('')
  const [showCancel,  setShowCancel] = useState(false)
  const [mapReady,    setMapReady]   = useState(false)
  const [locating,    setLocating]   = useState(false)
  const [rating,      setRating]   = useState(0)

  const [nearbyDrvs,  setNearbyDrvs] = useState([])
  const [showChat,    setShowChat] = useState(false)
  const [msgs,        setMsgs]     = useState([])
  const [chatIn,      setChatIn]   = useState('')
  const chatEndRef = useRef(null)

  const [safetyAlert, setSA]       = useState(null)
  const [showReport,  setShowReport] = useState(false)
  const mapRef     = useRef(null)
  const lastDrvPos = useRef(null)
  const stopTimer  = useRef(null)

  const [demoActive,  setDemoActive]  = useState(false)
  const [demoDrvPos,  setDemoDrvPos]  = useState(null)
  const [demoPhase,   setDemoPhase]   = useState('idle')
  const demoIv          = useRef(null)
  const demoPath        = useRef([])
  const demoStep        = useRef(0)
  const demoPickupStep  = useRef(0)

  /* === Back button — phone back = close overlay, not exit app === */
  useEffect(() => {
    replaceScreen('home')

    function onPop(e) {
      const scr = e.state?.jcScreen
      // If user backs to 'home' screen, close any overlay
      if (!scr || scr === 'home') {
        if (showChat)  { setShowChat(false);  return }
        if (locMode)   { setLocMode(null);    return }
        // On home screen, pressing back should do nothing (stay in app)
        // Push a dummy state so next back doesn't exit
        window.history.pushState({ jcScreen:'home' }, '')
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [locMode, showChat]) // eslint-disable-line

  // Push history entry when overlay opens
  useEffect(() => { if (locMode)   pushScreen('locSearch') }, [locMode])
  useEffect(() => { if (showChat)  pushScreen('chat')      }, [showChat])

  /* === GPS — passive location tracking ===
   * 1. Prompt for geolocation permission immediately on mount
   * 2. watchPosition continuously updates GPS (high accuracy)
   * 3. Location cached for 2 hours — even if user doesn't book a ride,
   *    pickup auto-fills instantly on next open
   * 4. Handles visibilitychange — re-request GPS when app comes back to foreground
   */
  useEffect(() => {
    // Step 1: immediate permission request + first fix
    getLocation(
      async (lat, lng) => {
        setGps([lat, lng])
        const addr = await reverseGeocode(lat, lng)
        setGpsAddr(addr)
        setPickup(prev => prev ? prev : { id:'current', short:addr, label:addr, lat, lng })
      },
      () => {
        // Permission denied or unavailable — use Kolkata default
        setGps([22.5726, 88.3639])
      }
    )

    if (!navigator.geolocation) return

    // Step 2: continuous watch for movement tracking
    let watchId = navigator.geolocation.watchPosition(
      pos => {
        const { latitude:lat, longitude:lng, accuracy } = pos.coords
        saveGPS(lat, lng)
        setGps([lat, lng])
        // Update pickup if user hasn't set one yet and we have good accuracy
        if (accuracy < 100) {
          setPickup(prev => {
            if (!prev || prev.id === 'current') {
              reverseGeocode(lat, lng).then(addr => {
                setGpsAddr(addr)
                setPickup({ id:'current', short:addr, label:addr, lat, lng })
              })
            }
            return prev
          })
        }
      },
      err => {
        // On error, fall back to last cached position
        const c = loadGPS()
        if (c) setGps([c.lat, c.lng])
      },
      { enableHighAccuracy:true, maximumAge:5000, timeout:30000 }
    )

    // Step 3: re-request GPS when app comes back to foreground
    function onVisibility() {
      if (!document.hidden) {
        getLocation(
          (lat, lng) => { saveGPS(lat, lng); setGps([lat, lng]) },
          () => {}
        )
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, []) // eslint-disable-line

  function recenterGPS() {
    setLocating(true)
    getLocation(
      async (lat, lng, accuracy) => {
        setGps([lat, lng])
        setMapCenter([lat, lng])
        setLocating(false)
        const addr = await reverseGeocode(lat, lng)
        setGpsAddr(addr)
        // Update pickup if user hasn't manually set one
        setPickup(prev => {
          if (!prev || prev.id === 'current') {
            return { id:'current', short:addr, label:addr, lat, lng }
          }
          return prev
        })
      },
      () => {
        setLocating(false)
        // Show permission denied message
        alert('Location access denied. Please enable GPS in your phone settings and try again.')
      }
    )
  }

  /* === ETA pipeline === */
  const runETA = useCallback(async (p, d) => {
    etaAbort.current?.abort()
    const ctrl = new AbortController()
    etaAbort.current = ctrl
    setEta(prev => prev ? { ...prev, loadingRide:true, loadingDriver:true }
      : { phase:'loading', rideInfo:null, fareOptions:null, driverInfo:null, loadingRide:true, loadingDriver:true })
    await computeETA({ pickup:p, drop:d }, update => {
      if (ctrl.signal.aborted) return
      setEta(update)
      if (update.rideInfo?.distance_km) {
        const km = update.rideInfo.distance_km
        if (km > MAX_KM) setDistErr(`We serve rides up to ${MAX_KM} km. Expanding soon!`)
        else if (km < 0.5) setDistErr('Pickup and drop are too close. Minimum ride distance is 500 meters.')
        else setDistErr('')
      }
      if (update.phase === 'instant' && update.fareOptions?.length)
        setSelV(v => v || update.fareOptions[0].vehicleId)
    }, ctrl.signal)
  }, [])

  useEffect(() => {
    clearInterval(etaTimer.current)
    if (!pickup || !drop) { setEta(null); setDistErr(''); return }
    runETA(pickup, drop)
    if (rideState === 'idle')
      etaTimer.current = setInterval(() => runETA(pickup, drop), ETA_REFRESH_MS)
    return () => clearInterval(etaTimer.current)
  }, [pickup, drop, runETA]) // eslint-disable-line

  useEffect(() => {
    if (!pickup || rideState !== 'idle') return
    const unsub = subscribeToNearbyDrivers(pickup.lat, pickup.lng, drivers => {
      // drivers is array of [lat,lng] — pass all to map
      if (Array.isArray(drivers)) {
        setNearbyDrvs(drivers.filter(p => p[0] && p[1]))
      }
      if (drop) runETA(pickup, drop)
    })
    return unsub
  }, [pickup?.lat, pickup?.lng, drop, rideState, runETA]) // eslint-disable-line

  useEffect(() => { if (rideState !== 'idle') setNearbyDrvs([]) }, [rideState])

  /* === Realtime ride updates === */
  useEffect(() => {
    if (!ride) return
    const ch = supabase.channel(`ride-${ride.id}`)
      .on('postgres_changes', { event:'UPDATE', schema:'public', table:'rides', filter:`id=eq.${ride.id}` }, ({ new:r }) => {
        setRide(r)
        if (r.ride_status === RIDE_STATUS.ASSIGNED)     { setRS('matched'); fetchDriver(r.driver_id); haptic('success') }
        if (r.ride_status === 'accepted')               { setRS('matched'); fetchDriver(r.driver_id); haptic('success') }
        if (r.ride_status === RIDE_STATUS.OTP_VERIFIED || r.ride_status === 'otp_verified') setRS('tracking')
        if (r.ride_status === RIDE_STATUS.STARTED || r.ride_status === 'started') setRS('tracking')
        if (r.ride_status === RIDE_STATUS.COMPLETED || r.ride_status === 'completed') setRS('rating')
        if (r.ride_status === RIDE_STATUS.CANCELLED || r.ride_status === 'cancelled') {
          setRS('idle'); setRide(null); setDriver(null); setDispatchMsg('')
        }
      }).subscribe()
    return () => ch.unsubscribe()
  }, [ride?.id]) // eslint-disable-line

  /* === Driver location realtime === */
  useEffect(() => {
    if (!ride || !driver) return
    const ch = supabase.channel(`drloc-${driver.id}`)
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'driver_locations', filter:`driver_id=eq.${driver.id}` }, ({ new:loc }) => {
        setDriver(prev => ({ ...prev, current_lat:loc.lat, current_lng:loc.lng }))
        if (ride?.ride_status === 'started' && pickup && drop)
          if (isRouteDeviation(loc.lat, loc.lng, pickup.lat, pickup.lng, drop.lat, drop.lng, 2.0))
            triggerRouteDeviationAlert(ride.id, loc.lat, loc.lng)
        if (lastDrvPos.current) {
          const moved = getDistanceKm(lastDrvPos.current[0], lastDrvPos.current[1], loc.lat, loc.lng)
          if (moved < 0.02) {
            if (!stopTimer.current) stopTimer.current = setTimeout(() => triggerLongStopAlert(ride.id, loc.lat, loc.lng, LONG_STOP_MINS), LONG_STOP_MINS*60*1000)
          } else { if (stopTimer.current) { clearTimeout(stopTimer.current); stopTimer.current=null } }
        }
        lastDrvPos.current = [loc.lat, loc.lng]
      }).subscribe()
    return () => { ch.unsubscribe(); if (stopTimer.current) clearTimeout(stopTimer.current) }
  }, [ride?.id, driver?.id, pickup, drop]) // eslint-disable-line

  useSafetyAlerts(ride?.id, a => setSA(a))

  /* === Chat realtime === */
  useEffect(() => {
    if (!ride) return
    const ch = supabase.channel(`chat-p-${ride.id}`)
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'chat_messages', filter:`ride_id=eq.${ride.id}` }, ({ new:m }) => {
        setMsgs(prev => prev.find(x=>x.id===m.id) ? prev : [...prev, m])
        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior:'smooth' }), 100)
      }).subscribe()
    return () => ch.unsubscribe()
  }, [ride?.id]) // eslint-disable-line

  /* === Demo === */
  function startDemo() {
    if (demoActive) return stopDemo()
    const p = pickup || DEMO_PICKUP
    const d = drop   || DEMO_DROP
    if (!pickup) setPickup(DEMO_PICKUP)
    if (!drop)   setDrop(DEMO_DROP)
    // Demo driver starts 1-2 km away from pickup
    const angle = Math.random() * 2 * Math.PI
    const dist  = 0.8 + Math.random() * 0.8
    const sLat  = p.lat + (dist/111) * Math.cos(angle)
    const sLng  = p.lng + (dist/111) * Math.sin(angle)
    // Path: driver → pickup → drop
    const pickupPath = makeDemoPath(sLat, sLng, p.lat, p.lng, 25)
    const ridePath   = makeDemoPath(p.lat, p.lng, d.lat, d.lng, 35)
    demoPath.current = [...pickupPath, ...ridePath]
    demoStep.current = 0
    demoPickupStep.current = pickupPath.length  // index where ride starts
    setDemoActive(true); setDemoPhase('approaching')
    setDemoDrvPos([sLat, sLng])
  }

  useEffect(() => {
    if (!demoActive) return
    clearInterval(demoIv.current)
    demoIv.current = setInterval(() => {
      demoStep.current++
      const step = demoStep.current
      const path = demoPath.current
      if (step >= path.length) {
        clearInterval(demoIv.current)
        setDemoPhase('completed')
        setTimeout(() => stopDemo(), 2000)
        return
      }
      setDemoDrvPos([...path[step]])
      // Transition phases based on path position
      if (step === demoPickupStep.current) {
        setDemoPhase('arrived')
        // Pause 2s at pickup, then start ride
        clearInterval(demoIv.current)
        setTimeout(() => {
          setDemoPhase('riding')
          demoIv.current = setInterval(() => {
            demoStep.current++
            if (demoStep.current >= demoPath.current.length) {
              clearInterval(demoIv.current); setDemoPhase('completed')
              setTimeout(() => stopDemo(), 2500); return
            }
            setDemoDrvPos([...demoPath.current[demoStep.current]])
          }, 300)
        }, 2000)
      }
    }, 350)
    return () => clearInterval(demoIv.current)
  }, [demoActive]) // eslint-disable-line

  function stopDemo() {
    clearInterval(demoIv.current); setDemoActive(false); setDemoDrvPos(null)
    setDemoPhase('idle'); demoStep.current=0; demoPath.current=[]
  }

  useEffect(() => { if (driver?.current_lat) stopDemo() }, [driver?.current_lat]) // eslint-disable-line

  /* === Actions === */
  async function fetchDriver(id) {
    if (!id) return
    const { data } = await supabase.from('drivers').select('*').eq('id', id).single()
    if (data) setDriver(data)
  }

  async function bookRide() {
    if (!pickup || !drop || !selVehicle || distErr) return
    haptic('medium')
    // Validate booking for others
    if (bookingFor.type === 'other') {
      if (!bookingFor.name?.trim()) { alert('Enter the name of the person you are booking for.'); return }
      const ph = String(bookingFor.phone||'').replace(/\D/g,'')
      if (ph.length !== 10 || !/^[6-9]/.test(ph)) { alert('Enter a valid 10-digit Indian mobile number for the person.'); return }
    }
    const ri = eta?.rideInfo
    if (!ri?.distance_km) return
    // Anti-duplicate: prevent double-booking same route within 5 minutes
    if (isDuplicateBooking(profile.id, pickup.lat, pickup.lng, drop.lat, drop.lng)) {
      alert('A booking for this route was just made. Please wait a moment before trying again.')
      return
    }
    const fd = calculateFare(selVehicle, ri.distance_km, ri.duration_min || 0)
    setLoading(true)
    let row = null
    const { data:rpc, error:rpcErr } = await supabase.rpc('create_ride', {
      p_passenger_id:      profile.id,
      p_pickup_address:    pickup.short, p_drop_address:   drop.short,
      p_pickup_lat:        pickup.lat,   p_pickup_lng:     pickup.lng,
      p_drop_lat:          drop.lat,     p_drop_lng:       drop.lng,
      p_vehicle_type:      fd.vehicleId, p_distance_km:    fd.distanceKm,
      p_duration_min:      fd.durationMins || 0,
      p_fare:              fd.totalFare,  p_payment_method: payMethod,
      p_booking_for_name:  bookingFor.type==='other' ? bookingFor.name  : null,
      p_booking_for_phone: bookingFor.type==='other' ? bookingFor.phone : null,
    })
    if (!rpcErr && rpc?.[0]?.id) {
      const { data:full } = await supabase.from('rides').select('*').eq('id', rpc[0].id).single()
      row = full || rpc[0]
    } else {
      const payload = {
        passenger_id: profile.id,
        pickup_address:pickup.short, pickup_lat:pickup.lat, pickup_lng:pickup.lng,
        drop_address:drop.short,     drop_lat:drop.lat,     drop_lng:drop.lng,
        vehicle_type:fd.vehicleId, distance_km:fd.distanceKm, fare:fd.totalFare,
        payment_method:payMethod, ride_status:'searching',
      }
      if (bookingFor.type==='other') { payload.booking_for_name=bookingFor.name||null; payload.booking_for_phone=bookingFor.phone||null }
      const { data:ins, error:insErr } = await supabase.from('rides').insert(payload).select().single()
      if (insErr) { setLoading(false); alert('Booking failed: '+(rpcErr?.message||insErr.message)+'\n\nRun fix_all_columns.sql in Supabase.'); return }
      row = ins
    }
    setLoading(false)
    if (!row) { alert('Booking failed'); return }
    setRide(row); setRS('searching'); setDispatchMsg('Searching for captain...')
    // Record to prevent duplicate bookings
    recordBooking(profile.id, pickup.lat, pickup.lng, drop.lat, drop.lng)
    clearInterval(etaTimer.current); etaAbort.current?.abort()
    // Dispatch to best scored driver (Rapido-style sequential dispatch)
    dispatchRide(row.id, pickup.lat, pickup.lng, fd.vehicleId, status => {
      if (status.status === 'searching') {
        const msg = status.radius > 3
          ? `Expanding search to ${status.radius}km...`
          : `Found ${status.found} captain${status.found!==1?'s':''} nearby`
        setDispatchMsg(msg)
      } else if (status.status === 'offering') {
        setDispatchMsg(`Contacting captain #${status.triedCount}...`)
      } else if (status.status === 'timeout' || status.status === 'declined') {
        setDispatchMsg(`Captain unavailable, trying next...`)
      } else if (status.status === 'accepted') {
        supabase.from('drivers').select('*').eq('id', status.driver.id).single()
          .then(({ data }) => {
            if (data) {
              setDriver(data)
              setRide(prev => ({ ...prev, driver_id: data.id, ride_status: RIDE_STATUS.ASSIGNED }))
              setRS('matched')
              setDispatchMsg('')
            }
          })
      } else if (status.status === 'no_drivers') {
        setDispatchMsg('No captains available nearby. Please try again in a few minutes.')
        // Cancel the ride in DB so it doesn't stay as 'searching_driver'
        if (row?.id || ride?.id) {
          supabase.from('rides').update({
            ride_status: 'no_driver_found',
            cancelled_at: new Date().toISOString()
          }).eq('id', row?.id || ride?.id).catch(() => {})
        }
        setTimeout(() => {
          setRS('idle'); setRide(null); setDriver(null); setDispatchMsg('')
        }, 4000)
      } else if (status.status === 'cancelled') {
        setRS('idle'); setRide(null); setDriver(null); setDispatchMsg('')
      }
    }).catch(() => { setDispatchMsg('') })
  }

  function openCancelModal() { if (!ride) return; setShowCancel(true) }
  function onCancelled(result) {
    setShowCancel(false)
    // Always reset state - even if "ride already ended" (it's done either way)
    setRS('idle'); setRide(null); setDriver(null); setDispatchMsg('')
    setPickup(null); setDrop(null); setEta(null)
    if (result?.penalty > 0) {
      setTimeout(() => alert(`A cancellation fee of ₹${result.penalty} has been applied to your account.`), 300)
    }
  }

  function closeCancelModal() {
    setShowCancel(false)
    // If ride is already ended (from backend check), reset anyway
    if (!ride || ride.ride_status?.includes('cancel') || ride.ride_status === 'no_driver_found') {
      setRS('idle'); setRide(null); setDriver(null); setDispatchMsg('')
    }
  }

  async function sendChat() {
    if (!chatIn.trim() || !ride) return
    const msg = chatIn.trim(); setChatIn('')
    await supabase.from('chat_messages').insert({ ride_id:ride.id, sender_id:profile.id, sender_role:'passenger', message:msg })
    setMsgs(prev => [...prev, { id:Date.now(), sender_role:'passenger', message:msg }])
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior:'smooth' }), 100)
  }

  async function submitRating(skip = false) {
    if (skip) {
      setRS('idle'); setRide(null); setDriver(null); setPickup(null); setDrop(null); setRating(0); setEta(null)
      return
    }
    if (ride && rating) await supabase.from('rides').update({ passenger_rating:rating }).eq('id', ride.id)
    setRS('idle'); setRide(null); setDriver(null); setPickup(null); setDrop(null); setRating(0); setEta(null); stopDemo()
  }

  /* === Derived (memoized to prevent unnecessary re-renders) === */
  const selectedFare    = React.useMemo(
    () => eta?.fareOptions?.find(f => f.vehicleId===selVehicle),
    [eta?.fareOptions, selVehicle]
  )
  const mapCenter       = React.useMemo(() => gps || [22.5726, 88.3639], [gps])
  const driverPos       = React.useMemo(
    () => driver?.current_lat ? [driver.current_lat, driver.current_lng] : null,
    [driver?.current_lat, driver?.current_lng]
  )
  const effectiveDrvPos = React.useMemo(
    () => driverPos || (demoActive ? demoDrvPos : null),
    [driverPos, demoActive, demoDrvPos]
  )
  const isActive        = React.useMemo(
    () => ['matched','tracking'].includes(rideState),
    [rideState]
  )

  /* === Location search — text mode === */
  if (locMode && !mapPickMode) return (
    <LocationSearch mode={locMode} currentLoc={gps} userPhone={profile?.phone}
      bookingFor={bookingFor} onBookingForChange={setBookingFor}
      onSelect={p => { if (locMode==='pickup') setPickup(p); else setDrop(p); setLocMode(null) }}
      onClose={() => setLocMode(null)}
      onMapPick={() => { setMapPickMode(locMode); setLocMode(null) }}
    />
  )

  /* === Location search — map pick mode === */
  if (mapPickMode) return (
    <MapLocationPicker
      mode={mapPickMode}
      initialLat={mapPickMode==='pickup' ? (pickup?.lat || gps?.[0]) : (drop?.lat || gps?.[0])}
      initialLng={mapPickMode==='pickup' ? (pickup?.lng || gps?.[1]) : (drop?.lng || gps?.[1])}
      currentGPS={gps}
      onConfirm={place => {
        if (mapPickMode==='pickup') setPickup(place)
        else setDrop(place)
        setMapPickMode(null)
      }}
      onClose={() => setMapPickMode(null)}
    />
  )

  /* === In-app chat screen === */
  if (showChat) return (
    <div style={{ position:'fixed', inset:0, background:'#fff', display:'flex', flexDirection:'column', zIndex:100 }}>
      <div style={{ padding:'calc(env(safe-area-inset-top,0px)+12px) 16px 12px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:12, flexShrink:0, background:'#fff' }}>
        <button className="btn btn-icon" onClick={() => setShowChat(false)}><BackIcon /></button>
        <div style={{ width:38, height:38, borderRadius:'50%', background:'linear-gradient(135deg,#FF5F1F,#FF8C00)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, color:'#fff', fontSize:14, flexShrink:0 }}>
          {driver?.name?.slice(0,2).toUpperCase()||'DR'}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div className="t-h3">{driver?.name||'Driver'}</div>
          {driver?.current_lat && pickup && (
            <div style={{ fontSize:12, color:'var(--green)', fontWeight:700, marginTop:2 }}>
              {(() => {
                const dkm = Math.sqrt(Math.pow((driver.current_lat-pickup.lat)*111,2)+Math.pow((driver.current_lng-pickup.lng)*111,2))
                return `🛵 ~${Math.max(1,Math.round(dkm/0.4))} min away`
              })()}
            </div>
          )}
          <div className="t-tiny t-muted" style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{driver?.vehicle_model} - {driver?.vehicle_number}</div>
        </div>
        <div style={{ display:'flex', gap:6 }}>
          <div style={{ fontSize:11, background:'#FFF7ED', color:'#FF5F1F', padding:'4px 10px', borderRadius:20, fontWeight:700 }}>In-app chat</div>
        </div>
      </div>
      <div className="scroll" style={{ flex:1, padding:16, display:'flex', flexDirection:'column', gap:10 }}>
        {msgs.length===0 && (
          <div style={{ textAlign:'center', padding:'60px 0' }}>
            <div style={{ fontSize:40, marginBottom:10 }}>💬</div>
            <div className="t-body t-muted">Send a message to your driver</div>
          </div>
        )}
        {msgs.map((m,i) => (
          <div key={m.id||i} style={{ display:'flex', flexDirection:'column', alignItems:m.sender_role==='passenger'?'flex-end':'flex-start' }}>
            <div className={m.sender_role==='passenger'?'bubble-me':'bubble-them'}>{m.message}</div>
            <div className="t-tiny t-dim" style={{ marginTop:3, padding:'0 4px' }}>{m.read?'✓✓':'✓'}</div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>
      <div style={{ padding:'10px 14px', borderTop:'1px solid var(--border)', display:'flex', gap:8, paddingBottom:`calc(10px + env(safe-area-inset-bottom,0px))`, background:'#fff', flexShrink:0 }}>
        <input className="input" style={{ flex:1 }} placeholder="Type a message..." value={chatIn}
          onChange={e=>setChatIn(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendChat()} />
        <button className="btn btn-primary" style={{ width:46, padding:0, borderRadius:14, flexShrink:0 }} onClick={sendChat}><SendIcon /></button>
      </div>
    </div>
  )

  /* === Main Screen === */
  // During active ride: minimal sheet = more map visible (Rapido style)
  const sheetH = rideState === 'idle'
    ? (pickup && drop ? '58vh' : SHEET_HEIGHT)
    : (['matched','tracking'].includes(rideState) ? '36vh' : 'auto')
  const bPad = rideState === 'idle' ? (pickup && drop ? 260 : BOTTOM_PAD) : 140

  return (
    <div style={{ position:'fixed', inset:0, overflow:'hidden' }}>
      {safetyAlert && <SafetyAlertToast alert={safetyAlert} onDismiss={() => setSA(null)} />}
      {/* Offline banner */}
      <OfflineBanner />
      {showReport && ride && <ReportModal rideId={ride.id} userId={profile.id} role="passenger" onClose={() => setShowReport(false)} />}
      {showCancel && ride && (
        <CancelRideModal
          ride={ride} role="passenger" userId={profile.id}
          onCancelled={onCancelled}
          onClose={closeCancelModal}
        />
      )}

      {/* Full-screen map */}
      <div style={{ position:'absolute', inset:0 }}>
        <MapView
          center={mapCenter}
          pickupCoords={pickup ? [pickup.lat, pickup.lng] : null}
          dropCoords={drop ? [drop.lat, drop.lng] : null}
          driverCoords={effectiveDrvPos}
          nearbyDrivers={rideState==='idle' ? nearbyDrvs : []}
          showRoute={(!!pickup && !!drop && !distErr) || rideState==='tracking' || demoActive}
          showDriverToPickup={rideState === 'matched'}
          zoom={14}
          bottomPad={bPad}
          onReady={() => setMapReady(true)}
        />
        <SkeletonMap visible={!mapReady} />
      </div>

      {/* Top bar — floating transparent overlay like Rapido */}
      <div style={{ position:'absolute', top:0, left:0, right:0, zIndex:30, padding:'calc(env(safe-area-inset-top,0px)+10px) 14px 10px', display:'flex', alignItems:'center', justifyContent:'space-between', pointerEvents:'none' }}>
        <button style={{ pointerEvents:'all', width:42, height:42, borderRadius:'50%', background:'rgba(255,255,255,0.95)', backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 2px 10px rgba(0,0,0,0.15)' }} onClick={onMenu}><MenuIcon /></button>
        <div style={{ pointerEvents:'all', display:'flex', alignItems:'center', gap:7, background:'rgba(255,255,255,0.95)', backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)', borderRadius:22, padding:'8px 16px', boxShadow:'0 2px 10px rgba(0,0,0,0.12)' }}>
          <span style={{ fontSize:14 }}>⚡</span>
          <span style={{ fontFamily:"'Space Grotesk',sans-serif", fontWeight:700, fontSize:15, color:'var(--brand)' }}>Jaldi Chalo</span>
        </div>
        <div style={{ width:42 }} />
      </div>

      {/* Locate-me — always visible, shows spinner while locating */}
      <button onClick={recenterGPS} disabled={locating}
        title="Find my location"
        style={{
          position:'absolute', right:14, bottom:`calc(${SHEET_HEIGHT} + 16px)`,
          zIndex:30, width:46, height:46, borderRadius:'50%',
          background: locating ? 'var(--brand)' : '#fff',
          boxShadow:'0 3px 14px rgba(0,0,0,0.22)',
          display:'flex', alignItems:'center', justifyContent:'center',
          border:'none', cursor: locating ? 'wait' : 'pointer',
          transition:'all 0.2s',
        }}>
        {locating
          ? <div style={{ width:20, height:20, border:'3px solid rgba(255,255,255,0.4)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />
          : <LocIcon />
        }
      </button>

      {/* Distance pill */}
      {eta?.rideInfo?.distance_km && !distErr && rideState==='idle' && (
        <div className="map-pill" style={{ position:'absolute', top:'calc(env(safe-area-inset-top,0px) + 68px)', right:14, zIndex:20 }}>
          <span>🛣️</span>
          <span style={{ fontWeight:800 }}>{eta.rideInfo.distance_km.toFixed(1)} km</span>
          <span style={{ color:'var(--text3)' }}>·</span>
          <span style={{ color:'var(--brand)', fontWeight:800 }}>
            {selectedFare ? fmtRs(selectedFare.totalFare) : `~${eta.rideInfo.duration_min} min`}
          </span>
        </div>
      )}

      {/* Safety bar */}
      {isActive && ride && (
        <div style={{ position:'absolute', top:'calc(env(safe-area-inset-top,0px) + 66px)', left:0, right:0, zIndex:25 }}>
          <SafetyBar rideId={ride.id} userId={profile.id} role="passenger" gps={gps} onReport={() => setShowReport(true)} />
        </div>
      )}

      {/* Demo badge */}
      {demoActive && (
        <div style={{ position:'absolute', top:'calc(env(safe-area-inset-top,0px) + 72px)', left:'50%', transform:'translateX(-50%)', zIndex:25, background:'rgba(0,0,0,0.82)', color:'#fff', borderRadius:20, padding:'6px 16px', fontSize:12, fontWeight:700, backdropFilter:'blur(12px)', display:'flex', alignItems:'center', gap:8, whiteSpace:'nowrap', boxShadow:'0 4px 12px rgba(0,0,0,0.3)' }}>
          <span style={{ width:8, height:8, borderRadius:'50%', background:'#22C55E', display:'inline-block', animation:'pulse 1.2s ease infinite' }} />
          {demoPhase==='arrived' ? '🛵 DEMO · Captain arrived!' 
            : demoPhase==='riding' ? '🛵 DEMO · Ride in progress...'
            : demoPhase==='completed' ? '✅ DEMO · Ride completed!'
            : '🛵 DEMO · Captain is on the way...'}
          <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
        </div>
      )}

      {/* Bottom overlay */}
      <div style={{ position:'absolute', bottom:0, left:0, right:0, zIndex:20 }}>
        {rideState==='idle' && !pickup && !drop && (
          <div style={{ padding:'0 14px 8px' }}>
            <button onClick={() => setLocMode('drop')} style={{ width:'100%', display:'flex', alignItems:'center', gap:10, background:'rgba(255,255,255,0.97)', backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)', borderRadius:28, padding:'13px 18px', border:'none', cursor:'pointer', boxShadow:'0 4px 20px rgba(0,0,0,0.15)', fontSize:15, color:'var(--text3)', fontFamily:'inherit' }}>
              <svg width="17" height="17" fill="none" stroke="var(--text3)" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              Where are you going?
            </button>
          </div>
        )}

        <div className="sheet" style={{ borderRadius:'22px 22px 0 0', maxHeight:sheetH, overflowY:'auto', padding:'8px 0 0', paddingBottom:`calc(16px + var(--safe-bottom))`, boxShadow:'0 -8px 32px rgba(0,0,0,0.12)' }}>
          <div className="sheet-handle" />

          {/* IDLE */}
          {rideState==='idle' && (
            <div className="anim-up" style={{ padding:'0 14px 14px' }}>
              <div className="loc-box" style={{ marginBottom:10 }}>
                <div className="loc-row" onClick={() => setLocMode('pickup')}>
                  <div className="dot-pickup" />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div className="t-tiny t-dim" style={{ marginBottom:1, textTransform:'uppercase' }}>Pickup</div>
                    <div className="t-h3" style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:pickup?'var(--text)':'var(--text3)' }}>{pickup?.short||'Set pickup location'}</div>
                  </div>
                </div>
                <div style={{ height:1, background:'var(--border)', margin:'0 14px' }} />
                <div className="loc-row" onClick={() => setLocMode('drop')}>
                  <div className="dot-drop" />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div className="t-tiny t-dim" style={{ marginBottom:1, textTransform:'uppercase' }}>Drop</div>
                    <div className="t-h3" style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:drop?'var(--text)':'var(--brand)', fontWeight:drop?600:700 }}>{drop?.short||'Where to?'}</div>
                  </div>
                </div>
              </div>

              {distErr && (
                <div style={{ background:'#FFF7ED', border:'1px solid #FED7AA', borderRadius:12, padding:'11px 14px', marginBottom:10, display:'flex', gap:10, fontSize:13, color:'#92400E', lineHeight:1.5 }}>
                  <span>😕</span><span>{distErr}</span>
                </div>
              )}

              {pickup && drop && !distErr && (
                <ETAPanel eta={eta} selectedId={selVehicle} onSelectVehicle={setSelV} nearbyByType={eta?.nearbyByType} style={{ marginBottom:10 }} />
              )}

              {selectedFare && !distErr && (
                <>
                  <div style={{ display:'flex', gap:8, marginBottom:10 }}>
                    {['cash','upi'].map(m => (
                      <button key={m} onClick={() => setPay(m)} style={{ flex:1, padding:'10px', borderRadius:12, border:`2px solid ${payMethod===m?'var(--brand)':'var(--border)'}`, background:payMethod===m?'var(--brand-light)':'#fff', color:payMethod===m?'var(--brand-text)':'var(--text2)', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s' }}>
                        {m==='cash'?'Cash':'UPI'}
                      </button>
                    ))}
                  </div>
                  <button className="btn btn-primary" onClick={bookRide} disabled={loading}>
                    {loading ? <span className="spinner-sm" /> : `Book ${selectedFare.vehicleName} · ${fmtRs(selectedFare.totalFare)} ->`}
                  </button>
                </>
              )}

              {pickup && !drop && !eta && (
                <button className="btn btn-primary" onClick={() => setLocMode('drop')}>Where to? -></button>
              )}
              {!pickup && (
                <button className="btn btn-primary" onClick={() => setLocMode('pickup')}>Set Pickup -></button>
              )}

              <button onClick={startDemo} style={{ width:'100%', marginTop:10, padding:'11px', borderRadius:12, border:`1.5px dashed ${demoActive?'var(--green)':'var(--border2)'}`, background:demoActive?'var(--green-dim)':'transparent', color:demoActive?'var(--green)':'var(--text3)', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:8, transition:'all 0.2s' }}>
                {demoActive ? 'Stop Demo' : 'Preview Demo Ride'}
              </button>
            </div>
          )}

          {/* SEARCHING — Rapido-style radar animation */}
          {rideState==='searching' && (
            <div className="anim-up" style={{ padding:'16px 16px 14px' }}>
              <style>{`
                @keyframes radarPing{0%{transform:scale(0.4);opacity:0.9}100%{transform:scale(2.8);opacity:0}}
                @keyframes radarSpin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
                @keyframes dotPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.4;transform:scale(0.7)}}
              `}</style>
              {/* Radar animation */}
              <div style={{ display:'flex', justifyContent:'center', marginBottom:14 }}>
                <div style={{ position:'relative', width:80, height:80 }}>
                  {/* Ping rings */}
                  {[0,0.4,0.8].map(d => (
                    <div key={d} style={{ position:'absolute', inset:0, borderRadius:'50%', border:'2px solid var(--brand)', animation:`radarPing 1.8s ease-out ${d}s infinite`, opacity:0 }} />
                  ))}
                  {/* Center scooter */}
                  <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <div style={{ width:46, height:46, borderRadius:'50%', background:'linear-gradient(135deg,#FF5F1F,#FF8C00)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, boxShadow:'0 4px 16px rgba(255,95,31,0.4)' }}>🛵</div>
                  </div>
                  {/* Rotating sweep */}
                  <div style={{ position:'absolute', inset:0, borderRadius:'50%', border:'2px solid transparent', borderTopColor:'rgba(255,95,31,0.6)', animation:'radarSpin 1.2s linear infinite' }} />
                </div>
              </div>
              {/* Status text */}
              <div style={{ textAlign:'center', marginBottom:12 }}>
                <div style={{ fontWeight:800, fontSize:17, marginBottom:4 }}>Finding captain...</div>
                <div style={{ fontSize:13, color:'var(--text3)', lineHeight:1.5, minHeight:20 }}>
                  {dispatchMsg || 'Scanning nearby captains...'}
                </div>
              </div>
              {/* Animated dots */}
              <div style={{ display:'flex', justifyContent:'center', gap:6, marginBottom:14 }}>
                {[0,0.2,0.4].map(d => (
                  <div key={d} style={{ width:7, height:7, borderRadius:'50%', background:'var(--brand)', animation:`dotPulse 1.2s ease ${d}s infinite` }} />
                ))}
              </div>
              {/* Ride summary */}
              <div style={{ background:'var(--bg2)', borderRadius:14, padding:'12px 14px', marginBottom:12 }}>
                {[{l:'📍 Pickup',v:pickup?.short},{l:'🎯 Drop',v:drop?.short},{l:'💰 Fare',v:ride?.fare?fmtRs(ride.fare):'—'}].map(r => (
                  <div key={r.l} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 0', borderBottom:'1px solid var(--border)' }}>
                    <span style={{ fontSize:12, color:'var(--text3)', fontWeight:600 }}>{r.l}</span>
                    <span style={{ fontSize:13, fontWeight:700, maxWidth:'60%', textAlign:'right', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.v}</span>
                  </div>
                ))}
              </div>
              <button className="btn btn-outline" style={{ color:'var(--red)', borderColor:'rgba(220,38,38,0.3)', width:'100%' }} onClick={openCancelModal}>
                Cancel Ride
              </button>
            </div>
          )}

          {/* MATCHED */}
          {rideState==='matched' && driver && (
            <div className="anim-up" style={{ padding:'10px 16px 16px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
                {driver.profile_photo_url
                  ? <img src={driver.profile_photo_url} alt="" style={{ width:52, height:52, borderRadius:'50%', objectFit:'cover', flexShrink:0 }} />
                  : <div style={{ width:52, height:52, borderRadius:'50%', background:'linear-gradient(135deg,#FF5F1F,#FF8C00)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:18, color:'#fff', flexShrink:0 }}>{driver.name?.slice(0,2).toUpperCase()}</div>
                }
                <div style={{ flex:1 }}>
                  <div className="t-h2">{driver.name}</div>
                  <div style={{ display:'flex', gap:3, alignItems:'center', marginTop:2 }}>
                    {[1,2,3,4,5].map(s => { const filled = s <= Math.round(driver.rating||5); return <StarIcon key={s} f={filled} /> })}
                    <span className="t-small t-muted" style={{ marginLeft:4 }}>{(driver.rating||5.0).toFixed(1)} · {driver.total_rides||0} rides</span>
                  </div>
                </div>
                <div className="badge badge-green">On way</div>
              </div>
              <div style={{ background:'var(--bg2)', borderRadius:14, padding:'12px 14px', marginBottom:12 }}>
                {[{l:'Vehicle',v:driver.vehicle_model},{l:'Plate',v:driver.vehicle_number,mono:true},{l:'Fare',v:fmtRs(ride?.fare||0),brand:true}].map(r => (
                  <div key={r.l} style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                    <span className="t-small t-muted">{r.l}</span>
                    <span style={{ fontWeight:800, color:r.brand?'var(--brand)':r.mono?'var(--brand)':'var(--text)', letterSpacing:r.mono?'0.1em':'normal', fontSize:r.mono?15:14 }}>{r.v}</span>
                  </div>
                ))}
                {ride?.otp_code && (
                  <div style={{ background:'var(--brand)', borderRadius:10, padding:'12px 14px', textAlign:'center', marginTop:8 }}>
                    <div className="t-tiny" style={{ color:'rgba(255,255,255,0.75)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>Show OTP to driver</div>
                    <div style={{ fontFamily:"'Space Grotesk',sans-serif", fontWeight:900, fontSize:34, letterSpacing:'0.3em', color:'#fff' }}>{ride.otp_code}</div>
                  </div>
                )}
              </div>
              <div style={{ display:'flex', gap:8, marginBottom:10 }}>
                <button onClick={() => setShowChat(true)} className="btn btn-ghost btn-sm" style={{ flex:1, borderRadius:12, color:'var(--brand)' }}><ChatIcon /> Chat</button>
                <button className="btn btn-ghost btn-sm" style={{ flex:1, borderRadius:12 }} onClick={() => setShowChat(true)}><ChatIcon /> Chat</button>
                <a href={`https://wa.me/${driver.phone?.replace(/\D/g,'')}`} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm" style={{ flex:1, borderRadius:12, color:'#25D366' }}><WaIcon /></a>
              </div>
              <button className="btn btn-outline" style={{ color:'var(--red)', borderColor:'rgba(220,38,38,0.25)' }} onClick={openCancelModal}>Cancel Ride</button>
            </div>
          )}

          {/* TRACKING */}
          {rideState==='tracking' && (
            <div className="anim-up" style={{ padding:'10px 16px 16px' }}>
              <div className="badge badge-green" style={{ marginBottom:12 }}>Ride in progress</div>
              <div style={{ display:'flex', gap:8, marginBottom:12 }}>
                {[{l:'Total Fare',v:fmtRs(ride?.fare||0),c:'var(--brand)'},{l:'Distance',v:`${(ride?.distance_km||0).toFixed(1)} km`},{l:'Payment',v:payMethod==='cash'?'Cash':'UPI'}].map(s => (
                  <div key={s.l} style={{ flex:1, background:'var(--bg2)', borderRadius:12, padding:'10px 8px', textAlign:'center' }}>
                    <div style={{ fontWeight:800, fontSize:15, color:s.c||'var(--text)' }}>{s.v}</div>
                    <div className="t-tiny t-dim">{s.l}</div>
                  </div>
                ))}
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => setShowChat(true)} className="btn btn-ghost btn-sm" style={{ flex:1, borderRadius:12, color:'var(--brand)' }}><ChatIcon /> Chat with captain</button>
              </div>
            </div>
          )}

          {/* RATING */}
          {rideState==='rating' && (
            <div className="anim-up" style={{ padding:'10px 16px 16px', textAlign:'center' }}>
              <div style={{ fontSize:42, marginBottom:8 }}>🎉</div>
              <div className="t-h1" style={{ marginBottom:2 }}>Ride complete!</div>
              {driver && (
                <div style={{ fontSize:13, color:'var(--text3)', marginBottom:14 }}>
                  Rate your experience with <strong>{driver.name}</strong>
                </div>
              )}
              {/* Star rating */}
              <div style={{ display:'flex', justifyContent:'center', gap:8, marginBottom:6 }}>
                {[1,2,3,4,5].map(s => (
                  <button key={s} onClick={() => setRating(s)}
                    style={{ fontSize:38, background:'none', border:'none', cursor:'pointer', transform:s<=rating?'scale(1.15)':'scale(1)', transition:'transform 0.15s', padding:2 }}>
                    {s<=rating?'⭐':'☆'}
                  </button>
                ))}
              </div>
              <div style={{ fontSize:12, color:'var(--text3)', marginBottom:16, minHeight:16 }}>
                {rating===5?'Excellent! 🙌':rating===4?'Great ride! 👍':rating===3?'It was okay':rating===2?'Needs improvement':rating===1?'Poor experience':'Tap to rate'}
              </div>
              {/* Fare summary */}
              <div style={{ background:'var(--bg2)', borderRadius:14, padding:'12px 16px', marginBottom:14, textAlign:'left' }}>
                {[
                  {l:'Total fare', v:fmtRs(ride?.fare||0), c:'var(--brand)'},
                  {l:'Distance',   v:`${(ride?.distance_km||0).toFixed(1)} km`},
                  {l:'Payment',    v:payMethod==='cash'?'💵 Cash':'📱 UPI'},
                ].map(r => (
                  <div key={r.l} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 0', borderBottom:'1px solid var(--border)' }}>
                    <span style={{ fontSize:13, color:'var(--text3)' }}>{r.l}</span>
                    <span style={{ fontWeight:700, color:r.c||'var(--text)', fontSize:r.l==='Total fare'?16:13 }}>{r.v}</span>
                  </div>
                ))}
              </div>
              <button className="btn btn-primary" onClick={submitRating} disabled={!rating} style={{ marginBottom:8 }}>
                {rating ? `Submit ${rating}★ Rating →` : 'Tap stars to rate'}
              </button>
              <button onClick={() => submitRating(true)}
                style={{ width:'100%', padding:'10px', background:'none', border:'none', fontSize:13, color:'var(--text3)', cursor:'pointer', fontFamily:'inherit' }}>
                Skip rating
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
