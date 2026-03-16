/* ===============================================================
   GEO + ROUTING  ·  Jaldi Chalo
   Geocoding:  Photon (primary) → Nominatim (fallback)
   Routing:    OSRM (free, no API key)
   Why Photon? 
   - No rate limiting for normal usage
   - Faster responses (< 200ms)
   - Better coverage for Indian cities, localities, police stations
   =============================================================== */

const PHOTON = 'https://photon.komoot.io'
const NOM    = 'https://nominatim.openstreetmap.org'
const OSRM   = 'https://router.project-osrm.org/route/v1/driving'

// Re-export fare helpers
export { getAllFareOptions as getFareOptions, instantFareEstimate } from './fareEngine'

/* --- GEOCODING ------------------------------------------------ */

/**
 * Search places — Photon primary, Nominatim fallback
 * Biased toward India, optimized for West Bengal / Kolkata region
 */
export async function searchPlaces(query, biasLat, biasLng) {
  if (!query || query.length < 2) return []

  // Try Photon first (faster, no rate limit)
  try {
    const bias = (biasLat && biasLng)
      ? `&lat=${biasLat}&lon=${biasLng}`
      : '&lat=22.5726&lon=88.3639'   // default bias: Kolkata
    const r = await fetch(
      `${PHOTON}/api/?q=${encodeURIComponent(query)}&limit=8&lang=en${bias}`,
      { headers: { 'User-Agent': 'JaldiChaloApp/2.0' }, signal: AbortSignal.timeout(4000) }
    )
    const data = await r.json()
    const features = data?.features || []
    if (features.length > 0) {
      return features.map(f => {
        const p = f.properties
        const coords = f.geometry?.coordinates || [0, 0]
        // Build readable short name
        const parts = [
          p.name,
          p.street,
          p.locality || p.suburb || p.district,
          p.city || p.state,
        ].filter(Boolean)
        return {
          id:    `ph_${coords[0]}_${coords[1]}`,
          label: parts.join(', '),
          short: parts.slice(0, 2).join(', ').trim() || p.name || query,
          lat:   coords[1],
          lng:   coords[0],
          source:'photon',
        }
      }).filter(p => p.lat && p.lng)
    }
  } catch {}

  // Fallback: Nominatim (slower but comprehensive)
  try {
    const r = await fetch(
      `${NOM}/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=7&countrycodes=in`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'JaldiChaloApp/2.0' }, signal: AbortSignal.timeout(6000) }
    )
    const data = await r.json()
    return data.map(p => {
      const parts = p.display_name.split(',')
      return {
        id:    `nom_${p.place_id}`,
        label: p.display_name,
        short: parts.slice(0, 3).join(',').trim(),
        lat:   parseFloat(p.lat),
        lng:   parseFloat(p.lon),
        source:'nominatim',
      }
    })
  } catch { return [] }
}

/**
 * Reverse geocode lat/lng → human-readable address
 * Photon primary, Nominatim fallback
 */
export async function reverseGeocode(lat, lng) {
  // Try Nominatim first for reverse (more detailed address)
  try {
    const r = await fetch(
      `${NOM}/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18&addressdetails=1`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'JaldiChaloApp/2.0' }, signal: AbortSignal.timeout(5000) }
    )
    const d = await r.json()
    const a = d.address || {}
    const parts = [
      a.road || a.pedestrian || a.footway,
      a.neighbourhood || a.suburb || a.village || a.town,
      a.city || a.state_district || a.county,
    ].filter(Boolean)
    if (parts.length >= 1) return parts.slice(0, 3).join(', ')
  } catch {}

  // Fallback: Photon reverse
  try {
    const r = await fetch(
      `${PHOTON}/reverse?lat=${lat}&lon=${lng}&limit=1`,
      { headers: { 'User-Agent': 'JaldiChaloApp/2.0' }, signal: AbortSignal.timeout(4000) }
    )
    const d = await r.json()
    const f = d?.features?.[0]?.properties
    if (f) {
      return [f.name, f.locality || f.suburb, f.city].filter(Boolean).join(', ')
    }
  } catch {}

  return 'Current Location'
}

/* --- MATH UTILITIES ------------------------------------------- */
const toRad = d => (d * Math.PI) / 180

/** Haversine straight-line distance in km */
export function getDistanceKm(lat1, lng1, lat2, lng2) {
  const R    = 6371
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a    =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** ETA estimate based on average city speed */
export function getEtaMins(distKm, speedKmh = 22) {
  return Math.max(2, Math.round((distKm / speedKmh) * 60))
}

/* --- OSRM ROUTING --------------------------------------------- */
export async function getOsrmRoute(fromLat, fromLng, toLat, toLng, signal) {
  try {
    const url = `${OSRM}/${fromLng},${fromLat};${toLng},${toLat}?overview=false&steps=false`
    const res  = await fetch(url, { signal, headers: { 'User-Agent': 'JaldiChaloApp/2.0' } })
    if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`)
    const data = await res.json()
    if (data.code !== 'Ok' || !data.routes?.length) throw new Error('No route')
    const route = data.routes[0]
    return {
      distance_km:  +(route.distance / 1000).toFixed(2),
      duration_min: Math.ceil(route.duration / 60),
      source:       'osrm',
    }
  } catch (e) {
    if (e?.name === 'AbortError' || e?.name === 'TimeoutError') return null
    const straight = getDistanceKm(fromLat, fromLng, toLat, toLng)
    const road     = +(straight * 1.3).toFixed(2)
    return { distance_km: road, duration_min: getEtaMins(road), source: 'haversine' }
  }
}

/** Phase 1 instant estimate (< 1ms, shown before OSRM responds) */
export function getInstantEstimate(pickupLat, pickupLng, dropLat, dropLng) {
  const straight = getDistanceKm(pickupLat, pickupLng, dropLat, dropLng)
  const road     = +(straight * 1.3).toFixed(2)
  return { distance_km: road, duration_min: getEtaMins(road), source: 'instant' }
}

/* --- ROUTE DEVIATION SAFETY CHECK ---------------------------- */
export function isRouteDeviation(curLat, curLng, fromLat, fromLng, toLat, toLng, threshKm = 1.5) {
  return _pointToSegmentKm(curLat, curLng, fromLat, fromLng, toLat, toLng) > threshKm
}

function _pointToSegmentKm(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return getDistanceKm(px, py, ax, ay)
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq))
  return getDistanceKm(px, py, ax + t * dx, ay + t * dy)
}
