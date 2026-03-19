import React, { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { checkRateLimit, resetRateLimit, IS_DEMO, sanitizePhone, sanitizeName, getDeviceFingerprint } from '../lib/security'
import { useAuth } from '../context/AuthContext'

const isValidPhone = n => /^[6-9]\d{9}$/.test(n)

function Inp({ val, set, ph, type='text', mono, autoFocus, onSubmit }) {
  return (
    <input type={type} placeholder={ph} value={val} autoFocus={!!autoFocus}
      autoComplete="off" autoCorrect="off" spellCheck={false}
      autoCapitalize={type==='email'||mono?'none':'words'}
      enterKeyHint={onSubmit?'done':'next'}
      onChange={e=>set(e.target.value)}
      onKeyDown={e=>{if(e.key==='Enter'&&onSubmit){e.preventDefault();onSubmit()}}}
      style={{ padding:'14px 16px', borderRadius:16, border:`2px solid ${String(val).trim()?'#FF5F1F':'#E0E0E0'}`, fontSize:15, background:'#fff', outline:'none', fontFamily:'inherit', color:'#111', userSelect:'text', WebkitUserSelect:'text', width:'100%', display:'block', transition:'border-color 0.15s', ...(mono?{letterSpacing:'0.07em',fontWeight:700}:{}) }}
    />
  )
}

function HowrahBridge() {
  return (
    <svg viewBox="0 0 400 140" fill="none" style={{width:'100%',maxWidth:440,opacity:0.22}}>
      <path d="M0 115 Q100 105 200 115 Q300 125 400 115 L400 140 L0 140Z" fill="white" opacity="0.4"/>
      <rect x="10" y="83" width="380" height="7" rx="2" fill="white"/>
      <rect x="58" y="22" width="16" height="61" rx="2" fill="white"/>
      <rect x="326" y="22" width="16" height="61" rx="2" fill="white"/>
      <rect x="50" y="14" width="32" height="11" rx="2" fill="white"/>
      <rect x="318" y="14" width="32" height="11" rx="2" fill="white"/>
      <path d="M66 22 Q130 70 200 85" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M334 22 Q270 70 200 85" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
      {[95,115,135,155,175,195].map(x=><line key={x} x1={x} y1={83} x2={x} y2={65+(x-66)*0.08} stroke="white" strokeWidth="1" opacity="0.6"/>)}
      {[205,225,245,265,285,305].map(x=><line key={x} x1={x} y1={83} x2={x} y2={65+(334-x)*0.08} stroke="white" strokeWidth="1" opacity="0.6"/>)}
    </svg>
  )
}

async function buildDemoSession(num) {
  const e = `jc${num}@demo.jaldichalo.app`
  const p = `Jaldi@${num}#2025`
  const { data:si } = await supabase.auth.signInWithPassword({ email:e, password:p })
  if (si?.session?.user) return { uid:si.session.user.id }
  const { data:su } = await supabase.auth.signUp({ email:e, password:p, options:{ data:{ phone:`+91${num}` } } })
  if (su?.session?.user) return { uid:su.session.user.id }
  if (su?.user&&!su?.session) return { uid:null, err:'Supabase: turn OFF email confirmations in Auth Settings' }
  return { uid:null, err:'Demo login failed. Please try again.' }
}

const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
)

export default function AuthPage() {
  const { setProfileDirect } = useAuth()

  const [step,    setStepRaw] = useState('home')
  const [phone,   setPhone]   = useState('')
  const [channel, setChannel] = useState('whatsapp')
  const [otp,     setOtp]     = useState(['','','','','',''])
  const [name,    setName]    = useState('')
  const [email,   setEmail]   = useState('')
  const [busy,    setBusy]    = useState(false)
  const [error,   setError]   = useState('')
  const [timer,   setTimer]   = useState(0)
  const otpRefs = useRef([])

  const STEPS = ['home','phone','otp','name']

  useEffect(() => {
    window.history.replaceState({ jcStep:'home' }, '')
    const onPop = e => { const s=e.state?.jcStep; if(s&&STEPS.includes(s)){setStepRaw(s);setError('')} }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, []) // eslint-disable-line

  function setStep(s) { setStepRaw(s); window.history.pushState({ jcStep:s }, '') }

  useEffect(() => {
    if (timer<=0) return
    const id = setInterval(()=>setTimer(t=>t>0?t-1:0), 1000)
    return () => clearInterval(id)
  }, [timer])

  async function sendOTP() {
    if (!isValidPhone(phone)) { setError('Enter a valid Indian mobile number (starts 6-9, 10 digits)'); return }
    // Rate limit: max 3 OTP sends per 5 minutes
    const rl = checkRateLimit(`otp_send_${phone}`, 3, 5 * 60 * 1000)
    if (!rl.allowed) { setError(`Too many attempts. Try again in ${rl.retryAfterSec}s`); return }
    setError(''); setBusy(true)
    const { error:otpErr } = await supabase.auth.signInWithOtp({ phone:`+91${phone}`, options:{ channel } })
    setBusy(false)
    if (otpErr && !otpErr.message?.includes('rate')) { setError(`Failed to send OTP: ${otpErr.message}`); return }
    setTimer(60)
    setError(`OTP sent to your ${channel==='whatsapp'?'WhatsApp':'SMS'}!${IS_DEMO?' (Demo: 123456)':''}`)
    setStep('otp')
  }

  async function verifyOTP() {
    const code = otp.join('')
    if (code.length!==6) { setError('Enter all 6 digits'); return }
    // Rate limit: max 5 OTP verify attempts per 10 minutes
    const rl = checkRateLimit(`otp_verify_${phone}`, 5, 10 * 60 * 1000)
    if (!rl.allowed) { setError(`Too many wrong attempts. Try again in ${rl.retryAfterSec}s`); return }
    setError(''); setBusy(true)
    let uid = null
    const { data, error:ve } = await supabase.auth.verifyOtp({ phone:`+91${phone}`, token:code, type:'sms' })
    if (!ve && data?.session?.user) { uid = data.session.user.id; resetRateLimit(`otp_verify_${phone}`) }
    // Demo mode only (development) - disabled in production
    if (!uid && IS_DEMO && code==='123456') {
      const res = await buildDemoSession(phone)
      if (!res.uid) { setError(res.err||'Login failed.'); setBusy(false); return }
      uid = res.uid
    }
    if (!uid) { setError('Invalid OTP. Please try again.'); setBusy(false); return }
    const { data:ex } = await supabase.from('passengers').select('*').eq('id',uid).maybeSingle()
    if (ex?.name) { setBusy(false); setProfileDirect(ex); return }
    setBusy(false); setStep('name')
  }

  async function loginGoogle() {
    setError(''); setBusy(true)
    const { error:err } = await supabase.auth.signInWithOAuth({
      provider:'google',
      options:{ redirectTo:`${window.location.origin}/`, queryParams:{ prompt:'select_account' } }
    })
    if (err) { setError(err.message); setBusy(false) }
  }

  async function savePassenger() {
    if (!name.trim()) { setError('Enter your name'); return }
    setError(''); setBusy(true)
    try {
      const { data:{ user }, error:uErr } = await supabase.auth.getUser()
      if (uErr||!user) { setError('Session expired. Login again.'); setBusy(false); return }
      // Check: phone not already registered to another account
      const { data: phoneCheck } = await supabase
        .from('passengers')
        .select('id')
        .eq('phone', `+91${phone}`)
        .neq('id', user.id)
        .maybeSingle()
      if (phoneCheck) {
        setError('This phone number is already registered. Please sign in.')
        setBusy(false); return
      }
      const { data:drCheck } = await supabase.from('drivers').select('id').eq('id',user.id).maybeSingle()
      if (drCheck) { setError('This number is a Driver account. Use Driver app.'); setBusy(false); return }
      const method = channel==='whatsapp'?'whatsapp':'phone'
      const deviceId = getDeviceFingerprint()
      const { data:rpcData, error:rpcErr } = await supabase.rpc('upsert_passenger', { p_id:user.id, p_name:name.trim(), p_phone:`+91${phone}`, p_email:email.trim()||null, p_method:method })
      if (rpcErr || rpcData?.success === false) {
        if (rpcData?.error === 'phone_taken') {
          setError(rpcData.message || 'Phone already registered.')
          setBusy(false); return
        }
        const { error:insErr } = await supabase.from('passengers').upsert({ id:user.id, name:name.trim(), phone:`+91${phone}`, email:email.trim()||null, phone_confirmed:true, login_method:method }, { onConflict:'id' })
        if (insErr) { setError(insErr.message); setBusy(false); return }
      }
      setBusy(false)
      setProfileDirect({ id:user.id, name:name.trim(), phone:`+91${phone}`, email:email.trim()||null, rating:5.00, total_rides:0, is_active:true, login_method:method, phone_confirmed:true })
    } catch(e) { setError(e.message||'Something went wrong.'); setBusy(false) }
  }

  function otpChange(i, v) {
    if (!/^\d?$/.test(v)) return
    const n=[...otp]; n[i]=v; setOtp(n)
    if (v&&i<5) otpRefs.current[i+1]?.focus()
  }
  function otpKey(i, e) { if(e.key==='Backspace'&&!otp[i]&&i>0) otpRefs.current[i-1]?.focus() }

  // -- Background animated render wrapper --------------------
  const brand  = '#FF5F1F'
  const brand2 = '#FF9500'

  function AuthBg({ children, backFn }) {
    const canvasRef = React.useRef(null)
    const animRef   = React.useRef(null)

    React.useEffect(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      const dpr = window.devicePixelRatio || 1
      const W = canvas.offsetWidth, H = canvas.offsetHeight
      canvas.width = W * dpr; canvas.height = H * dpr
      const ctx = canvas.getContext('2d')
      ctx.scale(dpr, dpr)

      const icons = ['🛵','🛵','🛵','🛺','🚗','🛵','🛺','🚗','🛵','🛺']
      const particles = Array.from({ length: 20 }, (_, i) => ({
        x: Math.random()*W, y: H + Math.random()*H,
        vx:(Math.random()-0.5)*0.4, vy:-(Math.random()*0.45+0.12),
        size:Math.random()*10+12, alpha:Math.random()*0.28+0.06,
        icon:icons[i%icons.length], rot:Math.random()*12-6,
        rotV:(Math.random()-0.5)*0.15, phase:Math.random()*Math.PI*2,
        wobble:Math.random()*0.7+0.3,
      }))

      let t = 0
      function draw() {
        ctx.clearRect(0,0,W,H); t+=0.009
        particles.forEach(p => {
          p.x += p.vx + Math.sin(t*p.wobble+p.phase)*0.2
          p.y += p.vy; p.rot += p.rotV
          if(p.y<-50){p.y=H+20;p.x=Math.random()*W}
          if(p.x<-50)p.x=W+20; if(p.x>W+50)p.x=-20
          const yF=1-p.y/H
          const fade=Math.min(1,Math.max(0,Math.sin(yF*Math.PI)))
          ctx.save()
          ctx.globalAlpha=p.alpha*fade*(0.55+Math.sin(t*0.6+p.phase)*0.38)
          ctx.translate(p.x,p.y); ctx.rotate(p.rot*Math.PI/180)
          ctx.font=`${p.size}px serif`; ctx.textAlign='center'; ctx.textBaseline='middle'
          ctx.fillText(p.icon,0,0); ctx.restore()
        })
        animRef.current = requestAnimationFrame(draw)
      }
      draw()
      return () => { if(animRef.current) cancelAnimationFrame(animRef.current) }
    }, [])

    return (
      <div style={{ position:'fixed', inset:0, overflow:'hidden',
        background:'linear-gradient(160deg, #060610 0%, #160700 45%, #050D05 85%, #060610 100%)',
        fontFamily:"'Plus Jakarta Sans',system-ui,sans-serif" }}>
        <style>{`
          @keyframes ab1{0%,100%{transform:translate(0,0)scale(1)rotate(0deg)}25%{transform:translate(22px,-16px)scale(1.07)rotate(3deg)}50%{transform:translate(-14px,20px)scale(0.95)rotate(-2deg)}75%{transform:translate(18px,8px)scale(1.04)rotate(2deg)}}
          @keyframes ab2{0%,100%{transform:translate(0,0)scale(1)}33%{transform:translate(-20px,16px)scale(1.10)}66%{transform:translate(16px,-12px)scale(0.93)}}
          @keyframes ab3{0%,100%{transform:translate(0,0)scale(1)}50%{transform:translate(10px,20px)scale(1.08)}}
          @keyframes authCard{0%{opacity:0;transform:scale(0.93) translateY(20px)}100%{opacity:1;transform:scale(1) translateY(0)}}
          @keyframes authGlare{0%{left:-80%;opacity:0}10%{opacity:1}90%{opacity:1}100%{left:180%;opacity:0}}
          @keyframes authFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
          .auth-card-anim{animation:authCard 0.6s cubic-bezier(0.16,1,0.3,1) both}
          .auth-glare{animation:authGlare 5s ease-in-out 2s infinite}
          .auth-float{animation:authFloat 4s ease-in-out infinite}
        `}</style>

        {/* Canvas */}
        <canvas ref={canvasRef} style={{ position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none' }}/>

        {/* Blobs */}
        <div style={{ position:'absolute',top:'-30%',left:'-30%',width:'80%',height:'80%',borderRadius:'50%',background:`radial-gradient(circle, ${brand}52 0%, transparent 65%)`,filter:'blur(42px)',animation:'ab1 9s ease-in-out infinite',pointerEvents:'none' }}/>
        <div style={{ position:'absolute',bottom:'-25%',right:'-30%',width:'90%',height:'90%',borderRadius:'50%',background:`radial-gradient(circle, ${brand2}3E 0%, transparent 60%)`,filter:'blur(55px)',animation:'ab2 11s ease-in-out infinite',pointerEvents:'none' }}/>
        <div style={{ position:'absolute',top:'20%',left:'5%',width:'75%',height:'75%',borderRadius:'50%',background:'radial-gradient(circle at 40% 40%, rgba(255,140,40,0.09) 0%, transparent 65%)',filter:'blur(32px)',animation:'ab3 13s ease-in-out infinite',pointerEvents:'none' }}/>

        {/* Back button overlay */}
        {backFn && (
          <button onClick={backFn} style={{
            position:'absolute',top:`calc(env(safe-area-inset-top,0px) + 12px)`,left:14,
            zIndex:20, width:40,height:40,borderRadius:'50%',
            background:'rgba(255,255,255,0.15)',backdropFilter:'blur(12px)',
            border:'1px solid rgba(255,255,255,0.2)',cursor:'pointer',
            display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',
          }}>
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
        )}

        {/* Glass card */}
        <div style={{
          position:'absolute',inset:0,
          display:'flex',flexDirection:'column',alignItems:'center',
          justifyContent:'center',
          padding:`calc(env(safe-area-inset-top,0px) + 16px) 20px calc(env(safe-area-inset-bottom,0px) + 20px)`,
          overflowY:'auto',
        }}>
          <div className="auth-card-anim auth-float" style={{
            width:'100%',maxWidth:400,
            background:'rgba(255,255,255,0.08)',
            backdropFilter:'blur(36px) saturate(1.4)',
            WebkitBackdropFilter:'blur(36px) saturate(1.4)',
            border:'1px solid rgba(255,255,255,0.14)',
            borderRadius:28,
            padding:'28px 24px 28px',
            position:'relative',overflow:'hidden',
            boxShadow:`0 0 0 1px rgba(255,255,255,0.04),0 28px 64px rgba(0,0,0,0.6),0 0 60px ${brand}18,inset 0 1px 0 rgba(255,255,255,0.20)`,
          }}>
            {/* Top ridge */}
            <div style={{ position:'absolute',top:0,left:'6%',right:'6%',height:1,background:'linear-gradient(90deg,transparent,rgba(255,255,255,0.32),transparent)',pointerEvents:'none' }}/>
            {/* Glare sweep */}
            <div className="auth-glare" style={{ position:'absolute',top:0,bottom:0,width:'25%',background:'linear-gradient(90deg,transparent,rgba(255,255,255,0.055),transparent)',pointerEvents:'none' }}/>

            {children}
          </div>
        </div>
      </div>
    )
  }

  // -- Input component (dark glass style) ------------------
  function GlassInp({ val, set, ph, type='text', mono, autoFocus, onSubmit }) {
    return (
      <input type={type} placeholder={ph} value={val} autoFocus={!!autoFocus}
        autoComplete="off" autoCorrect="off" spellCheck={false}
        autoCapitalize={type==='email'||mono?'none':'words'}
        enterKeyHint={onSubmit?'done':'next'}
        onChange={e=>set(e.target.value)}
        onKeyDown={e=>{if(e.key==='Enter'&&onSubmit){e.preventDefault();onSubmit()}}}
        style={{
          padding:'13px 16px', borderRadius:14, width:'100%', display:'block',
          border:`1.5px solid ${String(val).trim()?'rgba(255,95,31,0.8)':'rgba(255,255,255,0.15)'}`,
          fontSize:15, fontFamily:'inherit', outline:'none',
          background:'rgba(255,255,255,0.10)',
          backdropFilter:'blur(8px)',
          color:'#fff',
          transition:'border-color 0.18s, background 0.18s',
          ...(mono?{letterSpacing:'0.07em',fontWeight:700}:{}),
        }}
      />
    )
  }

  // -- Branded action button --------------------------------
  function GlassBtn({ label, fn, off }) {
    return (
      <button onClick={fn} disabled={off||busy} style={{
        padding:'15px',width:'100%',border:'none',borderRadius:16,
        background: off||busy ? 'rgba(255,255,255,0.1)' : `linear-gradient(135deg,${brand},${brand2})`,
        color: off||busy ? 'rgba(255,255,255,0.35)' : '#fff',
        fontSize:16,fontWeight:800,cursor:off||busy?'default':'pointer',
        fontFamily:'inherit',
        boxShadow: off||busy ? 'none' : `0 6px 20px ${brand}55`,
        transition:'all 0.15s',
      }}>
        {busy?'Please wait…':label}
      </button>
    )
  }

  // -- Error display ----------------------------------------
  function ErrBox({ msg }) {
    if (!msg) return null
    const isGood = msg.includes('sent') || msg.includes('success')
    return (
      <div style={{
        fontSize:13, fontWeight:600, padding:'10px 14px', borderRadius:12,
        marginBottom:14, lineHeight:1.4,
        background: isGood ? 'rgba(22,163,74,0.2)' : 'rgba(220,38,38,0.2)',
        border: `1px solid ${isGood?'rgba(34,197,94,0.4)':'rgba(239,68,68,0.4)'}`,
        color: isGood ? '#4ade80' : '#fca5a5',
      }}>{msg}</div>
    )
  }

  // -- App logo + tagline -----------------------------------
  function AppLogo() {
    return (
      <div style={{ display:'flex',alignItems:'center',gap:12,marginBottom:24 }}>
        <div style={{
          width:44,height:44,borderRadius:14,
          background:`linear-gradient(135deg,${brand},${brand2})`,
          display:'flex',alignItems:'center',justifyContent:'center',
          fontSize:22, flexShrink:0,
          boxShadow:`0 6px 18px ${brand}55`,
        }}>⚡</div>
        <div>
          <div style={{ fontSize:20,fontWeight:900,letterSpacing:'-0.5px',
            background:`linear-gradient(90deg,#fff 30%,rgba(255,220,130,1) 55%,#fff 80%)`,
            backgroundSize:'300px 100%',backgroundClip:'text',
            WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',
          }}>rideJi</div>
          <div style={{ fontSize:12,color:'rgba(255,255,255,0.5)',marginTop:1 }}>Need a Ride? Get rideJi.</div>
        </div>
      </div>
    )
  }

  // -- Divider ----------------------------------------------
  function GlassDivider() {
    return (
      <div style={{ display:'flex',alignItems:'center',gap:10,margin:'18px 0' }}>
        <div style={{ flex:1,height:1,background:'rgba(255,255,255,0.12)' }}/>
        <span style={{ fontSize:12,color:'rgba(255,255,255,0.4)',fontWeight:600 }}>or</span>
        <div style={{ flex:1,height:1,background:'rgba(255,255,255,0.12)' }}/>
      </div>
    )
  }

  /* -- HOME STEP -------------------------------------------- */
  if (step==='home') return (
    <AuthBg>
      <AppLogo />

      <div style={{ marginBottom:22 }}>
        <div style={{ fontSize:22,fontWeight:800,color:'#fff',marginBottom:4 }}>Welcome back</div>
        <div style={{ fontSize:14,color:'rgba(255,255,255,0.5)' }}>Sign in to book your ride</div>
      </div>

      {/* Google */}
      <button onClick={loginGoogle} disabled={busy} style={{
        width:'100%',padding:'14px',border:'1.5px solid rgba(255,255,255,0.2)',
        borderRadius:14,background:'rgba(255,255,255,0.10)',backdropFilter:'blur(8px)',
        display:'flex',alignItems:'center',justifyContent:'center',gap:10,
        fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'inherit',marginBottom:10,
        color:'#fff',transition:'all 0.15s',
      }}>
        <GoogleIcon /> Continue with Google
      </button>

      {/* WhatsApp */}
      <button onClick={()=>{setChannel('whatsapp');setStep('phone')}} disabled={busy} style={{
        width:'100%',padding:'14px',border:'1.5px solid rgba(37,211,102,0.4)',
        borderRadius:14,background:'rgba(37,211,102,0.08)',backdropFilter:'blur(8px)',
        display:'flex',alignItems:'center',justifyContent:'center',gap:10,
        fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'inherit',marginBottom:10,
        color:'#4ade80',transition:'all 0.15s',
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="#4ade80"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
        Continue with WhatsApp
      </button>

      {/* Mobile */}
      <button onClick={()=>{setChannel('sms');setStep('phone')}} disabled={busy} style={{
        width:'100%',padding:'14px',border:'1.5px solid rgba(255,255,255,0.15)',
        borderRadius:14,background:'rgba(255,255,255,0.07)',backdropFilter:'blur(8px)',
        display:'flex',alignItems:'center',justifyContent:'center',gap:10,
        fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'inherit',
        color:'rgba(255,255,255,0.7)',transition:'all 0.15s',
      }}>
        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18.01"/></svg>
        Continue with Mobile Number
      </button>

      <ErrBox msg={error} />

      <div style={{ textAlign:'center',marginTop:18,fontSize:11,color:'rgba(255,255,255,0.3)',lineHeight:1.6 }}>
        By continuing, you agree to our Terms of Service and Privacy Policy
      </div>
    </AuthBg>
  )

  /* -- PHONE STEP ------------------------------------------- */
  if (step==='phone') return (
    <AuthBg backFn={()=>setStep('home')}>
      <AppLogo />
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:20,fontWeight:800,color:'#fff',marginBottom:4 }}>Enter Mobile Number</div>
        <div style={{ fontSize:13,color:'rgba(255,255,255,0.5)' }}>We'll send OTP via {channel==='whatsapp'?'WhatsApp':'SMS'}</div>
      </div>

      <div style={{ display:'flex',gap:8,marginBottom:12 }}>
        <div style={{
          padding:'13px 14px',background:'rgba(255,255,255,0.10)',backdropFilter:'blur(8px)',
          borderRadius:14,border:'1.5px solid rgba(255,255,255,0.15)',
          display:'flex',alignItems:'center',gap:6,flexShrink:0,fontSize:14,fontWeight:700,color:'#fff',
        }}>🇮🇳 +91</div>
        <div style={{ flex:1 }}>
          <GlassInp val={phone} set={v=>setPhone(v.replace(/\D/g,'').slice(0,10))} ph="10-digit number" type="tel" autoFocus onSubmit={sendOTP} />
        </div>
      </div>

      <ErrBox msg={error} />
      <GlassBtn label={`Send OTP via ${channel==='whatsapp'?'WhatsApp':'SMS'} →`} fn={sendOTP} off={phone.length!==10} />
    </AuthBg>
  )

  /* -- OTP STEP --------------------------------------------- */
  if (step==='otp') return (
    <AuthBg backFn={()=>setStep('phone')}>
      <AppLogo />
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:20,fontWeight:800,color:'#fff',marginBottom:4 }}>Verify Number</div>
        <div style={{ fontSize:13,color:'rgba(255,255,255,0.5)' }}>Code sent to +91 {phone}</div>
      </div>

      {/* OTP boxes */}
      <div style={{ display:'flex',gap:8,justifyContent:'center',marginBottom:18 }}>
        {otp.map((d,i)=>(
          <input key={i} ref={el=>otpRefs.current[i]=el}
            value={d} maxLength={1} inputMode="numeric"
            onChange={e=>otpChange(i,e.target.value)} onKeyDown={e=>otpKey(i,e)}
            style={{
              width:46,height:58,textAlign:'center',fontSize:24,fontWeight:900,
              background:d?'rgba(255,95,31,0.2)':'rgba(255,255,255,0.08)',
              border:`2px solid ${d?brand:'rgba(255,255,255,0.2)'}`,
              borderRadius:14,outline:'none',fontFamily:'inherit',color:'#fff',
              userSelect:'text',WebkitUserSelect:'text',
              transition:'all 0.18s',boxShadow:d?`0 0 12px ${brand}44`:'none',
            }}
          />
        ))}
      </div>

      <ErrBox msg={error} />
      <GlassBtn label="Verify OTP →" fn={verifyOTP} off={otp.join('').length!==6} />

      <div style={{ textAlign:'center',marginTop:16 }}>
        {timer>0
          ? <span style={{ fontSize:13,color:'rgba(255,255,255,0.4)' }}>Resend in {timer}s</span>
          : <button onClick={()=>{setOtp(['','','','','','']);setStep('phone')}} style={{ fontSize:13,color:brand,background:'none',border:'none',fontWeight:700,cursor:'pointer',fontFamily:'inherit' }}>
              Resend / Change number
            </button>
        }
      </div>
    </AuthBg>
  )

  /* -- NAME STEP -------------------------------------------- */
  if (step==='name') return (
    <AuthBg backFn={()=>setStep('otp')}>
      <AppLogo />
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:20,fontWeight:800,color:'#fff',marginBottom:4 }}>Create Account</div>
        <div style={{ fontSize:13,color:'rgba(255,255,255,0.5)' }}>Just your name to get started</div>
      </div>

      <div style={{ display:'flex',flexDirection:'column',gap:10,marginBottom:16 }}>
        <GlassInp val={name} set={setName} ph="Your full name" autoFocus />
        <GlassInp val={email} set={setEmail} ph="Email (optional)" type="email" />
      </div>

      <ErrBox msg={error} />
      <GlassBtn label="Start Riding →" fn={savePassenger} off={!name.trim()} />
    </AuthBg>
  )

  return null
}

