import { useState, useEffect } from 'react'

/*
  PWA Install Banner — rideJi
  
  Strategy:
  1. index.html captures 'beforeinstallprompt' BEFORE React loads
     and stores it in window.__pwaPrompt
  2. This component reads it immediately on mount — no delay
  3. Shows instantly on FIRST visit (not dismissed before)
  4. iOS: shows manual guide after 1.5s
*/

const isIOS        = /iphone|ipad|ipod/i.test(navigator.userAgent)
const isInBrowser  = !window.matchMedia('(display-mode: standalone)').matches
                     && !window.navigator.standalone

export default function PWAInstallBanner() {
  const [prompt,  setPrompt]  = useState(() => window.__pwaPrompt || null)
  const [show,    setShow]    = useState(false)
  const [step,    setStep]    = useState('main')
  const dismissed = !!localStorage.getItem('jc_pwa_v2')

  useEffect(() => {
    if (dismissed || !isInBrowser) return

    // Android: prompt already captured? Show immediately
    if (window.__pwaPrompt) {
      setPrompt(window.__pwaPrompt)
      setShow(true)
      return
    }

    // Android: listen for prompt (if not yet fired)
    const onPrompt = (e) => {
      e.preventDefault()
      window.__pwaPrompt = e
      setPrompt(e)
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)

    // iOS: show guide after 1.5s
    let t
    if (isIOS) t = setTimeout(() => setShow(true), 1500)

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      clearTimeout(t)
    }
  }, []) // eslint-disable-line

  function install() {
    if (prompt) {
      prompt.prompt()
      prompt.userChoice.then(c => {
        if (c.outcome === 'accepted') dismiss()
      })
    } else if (isIOS) {
      setStep('ios')
    }
  }

  function dismiss() {
    setShow(false)
    localStorage.setItem('jc_pwa_v2', '1')
  }

  if (!show || dismissed || !isInBrowser) return null

  if (step === 'ios') return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999,
      background: '#fff',
      borderRadius: '24px 24px 0 0',
      boxShadow: '0 -8px 40px rgba(0,0,0,0.18)',
      padding: '20px 20px calc(32px + env(safe-area-inset-bottom,0px))',
      animation: 'slideUp 0.35s cubic-bezier(0.16,1,0.3,1) both',
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div style={{ fontWeight:800, fontSize:17 }}>Install rideJi</div>
        <button onClick={dismiss} style={{ background:'none', border:'none', fontSize:26, cursor:'pointer', color:'#aaa', lineHeight:1 }}>×</button>
      </div>
      {[
        { icon: '⬆️', title: 'Tap Share', desc: 'Tap the Share button at the bottom of Safari' },
        { icon: '📲', title: 'Add to Home', desc: 'Scroll down and tap "Add to Home Screen"' },
        { icon: '✅', title: 'Done!', desc: 'Opens fullscreen — no browser bar!' },
      ].map((s, i) => (
        <div key={i} style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 0', borderBottom: i<2 ? '1px solid #f0f0f0' : 'none' }}>
          <div style={{ width:44, height:44, borderRadius:14, background:'#FFF0E8', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>{s.icon}</div>
          <div>
            <div style={{ fontWeight:700, fontSize:14 }}>{s.title}</div>
            <div style={{ fontSize:13, color:'#888', marginTop:2 }}>{s.desc}</div>
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999,
      background: '#fff',
      borderTop: '1px solid #f0f0f0',
      boxShadow: '0 -6px 28px rgba(0,0,0,0.12)',
      padding: '14px 16px calc(14px + env(safe-area-inset-bottom,0px))',
      display: 'flex', alignItems: 'center', gap: 14,
      animation: 'slideUp 0.35s cubic-bezier(0.16,1,0.3,1) both',
    }}>
      {/* App icon */}
      <div style={{
        width:52, height:52, borderRadius:16, flexShrink:0,
        background: 'linear-gradient(135deg, #FF5F1F, #FF8C00)',
        display:'flex', alignItems:'center', justifyContent:'center',
        fontSize: 26,
        boxShadow: '0 4px 16px rgba(255,95,31,0.4)',
      }}>⚡</div>

      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontWeight:800, fontSize:15, marginBottom:2 }}>Install rideJi</div>
        <div style={{ fontSize:12, color:'#888', lineHeight:1.4 }}>
          {isIOS
            ? 'Add to Home Screen for fullscreen'
            : 'Faster · Offline ready · No browser bar'}
        </div>
      </div>

      <div style={{ display:'flex', gap:8, flexShrink:0 }}>
        <button onClick={install} style={{
          padding: '11px 20px',
          background: 'linear-gradient(135deg, #FF5F1F, #FF8C00)',
          color: '#fff', border: 'none', borderRadius: 14,
          fontWeight: 800, fontSize: 14, cursor: 'pointer',
          fontFamily: 'inherit',
          boxShadow: '0 4px 14px rgba(255,95,31,0.4)',
          whiteSpace: 'nowrap',
        }}>
          {isIOS ? 'How?' : 'Install'}
        </button>
        <button onClick={dismiss} style={{
          background: 'none', border: 'none',
          color: '#bbb', cursor: 'pointer', fontSize: 24,
          padding: '0 4px', lineHeight: 1, display: 'flex', alignItems: 'center',
        }}>×</button>
      </div>
    </div>
  )
}
