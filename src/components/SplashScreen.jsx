import { useEffect, useState, useRef } from 'react'

/* ================================================================
   rideJi — Premium Splash Screen v2.0
   - Glassmorphism card
   - Liquid morphism blobs
   - Floating vehicle particles (canvas)
   - "rideJi" shimmer logo
   - Smooth enter animation
================================================================ */

export function AppSkeleton({ isDriver = false }) {
  const [phase, setPhase]   = useState('enter')
  const canvasRef           = useRef(null)
  const animRef             = useRef(null)

  const brand  = isDriver ? '#16A34A' : '#FF5F1F'
  const brand2 = isDriver ? '#22C55E' : '#FF9500'
  const tagline = isDriver ? 'Your ride. Your earning.' : 'Need a Ride? Get rideJi.'

  useEffect(() => {
    setPhase('enter')
    const t = setTimeout(() => setPhase('show'), 60)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const W = canvas.offsetWidth
    const H = canvas.offsetHeight
    canvas.width  = W * dpr
    canvas.height = H * dpr
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)

    const icons = ['🛵','🛵','🛵','🛵','🛺','🛺','🚗','🚗','🛵','🛺','🚗']
    const N = 24
    const particles = Array.from({ length: N }, (_, i) => ({
      x:      Math.random() * W,
      y:      H + Math.random() * H,
      vx:     (Math.random() - 0.5) * 0.45,
      vy:     -(Math.random() * 0.55 + 0.18),
      size:   Math.random() * 10 + 13,
      alpha:  Math.random() * 0.28 + 0.06,
      icon:   icons[i % icons.length],
      rot:    Math.random() * 12 - 6,
      rotV:   (Math.random() - 0.5) * 0.15,
      phase:  Math.random() * Math.PI * 2,
      wobble: Math.random() * 0.8 + 0.3,
    }))

    let t = 0
    function draw() {
      ctx.clearRect(0, 0, W, H)
      t += 0.009
      particles.forEach(p => {
        p.x  += p.vx + Math.sin(t * p.wobble + p.phase) * 0.22
        p.y  += p.vy
        p.rot += p.rotV
        if (p.y < -50)    { p.y = H + 30; p.x = Math.random() * W }
        if (p.x < -50)    p.x = W + 30
        if (p.x > W + 50) p.x = -30
        const yFrac    = 1 - p.y / H
        const fadeEdge = Math.min(1, Math.max(0, Math.sin(yFrac * Math.PI)))
        const breathe  = 0.6 + Math.sin(t * 0.6 + p.phase) * 0.35
        ctx.save()
        ctx.globalAlpha = p.alpha * fadeEdge * breathe
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot * Math.PI / 180)
        ctx.font = `${p.size}px serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(p.icon, 0, 0)
        ctx.restore()
      })
      animRef.current = requestAnimationFrame(draw)
    }
    draw()
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  const cardStyle = {
    opacity:    phase === 'enter' ? 0 : 1,
    transform:  phase === 'enter' ? 'scale(0.90) translateY(24px)' : 'scale(1) translateY(0)',
    transition: 'opacity 0.8s cubic-bezier(0.16,1,0.3,1), transform 0.8s cubic-bezier(0.16,1,0.3,1)',
  }

  return (
    <div style={{ position:'fixed', inset:0, overflow:'hidden', fontFamily:"system-ui,-apple-system,sans-serif" }}>
      <style>{`
        @keyframes blob1{0%,100%{transform:translate(0,0)scale(1)rotate(0deg)}25%{transform:translate(22px,-16px)scale(1.07)rotate(3deg)}50%{transform:translate(-14px,20px)scale(0.95)rotate(-2deg)}75%{transform:translate(18px,8px)scale(1.04)rotate(2deg)}}
        @keyframes blob2{0%,100%{transform:translate(0,0)scale(1)}33%{transform:translate(-20px,16px)scale(1.10)}66%{transform:translate(16px,-12px)scale(0.93)}}
        @keyframes blob3{0%,100%{transform:translate(0,0)scale(1)rotate(0deg)}50%{transform:translate(10px,20px)scale(1.08)rotate(-4deg)}}
        @keyframes jcShimmer{0%{background-position:-500px 0}60%{background-position:500px 0}100%{background-position:500px 0}}
        @keyframes jcTagIn{0%{opacity:0;transform:translateY(14px)scale(0.97);filter:blur(4px)}100%{opacity:1;transform:translateY(0)scale(1);filter:blur(0)}}
        @keyframes jcDot{0%,100%{transform:scaleY(0.5)translateY(2px);opacity:0.3}50%{transform:scaleY(1.4)translateY(-3px);opacity:1}}
        @keyframes jcRing{0%{transform:scale(0.7);opacity:0.75}100%{transform:scale(2.2);opacity:0}}
        @keyframes jcFloat{0%,100%{transform:translateY(0px)rotate(0deg)}30%{transform:translateY(-9px)rotate(0.3deg)}70%{transform:translateY(-5px)rotate(-0.2deg)}}
        @keyframes jcGlare{0%{left:-80%;opacity:0}10%{opacity:1}90%{opacity:1}100%{left:180%;opacity:0}}
        @keyframes jcBadge{0%{opacity:0;transform:translateY(8px)}100%{opacity:1;transform:translateY(0)}}
        .jc-logo{background:linear-gradient(90deg,rgba(255,255,255,0.9) 0%,rgba(255,255,255,0.95) 20%,rgba(255,220,130,1) 42%,rgba(255,255,255,1) 52%,rgba(255,255,255,0.95) 72%,rgba(255,255,255,0.9) 100%);background-size:500px 100%;background-clip:text;-webkit-background-clip:text;-webkit-text-fill-color:transparent;animation:jcShimmer 3.2s ease-in-out 0.8s infinite}
        .jc-card-float{animation:jcFloat 5s ease-in-out infinite}
      `}</style>

      {/* Screen BG */}
      <div style={{
        position:'absolute', inset:0,
        background:`linear-gradient(160deg, #060610 0%, #160700 45%, #050D05 85%, #060610 100%)`,
      }}>
        {/* Canvas particles */}
        <canvas ref={canvasRef} style={{ position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none' }}/>

        {/* Blob 1 */}
        <div style={{ position:'absolute', top:'-30%', left:'-30%', width:'80%', height:'80%', borderRadius:'50%', background:`radial-gradient(circle, ${brand}52 0%, transparent 65%)`, filter:'blur(42px)', animation:'blob1 9s ease-in-out infinite', pointerEvents:'none' }}/>
        {/* Blob 2 */}
        <div style={{ position:'absolute', bottom:'-25%', right:'-30%', width:'90%', height:'90%', borderRadius:'50%', background:`radial-gradient(circle, ${brand2}3E 0%, transparent 60%)`, filter:'blur(55px)', animation:'blob2 11s ease-in-out infinite', pointerEvents:'none' }}/>
        {/* Blob 3 */}
        <div style={{ position:'absolute', top:'20%', left:'5%', width:'75%', height:'75%', borderRadius:'50%', background:`radial-gradient(circle at 40% 40%, rgba(255,140,40,0.10) 0%, transparent 65%)`, filter:'blur(32px)', animation:'blob3 13s ease-in-out infinite', pointerEvents:'none' }}/>

        {/* Content */}
        <div style={{
          position:'absolute', inset:0,
          display:'flex', flexDirection:'column',
          alignItems:'center', justifyContent:'center',
          padding:'0 32px',
          ...cardStyle,
        }}>
          {/* Glass card */}
          <div className="jc-card-float" style={{
            width:'100%', maxWidth:320,
            background:'rgba(255,255,255,0.065)',
            backdropFilter:'blur(36px) saturate(1.4)',
            WebkitBackdropFilter:'blur(36px) saturate(1.4)',
            border:'1px solid rgba(255,255,255,0.14)',
            borderRadius:28,
            padding:'34px 28px 28px',
            display:'flex', flexDirection:'column', alignItems:'center',
            position:'relative', overflow:'hidden',
            boxShadow:`0 0 0 1px rgba(255,255,255,0.04), 0 28px 64px rgba(0,0,0,0.6), 0 0 70px ${brand}1C, inset 0 1px 0 rgba(255,255,255,0.20), inset 0 -1px 0 rgba(0,0,0,0.3)`,
          }}>
            {/* Top ridge */}
            <div style={{ position:'absolute', top:0, left:'6%', right:'6%', height:1, background:'linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)', pointerEvents:'none' }}/>
            {/* Glare */}
            <div style={{ position:'absolute', top:0, bottom:0, width:'25%', background:'linear-gradient(90deg, transparent, rgba(255,255,255,0.055), transparent)', animation:'jcGlare 5s ease-in-out 2s infinite', pointerEvents:'none' }}/>

            {/* Icon */}
            <div style={{
              width:58, height:58, borderRadius:18,
              background:`linear-gradient(145deg, ${brand} 0%, ${brand2} 100%)`,
              display:'flex', alignItems:'center', justifyContent:'center',
              marginBottom:18, position:'relative',
              boxShadow:`0 12px 32px ${brand}55, inset 0 1px 0 rgba(255,255,255,0.25), inset 0 -1px 0 rgba(0,0,0,0.2)`,
            }}>
              <div style={{ position:'absolute', inset:-6, borderRadius:24, border:`1.5px solid ${brand}88`, animation:'jcRing 2.8s ease-out infinite' }}/>
              <div style={{ position:'absolute', inset:-6, borderRadius:24, border:`1.5px solid ${brand}55`, animation:'jcRing 2.8s ease-out 1.3s infinite' }}/>
              <div style={{ position:'absolute', inset:0, borderRadius:18, background:'linear-gradient(145deg, rgba(255,255,255,0.2) 0%, transparent 60%)', pointerEvents:'none' }}/>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                <path d="M13 2L4.09 12.96a1 1 0 0 0 .77 1.64H11l-1 7.36L19.91 11a1 1 0 0 0-.77-1.64H13l1-7.36z" fill="white" stroke="rgba(255,255,255,0.15)" strokeWidth="0.4"/>
              </svg>
            </div>

            {/* Logo */}
            <div style={{ marginBottom:10, lineHeight:1 }}>
              <span className="jc-logo" style={{ fontSize:50, fontWeight:900, letterSpacing:'-1.8px', fontFamily:"'SF Pro Display','Space Grotesk',system-ui,sans-serif" }}>ride</span>
              <span className="jc-logo" style={{ fontSize:50, fontWeight:900, letterSpacing:'-1.8px', fontFamily:"'SF Pro Display','Space Grotesk',system-ui,sans-serif" }}>Ji</span>
            </div>

            {/* Tagline */}
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.52)', fontWeight:500, letterSpacing:'0.05em', textAlign:'center', lineHeight:1.6, animation:'jcTagIn 0.9s cubic-bezier(0.16,1,0.3,1) 0.5s both' }}>
              {tagline}
            </div>

            {/* Divider */}
            <div style={{ width:36, height:1, background:`linear-gradient(90deg, transparent, ${brand}88, transparent)`, margin:'18px 0 16px' }}/>

            {/* Loading dots */}
            <div style={{ display:'flex', gap:5, alignItems:'center', height:14 }}>
              {[0, 0.18, 0.36, 0.54, 0.72].map((d, i) => (
                <div key={i} style={{
                  width: i===2 ? 14 : 6,
                  height:6, borderRadius:3,
                  background: i===2 ? brand : `${brand}99`,
                  animation:`jcDot 1.1s ${d}s ease-in-out infinite`,
                }}/>
              ))}
            </div>
          </div>

          {/* Badge */}
          <div style={{ marginTop:24, display:'flex', alignItems:'center', gap:6, animation:'jcBadge 0.8s 1s both' }}>
            <div style={{ width:1, height:10, background:'rgba(255,255,255,0.15)' }}/>
            <span style={{ fontSize:9.5, color:'rgba(255,255,255,0.22)', letterSpacing:'0.18em', fontWeight:700, textTransform:'uppercase' }}>Made in India</span>
            <span style={{ fontSize:12 }}>🇮🇳</span>
            <div style={{ width:1, height:10, background:'rgba(255,255,255,0.15)' }}/>
          </div>
        </div>
      </div>
    </div>
  )
}
