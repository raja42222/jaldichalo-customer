import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import PassengerHome from './PassengerHome'
import { SkeletonRideHistory, SkeletonProfile } from '../components/Skeleton'
import { EmergencyContactsScreen } from '../components/SafetyPanel'

const StarIcon = ({ f }) => <svg width="14" height="14" viewBox="0 0 24 24" fill={f?'#F59E0B':'none'} stroke="#F59E0B" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
const ChevR   = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
const OutIcon = () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
const BackIcon = () => <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
const XIcon   = () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>

/* -- Coming Soon Modal -- */
function ComingSoonModal({ item, onClose }) {
  if (!item) return null
  return (
    <div className="overlay" style={{ zIndex:90 }} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="anim-slide" style={{ width:'100%', background:'#fff', borderRadius:'24px 24px 0 0', padding:'16px 20px calc(36px + var(--safe-bottom))' }}>
        <div className="sheet-handle"/>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
          <div className="t-h2">{item.icon} {item.label}</div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#aaa' }}><XIcon/></button>
        </div>
        <div style={{ textAlign:'center', padding:'20px 0 10px' }}>
          <div style={{ fontSize:64, marginBottom:16 }}>🚀</div>
          <div style={{ fontWeight:800, fontSize:20, marginBottom:8 }}>Coming Soon!</div>
          <div style={{ fontSize:15, color:'#888', lineHeight:1.7, maxWidth:280, margin:'0 auto' }}>
            {item.comingSoonText || `${item.label} feature is being built. Check back soon!`}
          </div>
          {item.badge && (
            <div style={{ marginTop:16, display:'inline-block', padding:'8px 16px', background:'#ECFDF5', color:'#16A34A', borderRadius:20, fontWeight:700, fontSize:14 }}>
              🎁 {item.badge} per referral — launching soon
            </div>
          )}
        </div>
        <button onClick={onClose}
          style={{ marginTop:24, width:'100%', padding:'15px', background:'linear-gradient(135deg,#FF5F1F,#FF8C00)', color:'#fff', border:'none', borderRadius:16, fontWeight:800, fontSize:15, cursor:'pointer', fontFamily:'inherit' }}>
          Got it!
        </button>
      </div>
    </div>
  )
}

/* -- Help & Support Screen -- */
function HelpScreen({ onClose }) {
  const faqs = [
    { q:'How do I cancel a ride?',       a:'Tap the × button on the ride card before the driver arrives. Cancellations are free within 2 minutes.' },
    { q:'My driver is not arriving',     a:'Use the chat or call button to contact your driver. If unreachable, cancel and rebook.' },
    { q:'I was overcharged',             a:'Fares are calculated by OSRM real road distance. Contact support with your ride ID.' },
    { q:'How does WhatsApp OTP work?',   a:'We send a 6-digit code to your WhatsApp. Enter it to login — works even without SMS.' },
    { q:'How to add emergency contacts?',a:'Go to Profile → Emergency Contacts. Add up to 3 trusted contacts who get notified on SOS.' },
    { q:'What is SOS?',                  a:'In the ride screen, press SOS to alert your emergency contacts with your live location.' },
  ]
  const [open, setOpen] = useState(null)
  return (
    <div style={{ position:'fixed', inset:0, background:'#fff', zIndex:60, display:'flex', flexDirection:'column' }}>
      <div style={{ padding:'calc(env(safe-area-inset-top,0px)+14px) 16px 14px', background:'#fff', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <button className="btn btn-icon" onClick={onClose}><BackIcon /></button>
        <div className="t-h1">Help & Support</div>
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:'16px' }}>
        <div style={{ padding:'16px', background:'linear-gradient(135deg,#FF5F1F,#FF8C00)', borderRadius:16, marginBottom:16, color:'#fff' }}>
          <div style={{ fontWeight:800, fontSize:16 }}>Need help? Contact us</div>
          <div style={{ fontSize:13, opacity:0.9, marginTop:4 }}>support@jaldichalo.app</div>
          <div style={{ fontSize:13, opacity:0.9 }}>WhatsApp: +91 98765 43210 (Demo)</div>
        </div>
        <div style={{ fontWeight:700, fontSize:14, color:'#888', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:10 }}>FAQs</div>
        {faqs.map((faq, i) => (
          <div key={i} style={{ marginBottom:8, background:'var(--bg2)', borderRadius:14, overflow:'hidden' }}>
            <div onClick={()=>setOpen(open===i?null:i)}
              style={{ padding:'14px 16px', display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer' }}>
              <div style={{ fontWeight:600, fontSize:14, flex:1, paddingRight:8 }}>{faq.q}</div>
              <div style={{ fontSize:18, color:'#FF5F1F', flexShrink:0, transform:`rotate(${open===i?180:0}deg)`, transition:'transform 0.2s' }}>▾</div>
            </div>
            {open===i && <div style={{ padding:'0 16px 14px', fontSize:14, color:'#555', lineHeight:1.6 }}>{faq.a}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}

/* -- About Screen -- */
function AboutScreen({ onClose }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'#fff', zIndex:60, display:'flex', flexDirection:'column' }}>
      <div style={{ padding:'calc(env(safe-area-inset-top,0px)+14px) 16px 14px', background:'#fff', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <button className="btn btn-icon" onClick={onClose}><BackIcon /></button>
        <div className="t-h1">About Jaldi Chalo</div>
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:'24px 20px', textAlign:'center' }}>
        <div style={{ width:80, height:80, borderRadius:24, background:'linear-gradient(135deg,#FF5F1F,#FF8C00)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:40, margin:'0 auto 16px' }}>⚡</div>
        <div style={{ fontWeight:900, fontSize:28, letterSpacing:'-0.5px' }}>Jaldi Chalo</div>
        <div style={{ fontSize:15, color:'#FF5F1F', fontWeight:600, marginTop:4 }}>जल्दी चलो</div>
        <div style={{ marginTop:8, fontSize:13, color:'#888' }}>Version 1.0.0 Beta</div>
        <div style={{ marginTop:24, fontSize:15, color:'#555', lineHeight:1.8, textAlign:'left', background:'var(--bg2)', borderRadius:16, padding:'16px' }}>
          Jaldi Chalo is a ride-hailing service crafted with love in Kolkata 🇮🇳<br/><br/>
          Our mission: affordable, fast, and safe rides for everyone in West Bengal.
        </div>
        {[
          { icon:'🏍️', label:'Bike Rides',    val:'₹8/km' },
          { icon:'🛺', label:'Auto Rides',    val:'₹12/km' },
          { icon:'🚗', label:'Cab Non-AC',    val:'₹15/km' },
          { icon:'❄️', label:'Cab AC',        val:'₹17/km' },
        ].map(r => (
          <div key={r.label} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 0', borderBottom:'1px solid var(--border)' }}>
            <span style={{ fontSize:22 }}>{r.icon}</span>
            <span style={{ flex:1, fontWeight:600, fontSize:14 }}>{r.label}</span>
            <span style={{ fontWeight:800, fontSize:15, color:'#FF5F1F' }}>{r.val}</span>
          </div>
        ))}
        <div style={{ marginTop:24, fontSize:13, color:'#aaa' }}>
          Made with ❤️ in Kolkata<br/>
          © 2025 Jaldi Chalo. All rights reserved.
        </div>
      </div>
    </div>
  )
}

/* ===============================================================
   PASSENGER APP
=============================================================== */
export default function PassengerApp() {
  const { profile, signOut } = useAuth()
  const [sidebar,       setSidebar]       = useState(false)
  const [tab,           setTab]           = useState('home')
  const [history,       setHistory]       = useState([])
  const [histLoad,      setHistLoad]      = useState(false)
  const [showEmergency, setShowEmergency] = useState(false)
  const [showHelp,      setShowHelp]      = useState(false)
  const [showAbout,     setShowAbout]     = useState(false)
  const [comingSoon,    setComingSoon]    = useState(null)   // {icon, label, comingSoonText, badge}

  const initials = profile?.name?.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() || 'U'

  async function loadHistory() {
    if (!profile) return
    setHistLoad(true)
    const { data } = await supabase.from('rides').select('*')
      .eq('passenger_id', profile.id).order('created_at',{ascending:false}).limit(30)
    setHistory(data||[]); setHistLoad(false)
  }

  function goTab(t) {
    setSidebar(false)
    if (tab !== t) { window.history.pushState({ jcTab:t }, ''); setTab(t) }
    if (t==='history') loadHistory()
  }

  useEffect(() => {
    window.history.replaceState({ jcTab:'home' }, '')
    function onPop(e) {
      const prev = e.state?.jcTab
      if (prev === 'home' || !prev) {
        // Back to home — close sidebar if open, otherwise stay
        setSidebar(false)
        setTab('home')
        // Re-push so next back doesn't exit
        window.history.pushState({ jcTab:'home' }, '')
      } else {
        setTab(prev)
        setSidebar(false)
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  /* -- Menu items -- */
  const menuItems = [
    { icon:'🕐', label:'My Rides',           sub:'View past trips',                 action:()=>goTab('history') },
    {
      icon:'💳', label:'Payment',             sub:'Cash & UPI supported',
      action:()=>setComingSoon({ icon:'💳', label:'Payment Methods', comingSoonText:'Digital payment via UPI, credit/debit card and wallets — coming in v1.1!' })
    },
    { icon:'🛡️', label:'Safety',             sub:'Emergency contacts & SOS',        action:()=>{ setSidebar(false); setShowEmergency(true) }, highlight:true },
    {
      icon:'🎁', label:'Refer and Earn',      sub:'Get ₹50 per referral',
      badge:'₹50', action:()=>setComingSoon({ icon:'🎁', label:'Refer and Earn', badge:'₹50', comingSoonText:'Refer friends and earn ₹50 for each successful signup. Launching soon!' })
    },
    {
      icon:'🏆', label:'My Rewards',          sub:'View earned rewards',
      action:()=>setComingSoon({ icon:'🏆', label:'My Rewards', comingSoonText:'Earn reward points on every ride and redeem them for discounts.' })
    },
    {
      icon:'🎫', label:'Jaldi Pass',          sub:'Unlimited ride subscription',
      action:()=>setComingSoon({ icon:'🎫', label:'Jaldi Pass', comingSoonText:'Subscribe for unlimited rides at a flat monthly fee. Great for daily commuters!' })
    },
    {
      icon:'🪙', label:'JC Coins',            sub:'Loyalty coins & cashbacks',
      action:()=>setComingSoon({ icon:'🪙', label:'JC Coins', comingSoonText:'Earn JC Coins on every ride. Use them for discounts on future bookings.' })
    },
    {
      icon:'🔔', label:'Notifications',       sub:'',
      action:()=>setComingSoon({ icon:'🔔', label:'Notifications', comingSoonText:'Push notifications for ride updates, offers and safety alerts.' })
    },
    { icon:'❓', label:'Help & Support',      sub:'FAQs and contact us',             action:()=>{ setSidebar(false); setShowHelp(true) } },
    { icon:'ℹ️', label:'About Jaldi Chalo',   sub:'Version & fare info',             action:()=>{ setSidebar(false); setShowAbout(true) } },
  ]

  /* -- Profile tab items -- */
  const profileItems = [
    {
      e:'✏️', l:'Edit Profile',
      a:()=>setComingSoon({ icon:'✏️', label:'Edit Profile', comingSoonText:'Edit your name, photo and preferences.' })
    },
    {
      e:'💳', l:'Payment Methods',
      a:()=>setComingSoon({ icon:'💳', label:'Payment Methods', comingSoonText:'UPI, credit/debit cards and wallets — coming in v1.1!' })
    },
    { e:'🛡️', l:'Emergency Contacts', a:()=>setShowEmergency(true) },
    {
      e:'🔔', l:'Notifications',
      a:()=>setComingSoon({ icon:'🔔', label:'Notifications', comingSoonText:'Manage push notification preferences.' })
    },
    { e:'❓', l:'Help & Support', a:()=>setShowHelp(true) },
    { e:'ℹ️', l:'About Jaldi Chalo', a:()=>setShowAbout(true) },
  ]

  /* -- Sub-screens -- */
  if (showEmergency) return <EmergencyContactsScreen userId={profile.id} role="passenger" onClose={()=>setShowEmergency(false)} />
  if (showHelp)      return <HelpScreen onClose={()=>setShowHelp(false)} />
  if (showAbout)     return <AboutScreen onClose={()=>setShowAbout(false)} />

  return (
    <div style={{ height:'100dvh', display:'flex', flexDirection:'column', background:'var(--bg)', overflow:'hidden', position:'relative' }}>

      {/* -- Coming soon modal -- */}
      {comingSoon && <ComingSoonModal item={comingSoon} onClose={()=>setComingSoon(null)} />}

      {/* -- SIDEBAR -- */}
      {sidebar && (
        <>
          <div className="anim-in" onClick={()=>setSidebar(false)}
            style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:70, backdropFilter:'blur(2px)' }} />
          <div className="anim-slide" style={{ position:'fixed', left:0, top:0, bottom:0, width:'82vw', maxWidth:320, background:'#fff', zIndex:71, display:'flex', flexDirection:'column', overflowY:'auto', paddingTop:'var(--safe-top)', paddingBottom:'var(--safe-bottom)' }}>
            {/* Profile section */}
            <div style={{ padding:'22px 20px', borderBottom:'1px solid var(--border)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:14 }}>
                <div style={{ width:56, height:56, borderRadius:'50%', background:'linear-gradient(135deg,#FF5F1F,#FF8C00)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:20, color:'#fff' }}>{initials}</div>
                <div style={{ flex:1 }}>
                  <div className="t-h2">{profile?.name}</div>
                  <div className="t-small t-muted">{profile?.phone}</div>
                </div>
                <ChevR />
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', background:'var(--bg2)', borderRadius:12 }}>
                <StarIcon f={true}/><span className="t-h3">{(profile?.rating||5.00).toFixed(2)} My Rating</span>
                <span style={{ marginLeft:'auto' }}><ChevR /></span>
              </div>
            </div>

            {/* Menu */}
            <div style={{ flex:1 }}>
              {menuItems.map(item => (
                <div key={item.label} className="menu-item" onClick={item.action} style={{ cursor:'pointer' }}>
                  <div style={{ width:40, height:40, borderRadius:12, background:item.highlight?'#FEF2F2':'var(--bg2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>{item.icon}</div>
                  <div style={{ flex:1 }}>
                    <div className="t-h3" style={{ color:item.highlight?'var(--red)':'var(--text)' }}>{item.label}</div>
                    {item.sub&&<div className="t-small t-muted" style={{ marginTop:1 }}>{item.sub}</div>}
                  </div>
                  {item.badge&&<span className="badge badge-green" style={{ marginRight:6 }}>{item.badge}</span>}
                  <ChevR />
                </div>
              ))}
            </div>

            <div style={{ padding:'12px 20px calc(16px + var(--safe-bottom))', borderTop:'1px solid var(--border)' }}>
              <button className="btn btn-outline" style={{ color:'var(--red)', borderColor:'rgba(220,38,38,0.25)' }} onClick={signOut}><OutIcon /> Sign Out</button>
            </div>
          </div>
        </>
      )}

      {/* -- TABS -- */}
      {tab==='home' && <PassengerHome onMenu={() => { setSidebar(true); window.history.pushState({ jcTab:'sidebar' }, '') }} />}

      {tab==='history' && (
        <div className="screen scroll" style={{ overflowY:'auto' }}>
          <div style={{ padding:'14px 16px', display:'flex', alignItems:'center', gap:12, borderBottom:'1px solid var(--border)', background:'#fff' }}>
            <button className="btn btn-icon" onClick={()=>setSidebar(true)}>
              <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            <div className="t-h1">My Rides</div>
          </div>
          <div style={{ padding:'12px 14px 80px' }}>
            {histLoad && <SkeletonRideHistory />}
            {!histLoad&&history.length===0 && (
              <div style={{ textAlign:'center', padding:'60px 0' }}>
                <div style={{ fontSize:52, marginBottom:12 }}>🛵</div>
                <div className="t-h2" style={{ marginBottom:6 }}>No rides yet</div>
                <div className="t-body t-muted">Your completed trips will appear here</div>
                <button className="btn btn-primary" style={{ marginTop:20, width:'auto', padding:'14px 28px' }} onClick={()=>goTab('home')}>Book a Ride</button>
              </div>
            )}
            {history.map((r,i)=>(
              <div key={r.id} className="card-raised anim-up" style={{ marginBottom:10, animationDelay:`${i*0.04}s` }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10 }}>
                  <div className="t-small t-muted">{new Date(r.created_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</div>
                  <span className={`badge ${r.ride_status==='completed'?'badge-green':r.ride_status==='cancelled'?'badge-red':'badge-brand'}`}>{r.ride_status}</span>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
                  {[{c:'dot-pickup',v:r.pickup_address},{c:'dot-drop',v:r.drop_address}].map(x=>(
                    <div key={x.c} style={{ display:'flex', gap:10, alignItems:'center' }}>
                      <div className={x.c} style={{ flexShrink:0 }} />
                      <div className="t-h3" style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>{x.v}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:10, paddingTop:10, borderTop:'1px solid var(--border)' }}>
                  <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    <span style={{ fontWeight:800, fontSize:18, color:'var(--brand)' }}>₹{r.fare}</span>
                    <span className="badge badge-gray">{(r.payment_method||'').toUpperCase()}</span>
                    {r.distance_km&&<span className="t-small t-muted">{parseFloat(r.distance_km).toFixed(1)} km</span>}
                  </div>
                  {r.passenger_rating&&<div style={{ display:'flex', gap:2 }}>{[1,2,3,4,5].map(s=><StarIcon key={s} f={s<=r.passenger_rating} />)}</div>}
                </div>
              </div>
            ))}
          </div>
          <div className="bottom-nav">
            {[{id:'home',l:'Ride',e:'🏠'},{id:'history',l:'Rides',e:'🕐'},{id:'profile',l:'Profile',e:'👤'}].map(t=>(
              <button key={t.id} className={`nav-item ${tab===t.id?'active':''}`} onClick={()=>goTab(t.id)}>
                <span style={{ fontSize:20 }}>{t.e}</span>{t.l}
              </button>
            ))}
          </div>
        </div>
      )}

      {tab==='profile' && (
        <div className="screen scroll" style={{ overflowY:'auto' }}>
          <div style={{ padding:'14px 16px', display:'flex', alignItems:'center', gap:12, borderBottom:'1px solid var(--border)', background:'#fff' }}>
            <button className="btn btn-icon" onClick={()=>setSidebar(true)}>
              <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            <div className="t-h1">Profile</div>
          </div>
          <div style={{ padding:'0 14px 80px' }}>
            <div style={{ textAlign:'center', padding:'28px 0 24px' }}>
              <div style={{ width:80, height:80, borderRadius:'50%', background:'linear-gradient(135deg,#FF5F1F,#FF8C00)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:28, color:'#fff', margin:'0 auto 14px', boxShadow:'var(--s-brand)' }}>{initials}</div>
              <div className="t-h1">{profile?.name}</div>
              <div className="t-body t-muted" style={{ marginTop:4 }}>{profile?.phone}</div>
              {profile?.email&&<div className="t-small t-muted" style={{ marginTop:2 }}>{profile.email}</div>}
              <div style={{ display:'flex', justifyContent:'center', gap:16, marginTop:14 }}>
                <div style={{ textAlign:'center', padding:'10px 18px', background:'var(--bg2)', borderRadius:14 }}>
                  <div style={{ fontWeight:800, fontSize:18 }}>{profile?.total_rides||0}</div>
                  <div style={{ fontSize:11, color:'#888', marginTop:2 }}>Total Rides</div>
                </div>
                <div style={{ textAlign:'center', padding:'10px 18px', background:'var(--bg2)', borderRadius:14 }}>
                  <div style={{ fontWeight:800, fontSize:18, display:'flex', alignItems:'center', justifyContent:'center', gap:4 }}>
                    <StarIcon f/>{(profile?.rating||5.00).toFixed(1)}
                  </div>
                  <div style={{ fontSize:11, color:'#888', marginTop:2 }}>Rating</div>
                </div>
              </div>
            </div>

            {profileItems.map(item=>(
              <button key={item.l} onClick={item.a}
                style={{ width:'100%', display:'flex', alignItems:'center', gap:14, padding:'15px 14px', background:'#fff', border:'1px solid var(--border)', borderRadius:14, marginBottom:6, cursor:'pointer', fontFamily:'inherit', transition:'background 0.1s' }}
                onTouchStart={e=>e.currentTarget.style.background='var(--bg2)'}
                onTouchEnd={e=>e.currentTarget.style.background='#fff'}>
                <span style={{ fontSize:20 }}>{item.e}</span>
                <span className="t-h3" style={{ flex:1, textAlign:'left', color:item.l==='Emergency Contacts'?'var(--red)':'var(--text)' }}>{item.l}</span>
                <ChevR />
              </button>
            ))}
            <button className="btn btn-outline" style={{ marginTop:8, color:'var(--red)', borderColor:'rgba(220,38,38,0.25)' }} onClick={signOut}><OutIcon /> Sign Out</button>
          </div>
          <div className="bottom-nav">
            {[{id:'home',l:'Ride',e:'🏠'},{id:'history',l:'Rides',e:'🕐'},{id:'profile',l:'Profile',e:'👤'}].map(t=>(
              <button key={t.id} className={`nav-item ${tab===t.id?'active':''}`} onClick={()=>goTab(t.id)}>
                <span style={{ fontSize:20 }}>{t.e}</span>{t.l}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
