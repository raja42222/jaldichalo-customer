import { useEffect, useRef } from 'react'

/* ================================================================
   JALDI CHALO — MapView with Uber-style smooth driver animation
   ----------------------------------------------------------------
   Tech: MapLibre GL JS (not Leaflet — we use MapLibre for better
   mobile performance and vector tile support)

   Driver Animation System:
   1. Position queue   — chain GPS updates smoothly, no snapping
   2. Bearing calc     — marker rotates to face direction of travel
   3. Catmull-Rom spline — organic curves, not straight lines
   4. Speed-adaptive duration — matches actual GPS update interval
   5. Velocity prediction — continuous movement between GPS updates
   6. Visibility API   — pause animation when tab is hidden (battery)
   7. RAF-based 60fps  — smooth frame-by-frame movement
================================================================ */

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
const ML_JS     = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js'
const ML_CSS    = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css'

/* -- Math helpers ----------------------------------------------- */
const lerp     = (a, b, t) => a + (b - a) * t

/* easeOutCubic: fast start, smooth end — correct for moving vehicle */
const easeOut  = t => 1 - Math.pow(1 - t, 3)

/* easeInOutSine: smooth for short distances (< 50m) */
const easeSmooth = t => -(Math.cos(Math.PI * t) - 1) / 2

const emptyGJ  = () => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: [] } })

/* -- Bearing calculation (degrees, 0=North, clockwise) ----------- */
function calcBearing(fromLng, fromLat, toLng, toLat) {
  const dLng = (toLng - fromLng) * Math.PI / 180
  const lat1 = fromLat * Math.PI / 180
  const lat2 = toLat   * Math.PI / 180
  const y    = Math.sin(dLng) * Math.cos(lat2)
  const x    = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360
}

/* -- Shortest angle lerp (handles 359° → 1° correctly) ------------ */
function lerpAngle(a, b, t) {
  let diff = ((b - a + 540) % 360) - 180
  return a + diff * t
}

/* -- Haversine distance in meters ------------------------------- */
function distMeters(lng1, lat1, lng2, lat2) {
  const R    = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a    = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

/* -- Catmull-Rom spline point (p0,p1 = control, p2,p3 = endpoints) */
function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t
  return [
    0.5 * ((2*p1[0]) + (-p0[0]+p2[0])*t + (2*p0[0]-5*p1[0]+4*p2[0]-p3[0])*t2 + (-p0[0]+3*p1[0]-3*p2[0]+p3[0])*t3),
    0.5 * ((2*p1[1]) + (-p0[1]+p2[1])*t + (2*p0[1]-5*p1[1]+4*p2[1]-p3[1])*t2 + (-p0[1]+3*p1[1]-3*p2[1]+p3[1])*t3),
  ]
}

/* -- MapLibre global loader --------------------------------------- */
let mlReady = false, mlCbs = []
function ensureML(cb) {
  if (mlReady) { cb(); return }
  mlCbs.push(cb)
  if (mlCbs.length > 1) return
  if (!document.querySelector('link[data-ml]')) {
    const l = document.createElement('link')
    l.rel = 'stylesheet'; l.href = ML_CSS; l.dataset.ml = '1'
    document.head.appendChild(l)
  }
  const s = document.createElement('script')
  s.src = ML_JS; s.async = true
  s.onload = () => { mlReady = true; mlCbs.forEach(fn => fn()); mlCbs = [] }
  document.head.appendChild(s)
}

/* ================================================================
   DRIVER ANIMATION ENGINE
   Manages smooth movement with position queue + bearing + spline
================================================================ */
class DriverAnimator {
  constructor() {
    this.marker    = null     // MapLibre Marker
    this.markerEl  = null     // DOM element (for rotation)
    this.queue     = []       // pending positions: [{lng, lat, ts}]
    this.current   = null     // current [lng, lat]
    this.fromPos   = null     // animation start [lng, lat]
    this.toPos     = null     // animation target [lng, lat]
    this.bearing   = 0        // current heading in degrees
    this.fromBear  = 0        // animation start bearing
    this.toBear    = 0        // animation target bearing
    this.history   = []       // last 4 positions for Catmull-Rom
    this.rafId     = null
    this.startTs   = null
    this.duration  = 1800     // ms — adapts to GPS interval
    this.lastGpsTs = 0        // timestamp of last GPS update
    this.paused    = false
    this._onVisible = this._onVisible.bind(this)
    document.addEventListener('visibilitychange', this._onVisible)
  }

  _onVisible() {
    if (document.hidden) {
      this.paused = true
      if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null }
    } else {
      this.paused = false
      if (this.fromPos && this.toPos) this._startRaf()
    }
  }

  /* Add new GPS position to queue */
  push(lng, lat) {
    const now = Date.now()
    // Ignore if essentially same position (< 2 meters moved)
    if (this.current) {
      const d = distMeters(this.current[0], this.current[1], lng, lat)
      if (d < 2) return
    }

    // Adapt animation duration to actual GPS interval
    if (this.lastGpsTs > 0) {
      const interval   = now - this.lastGpsTs
      this.duration    = Math.min(interval * 0.92, 2500)  // 92% of interval, max 2.5s
    }
    this.lastGpsTs = now

    this.queue.push({ lng, lat })

    // If not animating, start immediately
    if (!this.rafId && !this.paused) this._nextAnim()
  }

  _nextAnim() {
    if (!this.queue.length || !this.marker) return

    const next     = this.queue.shift()
    const from     = this.current || [next.lng, next.lat]

    this.fromPos   = from
    this.toPos     = [next.lng, next.lat]
    this.fromBear  = this.bearing
    this.toBear    = calcBearing(from[0], from[1], next.lng, next.lat)

    // Update history for Catmull-Rom (keep last 4)
    this.history.push([...from])
    if (this.history.length > 4) this.history.shift()

    // If very short distance (< 10m), use faster smooth easing
    const dist = distMeters(from[0], from[1], next.lng, next.lat)
    if (dist < 10) this.duration = Math.min(this.duration, 600)

    this.startTs   = null
    this._startRaf()
  }

  _startRaf() {
    if (this.rafId) cancelAnimationFrame(this.rafId)
    this.rafId = requestAnimationFrame(ts => this._step(ts))
  }

  _step(ts) {
    if (this.paused || !this.marker || !this.fromPos || !this.toPos) return

    if (!this.startTs) this.startTs = ts
    const elapsed = ts - this.startTs
    const raw     = Math.min(elapsed / this.duration, 1)

    // Choose easing based on speed/distance
    const dist = distMeters(this.fromPos[0], this.fromPos[1], this.toPos[0], this.toPos[1])
    const t    = dist < 30 ? easeSmooth(raw) : easeOut(raw)

    let pos
    // Use Catmull-Rom spline if we have enough history (organic curves)
    if (this.history.length >= 3) {
      const h = this.history
      const p0 = h[h.length-2] || h[0]
      const p1 = h[h.length-1]
      const p2 = this.toPos
      // Extrapolate p3 beyond p2 for smooth continuation
      const p3 = [
        p2[0] + (p2[0] - p1[0]),
        p2[1] + (p2[1] - p1[1]),
      ]
      pos = catmullRom(p0, p1, p2, p3, t)
    } else {
      // Fallback: linear lerp
      pos = [lerp(this.fromPos[0], this.toPos[0], t), lerp(this.fromPos[1], this.toPos[1], t)]
    }

    // Smooth bearing interpolation (no 359→1 jump)
    const bear = lerpAngle(this.fromBear, this.toBear, easeSmooth(raw))

    // Apply position
    this.marker.setLngLat(pos)
    this.current = pos

    // Apply rotation via CSS transform on the inner element
    if (this.markerEl) {
      const inner = this.markerEl.querySelector('.driver-icon')
      if (inner) inner.style.transform = `rotate(${bear}deg)`
    }

    if (raw < 1) {
      this.rafId = requestAnimationFrame(ts2 => this._step(ts2))
    } else {
      // Animation complete
      this.current = this.toPos
      this.bearing = this.toBear
      this.rafId   = null
      // Process next in queue
      if (this.queue.length) this._nextAnim()
    }
  }

  /* Set marker reference */
  attach(marker, el) {
    this.marker   = marker
    this.markerEl = el
  }

  /* Teleport (first appearance, no animation) */
  teleport(lng, lat) {
    this.current   = [lng, lat]
    this.fromPos   = [lng, lat]
    this.queue     = []
    this.history   = [[lng, lat]]
    if (this.marker) this.marker.setLngLat([lng, lat])
  }

  /* Remove and clean up */
  destroy() {
    if (this.rafId) cancelAnimationFrame(this.rafId)
    document.removeEventListener('visibilitychange', this._onVisible)
    this.marker = null; this.markerEl = null
    this.queue  = []; this.history = []
    this.rafId  = null
  }
}

/* ================================================================
   MAPVIEW COMPONENT
================================================================ */
export default function MapView({
  center, pickupCoords, dropCoords,
  driverCoords, nearbyDrivers,
  showRoute, zoom = 14, bottomPad = 300,
  onReady,
}) {
  const divRef      = useRef(null)
  const mapRef      = useRef(null)
  const pins        = useRef({})          // pickup + drop markers
  const nearbyMks   = useRef({})          // nearby driver dots
  const driverAnim  = useRef(new DriverAnimator())
  const lastRoute   = useRef('')
  const ready       = useRef(false)
  const alive       = useRef(true)

  /* -- Mount / unmount ------------------------------------------ */
  useEffect(() => {
    alive.current = true
    ensureML(() => { if (alive.current && divRef.current) initMap() })
    return () => {
      alive.current = false
      driverAnim.current.destroy()
      Object.values(pins.current).forEach(m => { try { m.remove() } catch {} })
      Object.values(nearbyMks.current).forEach(m => { try { m.remove() } catch {} })
      pins.current = {}; nearbyMks.current = {}
      if (mapRef.current) { try { mapRef.current.remove() } catch {} mapRef.current = null; ready.current = false }
    }
  }, []) // eslint-disable-line

  function initMap() {
    if (mapRef.current || !divRef.current || !window.maplibregl) return
    const lat = center?.[0] ?? 22.5726
    const lng = center?.[1] ?? 88.3639
    const map = new window.maplibregl.Map({
      container: divRef.current, style: MAP_STYLE,
      center: [lng, lat], zoom, maxZoom: 19, attributionControl: false,
    })
    map.addControl(new window.maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
    map.on('load', () => {
      if (!alive.current) return
      map.addSource('route', { type: 'geojson', data: emptyGJ() })
      map.addLayer({ id:'route-glow',   type:'line', source:'route', layout:{'line-join':'round','line-cap':'round'}, paint:{'line-color':'#FF5F1F','line-width':14,'line-opacity':0.12,'line-blur':8} })
      map.addLayer({ id:'route-casing', type:'line', source:'route', layout:{'line-join':'round','line-cap':'round'}, paint:{'line-color':'#ffffff','line-width':8,'line-opacity':0.85} })
      map.addLayer({ id:'route-line',   type:'line', source:'route', layout:{'line-join':'round','line-cap':'round'}, paint:{'line-color':'#FF5F1F','line-width':5,'line-opacity':1} })
      mapRef.current = map; ready.current = true
      syncAll()
      if (onReady) onReady()
    })
  }

  /* -- Re-sync on prop changes ----------------------------------- */
  useEffect(() => { if (ready.current) syncAll() },
    [center, pickupCoords, dropCoords, driverCoords, nearbyDrivers, showRoute]) // eslint-disable-line

  function syncAll() {
    if (!mapRef.current || !ready.current) return
    syncCenter()
    syncPin('pickup', pickupCoords, pickupHtml())
    syncPin('drop',   dropCoords,   dropHtml())
    syncDriverMarker(driverCoords)
    syncNearby(nearbyDrivers || [])
    syncRoute()
    syncBounds()
  }

  function syncCenter() {
    if (!center || pickupCoords || dropCoords) return
    mapRef.current.flyTo({ center: [center[1], center[0]], zoom, speed: 1.2 })
  }

  /* Static pins (pickup / drop) */
  function syncPin(key, coords, html) {
    const ml = window.maplibregl
    if (!coords) {
      pins.current[key]?.remove()
      delete pins.current[key]
      return
    }
    const ll = [coords[1], coords[0]]
    if (pins.current[key]) { pins.current[key].setLngLat(ll); return }
    const el = document.createElement('div'); el.innerHTML = html
    pins.current[key] = new ml.Marker({ element: el, anchor: 'center' }).setLngLat(ll).addTo(mapRef.current)
  }

  /* -- Driver marker with full animation engine ---------------- */
  function syncDriverMarker(coords) {
    const ml   = window.maplibregl
    const anim = driverAnim.current
    if (!ml || !mapRef.current) return

    if (!coords) {
      // Remove driver marker
      if (anim.marker) { anim.marker.remove(); anim.destroy(); driverAnim.current = new DriverAnimator() }
      return
    }

    const lng = coords[1], lat = coords[0]

    if (!anim.marker) {
      // First appearance: create marker, teleport to position
      const el  = document.createElement('div')
      el.innerHTML = driverHtml()
      const mk  = new ml.Marker({ element: el, anchor: 'center' })
        .setLngLat([lng, lat])
        .addTo(mapRef.current)
      anim.attach(mk, el)
      anim.teleport(lng, lat)
    } else {
      // Subsequent updates: push to animation queue
      anim.push(lng, lat)
    }
  }

  /* Nearby driver dots (idle state — no animation needed) */
  function syncNearby(drivers) {
    const ml = window.maplibregl
    Object.values(nearbyMks.current).forEach(m => { try { m.remove() } catch {} })
    nearbyMks.current = {}
    drivers.forEach(([lat, lng], i) => {
      const el = document.createElement('div'); el.innerHTML = nearbyHtml(i)
      nearbyMks.current[`nb_${i}`] = new ml.Marker({ element: el, anchor: 'center' })
        .setLngLat([lng, lat]).addTo(mapRef.current)
    })
  }

  /* OSRM route */
  async function syncRoute() {
    if (!mapRef.current) return
    if (!showRoute || !pickupCoords || !dropCoords) {
      mapRef.current.getSource('route')?.setData(emptyGJ())
      lastRoute.current = ''; return
    }
    const k = `${pickupCoords[0].toFixed(5)},${pickupCoords[1].toFixed(5)}|${dropCoords[0].toFixed(5)},${dropCoords[1].toFixed(5)}`
    if (k === lastRoute.current) return; lastRoute.current = k
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${pickupCoords[1]},${pickupCoords[0]};${dropCoords[1]},${dropCoords[0]}?overview=full&geometries=geojson`
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
      if (!alive.current) return
      const json = await res.json()
      if (json.code !== 'Ok' || !json.routes?.length) throw new Error('no route')
      const c = json.routes[0].geometry.coordinates
      mapRef.current?.getSource('route')?.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: c } })
      fitCoords(c)
    } catch {
      if (!alive.current) return
      const fb = [[pickupCoords[1], pickupCoords[0]], [dropCoords[1], dropCoords[0]]]
      mapRef.current?.getSource('route')?.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: fb } })
      fitLngLats(fb)
    }
  }

  function syncBounds() {
    const pts = [pickupCoords, dropCoords].filter(Boolean)
    if (pts.length === 2 && !showRoute) fitLngLats(pts.map(p => [p[1], p[0]]))
    else if (pts.length === 1) mapRef.current.flyTo({ center: [pts[0][1], pts[0][0]], zoom: 15, speed: 1.4 })
  }

  function fitCoords(coords) {
    if (!mapRef.current || !coords?.length) return
    const ml = window.maplibregl
    const b  = coords.reduce((b, c) => b.extend(c), new ml.LngLatBounds(coords[0], coords[0]))
    mapRef.current.fitBounds(b, { padding: { top: 80, bottom: bottomPad, left: 48, right: 48 }, maxZoom: 16, duration: 900 })
  }
  function fitLngLats(arr) {
    if (!mapRef.current || !arr?.length) return
    const ml = window.maplibregl
    const b  = arr.reduce((b, c) => b.extend(c), new ml.LngLatBounds(arr[0], arr[0]))
    mapRef.current.fitBounds(b, { padding: { top: 80, bottom: bottomPad, left: 48, right: 48 }, maxZoom: 16, duration: 900 })
  }

  return <div ref={divRef} style={{ width: '100%', height: '100%', background: '#e8e4dc' }} />
}

/* ================================================================
   MARKER HTML
================================================================ */
function pickupHtml() {
  return `<div style="position:relative;width:26px;height:26px;display:flex;align-items:center;justify-content:center;">
    <style>@keyframes jcPls{0%{transform:scale(1);opacity:.6}70%{transform:scale(2.3);opacity:0}100%{opacity:0}}</style>
    <div style="position:absolute;inset:-5px;border-radius:50%;border:2px solid rgba(34,197,94,0.55);animation:jcPls 2.2s ease-out infinite;pointer-events:none;"></div>
    <div style="width:22px;height:22px;border-radius:50%;background:#22C55E;border:3px solid #fff;box-shadow:0 0 0 3px rgba(34,197,94,0.18),0 4px 14px rgba(0,0,0,0.22);"></div>
  </div>`
}

function dropHtml() {
  return `<div style="display:flex;flex-direction:column;align-items:center;">
    <div style="width:24px;height:24px;border-radius:50%;background:#F97316;border:3px solid #fff;box-shadow:0 0 0 3px rgba(249,115,22,0.18),0 4px 14px rgba(0,0,0,0.22);"></div>
    <div style="width:3px;height:10px;background:#F97316;border-radius:0 0 3px 3px;margin-top:-2px;"></div>
  </div>`
}

function driverHtml() {
  /* driver-icon class is used by DriverAnimator to apply CSS rotation */
  return `
    <style>
      .driver-marker { position:relative; width:52px; height:52px; }
      .driver-icon {
        width:52px; height:52px;
        display:flex; align-items:center; justify-content:center;
        /* transition makes bearing changes smooth at 60fps */
        transition: transform 0.3s ease-out;
        will-change: transform;
        transform-origin: center center;
      }
      .driver-inner {
        width:46px; height:46px; border-radius:50%;
        background: linear-gradient(145deg,#FF5F1F,#FF9500);
        display:flex; align-items:center; justify-content:center;
        font-size:22px;
        border:2.5px solid rgba(255,255,255,0.95);
        box-shadow: 0 0 0 4px rgba(255,95,31,0.2), 0 6px 20px rgba(255,95,31,0.35);
      }
      @keyframes drPulse{0%{box-shadow:0 0 0 0 rgba(255,95,31,0.45)}70%{box-shadow:0 0 0 10px rgba(255,95,31,0)}100%{box-shadow:0 0 0 0 rgba(255,95,31,0)}}
      .driver-inner { animation: drPulse 2.2s ease infinite; }
    </style>
    <div class="driver-marker">
      <div class="driver-icon">
        <div class="driver-inner">🛵</div>
      </div>
    </div>`
}

function nearbyHtml(idx) {
  const d = ((idx * 0.4) % 1.6).toFixed(1)
  return `
    <style>@keyframes nbBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}</style>
    <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(145deg,#FF8C00,#FFAA44);display:flex;align-items:center;justify-content:center;font-size:16px;border:2px solid rgba(255,255,255,0.9);box-shadow:0 2px 10px rgba(255,140,0,0.28);opacity:0.82;animation:nbBob 2s ease-in-out ${d}s infinite;will-change:transform;">🛵</div>`
}
