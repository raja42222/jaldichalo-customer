/* ================================================================
   GEO + ROUTING — Jaldi Chalo v4.0
   
   SEARCH STRATEGY (West Bengal / India only):
   1. If query matches popular WB places → instant result (0ms)
   2. Photon API with WB bbox + India country filter
   3. Post-fetch: strict India bbox filter, sort by proximity
   4. Nominatim India-only fallback if Photon returns < 2 results
   5. All results deduped and sorted by distance from user GPS
================================================================ */

const PHOTON = 'https://photon.komoot.io'
const NOM    = 'https://nominatim.openstreetmap.org'
const OSRM   = 'https://router.project-osrm.org/route/v1/driving'

// Strict India bounding box — nothing outside this will be shown
const INDIA = { minLat:6.4, maxLat:35.7, minLng:68.1, maxLng:97.4 }

// West Bengal bounding box — tighter, used as search bias
const WB    = { minLat:21.5, maxLat:27.2, minLng:85.8, maxLng:89.9 }

// Default bias: Kolkata centre
const DEFAULT_LAT = 22.5726
const DEFAULT_LNG = 88.3639

// Caches
const searchCache = new Map()  // TTL: 5 min
const routeCache  = new Map()  // TTL: 10 min
const revCache    = new Map()  // TTL: 10 min
const GEO_TTL   = 5  * 60 * 1000
const ROUTE_TTL = 10 * 60 * 1000

// Popular WB places for instant match (no API call needed)
const WB_PLACES = [
  { id:'wb_howrah',     short:'Howrah Station',         sublabel:'Howrah, West Bengal',                    lat:22.5839, lng:88.3427 },
  { id:'wb_sealdah',    short:'Sealdah Station',         sublabel:'Sealdah, Kolkata',                       lat:22.5644, lng:88.3700 },
  { id:'wb_airport',    short:'Netaji Subhas Airport',   sublabel:'Dum Dum, Kolkata',                       lat:22.6547, lng:88.4467 },
  { id:'wb_parkst',     short:'Park Street',             sublabel:'Central Kolkata',                        lat:22.5510, lng:88.3515 },
  { id:'wb_saltlake5',  short:'Salt Lake Sector V',      sublabel:'Bidhannagar, Kolkata',                   lat:22.5706, lng:88.4342 },
  { id:'wb_esplanade',  short:'Esplanade',               sublabel:'Central Kolkata',                        lat:22.5641, lng:88.3516 },
  { id:'wb_newtown',    short:'New Town',                sublabel:'Rajarhat, Kolkata',                      lat:22.5976, lng:88.4801 },
  { id:'wb_dakshin',    short:'Dakshineswar Temple',     sublabel:'Dakshineswar, Kolkata',                  lat:22.6559, lng:88.3578 },
  { id:'wb_gariahat',   short:'Gariahat',                sublabel:'South Kolkata',                          lat:22.5184, lng:88.3714 },
  { id:'wb_behala',     short:'Behala',                  sublabel:'South Kolkata',                          lat:22.4997, lng:88.3116 },
  { id:'wb_barasat',    short:'Barasat',                 sublabel:'North 24 Parganas',                      lat:22.7208, lng:88.4799 },
  { id:'wb_dumdum',     short:'Dum Dum',                 sublabel:'North Kolkata',                          lat:22.6551, lng:88.3998 },
  { id:'wb_bally',      short:'Bally',                   sublabel:'Howrah, West Bengal',                    lat:22.5860, lng:88.3379 },
  { id:'wb_chandannagar',short:'Chandannagar',           sublabel:'Hooghly, West Bengal',                   lat:22.8600, lng:88.3700 },
  { id:'wb_serampore',  short:'Serampore',               sublabel:'Hooghly, West Bengal',                   lat:22.7500, lng:88.3400 },
  { id:'wb_hooghly',    short:'Hooghly',                 sublabel:'Hooghly, West Bengal',                   lat:22.9000, lng:88.3900 },
  { id:'wb_durgapur',   short:'Durgapur',                sublabel:'Paschim Bardhaman',                      lat:23.5204, lng:87.3119 },
  { id:'wb_asansol',    short:'Asansol',                 sublabel:'Paschim Bardhaman',                      lat:23.6833, lng:86.9667 },
  { id:'wb_siliguri',   short:'Siliguri',                sublabel:'Darjeeling, North Bengal',               lat:26.7271, lng:88.3953 },
  { id:'wb_kalyani',    short:'Kalyani',                 sublabel:'Nadia, West Bengal',                     lat:22.9750, lng:88.4344 },
  { id:'wb_haldia',     short:'Haldia',                  sublabel:'Purba Medinipur',                        lat:22.0667, lng:88.0500 },
  { id:'wb_krishnanagar',short:'Krishnanagar',           sublabel:'Nadia, West Bengal',                     lat:23.4012, lng:88.5016 },
  { id:'wb_burdwan',    short:'Burdwan',                 sublabel:'Purba Bardhaman',                        lat:23.2324, lng:87.8615 },
  { id:'wb_domjur',     short:'Domjur',                  sublabel:'Howrah, West Bengal',                    lat:22.6082, lng:88.2985 },
  { id:'wb_uluberia',   short:'Uluberia',                sublabel:'Howrah, West Bengal',                    lat:22.4734, lng:88.1039 },
  { id:'wb_saltlake1',  short:'Salt Lake Sector I',      sublabel:'Bidhannagar, Kolkata',                   lat:22.5812, lng:88.4000 },
  { id:'wb_rajarhat',   short:'Rajarhat',                sublabel:'North 24 Parganas',                      lat:22.6200, lng:88.4500 },
  { id:'wb_baguiati',   short:'Baguiati',                sublabel:'Kolkata',                                lat:22.6200, lng:88.4300 },
  { id:'wb_tollygunge', short:'Tollygunge',              sublabel:'South Kolkata',                          lat:22.4940, lng:88.3438 },
  { id:'wb_garia',      short:'Garia',                   sublabel:'South Kolkata',                          lat:22.4631, lng:88.3923 },
  { id:'wb_narendrapur',short:'Narendrapur',             sublabel:'South 24 Parganas',                      lat:22.4242, lng:88.3871 },
  { id:'wb_sonarpur',   short:'Sonarpur',                sublabel:'South 24 Parganas',                      lat:22.4380, lng:88.4273 },
  { id:'wb_baruipur',   short:'Baruipur',                sublabel:'South 24 Parganas',                      lat:22.3583, lng:88.4322 },
  { id:'wb_airport2',   short:'Kolkata Airport T2',      sublabel:'Netaji Subhas, Dum Dum',                 lat:22.6525, lng:88.4463 },
  { id:'wb_howrahbridge',short:'Howrah Bridge',          sublabel:'Howrah-Kolkata border',                  lat:22.5851, lng:88.3468 },
  { id:'wb_victoriamem', short:'Victoria Memorial',      sublabel:'Maidan, Kolkata',                        lat:22.5448, lng:88.3426 },
]

export { getAllFareOptions as getFareOptions, instantFareEstimate } from './fareEngine'

/* -- helpers ------------------------------------------------ */
function inIndia(lat, lng) {
  return lat >= INDIA.minLat && lat <= INDIA.maxLat &&
         lng >= INDIA.minLng && lng <= INDIA.maxLng
}
function inWB(lat, lng) {
  return lat >= WB.minLat && lat <= WB.maxLat &&
         lng >= WB.minLng && lng <= WB.maxLng
}
function distDeg(lat, lng, bLat, bLng) {
  return Math.hypot(lat - bLat, lng - bLng)
}

/* -- INSTANT LOCAL MATCH (0ms) ------------------------------ */
function localMatch(query) {
  const q = query.toLowerCase().trim()
  if (q.length < 2) return []
  return WB_PLACES.filter(p =>
    p.short.toLowerCase().includes(q) ||
    p.sublabel.toLowerCase().includes(q)
  ).map(p => ({ ...p, label: `${p.short}, ${p.sublabel}`, source:'local' }))
}

/* -- SEARCH (India/WB only, cached) ------------------------ */
export async function searchPlaces(query, biasLat, biasLng) {
  if (!query || query.trim().length < 2) return []

  const bLat = biasLat ?? DEFAULT_LAT
  const bLng = biasLng ?? DEFAULT_LNG
  const q    = query.trim()
  const cKey = `${q.toLowerCase()}|${bLat.toFixed(2)}|${bLng.toFixed(2)}`

  // Cache hit
  const cached = searchCache.get(cKey)
  if (cached && Date.now() - cached.ts < GEO_TTL) return cached.results

  // Step 1: instant local match
  const local = localMatch(q)
  if (local.length >= 4) {
    // Enough local results — return immediately, no API call
    const sorted = local.sort((a,b) => distDeg(a.lat,a.lng,bLat,bLng) - distDeg(b.lat,b.lng,bLat,bLng))
    searchCache.set(cKey, { results: sorted.slice(0,8), ts: Date.now() })
    return sorted.slice(0,8)
  }

  let results = [...local]

  // Step 2: Photon with strict WB bbox + India country bias
  try {
    // Use WB bbox if user is in WB, else full India
    const inWb = inWB(bLat, bLng)
    const bbox = inWb
      ? `${WB.minLng},${WB.minLat},${WB.maxLng},${WB.maxLat}`
      : `${INDIA.minLng},${INDIA.minLat},${INDIA.maxLng},${INDIA.maxLat}`

    const url = `${PHOTON}/api/?q=${encodeURIComponent(q)}&limit=12&lang=en` +
      `&lat=${bLat}&lon=${bLng}&bbox=${bbox}`

    const r = await fetch(url, {
      headers: { 'User-Agent':'JaldiChaloApp/4.0 (West Bengal, India)' },
      signal: AbortSignal.timeout(5000),
    })
    const data = await r.json()
    const features = (data?.features || []).filter(f => {
      const [lng, lat] = f.geometry?.coordinates || [0,0]
      return inIndia(lat, lng)
    })

    const photonResults = features.map(f => {
      const p = f.properties
      const [lng, lat] = f.geometry.coordinates
      const nameParts = [
        p.name,
        p.street,
        p.locality || p.suburb || p.district || p.neighbourhood,
        p.city || p.county,
        p.state,
      ].filter(Boolean)
      const sublabel = [
        p.locality || p.suburb || p.district,
        p.city || p.county,
        p.state,
      ].filter(Boolean).join(', ')

      return {
        id:       `ph_${lng.toFixed(4)}_${lat.toFixed(4)}`,
        label:    nameParts.join(', '),
        short:    (p.name || nameParts[0] || q).trim(),
        sublabel: sublabel || 'India',
        lat, lng,
        source:   'photon',
        inWB:     inWB(lat, lng),
      }
    })

    // Merge: prefer WB results first
    const existingIds = new Set(results.map(r => `${r.lat.toFixed(3)},${r.lng.toFixed(3)}`))
    photonResults.forEach(p => {
      if (!existingIds.has(`${p.lat.toFixed(3)},${p.lng.toFixed(3)}`)) {
        results.push(p)
        existingIds.add(`${p.lat.toFixed(3)},${p.lng.toFixed(3)}`)
      }
    })
  } catch {}

  // Step 3: Nominatim India-only fallback if still not enough
  if (results.filter(r => r.source !== 'local').length < 2) {
    try {
      const inWb = inWB(bLat, bLng)
      const viewbox = inWb
        ? `${WB.minLng},${WB.maxLat},${WB.maxLng},${WB.minLat}`
        : `${INDIA.minLng},${INDIA.maxLat},${INDIA.maxLng},${INDIA.minLat}`

      const url = `${NOM}/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1` +
        `&limit=8&countrycodes=in&viewbox=${viewbox}&bounded=1&accept-language=en`
      const r = await fetch(url, {
        headers:{ 'Accept-Language':'en','User-Agent':'JaldiChaloApp/4.0' },
        signal: AbortSignal.timeout(8000),
      })
      const data = await r.json()
      const existingIds = new Set(results.map(r => `${r.lat.toFixed(3)},${r.lng.toFixed(3)}`))

      data.filter(p => inIndia(parseFloat(p.lat), parseFloat(p.lon))).forEach(p => {
        const a = p.address || {}
        const lat = parseFloat(p.lat), lng = parseFloat(p.lon)
        const key = `${lat.toFixed(3)},${lng.toFixed(3)}`
        if (existingIds.has(key)) return
        existingIds.add(key)
        const short = a.road || a.suburb || a.neighbourhood || a.village || a.town || a.city || p.display_name.split(',')[0]
        const sub   = [a.suburb || a.neighbourhood, a.city || a.state_district, a.state].filter(Boolean).join(', ')
        results.push({
          id:`nom_${p.place_id}`, label:p.display_name,
          short:short.trim(), sublabel:sub || 'India',
          lat, lng, source:'nominatim', inWB:inWB(lat,lng),
        })
      })
    } catch {}
  }

  // Step 4: Sort — WB results first, then by distance from user
  results.sort((a, b) => {
    if (a.inWB && !b.inWB) return -1
    if (!a.inWB && b.inWB) return 1
    if (a.source === 'local' && b.source !== 'local') return -1
    if (a.source !== 'local' && b.source === 'local') return 1
    return distDeg(a.lat,a.lng,bLat,bLng) - distDeg(b.lat,b.lng,bLat,bLng)
  })
  results = results.slice(0, 8)

  searchCache.set(cKey, { results, ts: Date.now() })
  return results
}

/* -- REVERSE GEOCODE (cached) ------------------------------- */
export async function reverseGeocode(lat, lng) {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`
  const c = revCache.get(key)
  if (c && Date.now() - c.ts < ROUTE_TTL) return c.addr

  // Check if near a popular WB place first (< 300m)
  const nearby = WB_PLACES.find(p => {
    const d = Math.hypot(p.lat - lat, p.lng - lng)
    return d < 0.003 // ~300m
  })
  if (nearby) {
    revCache.set(key, { addr: nearby.short, ts: Date.now() })
    return nearby.short
  }

  async function doRev() {
    // Nominatim is more detailed for Indian addresses
    try {
      const r = await fetch(
        `${NOM}/reverse?lat=${lat}&lon=${lng}&format=json&zoom=17&addressdetails=1&accept-language=en`,
        { headers:{ 'Accept-Language':'en','User-Agent':'JaldiChaloApp/4.0' }, signal:AbortSignal.timeout(5000) }
      )
      const d = await r.json()
      const a = d.address || {}
      const parts = [
        a.road || a.pedestrian || a.footway || a.residential,
        a.neighbourhood || a.suburb || a.village || a.town,
        a.city || a.state_district,
      ].filter(Boolean)
      if (parts.length) return parts.slice(0,2).join(', ')
    } catch {}
    // Photon fallback
    try {
      const r = await fetch(`${PHOTON}/reverse?lat=${lat}&lon=${lng}&limit=1`,
        { headers:{ 'User-Agent':'JaldiChaloApp/4.0' }, signal:AbortSignal.timeout(4000) })
      const d = await r.json()
      const f = d?.features?.[0]?.properties
      if (f) return [f.name, f.locality||f.suburb, f.city].filter(Boolean).slice(0,2).join(', ')
    } catch {}
    return 'Current Location'
  }

  const addr = await doRev()
  revCache.set(key, { addr, ts: Date.now() })
  return addr
}

/* -- MATH --------------------------------------------------- */
const toRad = d => d * Math.PI / 180

export function getDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = toRad(lat2-lat1), dLng = toRad(lng2-lng1)
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}
export function getEtaMins(distKm, speedKmh=22) {
  return Math.max(2, Math.round((distKm/speedKmh)*60))
}

/* -- OSRM ROUTING (cached, instant fallback) ---------------- */
export async function getOsrmRoute(fromLat, fromLng, toLat, toLng, signal) {
  const key = `${fromLat.toFixed(4)},${fromLng.toFixed(4)}-${toLat.toFixed(4)},${toLng.toFixed(4)}`
  const c = routeCache.get(key)
  if (c && Date.now() - c.ts < ROUTE_TTL) return c.route

  const straight = getDistanceKm(fromLat, fromLng, toLat, toLng)
  const estimated = { distance_km:+(straight*1.3).toFixed(2), duration_min:getEtaMins(straight*1.3), source:'haversine' }

  try {
    const url = `${OSRM}/${fromLng},${fromLat};${toLng},${toLat}?overview=false&steps=false`
    const res  = await fetch(url, { signal, headers:{ 'User-Agent':'JaldiChaloApp/4.0' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    if (data.code !== 'Ok' || !data.routes?.length) throw new Error('no route')
    const r = { distance_km:+(data.routes[0].distance/1000).toFixed(2), duration_min:Math.ceil(data.routes[0].duration/60), source:'osrm' }
    routeCache.set(key, { route:r, ts:Date.now() })
    return r
  } catch(e) {
    if (e?.name==='AbortError'||e?.name==='TimeoutError') return null
    return estimated
  }
}

export function getInstantEstimate(pickupLat, pickupLng, dropLat, dropLng) {
  const straight = getDistanceKm(pickupLat, pickupLng, dropLat, dropLng)
  const road = +(straight*1.3).toFixed(2)
  return { distance_km:road, duration_min:getEtaMins(road), source:'instant' }
}

export function isRouteDeviation(curLat, curLng, fromLat, fromLng, toLat, toLng, threshKm=1.5) {
  return _ptSeg(curLat, curLng, fromLat, fromLng, toLat, toLng) > threshKm
}
function _ptSeg(px, py, ax, ay, bx, by) {
  const dx=bx-ax, dy=by-ay, lenSq=dx*dx+dy*dy
  if (lenSq===0) return getDistanceKm(px,py,ax,ay)
  const t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/lenSq))
  return getDistanceKm(px,py,ax+t*dx,ay+t*dy)
}
