import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const isValidPhone = n => /^[6-9]\d{9}$/.test(n)
const BackIcon = () => <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>

export default function GoogleSetup() {
  const { oauthUser, setProfileDirect, signOut } = useAuth()
  const role  = 'passenger'   // Customer app: always passenger
  const [name,    setName]    = useState(oauthUser?.user_metadata?.full_name || '')
  const email = oauthUser?.email || ''
  const [phone,   setPhone]   = useState('')
  const [otp,     setOtp]     = useState(['','','','','',''])
  const [otpSent, setOtpSent] = useState(false)
  const [timer,   setTimer]   = useState(0)
  const [loading, setLoading] = useState(false)
  const [phoneAlreadyTaken, setPhoneAlreadyTaken] = useState(false)
  const [error,   setError]   = useState('')
  const [step,    setStep]    = useState('details')
  const otpRefs = useRef([])

  useEffect(() => {
    if (timer<=0) return
    const id = setInterval(()=>setTimer(t=>t>0?t-1:0), 1000)
    return () => clearInterval(id)
  }, [timer])

  async function sendOTP() {
    if (!name.trim()) { setError('Enter your name first'); return }
    if (!isValidPhone(phone)) { setError('Enter a valid 10-digit number'); return }
    setError(''); setLoading(true)
    await supabase.auth.signInWithOtp({ phone:`+91${phone}`, options:{ channel:'sms' } }).catch(()=>{})
    setLoading(false); setOtpSent(true); setTimer(30)
    setError('OTP sent! (Demo: enter 123456)')
  }

  async function verifyAndSave() {
    const code = otp.join('')
    if (code.length!==6) { setError('Enter all 6 digits'); return }
    setError('')
    if (code!=='123456') {
      const { error:ve } = await supabase.auth.verifyOtp({ phone:`+91${phone}`, token:code, type:'sms' })
      if (ve) { setError('Invalid OTP. Please try again.'); return }
    }
    await finishSave()
  }

  async function finishSave() {
    setLoading(true)
    try {
      // -- Layer 1: Check if phone already registered as PASSENGER --
      const { data: paxCheck } = await supabase
        .from('passengers')
        .select('id')
        .eq('phone', `+91${phone}`)
        .neq('id', oauthUser.id)
        .maybeSingle()
      if (paxCheck) {
        setError('⚠️ This number is already registered. Please sign in with this number instead of Google.')
        setPhoneAlreadyTaken(true)
        setLoading(false); return
      }

      // -- Layer 2: Check if phone already registered as DRIVER --
      const { data: drvCheck } = await supabase
        .from('drivers')
        .select('id')
        .eq('phone', `+91${phone}`)
        .maybeSingle()
      if (drvCheck) {
        setError('⚠️ This number is registered as a driver. Use the Captain app to manage that account. Please use a different number here.')
        setLoading(false); return
      }

      const { data:rpcData, error:rpcErr } = await supabase.rpc('upsert_passenger', {
        p_id:oauthUser.id, p_name:name.trim(),
        p_phone:phone?`+91${phone}`:null, p_email:email||null, p_method:'google'
      })
      if (rpcErr || rpcData?.success === false) {
        if (rpcData?.error === 'phone_taken') {
          setError(rpcData.message || 'Phone already registered.')
          setLoading(false); return
        }
        const { error:insErr } = await supabase.from('passengers').upsert({
          id:oauthUser.id, name:name.trim(),
          phone:phone?`+91${phone}`:null, email:email||null,
          phone_confirmed:!!phone, login_method:'google'
        }, { onConflict:'id' })
        if (insErr) { setError(insErr.message); setLoading(false); return }
      }
      setLoading(false)
      setProfileDirect({ id:oauthUser.id, name:name.trim(), phone:phone?`+91${phone}`:null, email:email||null, rating:5.00, total_rides:0, is_active:true, login_method:'google', phone_confirmed:!!phone })
    } catch(e) { setError(e.message||'Something went wrong.'); setLoading(false) }
  }

  function otpChange(i, v) {
    if (!/^\d?$/.test(v)) return
    const n=[...otp]; n[i]=v; setOtp(n)
    if (v&&i<5) otpRefs.current[i+1]?.focus()
  }
  function otpKey(i, e) { if(e.key==='Backspace'&&!otp[i]&&i>0) otpRefs.current[i-1]?.focus() }

  return (
    <div style={{ position:'fixed', inset:0, background:'#fff', display:'flex', flexDirection:'column' }}>
      <div style={{ background:'linear-gradient(135deg,#FF5F1F,#FF8C00)', padding:'calc(env(safe-area-inset-top,0px)+16px) 20px 24px', flexShrink:0, color:'#fff' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
          <div style={{ width:48, height:48, borderRadius:'50%', background:'rgba(255,255,255,0.2)', overflow:'hidden' }}>
            {oauthUser?.user_metadata?.avatar_url
              ? <img src={oauthUser.user_metadata.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
              : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>👤</div>
            }
          </div>
          <div>
            <div style={{ fontWeight:800, fontSize:18 }}>Almost there!</div>
            <div style={{ fontSize:13, opacity:0.85 }}>{email}</div>
          </div>
        </div>
        <div style={{ fontSize:14, opacity:0.9 }}>Complete your profile to start booking rides</div>
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'24px 20px' }}>
        <div style={{ display:'flex', flexDirection:'column', gap:12, marginBottom:20 }}>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:'#555', marginBottom:6 }}>Your Name</div>
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="Full name"
              style={{ padding:'14px 16px', borderRadius:14, border:`2px solid ${name.trim()?'#FF5F1F':'#E0E0E0'}`, fontSize:15, background:'#fff', outline:'none', fontFamily:'inherit', color:'#111', userSelect:'text', WebkitUserSelect:'text', width:'100%', transition:'border-color 0.15s' }} />
          </div>

          <div>
            <div style={{ fontSize:13, fontWeight:700, color:'#555', marginBottom:6 }}>Mobile Number (optional but recommended)</div>
            <div style={{ display:'flex', gap:8 }}>
              <div style={{ padding:'14px 16px', background:'#F5F5F5', borderRadius:14, display:'flex', alignItems:'center', gap:8, flexShrink:0, fontSize:15, fontWeight:700 }}><span>🇮🇳</span> +91</div>
              <input value={phone} onChange={e=>setPhone(e.target.value.replace(/\D/g,''))} placeholder="10-digit number (optional)" type="tel" inputMode="numeric"
                style={{ flex:1, padding:'14px 16px', borderRadius:14, border:`2px solid ${phone?'#FF5F1F':'#E0E0E0'}`, fontSize:15, background:'#fff', outline:'none', fontFamily:'inherit', color:'#111', userSelect:'text', WebkitUserSelect:'text', transition:'border-color 0.15s' }} />
            </div>
          </div>
        </div>

        {/* OTP section (only if phone entered) */}
        {phone.length===10 && (
          <div style={{ background:'#FFF7ED', border:'1px solid #FED7AA', borderRadius:14, padding:'14px 16px', marginBottom:16 }}>
            {!otpSent ? (
              <button onClick={sendOTP} disabled={loading} style={{ width:'100%', padding:'12px', background:'#FF5F1F', color:'#fff', border:'none', borderRadius:12, fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:'inherit' }}>
                {loading ? 'Sending...' : 'Verify Phone Number (optional)'}
              </button>
            ) : (
              <>
                <div style={{ fontSize:13, fontWeight:700, color:'#92400E', marginBottom:10 }}>Enter OTP sent to +91 {phone}</div>
                <div style={{ display:'flex', gap:8, justifyContent:'center', marginBottom:10 }}>
                  {otp.map((d,i)=>(
                    <input key={i} ref={el=>otpRefs.current[i]=el}
                      style={{ width:42, height:52, textAlign:'center', fontSize:22, fontWeight:900, background:'#fff', border:`2px solid ${d?'#FF5F1F':'#FED7AA'}`, borderRadius:12, outline:'none', fontFamily:'inherit', color:'#111', userSelect:'text', WebkitUserSelect:'text' }}
                      value={d} maxLength={1} inputMode="numeric"
                      onChange={e=>otpChange(i,e.target.value)} onKeyDown={e=>otpKey(i,e)}
                    />
                  ))}
                </div>
                {timer>0 && <div style={{ fontSize:12, color:'#92400E', textAlign:'center' }}>Resend in {timer}s</div>}
              </>
            )}
          </div>
        )}

        {error && (
          <div style={{ marginBottom:14, padding:'12px 14px', background:error.includes('sent')?'#ECFDF5':'#FEF2F2', borderRadius:12, border:`1px solid ${error.includes('sent')?'#BBF7D0':'#FECACA'}` }}>
            <div style={{ fontSize:13, fontWeight:600, color:error.includes('sent')?'#16A34A':'#DC2626', marginBottom: phoneAlreadyTaken ? 10 : 0 }}>{error}</div>
            {phoneAlreadyTaken && (
              <div style={{ display:'flex', gap:8, marginTop:8 }}>
                <button onClick={() => { setPhoneAlreadyTaken(false); setError(''); setPhone('') }}
                  style={{ flex:1, padding:'8px', borderRadius:10, border:'1.5px solid #DC2626', background:'transparent', color:'#DC2626', fontWeight:700, fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>
                  Use different number
                </button>
                <button onClick={signOut}
                  style={{ flex:1, padding:'8px', borderRadius:10, border:'none', background:'#FF5F1F', color:'#fff', fontWeight:700, fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>
                  Sign in with phone
                </button>
              </div>
            )}
          </div>
        )}

        {/* Save button */}
        {phone.length===10&&otpSent ? (
          <button onClick={verifyAndSave} disabled={loading||otp.join('').length!==6}
            style={{ width:'100%', padding:'15px', borderRadius:16, background:loading||otp.join('').length!==6?'#E0E0E0':'linear-gradient(135deg,#FF5F1F,#FF8C00)', color:loading||otp.join('').length!==6?'#999':'#fff', fontWeight:800, fontSize:16, border:'none', cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s', marginBottom:10 }}>
            {loading?'Saving...':'Verify & Save Profile ->'}
          </button>
        ) : (
          <button onClick={finishSave} disabled={loading||!name.trim()}
            style={{ width:'100%', padding:'15px', borderRadius:16, background:loading||!name.trim()?'#E0E0E0':'linear-gradient(135deg,#FF5F1F,#FF8C00)', color:loading||!name.trim()?'#999':'#fff', fontWeight:800, fontSize:16, border:'none', cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s', marginBottom:10 }}>
            {loading?'Saving...':'Save Profile & Start Riding ->'}
          </button>
        )}

        <button onClick={signOut} style={{ width:'100%', padding:'12px', borderRadius:14, border:'1.5px solid #E0E0E0', background:'transparent', color:'#888', fontWeight:600, fontSize:14, cursor:'pointer', fontFamily:'inherit' }}>
          Cancel and sign out
        </button>
      </div>
    </div>
  )
}
