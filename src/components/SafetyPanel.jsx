import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { triggerSOS, submitSafetyReport, REPORT_TYPES, buildShareLink, generateShareToken, getEmergencyContacts, saveEmergencyContact, deleteEmergencyContact } from '../lib/safetyService'

const XIcon = () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
const BackIcon = () => <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
const ChevR = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>

// --- SOS MODAL -------------------------------------------------
function SOSModal({ rideId, userId, role, gps, emergencyContacts, onClose }) {
  const [step, setStep] = useState('confirm')   // confirm | triggered | done
  const [result, setResult] = useState(null)
  const [countdown, setCountdown] = useState(5)

  useEffect(() => {
    if (step !== 'confirm') return
    if (countdown <= 0) { handleTrigger(); return }
    const id = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(id)
  }, [countdown, step])

  async function handleTrigger() {
    setStep('triggered')
    const res = await triggerSOS({ rideId, userId, role, lat: gps?.[0], lng: gps?.[1] })
    setResult(res)
    setStep('done')
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div className="anim-bounce" style={{ background:'#fff', borderRadius:24, padding:28, width:'100%', maxWidth:360, textAlign:'center' }}>
        {step === 'confirm' && (
          <>
            <div style={{ width:80, height:80, borderRadius:'50%', background:'#FEF2F2', border:'4px solid #DC2626', display:'flex', alignItems:'center', justifyContent:'center', fontSize:36, margin:'0 auto 16px' }}>🆘</div>
            <div className="t-h1" style={{ color:'#DC2626', marginBottom:8 }}>SOS Alert</div>
            <div className="t-body t-muted" style={{ marginBottom:20, lineHeight:1.6 }}>
              Your live location and ride details will be shared with emergency contacts.
              Triggering in <span style={{ fontWeight:800, color:'#DC2626', fontSize:18 }}>{countdown}</span>s
            </div>
            {emergencyContacts.length > 0 && (
              <div style={{ background:'#FEF2F2', borderRadius:12, padding:'12px 14px', marginBottom:18, textAlign:'left' }}>
                <div className="t-tiny t-muted" style={{ marginBottom:8, textTransform:'uppercase' }}>Notifying</div>
                {emergencyContacts.map(c => (
                  <div key={c.id} style={{ display:'flex', gap:8, alignItems:'center', marginBottom:4 }}>
                    <span style={{ fontSize:14 }}>👤</span>
                    <span style={{ fontWeight:600, fontSize:13 }}>{c.name}</span>
                    <span className="t-small t-muted">({c.relation})</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display:'flex', gap:10 }}>
              <button className="btn btn-outline" style={{ flex:1 }} onClick={onClose}>Cancel</button>
              <button onClick={handleTrigger} style={{ flex:2, padding:'14px', background:'#DC2626', color:'#fff', border:'none', borderRadius:14, fontWeight:800, fontSize:15, cursor:'pointer', fontFamily:'inherit' }}>
                🆘 SEND SOS NOW
              </button>
            </div>
          </>
        )}
        {step === 'triggered' && (
          <>
            <div style={{ width:60, height:60, border:'4px solid #DC2626', borderTopColor:'transparent', borderRadius:'50%', margin:'0 auto 20px', animation:'spin 0.8s linear infinite' }} />
            <div className="t-h2" style={{ color:'#DC2626' }}>Sending SOS…</div>
          </>
        )}
        {step === 'done' && (
          <>
            <div style={{ fontSize:48, marginBottom:14 }}>{result?.success ? '✅' : '❌'}</div>
            <div className="t-h2" style={{ marginBottom:8, color: result?.success ? 'var(--green)':'var(--red)' }}>
              {result?.success ? 'SOS Sent!' : 'Failed to Send'}
            </div>
            {result?.success && (
              <div className="t-body t-muted" style={{ marginBottom:16, lineHeight:1.6 }}>
                Your location has been shared. Help is on the way.
              </div>
            )}
            {/* Emergency call quick buttons */}
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16 }}>
              {emergencyContacts.slice(0,2).map(c => (
                <a key={c.id} href={`tel:${c.phone}`} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:'#ECFDF5', borderRadius:12, textDecoration:'none', color:'var(--green)', fontWeight:700, fontSize:14 }}>
                  📞 Call {c.name}
                </a>
              ))}
              <a href="tel:100" style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:'#FEF2F2', borderRadius:12, textDecoration:'none', color:'#DC2626', fontWeight:700, fontSize:14 }}>
                🚔 Call Police (100)
              </a>
              <a href="tel:108" style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:'#FEF2F2', borderRadius:12, textDecoration:'none', color:'#DC2626', fontWeight:700, fontSize:14 }}>
                🚑 Call Ambulance (108)
              </a>
            </div>
            <button className="btn btn-outline" onClick={onClose}>Close</button>
          </>
        )}
      </div>
    </div>
  )
}

// --- REPORT MODAL ----------------------------------------------
function ReportModal({ rideId, userId, role, onClose }) {
  const [selected, setSelected] = useState('')
  const [desc, setDesc] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function submit() {
    if (!selected) return
    setLoading(true)
    await submitSafetyReport({ rideId, reporterId: userId, reporterRole: role, reportType: selected, description: desc })
    setLoading(false); setDone(true)
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:180, display:'flex', alignItems:'flex-end', backdropFilter:'blur(3px)' }}>
      <div className="anim-slide" style={{ width:'100%', background:'#fff', borderRadius:'24px 24px 0 0', padding:'10px 20px calc(28px + var(--safe-bottom))', maxHeight:'85vh', overflowY:'auto' }}>
        <div className="sheet-handle" />
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
          <div className="t-h2">Report Safety Issue</div>
          <button className="btn btn-icon" onClick={onClose}><XIcon /></button>
        </div>
        {done ? (
          <div style={{ textAlign:'center', padding:'24px 0' }}>
            <div style={{ fontSize:48, marginBottom:12 }}>✅</div>
            <div className="t-h2" style={{ marginBottom:6 }}>Report Submitted</div>
            <div className="t-body t-muted" style={{ marginBottom:20 }}>Our safety team will review this shortly.</div>
            <button className="btn btn-primary" onClick={onClose}>Done</button>
          </div>
        ) : (
          <>
            <div className="t-tiny t-muted" style={{ textTransform:'uppercase', marginBottom:10 }}>Select Issue Type *</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16 }}>
              {REPORT_TYPES.map(rt => (
                <div key={rt.id} onClick={() => setSelected(rt.id)} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderRadius:12, border:`2px solid ${selected===rt.id?'var(--red)':'var(--border)'}`, background:selected===rt.id?'#FEF2F2':'#fff', cursor:'pointer', transition:'all 0.15s' }}>
                  <span style={{ fontSize:20 }}>{rt.emoji}</span>
                  <span style={{ fontWeight:600, fontSize:14, color:selected===rt.id?'var(--red)':'var(--text)' }}>{rt.label}</span>
                  {selected===rt.id && <span style={{ marginLeft:'auto', color:'var(--red)', fontWeight:800 }}>✓</span>}
                </div>
              ))}
            </div>
            <div className="t-tiny t-muted" style={{ textTransform:'uppercase', marginBottom:8 }}>Additional Details (optional)</div>
            <textarea className="input" rows={3} placeholder="Describe what happened…" value={desc} onChange={e=>setDesc(e.target.value)}
              style={{ resize:'none', marginBottom:16, userSelect:'text', WebkitUserSelect:'text' }} />
            <button className="btn btn-primary" style={{ background:'#DC2626' }} onClick={submit} disabled={loading||!selected}>
              {loading ? <span className="spinner-sm" /> : 'Submit Report'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// --- EMERGENCY CONTACTS MANAGER --------------------------------
function EmergencyContactsScreen({ userId, role, onClose }) {
  const [contacts, setContacts] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [adding,   setAdding]   = useState(false)
  const [form, setForm] = useState({ name:'', phone:'', relation:'family' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const c = await getEmergencyContacts(userId)
    setContacts(c); setLoading(false)
  }

  async function add() {
    if (!form.name.trim() || form.phone.replace(/\D/g,'').length < 10) {
      setErr('Enter valid name and 10-digit phone number'); return
    }
    setSaving(true); setErr('')
    const { error } = await saveEmergencyContact({ userId, role, ...form, phone: `+91${form.phone.replace(/\D/g,'').slice(-10)}` })
    if (error) { setErr(error.message); setSaving(false); return }
    await load(); setSaving(false); setAdding(false); setForm({ name:'', phone:'', relation:'family' })
  }

  async function remove(id) {
    await deleteEmergencyContact(id, userId); await load()
  }

  const RELATIONS = ['mother','father','spouse','sibling','friend','other']

  return (
    <div className="screen anim-in" style={{ background:'#fff', zIndex:100 }}>
      <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:12 }}>
        <button className="btn btn-icon" onClick={onClose}><BackIcon /></button>
        <div className="t-h2" style={{ flex:1 }}>Emergency Contacts</div>
        {contacts.length < 3 && <button className="btn btn-primary" style={{ width:'auto', padding:'9px 16px', borderRadius:12, fontSize:13 }} onClick={() => setAdding(true)}>+ Add</button>}
      </div>

      <div className="scroll" style={{ flex:1, overflowY:'auto', padding:'12px 16px' }}>
        <div style={{ background:'#FFF7ED', border:'1px solid #FED7AA', borderRadius:12, padding:'11px 14px', marginBottom:16, fontSize:13, color:'#92400E', lineHeight:1.6 }}>
          ⚠️ Emergency contacts will be notified with your live location when you press SOS. Add up to 3 trusted contacts.
        </div>

        {loading && [1,2].map(i => <div key={i} className="skel" style={{ height:72, borderRadius:14, marginBottom:8 }} />)}

        {!loading && contacts.length === 0 && (
          <div style={{ textAlign:'center', padding:'40px 0' }}>
            <div style={{ fontSize:40, marginBottom:12 }}>👥</div>
            <div className="t-h3" style={{ marginBottom:6 }}>No emergency contacts</div>
            <div className="t-body t-muted">Add up to 3 trusted contacts who will be notified in emergencies</div>
          </div>
        )}

        {contacts.map(c => (
          <div key={c.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 16px', background:'#fff', border:'1px solid var(--border)', borderRadius:14, marginBottom:8 }}>
            <div style={{ width:42, height:42, borderRadius:'50%', background:'#FEF2F2', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>👤</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div className="t-h3">{c.name}</div>
              <div className="t-small t-muted">{c.phone} · {c.relation}</div>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <a href={`tel:${c.phone}`} style={{ padding:'7px 12px', background:'#ECFDF5', borderRadius:10, color:'var(--green)', fontWeight:700, fontSize:12, textDecoration:'none' }}>Call</a>
              <button onClick={() => remove(c.id)} style={{ padding:'7px 12px', background:'#FEF2F2', borderRadius:10, color:'var(--red)', fontWeight:700, fontSize:12, border:'none', cursor:'pointer', fontFamily:'inherit' }}>Remove</button>
            </div>
          </div>
        ))}

        {adding && (
          <div style={{ background:'#F8F8F8', borderRadius:14, padding:16, marginTop:16, border:'1px solid var(--border)' }}>
            <div className="t-h3" style={{ marginBottom:12 }}>Add New Contact</div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <input className="input" placeholder="Full name *" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} />
              <div style={{ display:'flex', background:'#fff', border:'1.5px solid var(--border)', borderRadius:14, overflow:'hidden' }}>
                <div style={{ padding:'13px 12px', borderRight:'1px solid var(--border)', fontWeight:700, fontSize:14, flexShrink:0 }}>🇮🇳 +91</div>
                <input style={{ flex:1, background:'transparent', border:'none', outline:'none', padding:'13px 12px', fontSize:15, fontWeight:600, fontFamily:'inherit', color:'var(--text)', userSelect:'text', WebkitUserSelect:'text' }}
                  type="tel" inputMode="numeric" placeholder="Phone number *"
                  value={form.phone} onChange={e=>setForm({...form,phone:e.target.value.replace(/\D/g,'').slice(0,10)})} />
              </div>
              <select className="input" value={form.relation} onChange={e=>setForm({...form,relation:e.target.value})} style={{ background:'#fff' }}>
                {RELATIONS.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
              </select>
              {err && <div style={{ color:'var(--red)', fontSize:13, padding:'8px 12px', background:'var(--red-dim)', borderRadius:10 }}>{err}</div>}
              <div style={{ display:'flex', gap:8 }}>
                <button className="btn btn-outline" style={{ flex:1 }} onClick={() => setAdding(false)}>Cancel</button>
                <button className="btn btn-primary" style={{ flex:2 }} onClick={add} disabled={saving}>
                  {saving ? <span className="spinner-sm" /> : 'Save Contact'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// --- SHARE RIDE -------------------------------------------------
async function handleShareRide(rideId) {
  let token = null
  // Get existing token or generate
  const { data: ride } = await supabase.from('rides').select('share_token').eq('id', rideId).single()
  if (ride?.share_token) { token = ride.share_token }
  else { token = await generateShareToken(rideId) }
  if (!token) { alert('Could not generate share link'); return }
  const link = buildShareLink(token)
  if (navigator.share) {
    navigator.share({ title: 'Track my Jaldi Chalo ride', text: 'Track my live ride location:', url: link })
  } else {
    navigator.clipboard?.writeText(link).then(() => alert(`Link copied!\n${link}`)).catch(() => alert(`Share link:\n${link}`))
  }
}

// --- SAFETY ALERTS LISTENER -------------------------------------
export function useSafetyAlerts(rideId, onAlert) {
  useEffect(() => {
    if (!rideId) return
    const ch = supabase.channel(`safety-${rideId}`)
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'safety_alerts', filter:`ride_id=eq.${rideId}` }, ({ new: alert }) => {
        onAlert && onAlert(alert)
      }).subscribe()
    return () => ch.unsubscribe()
  }, [rideId])
}

// --- MAIN SAFETY PANEL -----------------------------------------
// Floating SOS bar shown during active rides
export function SafetyBar({ rideId, userId, role, gps, onReport }) {
  const [showSOS, setShowSOS] = useState(false)
  const [emergencyContacts, setEmergencyContacts] = useState([])

  useEffect(() => {
    if (!userId) return
    getEmergencyContacts(userId).then(setEmergencyContacts)
  }, [userId])

  return (
    <>
      <div style={{ display:'flex', gap:8, padding:'8px 14px', background:'#FFF7ED', borderBottom:'1px solid #FED7AA', alignItems:'center', flexShrink:0 }}>
        <button
          onClick={() => setShowSOS(true)}
          style={{ flex:'none', padding:'8px 16px', background:'#DC2626', color:'#fff', border:'none', borderRadius:10, fontWeight:800, fontSize:14, cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:6, boxShadow:'0 2px 8px rgba(220,38,38,0.35)' }}>
          🆘 SOS
        </button>
        <button
          onClick={() => rideId && handleShareRide(rideId)}
          style={{ flex:1, padding:'8px 12px', background:'#fff', border:'1px solid #FED7AA', borderRadius:10, fontWeight:600, fontSize:13, cursor:'pointer', fontFamily:'inherit', color:'#92400E', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
          📤 Share Ride
        </button>
        <button
          onClick={onReport}
          style={{ flex:'none', padding:'8px 12px', background:'#fff', border:'1px solid var(--border)', borderRadius:10, fontWeight:600, fontSize:13, cursor:'pointer', fontFamily:'inherit', color:'var(--text2)', display:'flex', alignItems:'center', gap:5 }}>
          🚩 Report
        </button>
      </div>

      {showSOS && (
        <SOSModal
          rideId={rideId} userId={userId} role={role}
          gps={gps} emergencyContacts={emergencyContacts}
          onClose={() => setShowSOS(false)}
        />
      )}
    </>
  )
}

// --- SAFETY ALERT TOAST -----------------------------------------
export function SafetyAlertToast({ alert, onDismiss }) {
  if (!alert) return null
  const msgs = {
    route_deviation: { emoji:'⚠️', title:'Route Deviation Detected', msg:'The driver has deviated from the expected route.', color:'#DC2626' },
    long_stop:       { emoji:'⏸️', title:'Ride Stopped',              msg:`Ride has been stationary for ${alert.details?.stopped_mins||'several'} minutes.`, color:'#D97706' },
    sos:             { emoji:'🆘', title:'SOS Alert',                  msg:'An SOS has been triggered. Please check on the rider.', color:'#DC2626' },
  }
  const m = msgs[alert.alert_type] || { emoji:'⚠️', title:'Safety Alert', msg:'Please check on the ride.', color:'#DC2626' }

  return (
    <div className="anim-bounce" style={{ position:'fixed', top:72, left:16, right:16, zIndex:150, background:'#fff', border:`2px solid ${m.color}`, borderRadius:16, padding:'14px 16px', boxShadow:'0 8px 32px rgba(0,0,0,0.15)' }}>
      <div style={{ display:'flex', gap:12, alignItems:'flex-start' }}>
        <span style={{ fontSize:24, flexShrink:0 }}>{m.emoji}</span>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:700, color:m.color, marginBottom:2 }}>{m.title}</div>
          <div style={{ fontSize:13, color:'var(--text2)' }}>{m.msg}</div>
        </div>
        <button onClick={onDismiss} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text3)', flexShrink:0, fontSize:20 }}>×</button>
      </div>
      <div style={{ display:'flex', gap:8, marginTop:10 }}>
        <a href="tel:100" style={{ flex:1, padding:'9px', background:'#FEF2F2', borderRadius:10, textDecoration:'none', color:'#DC2626', fontWeight:700, fontSize:12, textAlign:'center' }}>🚔 Police</a>
        <a href="tel:108" style={{ flex:1, padding:'9px', background:'#FEF2F2', borderRadius:10, textDecoration:'none', color:'#DC2626', fontWeight:700, fontSize:12, textAlign:'center' }}>🚑 Ambulance</a>
        <button onClick={onDismiss} style={{ flex:1, padding:'9px', background:'var(--bg2)', borderRadius:10, border:'none', fontWeight:600, fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>Dismiss</button>
      </div>
    </div>
  )
}

export { EmergencyContactsScreen, ReportModal, handleShareRide }
