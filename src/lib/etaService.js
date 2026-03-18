/* ================================================================
   JALDI CHALO — Driver Matching Engine v4.0
   ----------------------------------------------------------------
   Rapido-style automatic driver matching system

   MATCHING ALGORITHM:
   1. Passenger books → ride created with status 'searching_driver'
   2. Find all online+approved drivers within 3 km radius
   3. Score each driver:
      score = (0.55 × proximity) + (0.30 × rating) + (0.15 × acceptance)
   4. Sort by score (highest first), distance as tie-breaker
   5. Send request to driver #1 → wait 10 seconds
   6. Driver accepts → status = 'driver_assigned'
   7. Driver declines / timeout → try driver #2, #3...
   8. All candidates exhausted in 3km → expand to 5km, then 8km
   9. Truly no driver → status = 'no_driver_found'

   REALTIME (not polling):
   - waitForDriverResponse uses Supabase Realtime channel
   - Instant response — no 1.2s polling delay

   RIDE STATUS FLOW (DB):
   searching_driver → driver_assigned → ride_started → ride_completed
                   ↘ no_driver_found      ↘ cancelled
================================================================ */

import { supabase }     from './supabase'
import { getDistanceKm, getEtaMins, getOsrmRoute, getInstantEstimate } from './geo'
import { getAllFareOptions, instantFareEstimate } from './fareEngine'

/* -- Constants ----------------------------------------------- */
const RADIUS_TIERS     = [3, 5, 8]     // km — expand if no drivers found
const DRIVER_STALE_SEC = 15            // ignore drivers not updated in 15s
const DISPATCH_TIMEOUT = 10000         // ms per driver (10 seconds exactly)
const MAX_PER_TIER     = 10            // max candidates per radius tier
const AVG_SPEED_KMPH   = { bike:28, auto:22, cab:20, 'cab-ac':20, default:22 }

/* -- Ride status constants (matches DB) ----------------------- */
export const RIDE_STATUS = {
  SEARCHING:    'searching_driver',
  ASSIGNED:     'driver_assigned',
  ARRIVED:      'driver_arrived',
  OTP_VERIFIED: 'otp_verified',
  STARTED:      'ride_started',
  COMPLETED:    'ride_completed',
  CANCELLED:    'cancelled',
  NO_DRIVER:    'no_driver_found',
}

/* ================================================================
   HAVERSINE DISTANCE (fast, pure JS, no imports needed)
================================================================ */
function haversineKm(lat1, lng1, lat2, lng2) {
  const R    = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a    =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/* ================================================================
   STEP 1 — Find nearby drivers within a radius tier
   Strategy: SQL RPC (indexed, fast) → JS bounding-box fallback
================================================================ */
async function findDriversInRadius(pickupLat, pickupLng, radiusKm, vehicleType, excludeIds = []) {
  let drivers = []

  /* Strategy A: SQL RPC with Haversine in Postgres */
  try {
    const { data, error } = await supabase.rpc('find_nearby_drivers', {
      p_lat:          pickupLat,
      p_lng:          pickupLng,
      p_radius:       radiusKm,
      p_limit:        MAX_PER_TIER,
      p_vehicle_type: vehicleType || null,
    })
    if (!error && data?.length) {
      drivers = data.map(d => ({
        ...d,
        distKm:          parseFloat(d.dist_km),
        rating:          parseFloat(d.rating || 4.5),
        acceptance_rate: parseFloat(d.acceptance_rate || 80),
      }))
    }
  } catch { /* fall through to JS strategy */ }

  /* Strategy B: JS bounding-box + haversine filter */
  if (!drivers.length) {
    try {
      const cutoff  = new Date(Date.now() - DRIVER_STALE_SEC * 1000).toISOString()
      const latD    = radiusKm / 111
      const lngD    = radiusKm / (111 * Math.cos(pickupLat * Math.PI / 180))

      let q = supabase.from('drivers')
        .select('id,name,phone,vehicle_type,vehicle_model,vehicle_number,rating,acceptance_rate,current_lat,current_lng,last_seen,profile_photo_url,status')
        .eq('is_online', true)
        .ilike('status', 'approved')
        .gte('current_lat', pickupLat - latD)
        .lte('current_lat', pickupLat + latD)
        .gte('current_lng', pickupLng - lngD)
        .lte('current_lng', pickupLng + lngD)
        .gte('last_seen', cutoff)
        .limit(MAX_PER_TIER * 2)

      if (vehicleType) q = q.eq('vehicle_type', vehicleType)

      const { data } = await q
      if (data?.length) {
        drivers = data
          .map(d => ({
            ...d,
            distKm:          haversineKm(pickupLat, pickupLng, d.current_lat, d.current_lng),
            rating:          parseFloat(d.rating || 4.5),
            acceptance_rate: parseFloat(d.acceptance_rate || 80),
          }))
          .filter(d => d.distKm <= radiusKm)
      }
    } catch { /* no drivers */ }
  }

  /* Filter out already-tried drivers and sort by score */
  return scoreAndRank(
    drivers.filter(d => !excludeIds.includes(d.id)),
    radiusKm
  ).slice(0, MAX_PER_TIER)
}

/* ================================================================
   STEP 2 — Score drivers (Rapido's published weighted formula)
================================================================ */
function scoreAndRank(drivers, maxRadius) {
  return drivers
    .map(d => {
      const proximity   = Math.max(0, 1 - (d.distKm / maxRadius))    // 0-1, closer=higher
      const ratingS     = Math.min(1, (d.rating || 4.5) / 5.0)       // 0-1
      const acceptanceS = Math.min(1, (d.acceptance_rate || 80) / 100) // 0-1

      const score = (0.55 * proximity) + (0.30 * ratingS) + (0.15 * acceptanceS)
      return { ...d, score: +score.toFixed(4) }
    })
    .sort((a, b) =>
      // Primary: score descending
      Math.abs(b.score - a.score) > 0.01
        ? b.score - a.score
        // Tie-break: distance ascending
        : a.distKm - b.distKm
    )
}

/* ================================================================
   STEP 3 — Wait for driver response using Realtime (not polling)
   Returns: 'accepted' | 'declined' | 'timeout' | 'cancelled'
================================================================ */
function waitForDriverResponse(rideId, driverId, timeoutMs) {
  return new Promise(resolve => {
    let resolved = false
    const timer  = setTimeout(() => { if (!resolved) { resolved = true; cleanup(); resolve('timeout') } }, timeoutMs)

    const ch = supabase.channel(`dispatch-${rideId}-${driverId}`)
      .on('postgres_changes', {
        event:  'UPDATE',
        schema: 'public',
        table:  'rides',
        filter: `id=eq.${rideId}`,
      }, ({ new: row }) => {
        if (resolved) return
        if (row.ride_status === RIDE_STATUS.ASSIGNED && row.driver_id === driverId) {
          resolved = true; cleanup(); resolve('accepted')
        } else if (row.ride_status === RIDE_STATUS.CANCELLED) {
          resolved = true; cleanup(); resolve('cancelled')
        } else if (row.driver_id !== driverId && row.ride_status === RIDE_STATUS.SEARCHING) {
          // Driver reset ride back (declined)
          resolved = true; cleanup(); resolve('declined')
        }
      })
      .subscribe()

    function cleanup() {
      clearTimeout(timer)
      supabase.removeChannel(ch)
    }
  })
}

/* ================================================================
   MAIN DISPATCH ENGINE
   Called after ride is created in DB.
   Tries drivers tier by tier (3km → 5km → 8km).
================================================================ */
export async function dispatchRide(rideId, pickupLat, pickupLng, vehicleType, onStatusUpdate) {
  const triedDriverIds = new Set()

  for (const radius of RADIUS_TIERS) {
    const candidates = await findDriversInRadius(
      pickupLat, pickupLng, radius, vehicleType,
      Array.from(triedDriverIds)
    )

    if (!candidates.length) {
      onStatusUpdate({ status: 'searching', radius, found: 0 })
      continue  // try next radius tier
    }

    onStatusUpdate({ status: 'searching', radius, found: candidates.length })

    for (const driver of candidates) {
      triedDriverIds.add(driver.id)

      /* Offer ride to this driver */
      const { error: assignErr } = await supabase.from('rides')
        .update({
          driver_id:   driver.id,
          ride_status: 'requested',  // internal: driver sees 'requested'
        })
        .eq('id', rideId)
        .in('ride_status', [RIDE_STATUS.SEARCHING, 'searching'])

      if (assignErr) {
        // Ride might have been cancelled or already assigned — stop
        const { data: current } = await supabase.from('rides').select('ride_status').eq('id', rideId).single()
        if (current?.ride_status === RIDE_STATUS.CANCELLED) { onStatusUpdate({ status: 'cancelled' }); return }
        continue
      }

      onStatusUpdate({ status: 'offering', driver, radius, triedCount: triedDriverIds.size })

      /* Wait for response (Realtime, not polling) */
      const result = await waitForDriverResponse(rideId, driver.id, DISPATCH_TIMEOUT)

      if (result === 'accepted') {
        /* Update acceptance rate */
        supabase.rpc('update_driver_acceptance', { p_driver_id: driver.id, p_accepted: true }).catch(() => {})
        onStatusUpdate({ status: 'accepted', driver })
        return
      }

      if (result === 'cancelled') {
        onStatusUpdate({ status: 'cancelled' })
        return
      }

      /* Timeout or declined — reset ride, try next driver */
      supabase.rpc('update_driver_acceptance', { p_driver_id: driver.id, p_accepted: false }).catch(() => {})
      await supabase.from('rides')
        .update({ driver_id: null, ride_status: RIDE_STATUS.SEARCHING })
        .eq('id', rideId)
        .eq('driver_id', driver.id)

      onStatusUpdate({ status: result === 'timeout' ? 'timeout' : 'declined', driver })
    }
  }

  /* All tiers exhausted */
  await supabase.from('rides')
    .update({ ride_status: RIDE_STATUS.NO_DRIVER })
    .eq('id', rideId)
    .in('ride_status', [RIDE_STATUS.SEARCHING, 'searching'])

  onStatusUpdate({ status: 'no_drivers' })
}

/* ================================================================
   ETA ORCHESTRATOR (for booking screen fare display)
   Phase 1 (<5ms)   : Instant haversine → show fares immediately
   Phase 2 (~200ms) : Find nearby drivers → show ETA per vehicle type
   Phase 3 (~600ms) : OSRM road route → accurate fare + driver ETA
================================================================ */
export async function computeETA({ pickup, drop }, onUpdate, signal) {
  if (!pickup || !drop) return
  const t0 = performance.now()

  /* Phase 1: Instant */
  const straight    = haversineKm(pickup.lat, pickup.lng, drop.lat, drop.lng)
  const instantFares = instantFareEstimate(straight)
  const instant      = getInstantEstimate(pickup.lat, pickup.lng, drop.lat, drop.lng)

  onUpdate({
    phase: 'instant',
    rideInfo:      { ...instant, loading: true },
    fareOptions:   instantFares,
    driverInfo:    null,
    nearbyByType:  null,
    loadingRide:   true,
    loadingDriver: true,
    elapsed:       Math.round(performance.now() - t0),
  })

  if (signal?.aborted) return

  /* Phase 2+3 in parallel */
  const [driversResult, rideRouteResult] = await Promise.allSettled([
    findAllVehicleTypes(pickup.lat, pickup.lng),
    getOsrmRoute(pickup.lat, pickup.lng, drop.lat, drop.lng, signal),
  ])

  if (signal?.aborted) return

  const nearbyByType = driversResult.status === 'fulfilled' ? driversResult.value : {}
  const rideRoute    = rideRouteResult.status === 'fulfilled' ? rideRouteResult.value : null
  const finalRide    = rideRoute || instant
  const refinedFares = getAllFareOptions(finalRide.distance_km, finalRide.duration_min)

  /* Find best overall driver across all types */
  const allDrivers = Object.values(nearbyByType).filter(Boolean)
  const bestDriver = allDrivers.length
    ? allDrivers.reduce((best, d) => (!best || d.score > best.score) ? d : best, null)
    : null

  if (!bestDriver) {
    /* Use demo drivers when no real drivers online */
    const demos       = generateDemoDrivers(pickup.lat, pickup.lng)
    const demoByType  = buildDemoNearbyByType(pickup.lat, pickup.lng)
    const bestDemo    = demos[0]

    onUpdate({
      phase:         'complete',
      rideInfo:      { distance_km: finalRide.distance_km, duration_min: finalRide.duration_min, source: finalRide.source, loading: false },
      fareOptions:   refinedFares,
      driverInfo:    {
        driver:      bestDemo,
        distanceKm:  bestDemo.distKm,
        etaMins:     getEtaMins(bestDemo.distKm, AVG_SPEED_KMPH[bestDemo.vehicle_type] || 22),
        source:      'demo',
        isDemo:      true,
        available:   true,
        score:       bestDemo.score,
      },
      nearbyByType:  demoByType,
      loadingRide:   false,
      loadingDriver: false,
      elapsed:       Math.round(performance.now() - t0),
    })
    return
  }

  /* Show intermediate result with haversine ETA */
  onUpdate({
    phase:       'drivers_found',
    rideInfo:    { distance_km: finalRide.distance_km, duration_min: finalRide.duration_min, source: finalRide.source, loading: false },
    fareOptions: refinedFares,
    driverInfo:  {
      driver:     bestDriver,
      distanceKm: bestDriver.distKm,
      etaMins:    getEtaMins(bestDriver.distKm, AVG_SPEED_KMPH[bestDriver.vehicle_type] || 22),
      source:     'haversine',
      isDemo:     false,
      available:  true,
      score:      bestDriver.score,
    },
    nearbyByType,
    loadingRide:   false,
    loadingDriver: false,
    elapsed:       Math.round(performance.now() - t0),
  })

  if (signal?.aborted) return

  /* Phase 3: Refine driver ETA with OSRM road route */
  const roadEta = await getOsrmRoute(
    bestDriver.current_lat, bestDriver.current_lng,
    pickup.lat, pickup.lng, signal
  ).catch(() => null)

  if (signal?.aborted) return

  const eta = roadEta
    ? { distanceKm: roadEta.distance_km, etaMins: roadEta.duration_min, source: 'osrm' }
    : { distanceKm: bestDriver.distKm, etaMins: getEtaMins(bestDriver.distKm, AVG_SPEED_KMPH[bestDriver.vehicle_type] || 22), source: 'haversine' }

  onUpdate({
    phase:       'complete',
    rideInfo:    { distance_km: finalRide.distance_km, duration_min: finalRide.duration_min, source: finalRide.source, loading: false },
    fareOptions: refinedFares,
    driverInfo:  { driver: bestDriver, distanceKm: eta.distanceKm, etaMins: eta.etaMins, source: eta.source, isDemo: false, available: true, score: bestDriver.score },
    nearbyByType,
    loadingRide:   false,
    loadingDriver: false,
    elapsed:       Math.round(performance.now() - t0),
  })
}

/* Find best driver for each vehicle type simultaneously */
async function findAllVehicleTypes(lat, lng) {
  const types   = ['bike', 'auto', 'cab', 'cab-ac']
  const results = await Promise.allSettled(
    types.map(vt => findDriversInRadius(lat, lng, RADIUS_TIERS[0], vt))
  )
  const out = {}
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value?.length) out[types[i]] = r.value[0]
  })
  return out
}

/* ================================================================
   REALTIME — Nearby driver dots for map
================================================================ */
export function subscribeToNearbyDrivers(pickupLat, pickupLng, onUpdate) {
  const nearby = new Map()

  const channel = supabase.channel(`nearby-${Math.round(pickupLat * 1000)}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'drivers' },
      ({ new: d }) => {
        if (!d.is_online || d.status?.toLowerCase() !== 'approved' || !d.current_lat) {
          nearby.delete(d.id)
        } else {
          const dist = haversineKm(pickupLat, pickupLng, d.current_lat, d.current_lng)
          if (dist <= RADIUS_TIERS[1]) {   // show up to 5km for map dots
            nearby.set(d.id, { lat: d.current_lat, lng: d.current_lng, dist, ts: Date.now() })
          } else {
            nearby.delete(d.id)
          }
        }
        // Purge stale
        const now = Date.now()
        for (const [id, v] of nearby) { if (now - v.ts > 30000) nearby.delete(id) }
        onUpdate(Array.from(nearby.values()).map(v => [v.lat, v.lng]))
      })
    .subscribe()

  return () => supabase.removeChannel(channel)
}

/* ================================================================
   DRIVER LOCATION PUSH (DriverHome calls every 2s)
================================================================ */
export async function updateDriverLocation(driverId, lat, lng) {
  return supabase.from('drivers').update({
    current_lat: lat,
    current_lng: lng,
    last_seen:   new Date().toISOString(),
  }).eq('id', driverId)
}

/* ================================================================
   DEMO DRIVERS (shown when no real drivers online)
================================================================ */
function seededRand(seed) {
  let s = seed
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646 }
}

function generateDemoDrivers(lat, lng) {
  const rng  = seededRand(88888 + Math.floor(lat * 1000))
  const pool = [
    { type:'bike',   model:'Honda Activa 6G',   name:'Rahul K.' },
    { type:'bike',   model:'TVS Jupiter',        name:'Suresh M.' },
    { type:'auto',   model:'Bajaj RE Auto',      name:'Arun P.' },
    { type:'auto',   model:'Piaggio Ape City',   name:'Deepak S.' },
    { type:'cab',    model:'Maruti Swift DZire',  name:'Priya R.' },
    { type:'cab-ac', model:'Hyundai Xcent',      name:'Kiran B.' },
    { type:'bike',   model:'Honda Dio',          name:'Anjali T.' },
    { type:'cab',    model:'Toyota Etios',       name:'Vijay N.' },
  ]
  return pool.map((p, i) => {
    const angle  = rng() * 2 * Math.PI
    const dist   = 0.5 + rng() * 2.5   // within 3km for demo
    const latOff = (dist / 111) * Math.cos(angle)
    const lngOff = (dist / (111 * Math.cos(lat * Math.PI / 180))) * Math.sin(angle)
    const rating = +(4.1 + rng() * 0.9).toFixed(1)
    const ar     = +(78 + rng() * 20).toFixed(0)
    const prox   = Math.max(0, 1 - dist / RADIUS_TIERS[0])
    const score  = +(0.55 * prox + 0.30 * rating/5 + 0.15 * ar/100).toFixed(4)
    return {
      id:              `demo_${i}`,
      name:            p.name,
      vehicle_type:    p.type,
      vehicle_model:   p.model,
      rating,
      acceptance_rate: ar,
      current_lat:     +(lat + latOff).toFixed(6),
      current_lng:     +(lng + lngOff).toFixed(6),
      distKm:          +dist.toFixed(2),
      score,
      isDemo:          true,
    }
  }).sort((a, b) => b.score - a.score)
}

function buildDemoNearbyByType(lat, lng) {
  const demos = generateDemoDrivers(lat, lng)
  const out   = {}
  for (const d of demos) { if (!out[d.vehicle_type]) out[d.vehicle_type] = d }
  return out
}

/* Legacy export aliases */
export { findDriversInRadius as findScoredDrivers }
