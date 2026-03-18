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
    this.mk=null; this.el=null
    this.queue=[]; this.cur=null
    this.from=null; this.to=null
    this.bearing=0; this.fromB=0; this.toB=0
    this.hist=[]; this.rafId=null
    this.startTs=null; this.dur=1800
    this.lastGpsTs=0; this.paused=false
    this._vis = this._vis.bind(this)
    document.addEventListener('visibilitychange', this._vis)
  }
  _vis() {
    if (document.hidden) { this.paused=true; if(this.rafId){cancelAnimationFrame(this.rafId);this.rafId=null} }
    else { this.paused=false; if(this.from&&this.to) this._raf() }
  }
  push(lng, lat) {
    const now = Date.now()
    if (this.cur && haversineM(this.cur[0],this.cur[1],lng,lat)<2) return
    if (this.lastGpsTs>0) this.dur = Math.min((now-this.lastGpsTs)*0.92, 2500)
    this.lastGpsTs = now
    this.queue.push([lng,lat])
    if (!this.rafId && !this.paused) this._next()
  }
  _next() {
    if (!this.queue.length||!this.mk) return
    const [lng,lat] = this.queue.shift()
    const from = this.cur||[lng,lat]
    this.from=from; this.to=[lng,lat]
    this.fromB=this.bearing
    this.toB = calcBearing(from[0],from[1],lng,lat)
    this.hist.push([...from])
    if (this.hist.length>4) this.hist.shift()
    if (haversineM(from[0],from[1],lng,lat)<10) this.dur=Math.min(this.dur,600)
    this.startTs=null; this._raf()
  }
  _raf() {
    if (this.rafId) cancelAnimationFrame(this.rafId)
    this.rafId = requestAnimationFrame(ts=>this._step(ts))
  }
  _step(ts) {
    if (this.paused||!this.mk||!this.from||!this.to) return
    if (!this.startTs) this.startTs=ts
    const raw = Math.min((ts-this.startTs)/this.dur, 1)
    const dist = haversineM(this.from[0],this.from[1],this.to[0],this.to[1])
    const t = dist<30 ? easeSmooth(raw) : easeOut(raw)
    // Catmull-Rom spline for smooth curves
    let pos
    if (this.hist.length>=3) {
      const h=this.hist, p0=h[h.length-2]||h[0], p1=h[h.length-1], p2=this.to
      const p3=[p2[0]+(p2[0]-p1[0]), p2[1]+(p2[1]-p1[1])]
      const t2=t*t, t3=t2*t
      pos=[
        0.5*((2*p1[0])+(-p0[0]+p2[0])*t+(2*p0[0]-5*p1[0]+4*p2[0]-p3[0])*t2+(-p0[0]+3*p1[0]-3*p2[0]+p3[0])*t3),
        0.5*((2*p1[1])+(-p0[1]+p2[1])*t+(2*p0[1]-5*p1[1]+4*p2[1]-p3[1])*t2+(-p0[1]+3*p1[1]-3*p2[1]+p3[1])*t3),
      ]
    } else {
      pos=[lerp(this.from[0],this.to[0],t), lerp(this.from[1],this.to[1],t)]
    }
    this.mk.setLngLat(pos)
    this.cur=pos
    const bear = lerpAngle(this.fromB, this.toB, easeSmooth(raw))
    const icon = this.el?.querySelector('.drv-icon')
    // 🛵 emoji faces left (West), so offset +90° so it faces direction of travel
    if (icon) icon.style.transform = `rotate(${bear}deg)`
    if (raw<1) { this.rafId=requestAnimationFrame(ts2=>this._step(ts2)) }
    else { this.cur=this.to; this.bearing=this.toB; this.rafId=null; if(this.queue.length) this._next() }
  }
  attach(mk,el) { this.mk=mk; this.el=el }
  teleport(lng,lat) {
    this.cur=[lng,lat]; this.from=[lng,lat]
    this.queue=[]; this.hist=[[lng,lat]]
    this.bearing=0   // default: face North (up)
    if(this.mk) this.mk.setLngLat([lng,lat])
    const icon = this.el?.querySelector('.drv-icon')
    if(icon) icon.style.transform = 'rotate(0deg)'
  }
  destroy() {
    if(this.rafId) cancelAnimationFrame(this.rafId)
    document.removeEventListener('visibilitychange',this._vis)
    this.mk=null; this.el=null; this.queue=[]; this.hist=[]; this.rafId=null
  }
}

/* ================================================================
   COMPONENT
================================================================ */
export default function MapView({
  center, pickupCoords, dropCoords,
  driverCoords, nearbyDrivers,
  showRoute, zoom=14, bottomPad=180,
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
      if(onReady) onReady()
      syncAll()
    })
  }

  /* -- Sync on prop change -- */
  useEffect(() => { if(ready.current) syncAll() },
    [center,pickupCoords,dropCoords,driverCoords,nearbyDrivers,showRoute,bottomPad]) // eslint-disable-line

  function syncAll() {
    if(!mapRef.current||!ready.current) return
    syncCenter()
    syncPin('pickup', pickupCoords, pickupHtml())
    syncPin('drop',   dropCoords,   dropHtml())
    syncDriver(driverCoords)
    syncNearby(nearbyDrivers||[])
    syncRoute()
    syncBounds()
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

  /* Driver marker with smooth animation */
  function syncDriver(coords) {
    const ml=window.maplibregl, anim=drvAnim.current
    if(!ml||!mapRef.current) return
    if(!coords) {
      if(anim.mk) { anim.mk.remove(); anim.destroy(); drvAnim.current=new DriverAnim() }
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
