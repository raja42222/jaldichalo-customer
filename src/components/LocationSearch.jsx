import { useState, useEffect, useRef } from 'react'
import { searchPlaces, reverseGeocode } from '../lib/geo'

const BackIcon  = () => <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
const XIcon     = () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
const PinIcon   = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
const ClockIcon = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
const LocIcon   = () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>
const SpinIcon  = () => <div style={{width:16,height:16,border:'2.5px solid #E0E0E0',borderTopColor:'#FF5F1F',borderRadius:'50%',animation:'spin 0.7s linear infinite',display:'inline-block'}}/>

/* -- Recent storage -- */
const KEY = 'jc_recent_v4'
const getRecent  = ()  => { try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] } }
const saveRecent = (p) => {
  try {
    const arr = getRecent().filter(x => x.id !== p.id).slice(0, 6)
    arr.unshift(p)
    localStorage.setItem(KEY, JSON.stringify(arr))
  } catch {}
}

/* -- Popular Kolkata places -- */
const POPULAR_KOLKATA = [
  { id:'kol1',  short:'Howrah Station',            label:'Howrah Railway Station, Howrah',            lat:22.5839, lng:88.3427 },
  { id:'kol2',  short:'Sealdah Station',            label:'Sealdah Railway Station, Kolkata',          lat:22.5644, lng:88.3700 },
  { id:'kol3',  short:'Netaji Subhas Airport',      label:'Kolkata Airport, Dum Dum',                  lat:22.6547, lng:88.4467 },
  { id:'kol4',  short:'Park Street',                label:'Park Street, Kolkata',                      lat:22.5510, lng:88.3515 },
  { id:'kol5',  short:'Salt Lake Sector V',         label:'Salt Lake City Sector V, Kolkata',          lat:22.5706, lng:88.4342 },
  { id:'kol6',  short:'Esplanade',                  label:'Esplanade Metro, Kolkata',                  lat:22.5641, lng:88.3516 },
  { id:'kol7',  short:'Dakshineswar Temple',        label:'Dakshineswar, Kolkata',                     lat:22.6559, lng:88.3578 },
  { id:'kol8',  short:'New Town Action Area',       label:'New Town, Rajarhat, Kolkata',               lat:22.5976, lng:88.4801 },
  { id:'kol9',  short:'Behala Chowrasta',           label:'Behala, Kolkata',                           lat:22.4997, lng:88.3116 },
  { id:'kol10', short:'Barasat',                    label:'Barasat, North 24 Parganas',                lat:22.7208, lng:88.4799 },
  { id:'kol11', short:'Dum Dum',                    label:'Dum Dum, Kolkata',                          lat:22.6551, lng:88.3998 },
  { id:'kol12', short:'Gariahat',                   label:'Gariahat, South Kolkata',                   lat:22.5184, lng:88.3714 },
]

function BookForModal({ current, userPhone, onClose, onChange }) {
  const [mode,   setMode]   = useState(current?.type || 'myself')
  const [cName,  setCName]  = useState(current?.name || '')
  const [cPhone, setCPhone] = useState(current?.rawPhone || '')

  function confirm() {
    if (mode === 'myself') { onChange({ type:'myself', phone:userPhone }); onClose(); return }
    const digits = cPhone.replace(/\D/g, '')
    if (digits.length < 10) { alert('Enter a valid 10-digit number'); return }
    onChange({ type:'other', name:cName.trim(), phone:`+91${digits.slice(-10)}`, rawPhone:digits.slice(-10) })
    onClose()
  }

  return (
    <div className="overlay" style={{ zIndex:80 }} onClick={e => e.target===e.currentTarget&&onClose()}>
      <div className="anim-slide" style={{ width:'100%', background:'#fff', borderRadius:'24px 24px 0 0', padding:'10px 20px calc(28px + var(--safe-bottom))' }}>
        <div className="sheet-handle"/>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:22 }}>
          <div className="t-h2">Booking ride for</div>
          <button className="btn btn-icon" style={{ width:34, height:34 }} onClick={onClose}><XIcon /></button>
        </div>
        <div onClick={()=>setMode('myself')} style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 0', borderBottom:'1px solid var(--border)', cursor:'pointer' }}>
          <div style={{ width:40, height:40, borderRadius:'50%', background:'var(--bg2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>👤</div>
          <div style={{ flex:1 }}><div className="t-h3">Myself</div><div className="t-small t-muted">{userPhone}</div></div>
          <div style={{ width:22, height:22, borderRadius:'50%', border:`2px solid ${mode==='myself'?'var(--green2)':'var(--border2)'}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            {mode==='myself'&&<div style={{ width:12, height:12, borderRadius:'50%', background:'var(--green2)' }} />}
          </div>
        </div>
        <div onClick={()=>setMode('other')} style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 0', cursor:'pointer', borderBottom:'1px solid var(--border)' }}>
          <div style={{ width:40, height:40, borderRadius:'50%', background:'var(--bg2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>👥</div>
          <div style={{ flex:1 }}><div className="t-h3">Someone else</div><div className="t-small t-muted">Book for a friend or family member</div></div>
          <div style={{ width:22, height:22, borderRadius:'50%', border:`2px solid ${mode==='other'?'var(--green2)':'var(--border2)'}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            {mode==='other'&&<div style={{ width:12, height:12, borderRadius:'50%', background:'var(--green2)' }} />}
          </div>
        </div>
        {mode==='other'&&(
          <div style={{ marginTop:16, display:'flex', flexDirection:'column', gap:12 }}>
            <input placeholder="Their name" value={cName} onChange={e=>setCName(e.target.value)}
              style={{ padding:'13px 16px', borderRadius:14, border:'1.5px solid var(--border2)', fontSize:15, fontFamily:'inherit', outline:'none', background:'var(--bg2)' }}
            />
            <div style={{ display:'flex', alignItems:'center', background:'var(--bg2)', borderRadius:14, border:'1.5px solid var(--border2)', overflow:'hidden' }}>
              <span style={{ padding:'13px 12px', borderRight:'1px solid var(--border)', fontWeight:700, fontSize:14, color:'#555', flexShrink:0 }}>🇮🇳 +91</span>
              <input type="tel" inputMode="numeric" placeholder="Their phone number" value={cPhone}
                onChange={e=>setCPhone(e.target.value.replace(/\D/g,'').slice(0,10))}
                style={{ flex:1, padding:'13px 12px', border:'none', outline:'none', fontFamily:'inherit', fontSize:15, background:'transparent' }}
              />
            </div>
          </div>
        )}
        <button onClick={confirm}
          style={{ marginTop:20, width:'100%', padding:'15px', background:'linear-gradient(135deg,#FF5F1F,#FF8C00)', color:'#fff', border:'none', borderRadius:16, fontWeight:800, fontSize:15, cursor:'pointer', fontFamily:'inherit' }}>
          Confirm
        </button>
      </div>
    </div>
  )
}

/* ============================================================
   LOCATION SEARCH
============================================================ */
export default function LocationSearch({ mode, currentLoc, onSelect, onClose, bookingFor, userPhone, onBookingForChange }) {
  const [query,    setQuery]   = useState('')
  const [results,  setResults] = useState([])
  const [loading,  setLoading] = useState(false)
  const [recents,  setRecents] = useState(getRecent)
  const [showBookFor, setShowBookFor] = useState(false)
  const [gpsLoading,  setGpsLoading]  = useState(false)

  const inputRef  = useRef(null)
  const debouncer = useRef(null)

  // Focus input on open
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 150)
  }, [])

  // Debounced search — searches as you type
  useEffect(() => {
    clearTimeout(debouncer.current)
    if (query.trim().length < 2) { setResults([]); setLoading(false); return }
    setLoading(true)
    debouncer.current = setTimeout(async () => {
      const biasLat = currentLoc?.[0] || 22.5726
      const biasLng = currentLoc?.[1] || 88.3639
      const res = await searchPlaces(query, biasLat, biasLng)
      setResults(res)
      setLoading(false)
    }, 200)   // 200ms debounce — fast enough to feel instant
  }, [query, currentLoc])

  function pick(place) {
    saveRecent(place)
    setRecents(getRecent())
    onSelect(place)
  }

  async function useGPSLocation() {
    setGpsLoading(true)
    navigator.geolocation?.getCurrentPosition(
      async pos => {
        const { latitude: lat, longitude: lng } = pos.coords
        const addr = await reverseGeocode(lat, lng)
        pick({ id:'current', short:'Current Location', label:addr, lat, lng })
        setGpsLoading(false)
      },
      () => { setGpsLoading(false); alert('Could not get location. Please allow location access.') },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const showSuggestions = query.trim().length >= 2
  const showRecents     = !showSuggestions && recents.length > 0
  const showPopular     = !showSuggestions && !showRecents

  return (
    <>
      <div style={{ position:'fixed', inset:0, background:'#fff', zIndex:60, display:'flex', flexDirection:'column' }}>
        {/* Header */}
        <div style={{ padding:'calc(env(safe-area-inset-top,0px)+10px) 16px 10px', background:'#fff', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
            <button className="btn btn-icon" onClick={onClose} style={{ flexShrink:0 }}><BackIcon /></button>
            <div style={{ fontWeight:700, fontSize:16 }}>
              {mode === 'pickup' ? '📍 Set Pickup Point' : '🎯 Where to?'}
            </div>
            {mode === 'drop' && (
              <button onClick={()=>setShowBookFor(true)}
                style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:6, padding:'6px 12px', background:'var(--bg2)', borderRadius:20, border:'none', cursor:'pointer', fontFamily:'inherit', fontSize:13, fontWeight:600, flexShrink:0 }}>
                👤 {bookingFor?.type==='other' ? bookingFor.name||'Other' : 'For me'} ▾
              </button>
            )}
          </div>

          {/* Search input */}
          <div style={{ display:'flex', alignItems:'center', background:'var(--bg2)', borderRadius:16, border:'1.5px solid #FF5F1F', gap:10, padding:'0 12px' }}>
            <div style={{ color:'#FF5F1F', flexShrink:0 }}><PinIcon /></div>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={mode === 'pickup' ? 'Search pickup location' : 'Search destination'}
              style={{ flex:1, padding:'14px 0', fontSize:16, border:'none', outline:'none', background:'transparent', fontFamily:'inherit', color:'#111', userSelect:'text', WebkitUserSelect:'text' }}
              autoFocus
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
            {loading
              ? <SpinIcon />
              : query
                ? <button onClick={()=>setQuery('')} style={{ background:'none', border:'none', cursor:'pointer', color:'#aaa', flexShrink:0 }}><XIcon /></button>
                : null
            }
          </div>
        </div>

        {/* Body */}
        <div style={{ flex:1, overflowY:'auto' }}>
          {/* Use GPS */}
          <div onClick={useGPSLocation} style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 18px', borderBottom:'1px solid var(--border)', cursor:'pointer', background: gpsLoading ? 'var(--bg2)' : '#fff' }}>
            <div style={{ width:40, height:40, borderRadius:12, background:'#EBF5FB', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              {gpsLoading ? <SpinIcon /> : <LocIcon />}
            </div>
            <div>
              <div style={{ fontWeight:700, fontSize:14, color:'#0EA5E9' }}>Use Current Location</div>
              <div style={{ fontSize:12, color:'#888', marginTop:1 }}>Get your exact GPS location</div>
            </div>
          </div>

          {/* Search results */}
          {showSuggestions && (
            <div>
              {loading && !results.length && (
                <div style={{ padding:'20px', textAlign:'center', color:'#888', fontSize:14 }}>
                  <SpinIcon /> &nbsp;Searching...
                </div>
              )}
              {!loading && results.length === 0 && (
                <div style={{ padding:'40px 20px', textAlign:'center' }}>
                  <div style={{ fontSize:40, marginBottom:10 }}>🔍</div>
                  <div style={{ fontWeight:700, fontSize:16 }}>No results found</div>
                  <div style={{ fontSize:13, color:'#888', marginTop:6 }}>Try a different spelling or landmark</div>
                </div>
              )}
              {results.map((p, i) => (
                <div key={p.id || i} onClick={() => pick(p)}
                  style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 18px', borderBottom:'1px solid var(--border)', cursor:'pointer' }}>
                  <div style={{ width:38, height:38, borderRadius:10, background:'var(--bg2)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <PinIcon />
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:600, fontSize:14, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.short}</div>
                    <div style={{ fontSize:12, color:'#888', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.sublabel || p.label}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Recent searches */}
          {showRecents && (
            <div>
              <div style={{ padding:'14px 18px 8px', fontSize:11, fontWeight:700, color:'#888', textTransform:'uppercase', letterSpacing:'0.05em' }}>Recent</div>
              {recents.map((p, i) => (
                <div key={p.id || i} onClick={() => pick(p)}
                  style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 18px', borderBottom:'1px solid var(--border)', cursor:'pointer' }}>
                  <div style={{ width:38, height:38, borderRadius:10, background:'var(--bg2)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <ClockIcon />
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:600, fontSize:14, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.short}</div>
                    <div style={{ fontSize:12, color:'#888', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.sublabel || p.label}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Popular Kolkata places */}
          {showPopular && (
            <div>
              <div style={{ padding:'14px 18px 8px', fontSize:11, fontWeight:700, color:'#888', textTransform:'uppercase', letterSpacing:'0.05em' }}>Popular in Kolkata & WB</div>
              {POPULAR_KOLKATA.map((p, i) => (
                <div key={p.id} onClick={() => pick(p)}
                  style={{ display:'flex', alignItems:'center', gap:14, padding:'13px 18px', borderBottom:'1px solid var(--border)', cursor:'pointer' }}>
                  <div style={{ width:38, height:38, borderRadius:10, background:'#FFF0E8', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <span style={{ fontSize:18 }}>
                      {['🚂','🚂','✈️','🌆','💻','🏛️','⛺','🏙️','🏘️','🏘️','✈️','🛍️'][i] || '📍'}
                    </span>
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:600, fontSize:14 }}>{p.short}</div>
                    <div style={{ fontSize:12, color:'#888', marginTop:2 }}>{p.label}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showBookFor && (
        <BookForModal current={bookingFor} userPhone={userPhone}
          onClose={() => setShowBookFor(false)}
          onChange={v => { onBookingForChange?.(v); setShowBookFor(false) }}
        />
      )}
    </>
  )
}
