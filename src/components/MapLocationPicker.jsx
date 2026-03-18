import { useEffect, useRef, useState, useCallback } from 'react'
import { reverseGeocode, searchPlaces } from '../lib/geo'

/* ================================================================
   MAP LOCATION PICKER — Uber/Rapido style
   
   Flow:
   1. Full-screen map with center pin
   2. User drags map — pin stays fixed in center
   3. Live reverse geocode shows address as map moves
   4. "Confirm" button locks the location
   5. Search bar at top for typing an address
   6. "Use GPS" button for instant current location
   
   Features:
   - MapLibre GL — same as main map (shared loader)
   - High accuracy GPS on open
   - Debounced reverse geocode on map move (300ms)
   - Search suggestions dropdown
   - Smooth map animations
================================================================ */

const ML_JS  = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js'
const ML_CSS = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css'
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'

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

const BackIcon  = () => <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
const SearchIcon = () => <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
const LocIcon   = () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>
const XIcon     = () => <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
const PinIcon   = () => <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>

export default function MapLocationPicker({
  mode,          // 'pickup' | 'drop'
  initialLat,    // starting map center
  initialLng,
  currentGPS,    // user's GPS [lat, lng]
  onConfirm,     // (place) => void
  onClose,
}) {
  const divRef      = useRef(null)
  const mapRef      = useRef(null)
  const alive       = useRef(true)
  const moveTimer   = useRef(null)
  const searchTimer = useRef(null)

  const [address,   setAddress]   = useState('Locating...')
  const [lat,       setLat]       = useState(initialLat || currentGPS?.[0] || 22.5726)
  const [lng,       setLng]       = useState(initialLng || currentGPS?.[1] || 88.3639)
  const [isMoving,  setIsMoving]  = useState(false)
  const [geocoding, setGeocoding] = useState(false)
  const [gpsLoading,setGpsLoad]   = useState(false)
  const [query,     setQuery]     = useState('')
  const [results,   setResults]   = useState([])
  const [showSearch, setShowSearch] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  const isPickup = mode === 'pickup'
  const accentColor = isPickup ? '#22C55E' : '#FF5F1F'

  /* -- Mount map ---------------------------------------------- */
  useEffect(() => {
    alive.current = true
    ensureML(() => { if (alive.current && divRef.current) initMap() })
    return () => {
      alive.current = false
      clearTimeout(moveTimer.current)
      clearTimeout(searchTimer.current)
      if (mapRef.current) { try { mapRef.current.remove() } catch {} mapRef.current = null }
    }
  }, []) // eslint-disable-line

  function initMap() {
    if (mapRef.current || !divRef.current || !window.maplibregl) return
    const cLat = initialLat || currentGPS?.[0] || 22.5726
    const cLng = initialLng || currentGPS?.[1] || 88.3639

    const map = new window.maplibregl.Map({
      container:          divRef.current,
      style:              MAP_STYLE,
      center:             [cLng, cLat],
      zoom:               16,
      maxZoom:            19,
      minZoom:            10,
      attributionControl: false,
      pitchWithRotate:    false,
      dragRotate:         false,
    })

    map.addControl(new window.maplibregl.AttributionControl({ compact: true }), 'bottom-left')

    // Events
    map.on('dragstart',  () => { if (alive.current) { setIsMoving(true); setGeocoding(false) } })
    map.on('drag',       () => { if (alive.current) { setIsMoving(true) } })
    map.on('dragend',    onMoveEnd)
    map.on('moveend',    onMoveEnd)
    map.on('zoomstart',  () => { if (alive.current) setIsMoving(true) })
    map.on('zoomend',    onMoveEnd)

    mapRef.current = map

    // Initial reverse geocode
    doReverseGeocode(cLat, cLng)
  }

  const onMoveEnd = useCallback(() => {
    if (!alive.current || !mapRef.current) return
    setIsMoving(false)
    const center = mapRef.current.getCenter()
    const newLat = center.lat
    const newLng = center.lng
    setLat(newLat)
    setLng(newLng)

    // Debounce reverse geocode — don't spam API
    clearTimeout(moveTimer.current)
    setGeocoding(true)
    moveTimer.current = setTimeout(() => {
      doReverseGeocode(newLat, newLng)
    }, 350)
  }, [])

  async function doReverseGeocode(lt, lg) {
    if (!alive.current) return
    try {
      const addr = await reverseGeocode(lt, lg)
      if (alive.current) { setAddress(addr); setGeocoding(false) }
    } catch {
      if (alive.current) { setAddress('Selected location'); setGeocoding(false) }
    }
  }

  /* -- GPS locate --------------------------------------------- */
  function goToGPS() {
    if (!navigator.geolocation) return
    setGpsLoad(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        if (!alive.current) return
        const { latitude: lt, longitude: lg } = pos.coords
        setGpsLoad(false)
        mapRef.current?.flyTo({ center: [lg, lt], zoom: 17, duration: 900 })
        setLat(lt); setLng(lg)
        doReverseGeocode(lt, lg)
      },
      () => {
        setGpsLoad(false)
        // Use currentGPS fallback
        if (currentGPS) {
          mapRef.current?.flyTo({ center: [currentGPS[1], currentGPS[0]], zoom: 17, duration: 900 })
        }
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    )
  }

  /* -- Search ------------------------------------------------- */
  useEffect(() => {
    clearTimeout(searchTimer.current)
    if (query.trim().length < 2) { setResults([]); setSearchLoading(false); return }
    setSearchLoading(true)
    searchTimer.current = setTimeout(async () => {
      const bLat = currentGPS?.[0] || 22.5726
      const bLng = currentGPS?.[1] || 88.3639
      const res = await searchPlaces(query, bLat, bLng)
      if (alive.current) { setResults(res); setSearchLoading(false) }
    }, 250)
  }, [query, currentGPS])

  function selectSearchResult(place) {
    setQuery('')
    setResults([])
    setShowSearch(false)
    setAddress(place.short)
    setLat(place.lat)
    setLng(place.lng)
    mapRef.current?.flyTo({ center: [place.lng, place.lat], zoom: 17, duration: 800 })
  }

  /* -- Confirm ------------------------------------------------ */
  function confirmLocation() {
    setConfirmed(true)
    setTimeout(() => {
      onConfirm({
        id:       `map_${lat.toFixed(5)}_${lng.toFixed(5)}`,
        short:    address,
        label:    address,
        sublabel: '',
        lat,
        lng,
        source:   'map',
      })
    }, 200)
  }

  const pinIsMoving = isMoving || geocoding

  return (
    <div style={{ position:'fixed', inset:0, zIndex:50, display:'flex', flexDirection:'column', background:'#e8e4dc' }}>
      <style>{`
        @keyframes pinBounce {
          0%,100%{ transform:translateX(-50%) translateY(0); }
          50%     { transform:translateX(-50%) translateY(-8px); }
        }
        @keyframes shadowPulse {
          0%,100%{ transform:translateX(-50%) scale(1); opacity:0.3; }
          50%     { transform:translateX(-50%) scale(0.6); opacity:0.15; }
        }
        @keyframes fadeSlideUp {
          from { opacity:0; transform:translateY(10px); }
          to   { opacity:1; transform:translateY(0); }
        }
        .confirm-btn:active { transform:scale(0.97); }
        .map-picker-result:active { background:#f5f5f5; }
        .gps-btn:active { transform:scale(0.92); }
      `}</style>

      {/* -- Top bar ------------------------------------------- */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
        padding: 'calc(env(safe-area-inset-top,0px)+10px) 12px 10px',
        display: 'flex', flexDirection: 'column', gap: 8,
        pointerEvents: 'none',
      }}>
        {/* Back + mode label */}
        <div style={{ display:'flex', alignItems:'center', gap:10, pointerEvents:'all' }}>
          <button onClick={onClose} style={{
            width:42, height:42, borderRadius:'50%',
            background:'rgba(255,255,255,0.96)',
            backdropFilter:'blur(12px)', border:'none', cursor:'pointer',
            display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow:'0 2px 12px rgba(0,0,0,0.18)',
          }}>
            <BackIcon />
          </button>

          {/* Mode pill */}
          <div style={{
            background:'rgba(255,255,255,0.96)',
            backdropFilter:'blur(12px)',
            borderRadius:22, padding:'9px 16px',
            display:'flex', alignItems:'center', gap:8,
            boxShadow:'0 2px 12px rgba(0,0,0,0.15)',
          }}>
            <div style={{
              width:9, height:9, borderRadius:'50%',
              background: accentColor,
              boxShadow:`0 0 6px ${accentColor}`,
            }}/>
            <span style={{ fontWeight:700, fontSize:14, color:'#111' }}>
              {isPickup ? 'Set Pickup Point' : 'Set Drop Point'}
            </span>
          </div>
        </div>

        {/* Search bar */}
        <div style={{ pointerEvents:'all' }}>
          {!showSearch ? (
            <button onClick={() => { setShowSearch(true); setTimeout(() => document.getElementById('mps-input')?.focus(), 100) }}
              style={{
                width:'100%', display:'flex', alignItems:'center', gap:10,
                background:'rgba(255,255,255,0.97)',
                backdropFilter:'blur(14px)',
                borderRadius:14, padding:'12px 16px',
                border:`1.5px solid ${accentColor}33`,
                cursor:'text', textAlign:'left',
                boxShadow:'0 2px 12px rgba(0,0,0,0.12)',
              }}>
              <span style={{ color:'#888', flexShrink:0 }}><SearchIcon /></span>
              <span style={{ fontSize:14, color:'#999', flex:1 }}>Search for a location...</span>
            </button>
          ) : (
            <div>
              <div style={{
                display:'flex', alignItems:'center', gap:8,
                background:'rgba(255,255,255,0.97)',
                backdropFilter:'blur(14px)',
                borderRadius:14, padding:'12px 14px',
                border:`2px solid ${accentColor}`,
                boxShadow:'0 2px 16px rgba(0,0,0,0.15)',
              }}>
                <span style={{ color:accentColor, flexShrink:0 }}><SearchIcon /></span>
                <input
                  id="mps-input"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder={`Search ${isPickup ? 'pickup' : 'destination'}...`}
                  style={{
                    flex:1, border:'none', outline:'none', fontSize:15,
                    background:'transparent', fontFamily:'inherit', color:'#111',
                  }}
                  autoComplete="off" autoCorrect="off" spellCheck={false}
                />
                {searchLoading
                  ? <div style={{ width:16,height:16,border:`2px solid #E0E0E0`,borderTopColor:accentColor,borderRadius:'50%',animation:'spin 0.7s linear infinite',flexShrink:0 }}/>
                  : <button onClick={() => { setQuery(''); setResults([]); setShowSearch(false) }} style={{ background:'none',border:'none',cursor:'pointer',color:'#aaa',flexShrink:0,padding:2 }}><XIcon /></button>
                }
              </div>

              {/* Search results dropdown */}
              {results.length > 0 && (
                <div style={{
                  marginTop:6, background:'rgba(255,255,255,0.98)',
                  backdropFilter:'blur(20px)',
                  borderRadius:14, overflow:'hidden',
                  boxShadow:'0 8px 32px rgba(0,0,0,0.18)',
                  animation:'fadeSlideUp 0.2s ease',
                  maxHeight:240, overflowY:'auto',
                }}>
                  {results.map((p, i) => (
                    <div key={p.id||i} onClick={() => selectSearchResult(p)}
                      className="map-picker-result"
                      style={{
                        display:'flex', alignItems:'center', gap:12,
                        padding:'12px 16px',
                        borderBottom: i < results.length-1 ? '1px solid #F0F0F0' : 'none',
                        cursor:'pointer',
                      }}>
                      <div style={{ width:34,height:34,borderRadius:10,background:'#FFF0E8',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
                        <PinIcon />
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:600,fontSize:14,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{p.short}</div>
                        <div style={{ fontSize:12,color:'#888',marginTop:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{p.sublabel||p.label}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* -- Map container ------------------------------------- */}
      <div ref={divRef} style={{ position:'absolute', inset:0 }}>
        <style>{`.maplibregl-ctrl-bottom-left{bottom:180px!important}.maplibregl-ctrl-top-right{display:none}`}</style>
      </div>

      {/* -- Center pin (stays fixed on screen) ---------------- */}
      <div style={{
        position:'absolute', left:'50%', top:'50%',
        zIndex:10, pointerEvents:'none',
        // Pin drops down from center — offset upward by pin height
        transform:'translateX(-50%) translateY(-100%)',
      }}>
        {/* Pin shadow — shrinks when moving (pin is "up") */}
        <div style={{
          width:16, height:6, borderRadius:'50%',
          background:'rgba(0,0,0,0.25)',
          margin:'0 auto',
          transform:`translateX(-50%) scale(${pinIsMoving ? 0.6 : 1})`,
          opacity: pinIsMoving ? 0.15 : 0.3,
          transition:'transform 0.25s ease, opacity 0.25s ease',
          position:'absolute', bottom:-4, left:'50%',
          filter:'blur(2px)',
        }}/>

        {/* Pin body */}
        <div style={{
          transform:`translateY(${pinIsMoving ? '-10px' : '0px'})`,
          transition:'transform 0.25s cubic-bezier(0.34,1.56,0.64,1)',
          display:'flex', flexDirection:'column', alignItems:'center',
        }}>
          {/* Pin head */}
          <div style={{
            width:44, height:44, borderRadius:'50% 50% 50% 0',
            transform:'rotate(-45deg)',
            background:`linear-gradient(135deg, ${accentColor}, ${isPickup ? '#16A34A' : '#FF8C00'})`,
            border:'3px solid #fff',
            boxShadow:`0 4px 20px ${accentColor}66, 0 8px 32px rgba(0,0,0,0.2)`,
            display:'flex', alignItems:'center', justifyContent:'center',
            position:'relative',
          }}>
            {/* Inner dot */}
            <div style={{
              width:14, height:14, borderRadius:'50%',
              background:'rgba(255,255,255,0.95)',
              transform:'rotate(45deg)',
            }}/>
          </div>

          {/* Pin tail */}
          <div style={{
            width:3, height:12,
            background:`linear-gradient(to bottom, ${accentColor}, transparent)`,
            borderRadius:2,
            marginTop:-3,
          }}/>
        </div>
      </div>

      {/* -- GPS button ---------------------------------------- */}
      <button onClick={goToGPS} className="gps-btn"
        style={{
          position:'absolute', right:14, bottom:240, zIndex:20,
          width:46, height:46, borderRadius:'50%',
          background: gpsLoading ? accentColor : '#fff',
          border:'none', cursor:'pointer',
          display:'flex', alignItems:'center', justifyContent:'center',
          boxShadow:'0 3px 14px rgba(0,0,0,0.22)',
          transition:'all 0.2s',
        }}>
        {gpsLoading
          ? <div style={{ width:20,height:20,border:'3px solid rgba(255,255,255,0.4)',borderTopColor:'#fff',borderRadius:'50%',animation:'spin 0.7s linear infinite' }}/>
          : <LocIcon />
        }
      </button>

      {/* -- Bottom confirm panel ------------------------------- */}
      <div style={{
        position:'absolute', bottom:0, left:0, right:0, zIndex:20,
        background:'rgba(255,255,255,0.97)',
        backdropFilter:'blur(20px)',
        borderRadius:'24px 24px 0 0',
        padding:'16px 16px calc(24px + env(safe-area-inset-bottom,0px))',
        boxShadow:'0 -8px 32px rgba(0,0,0,0.12)',
        animation:'fadeSlideUp 0.3s ease',
      }}>
        {/* Handle */}
        <div style={{ width:36,height:4,background:'#E0E0E0',borderRadius:2,margin:'0 auto 14px' }}/>

        {/* Address display */}
        <div style={{
          display:'flex', alignItems:'flex-start', gap:12,
          background:'#F8F8F8', borderRadius:16,
          padding:'14px 16px', marginBottom:14,
          border:`1.5px solid ${accentColor}33`,
          minHeight:60,
        }}>
          <div style={{
            width:10, height:10, borderRadius:'50%',
            background: accentColor, marginTop:4, flexShrink:0,
            boxShadow:`0 0 8px ${accentColor}66`,
          }}/>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:11,color:'#888',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:3 }}>
              {isPickup ? 'Pickup Location' : 'Drop Location'}
            </div>
            {geocoding || isMoving ? (
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ width:12,height:12,border:`2px solid #E0E0E0`,borderTopColor:accentColor,borderRadius:'50%',animation:'spin 0.7s linear infinite',flexShrink:0 }}/>
                <span style={{ fontSize:14,color:'#888' }}>Getting address...</span>
              </div>
            ) : (
              <div style={{ fontSize:15,fontWeight:700,color:'#111',lineHeight:1.3 }}>{address}</div>
            )}
          </div>
        </div>

        {/* Confirm button */}
        <button
          onClick={confirmLocation}
          disabled={geocoding || isMoving || confirmed}
          className="confirm-btn"
          style={{
            width:'100%', padding:'16px',
            background: (geocoding || isMoving || confirmed)
              ? '#E0E0E0'
              : `linear-gradient(135deg, ${accentColor}, ${isPickup ? '#16A34A' : '#FF8C00'})`,
            color: (geocoding || isMoving || confirmed) ? '#999' : '#fff',
            border:'none', borderRadius:16,
            fontWeight:800, fontSize:16,
            cursor: (geocoding || isMoving || confirmed) ? 'default' : 'pointer',
            fontFamily:'inherit',
            boxShadow: (geocoding || isMoving || confirmed) ? 'none' : `0 8px 24px ${accentColor}44`,
            transition:'all 0.2s',
            display:'flex', alignItems:'center', justifyContent:'center', gap:8,
          }}>
          {confirmed ? '✓ Location set!' : (geocoding ? 'Getting address...' : `Confirm ${isPickup ? 'Pickup' : 'Drop'} →`)}
        </button>
      </div>
    </div>
  )
}
