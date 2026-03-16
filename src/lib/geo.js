/* ================================================================
   GEO + ROUTING — Jaldi Chalo
   India-only geocoding with smart caching + fallbacks
================================================================ */

const PHOTON = 'https://photon.komoot.io'
const NOM    = 'https://nominatim.openstreetmap.org'
const OSRM   = 'https://router.project-osrm.org/route/v1/driving'

// India bounding box — filters out non-India results
const INDIA_BBOX = { minLat:6.4, maxLat:35.7, minLng:68.1, maxLng:97.4 }

// Search result cache — avoid re-fetching same query
const searchCache = new Map()
const routeCache  = new Map()
const GEO_CACHE_TTL  = 5 * 60 * 1000   // 5 minutes
const ROUTE_CACHE_TTL = 10 * 60 * 1000  // 10 minutes

function isInIndia(lat, lng) {
  return lat >= INDIA_BBOX.minLat && lat <= INDIA_BBOX.maxLat &&
         lng >= INDIA_BBOX.minLng && lng <= INDIA_BBOX.maxLng
}

export { getAllFareOptions as getFareOptions, instantFareEstimate } from './fareEngine'

/* -- Search Places (India-only, cached) ----------------------- */
export async function searchPlaces(query, biasLat, biasLng) {
  if (!query || query.length < 2) return []

  const bLat = biasLat || 22.5726
  const bLng = biasLng || 88.3639
  const cacheKey = `${query.toLowerCase()}|${bLat.toFixed(2)}|${bLng.toFixed(2)}`

  // Cache hit
  const cached = searchCache.get(cacheKey)
  if (cached && Date.now() - cached.ts < GEO_CACHE_TTL) return cached.results

  let results = []

  /* Strategy 1: Photon with India bbox */
  try {
    const url = `${PHOTON}/api/?q=${encodeURIComponent(query)}&limit=10&lang=en` +
      `&lat=${bLat}&lon=${bLng}` +
      `&bbox=${INDIA_BBOX.minLng},${INDIA_BBOX.minLat},${INDIA_BBOX.maxLng},${INDIA_BBOX.maxLat}`
    const r = await fetch(url, {
      headers: { 'User-Agent': 'JaldiChaloApp/3.0' },
      signal: AbortSignal.timeout(5000),
    })
    const data = await r.json()
    const features = (data?.features || [])
      .filter(f => {
        const [lng, lat] = f.geometry?.coordinates || [0,0]
        return isInIndia(lat, lng)
      })

    if (features.length > 0) {
      results = features.map(f => {
        const p = f.properties
        const [lng, lat] = f.geometry.coordinates
        const parts = [
          p.name,
          p.street,
          p.locality || p.suburb || p.district || p.neighbourhood,
          p.city || p.county || p.state,
          p.country,
        ].filter(Boolean)
        return {
          id:     `ph_${lng.toFixed(4)}_${lat.toFixed(4)}`,
          label:  parts.join(', '),
          short:  (p.name || parts[0] || query).trim(),
          sublabel: parts.slice(1, 3).join(', '),
          lat, lng,
          source: 'photon',
        }
      })
    }
  } catch {}

  /* Strategy 2: Nominatim India-only fallback */
  if (results.length < 2) {
    try {
      const url = `${NOM}/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1` +
        `&limit=8&countrycodes=in&viewbox=${INDIA_BBOX.minLng},${INDIA_BBOX.maxLat},${INDIA_BBOX.maxLng},${INDIA_BBOX.minLat}` +
        `&bounded=1&accept-language=en`
      const r = await fetch(url, {
        headers: { 'Accept-Language': 'en', 'User-Agent': 'JaldiChaloApp/3.0' },
        signal: AbortSignal.timeout(7000),
      })
      const data = await r.json()
      const nom = data
        .filter(p => isInIndia(parseFloat(p.lat), parseFloat(p.lon)))
        .map(p => {
          const a = p.address || {}
          const short = a.road || a.suburb || a.neighbourhood || a.village || a.town || a.city || p.display_name.split(',')[0]
          const sub   = [a.suburb || a.neighbourhood, a.city || a.state_district].filter(Boolean).join(', ')
          return {
            id:     `nom_${p.place_id}`,
            label:  p.display_name,
            short:  short.trim(),
            sublabel: sub,
            lat:    parseFloat(p.lat),
            lng:    parseFloat(p.lon),
            source: 'nominatim',
          }
        })
      // Merge: nom results for things photon missed
      const existingCoords = new Set(results.map(r => `${r.lat.toFixed(3)},${r.lng.toFixed(3)}`))
      nom.forEach(n => {
        if (!existingCoords.has(`${n.lat.toFixed(3)},${n.lng.toFixed(3)}`)) results.push(n)
      })
    } catch {}
  }

  /* Deduplicate and sort by distance from bias point */
  results = deduplicateResults(results)
  results.sort((a, b) => {
    const dA = Math.hypot(a.lat - bLat, a.lng - bLng)
    const dB = Math.hypot(b.lat - bLat, b.lng - bLng)
    return dA - dB
  })
  results = results.slice(0, 8)

  searchCache.set(cacheKey, { results, ts: Date.now() })
  return results
}

function deduplicateResults(arr) {
  const seen = new Map()
  return arr.filter(r => {
    const key = `${r.lat.toFixed(3)},${r.lng.toFixed(3)}`
    if (seen.has(key)) return false
    seen.set(key, true)
    return true
  })
}

/* -- Reverse Geocode (cached) --------------------------------- */
const revCache = new Map()
export async function reverseGeocode(lat, lng) {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`
  const c = revCache.get(key)
  if (c && Date.now() - c.ts < GEO_CACHE_TTL * 2) return c.addr

  async function doReverse() {
    // Nominatim primary for reverse
    try {
      const r = await fetch(
        `${NOM}/reverse?lat=${lat}&lon=${lng}&format=json&zoom=17&addressdetails=1&accept-language=en`,
        { headers: { 'Accept-Language': 'en', 'User-Agent': 'JaldiChaloApp/3.0' }, signal: AbortSignal.timeout(5000) }
      )
      const d = await r.json()
      const a = d.address || {}
      const parts = [
        a.road || a.pedestrian || a.footway || a.residential,
        a.neighbourhood || a.suburb || a.village || a.town,
        a.city || a.state_district,
      ].filter(Boolean)
      if (parts.length >= 1) return parts.slice(0, 2).join(', ')
    } catch {}

    // Photon fallback
    try {
      const r = await fetch(`${PHOTON}/reverse?lat=${lat}&lon=${lng}&limit=1`,
        { headers: { 'User-Agent': 'JaldiChaloApp/3.0' }, signal: AbortSignal.timeout(4000) })
      const d = await r.json()
      const f = d?.features?.[0]?.properties
      if (f) return [f.name, f.locality || f.suburb, f.city].filter(Boolean).slice(0,2).join(', ')
    } catch {}

    return 'Current Location'
  }

  const addr = await doReverse()
  revCache.set(key, { addr, ts: Date.now() })
  return addr
}

/* -- Math ----------------------------------------------------- */
const toRad = d => d * Math.PI / 180

export function getDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

export function getEtaMins(distKm, speedKmh = 22) {
  return Math.max(2, Math.round((distKm / speedKmh) * 60))
}

/* -- OSRM Routing (cached, with fast fallback) ---------------- */
export async function getOsrmRoute(fromLat, fromLng, toLat, toLng, signal) {
  const key = `${fromLat.toFixed(4)},${fromLng.toFixed(4)}-${toLat.toFixed(4)},${toLng.toFixed(4)}`
  const c = routeCache.get(key)
  if (c && Date.now() - c.ts < ROUTE_CACHE_TTL) return c.route

  // Instant haversine result — shown IMMEDIATELY
  const straight  = getDistanceKm(fromLat, fromLng, toLat, toLng)
  const estimated = { distance_km: +(straight*1.3).toFixed(2), duration_min: getEtaMins(straight*1.3), source:'haversine' }

  try {
    const url = `${OSRM}/${fromLng},${fromLat};${toLng},${toLat}?overview=false&steps=false`
    const res  = await fetch(url, { signal, headers: { 'User-Agent': 'JaldiChaloApp/3.0' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    if (data.code !== 'Ok' || !data.routes?.length) throw new Error('No route')
    const r = { distance_km: +(data.routes[0].distance/1000).toFixed(2), duration_min: Math.ceil(data.routes[0].duration/60), source:'osrm' }
    routeCache.set(key, { route: r, ts: Date.now() })
    return r
  } catch (e) {
    if (e?.name === 'AbortError' || e?.name === 'TimeoutError') return null
    return estimated
  }
}

export function getInstantEstimate(pickupLat, pickupLng, dropLat, dropLng) {
  const straight = getDistanceKm(pickupLat, pickupLng, dropLat, dropLng)
  const road = +(straight * 1.3).toFixed(2)
  return { distance_km: road, duration_min: getEtaMins(road), source:'instant' }
}

export function isRouteDeviation(curLat, curLng, fromLat, fromLng, toLat, toLng, threshKm = 1.5) {
  return _ptSegKm(curLat, curLng, fromLat, fromLng, toLat, toLng) > threshKm
}
function _ptSegKm(px, py, ax, ay, bx, by) {
  const dx = bx-ax, dy = by-ay, lenSq = dx*dx+dy*dy
  if (lenSq === 0) return getDistanceKm(px, py, ax, ay)
  const t = Math.max(0, Math.min(1, ((px-ax)*dx+(py-ay)*dy)/lenSq))
  return getDistanceKm(px, py, ax+t*dx, ay+t*dy)
}
