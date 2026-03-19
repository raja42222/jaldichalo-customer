import { useEffect, useRef } from 'react'

/* ================================================================
   JALDI CHALO — MapView v5.0
   Full-screen, Rapido-style map with:
   - Truly full-screen (position:absolute inset:0)
   - Smooth Uber-style driver animation (queue + bearing + spline)
   - Proper geolocation with accuracy circle
   - Route line (pickup→drop) with orange glow
   - Nearby driver dots with animation
   - onReady callback for skeleton dismiss
================================================================ */

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
const ML_JS     = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js'
const ML_CSS    = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css'

/* -- Math ------------------------------------------------------- */
const lerp = (a, b, t) => a + (b - a) * t
const easeOut = t => 1 - Math.pow(1 - t, 3)
const easeSmooth = t => -(Math.cos(Math.PI * t) - 1) / 2
const emptyGJ = () => ({ type:'Feature', geometry:{ type:'LineString', coordinates:[] } })

function haversineM(lng1, lat1, lng2, lat2) {
  const R = 6371000
  const dLat = (lat2-lat1)*Math.PI/180
  const dLng = (lng2-lng1)*Math.PI/180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2
  return R*2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

function calcBearing(lng1, lat1, lng2, lat2) {
  const dLng = (lng2-lng1)*Math.PI/180
  const y = Math.sin(dLng)*Math.cos(lat2*Math.PI/180)
  const x = Math.cos(lat1*Math.PI/180)*Math.sin(lat2*Math.PI/180) - Math.sin(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.cos(dLng)
  return ((Math.atan2(y,x)*180/Math.PI)+360)%360
}

function lerpAngle(a, b, t) {
  return a + (((b-a+540)%360)-180)*t
}

/* -- MapLibre loader -------------------------------------------- */
let mlReady = false, mlCbs = []
function ensureML(cb) {
  if (mlReady) { cb(); return }
  mlCbs.push(cb)
  if (mlCbs.length > 1) return
  if (!document.querySelector('link[data-ml]')) {
    const l = document.createElement('link')
    l.rel='stylesheet'; l.href=ML_CSS; l.dataset.ml='1'
    document.head.appendChild(l)
  }
  const s = document.createElement('script')
  s.src=ML_JS; s.async=true
  s.onload = () => { mlReady=true; mlCbs.forEach(fn=>fn()); mlCbs=[] }
  document.head.appendChild(s)
}

/* -- Driver animation engine ------------------------------------ */
class DriverAnim {
  constructor() {
    this.mk       = null
    this.el       = null
    // Route-following: array of [lng,lat] waypoints from OSRM
    this.routePts = []   // current road-route segment to follow
    this.routeIdx = 0    // index into routePts
    this.cur      = null
    this.bearing  = 0
    this.rafId    = null
    this.startTs  = null
    this.segDur   = 800  // ms per route segment
    this.lastGpsTs= 0
    this.paused   = false
    this.hist     = []   // GPS history for trail
    this._vis     = this._vis.bind(this)
    document.addEventListener('visibilitychange', this._vis)
  }
  _vis() {
    if (document.hidden) {
      this.paused = true
      if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null }
    } else {
      this.paused = false
      if (this.routeIdx < this.routePts.length - 1) this._animNext()
    }
  }

  // Called with new GPS coordinate — fetch OSRM road route then animate
  push(lng, lat) {
    const now = Date.now()
    if (this.cur && haversineM(this.cur[0], this.cur[1], lng, lat) < 3) return
    this.hist.push([lng, lat])
    if (this.hist.length > 60) this.hist.shift()

    const from = this.cur || [lng, lat]
    const distM = haversineM(from[0], from[1], lng, lat)

    // Very short move: skip OSRM, animate directly
    if (distM < 30) {
      this.routePts = [from, [lng, lat]]
      this.routeIdx = 0
      this.segDur   = Math.min(now - this.lastGpsTs, 1500) * 0.85 || 600
      this.lastGpsTs = now
      if (!this.rafId && !this.paused) this._animNext()
      return
    }

    // Fetch OSRM road route between from→to
    this.lastGpsTs = now
    const url = `https://router.project-osrm.org/route/v1/driving/${from[0]},${from[1]};${lng},${lat}?overview=full&geometries=geojson&steps=false`
    fetch(url, { signal: AbortSignal.timeout(3000) })
      .then(r => r.json())
      .then(data => {
        if (data.code !== 'Ok' || !data.routes?.[0]) throw new Error('no route')
        const coords = data.routes[0].geometry.coordinates
        if (coords.length < 2) throw new Error('too short')
        // Smooth: add current position as first point
        this.routePts = [from, ...coords]
        this.routeIdx = 0
        const totalDist = data.routes[0].distance || distM
        const totalTime = Math.min((now - this.lastGpsTs) * 1.1 + 500, 3000)
        // Per-segment duration proportional to segment length
        this.segDur = Math.max(300, totalTime / coords.length)
        if (!this.rafId && !this.paused) this._animNext()
      })
      .catch(() => {
        // Fallback: straight line with smooth interpolation
        this.routePts = [from, [lng, lat]]
        this.routeIdx = 0
        this.segDur   = 1200
        if (!this.rafId && !this.paused) this._animNext()
      })
  }

  _animNext() {
    if (this.routeIdx >= this.routePts.length - 1) return
    const from = this.routePts[this.routeIdx]
    const to   = this.routePts[this.routeIdx + 1]
    const segDist = haversineM(from[0], from[1], to[0], to[1])
    // Duration proportional to segment distance (feels natural speed)
    const dur = Math.max(150, Math.min(this.segDur, segDist * 25))

    this.startTs  = null
    this._from    = from
    this._to      = to
    this._fromBear= this.bearing
    this._toBear  = calcBearing(from[0], from[1], to[0], to[1])
    this._dur     = dur
    this.rafId    = requestAnimationFrame(ts => this._step(ts))
  }

  _step(ts) {
    if (this.paused || !this.mk || !this._from || !this._to) return
    if (!this.startTs) this.startTs = ts
    const raw = Math.min((ts - this.startTs) / this._dur, 1)
    const t   = easeOut(raw)

    // Smooth interpolation along road segment
    const pos = [
      lerp(this._from[0], this._to[0], t),
      lerp(this._from[1], this._to[1], t),
    ]
    this.mk.setLngLat(pos)
    this.cur = pos

    // Smooth bearing rotation
    const bear = lerpAngle(this._fromBear, this._toBear, easeSmooth(raw))
    const icon = this.el?.querySelector('.drv-icon')
    if (icon) icon.style.transform = `rotate(${bear}deg)`

    if (raw < 1) {
      this.rafId = requestAnimationFrame(ts2 => this._step(ts2))
    } else {
      // Segment done — move to next
      this.cur     = this._to
      this.bearing = this._toBear
      this.rafId   = null
      this.routeIdx++
      if (this.routeIdx < this.routePts.length - 1 && !this.paused) {
        this._animNext()
      }
    }
  }

  attach(mk, el) { this.mk = mk; this.el = el }

  teleport(lng, lat) {
    if (this.rafId) cancelAnimationFrame(this.rafId)
    this.rafId    = null
    this.cur      = [lng, lat]
    this.routePts = [[lng, lat]]
    this.routeIdx = 0
    this.hist     = [[lng, lat]]
    this.bearing  = 0
    if (this.mk) this.mk.setLngLat([lng, lat])
    const icon = this.el?.querySelector('.drv-icon')
    if (icon) icon.style.transform = 'rotate(0deg)'
  }

  destroy() {
    if (this.rafId) cancelAnimationFrame(this.rafId)
    document.removeEventListener('visibilitychange', this._vis)
    this.mk = null; this.el = null
    this.routePts = []; this.hist = []; this.rafId = null
  }
}

/* ================================================================
   COMPONENT
================================================================ */
export default function MapView({
  center, pickupCoords, dropCoords,
  driverCoords, nearbyDrivers,
  showRoute, showDriverToPickup=false,
  zoom=14, bottomPad=180,
  onReady,
}) {
  const divRef    = useRef(null)
  const mapRef    = useRef(null)
  const pins      = useRef({})
  const nearbyMks = useRef({})
  const drvAnim   = useRef(new DriverAnim())
  const lastRoute = useRef('')
  const ready     = useRef(false)
  const alive     = useRef(true)

  /* -- Mount -- */
  useEffect(() => {
    alive.current = true
    ensureML(() => { if(alive.current && divRef.current) initMap() })
    return () => {
      alive.current = false
      drvAnim.current.destroy()
      Object.values(pins.current).forEach(m => { try{m.remove()}catch{} })
      Object.values(nearbyMks.current).forEach(m => { try{m.remove()}catch{} })
      pins.current={}; nearbyMks.current={}
      if(mapRef.current) { try{mapRef.current.remove()}catch{}; mapRef.current=null; ready.current=false }
    }
  }, []) // eslint-disable-line

  function initMap() {
    if(mapRef.current||!divRef.current||!window.maplibregl) return
    const lat=center?.[0]??22.5726, lng=center?.[1]??88.3639
    const map = new window.maplibregl.Map({
      container:divRef.current, style:MAP_STYLE,
      center:[lng,lat], zoom, maxZoom:19, attributionControl:false,
      pitchWithRotate:false, dragRotate:false,
    })
    // Hide default attribution clutter
    map.addControl(new window.maplibregl.AttributionControl({ compact:true }), 'bottom-left')
    map.on('load', () => {
      if(!alive.current) return
      // Route layers
      map.addSource('route', { type:'geojson', data:emptyGJ() })
      map.addLayer({ id:'route-glow',   type:'line', source:'route', layout:{'line-join':'round','line-cap':'round'}, paint:{'line-color':'#FF5F1F','line-width':18,'line-opacity':0.10,'line-blur':10} })
      map.addLayer({ id:'route-casing', type:'line', source:'route', layout:{'line-join':'round','line-cap':'round'}, paint:{'line-color':'#ffffff','line-width':9,'line-opacity':0.90} })
      map.addLayer({ id:'route-line',   type:'line', source:'route', layout:{'line-join':'round','line-cap':'round'}, paint:{'line-color':'#FF5F1F','line-width':5,'line-opacity':1} })
      // Dashed preview layer (shown before booking)
      map.addSource('route-preview', { type:'geojson', data:emptyGJ() })
      map.addLayer({ id:'route-preview', type:'line', source:'route-preview', layout:{'line-join':'round','line-cap':'round'}, paint:{'line-color':'#FF5F1F','line-width':3,'line-opacity':0.5,'line-dasharray':[4,4]} })
      mapRef.current=map; ready.current=true

      // ResizeObserver: auto-resize map when container size changes
      // (fixes blank map when bottom sheet height changes)
      if (typeof ResizeObserver !== 'undefined' && divRef.current) {
        const ro = new ResizeObserver(() => {
          try { mapRef.current?.resize() } catch {}
        })
        ro.observe(divRef.current)
        mapRef.current._ro = ro
      }

      if(onReady) onReady()
      syncAll()
    })
  }

  /* -- Sync on prop change -- */
  useEffect(() => {
    if (!ready.current) return
    try { mapRef.current?.resize() } catch {}  // resize before sync
    syncAll()
  }, [center,pickupCoords,dropCoords,driverCoords,nearbyDrivers,showRoute,showDriverToPickup,zoom,bottomPad]) // eslint-disable-line

  function syncAll() {
    if(!mapRef.current||!ready.current) return
    syncCenter()
    syncPin('pickup', pickupCoords, pickupHtml())
    syncPin('drop',   dropCoords,   dropHtml())
    syncDriver(driverCoords)
    syncNearby(nearbyDrivers||[])
    syncRoute()
    syncDriverToPickup()
    syncBounds()
  }

  function syncDriverToPickup() {
    if(!mapRef.current) return
    const src = mapRef.current.getSource('driver-to-pick')
    if(!src) return
    if(!showDriverToPickup || !driverCoords || !pickupCoords) {
      src.setData(emptyGJ()); return
    }
    const coords = [[driverCoords[1],driverCoords[0]],[pickupCoords[1],pickupCoords[0]]]
    src.setData({type:'Feature',geometry:{type:'LineString',coordinates:coords}})
  }

  function syncCenter() {
    if(!center||pickupCoords||dropCoords) return
    mapRef.current.easeTo({ center:[center[1],center[0]], zoom, duration:600 })
  }

  /* Static pins */
  function syncPin(key, coords, html) {
    const ml = window.maplibregl
    if(!coords) { pins.current[key]?.remove(); delete pins.current[key]; return }
    const ll=[coords[1],coords[0]]
    if(pins.current[key]) { pins.current[key].setLngLat(ll); return }
    const el=document.createElement('div'); el.innerHTML=html
    pins.current[key] = new ml.Marker({element:el,anchor:'center'}).setLngLat(ll).addTo(mapRef.current)
  }

  /* Driver marker with smooth animation + route trail */
  function syncDriver(coords) {
    const ml=window.maplibregl, anim=drvAnim.current
    if(!ml||!mapRef.current) return
    if(!coords) {
      if(anim.mk) { anim.mk.remove(); anim.destroy(); drvAnim.current=new DriverAnim() }
      // Clear trail
      try { mapRef.current.getSource('driver-trail')?.setData({type:'Feature',geometry:{type:'LineString',coordinates:[]}}) } catch {}
      return
    }
    const [lat,lng] = coords
    if(!anim.mk) {
      const el=document.createElement('div'); el.innerHTML=driverHtml()
      const mk=new ml.Marker({element:el,anchor:'center'}).setLngLat([lng,lat]).addTo(mapRef.current)
      anim.attach(mk,el); anim.teleport(lng,lat)
    } else {
      anim.push(lng,lat)
    }
    // Draw driver movement trail
    if(anim.hist && anim.hist.length > 1) {
      try {
        const trailCoords = [...anim.hist, [lng, lat]]
        const src = mapRef.current.getSource('driver-trail')
        if(src) {
          src.setData({type:'Feature',geometry:{type:'LineString',coordinates:trailCoords}})
        } else if(mapRef.current.isStyleLoaded()) {
          mapRef.current.addSource('driver-trail', {type:'geojson', data:{type:'Feature',geometry:{type:'LineString',coordinates:trailCoords}}})
          mapRef.current.addLayer({id:'driver-trail',type:'line',source:'driver-trail',
            layout:{'line-join':'round','line-cap':'round'},
            paint:{'line-color':'rgba(255,95,31,0.35)','line-width':3.5,'line-dasharray':[2,4]}
          })
        }
      } catch {}
    }
  }

  /* Nearby dots */
  function syncNearby(drivers) {
    const ml=window.maplibregl
    Object.values(nearbyMks.current).forEach(m=>{try{m.remove()}catch{}})
    nearbyMks.current={}
    drivers.forEach(([lat,lng],i) => {
      const el=document.createElement('div'); el.innerHTML=nearbyDotHtml(i)
      nearbyMks.current[`nb${i}`]=new ml.Marker({element:el,anchor:'center'}).setLngLat([lng,lat]).addTo(mapRef.current)
    })
  }

  /* Route */
  async function syncRoute() {
    if(!mapRef.current) return
    if(!showRoute||!pickupCoords||!dropCoords) {
      mapRef.current.getSource('route')?.setData(emptyGJ())
      mapRef.current.getSource('route-preview')?.setData(emptyGJ())
      lastRoute.current=''; return
    }
    const k=`${pickupCoords[0].toFixed(5)},${pickupCoords[1].toFixed(5)}|${dropCoords[0].toFixed(5)},${dropCoords[1].toFixed(5)}`
    if(k===lastRoute.current) return; lastRoute.current=k
    // Show straight line immediately while fetching
    const straight=[[pickupCoords[1],pickupCoords[0]],[dropCoords[1],dropCoords[0]]]
    mapRef.current.getSource('route-preview')?.setData({type:'Feature',geometry:{type:'LineString',coordinates:straight}})
    try {
      const url=`https://router.project-osrm.org/route/v1/driving/${pickupCoords[1]},${pickupCoords[0]};${dropCoords[1]},${dropCoords[0]}?overview=full&geometries=geojson`
      const res=await fetch(url, {signal:AbortSignal.timeout(8000)})
      if(!alive.current) return
      const json=await res.json()
      if(json.code!=='Ok'||!json.routes?.length) throw new Error('no route')
      const coords=json.routes[0].geometry.coordinates
      mapRef.current?.getSource('route')?.setData({type:'Feature',geometry:{type:'LineString',coordinates:coords}})
      mapRef.current?.getSource('route-preview')?.setData(emptyGJ()) // hide straight line
      fitCoords(coords)
    } catch {
      if(!alive.current) return
      mapRef.current?.getSource('route')?.setData({type:'Feature',geometry:{type:'LineString',coordinates:straight}})
      mapRef.current?.getSource('route-preview')?.setData(emptyGJ())
      fitLngLats(straight)
    }
  }

  function syncBounds() {
    const pts=[pickupCoords,dropCoords].filter(Boolean)
    if(pts.length===2&&!showRoute) fitLngLats(pts.map(p=>[p[1],p[0]]))
    else if(pts.length===1) mapRef.current.easeTo({center:[pts[0][1],pts[0][0]],zoom:15,duration:800})
  }

  function fitCoords(coords) {
    if(!mapRef.current||!coords?.length) return
    const ml=window.maplibregl
    const b=coords.reduce((b,c)=>b.extend(c), new ml.LngLatBounds(coords[0],coords[0]))
    mapRef.current.fitBounds(b, {padding:{top:100,bottom:bottomPad+60,left:60,right:60},maxZoom:16,duration:900})
  }
  function fitLngLats(arr) {
    if(!mapRef.current||!arr?.length) return
    const ml=window.maplibregl
    const b=arr.reduce((b,c)=>b.extend(c), new ml.LngLatBounds(arr[0],arr[0]))
    mapRef.current.fitBounds(b, {padding:{top:100,bottom:bottomPad+60,left:60,right:60},maxZoom:16,duration:900})
  }

  return (
    <div ref={divRef} style={{ position:'absolute', inset:0, background:'#e8e4dc' }}>
      <style>{`
        .maplibregl-ctrl-bottom-left { bottom:${bottomPad+10}px !important; }
        .maplibregl-ctrl-bottom-right { bottom:${bottomPad+10}px !important; }
        .maplibregl-ctrl-top-right { display:none; }
      `}</style>
    </div>
  )
}

/* -- Marker HTML ------------------------------------------------- */
function pickupHtml() {
  return `
    <style>@keyframes jcPing{0%{transform:scale(1);opacity:.7}70%{transform:scale(2.4);opacity:0}100%{opacity:0}}</style>
    <div style="position:relative;width:28px;height:28px;display:flex;align-items:center;justify-content:center">
      <div style="position:absolute;inset:-6px;border-radius:50%;border:2px solid rgba(34,197,94,0.6);animation:jcPing 2s ease-out infinite;pointer-events:none"></div>
      <div style="width:24px;height:24px;border-radius:50%;background:#22C55E;border:3px solid #fff;box-shadow:0 2px 8px rgba(34,197,94,0.5),0 4px 14px rgba(0,0,0,0.2)"></div>
    </div>`
}

function dropHtml() {
  return `
    <div style="display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 4px 8px rgba(0,0,0,0.3))">
      <div style="width:26px;height:26px;border-radius:50% 50% 50% 0;background:#F97316;border:3px solid #fff;transform:rotate(-45deg)"></div>
    </div>`
}

function driverHtml() {
  /* Rapido-style driver marker: orange circle with white bike icon pointing UP (North)
   * Rotation is applied on .drv-icon — bearing 0 = North, 90 = East, etc.
   * No offset needed. */
  return `
    <style>
      .drv-wrap{position:relative;width:52px;height:52px}
      .drv-icon{width:52px;height:52px;will-change:transform;transform-origin:26px 26px;display:block;transition:none}
      @keyframes drvPing{0%{transform:scale(0.6);opacity:0.8}100%{transform:scale(2.4);opacity:0}}
      .drv-ring{position:absolute;inset:0;border-radius:50%;border:2px solid rgba(255,95,31,0.6);animation:drvPing 2s ease-out infinite;pointer-events:none}
      .drv-ring2{position:absolute;inset:0;border-radius:50%;border:2px solid rgba(255,95,31,0.4);animation:drvPing 2s ease-out 0.7s infinite;pointer-events:none}
    </style>
    <div class="drv-wrap">
      <div class="drv-ring"></div>
      <div class="drv-ring2"></div>
      <svg class="drv-icon" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="og" x1="0" y1="0" x2="52" y2="52" gradientUnits="userSpaceOnUse">
            <stop stop-color="#FF5F1F"/>
            <stop offset="1" stop-color="#FF9500"/>
          </linearGradient>
        </defs>
        <!-- Shadow -->
        <circle cx="26" cy="27" r="22" fill="rgba(0,0,0,0.15)"/>
        <!-- Main circle -->
        <circle cx="26" cy="26" r="22" fill="url(#og)" stroke="white" stroke-width="2.5"/>
        <!-- Bike/scooter top-down view pointing UP — simplified clean shape -->
        <!-- Body -->
        <ellipse cx="26" cy="27" rx="4" ry="9" fill="white" opacity="0.95"/>
        <!-- Front wheel (top = North direction) -->
        <ellipse cx="26" cy="14" rx="3" ry="5" fill="white" opacity="0.9"/>
        <!-- Rear wheel (bottom) -->
        <ellipse cx="26" cy="38" rx="3" ry="5" fill="white" opacity="0.9"/>
        <!-- Handlebars -->
        <line x1="20" y1="17" x2="32" y2="17" stroke="white" stroke-width="2.5" stroke-linecap="round" opacity="0.9"/>
      </svg>
    </div>`
}

function nearbyDotHtml(i) {
  const d=((i*0.4)%1.6).toFixed(1)
  return `
    <style>@keyframes nbFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}</style>
    <div style="width:34px;height:34px;border-radius:50%;background:linear-gradient(145deg,#FF8C00,#FFAA44);display:flex;align-items:center;justify-content:center;font-size:17px;border:2px solid rgba(255,255,255,0.9);box-shadow:0 2px 10px rgba(255,140,0,0.3);opacity:0.85;animation:nbFloat 2s ease-in-out ${d}s infinite;will-change:transform">🛵</div>`
}
