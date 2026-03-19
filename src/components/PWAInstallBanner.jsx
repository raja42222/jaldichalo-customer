import { useState, useEffect, useRef } from 'react'

const isIOS       = /iphone|ipad|ipod/i.test(navigator.userAgent)
const isAndroid   = /android/i.test(navigator.userAgent)
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone
const DONE_KEY    = 'jc_pwa_done'

export default function PWAInstallBanner() {
  const [prompt,  setPrompt]  = useState(null)
  const [show,    setShow]    = useState(false)
  const [step,    setStep]    = useState('banner')
  const [isDone,  setIsDone]  = useState(() => !!localStorage.getItem(DONE_KEY))
  const captured  = useRef(false)

  useEffect(() => {
    // Already installed or dismissed
    if (isDone || isStandalone) return

    // Android: capture beforeinstallprompt immediately
    const onPrompt = (e) => {
      e.preventDefault()
      setPrompt(e)
      captured.current = true
      // Show immediately — don't wait
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)

    // If event already fired before component mounted (e.g. cached)
    if (window.__pwaPromptEvent) {
      onPrompt(window.__pwaPromptEvent)
    }

    // iOS: show after 2s
    let iosTimer
    if (isIOS && !captured.current) {
      iosTimer = setTimeout(() => setShow(true), 2000)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      clearTimeout(iosTimer)
    }
  }, [isDone])

  // Capture early (before React mounts) — put in index.html too
  useEffect(() => {
    const earlyCapture = (e) => { e.preventDefault(); window.__pwaPromptEvent = e }
    window.addEventListener('beforeinstallprompt', earlyCapture)
    return () => window.removeEventListener('beforeinstallprompt', earlyCapture)
  }, [])

  function install() {
    if (prompt) {
      prompt.prompt()
      prompt.userChoice.then(c => { if (c.outcome === 'accepted') dismiss() })
    } else if (isIOS) {
      setStep('ios')
    }
  }

  function dismiss() {
    setShow(false); setIsDone(true)
    localStorage.setItem(DONE_KEY, '1')
  }

  if (!show || isDone || isStandalone) return null

  if (step === 'ios') return (
    <div style={{
      position:'fixed', bottom:0, left:0, right:0, zIndex:9999,
      background:'#fff', borderRadius:'20px 20px 0 0',
      boxShadow:'0 -8px 32px rgba(0,0,0,0.18)',
      padding:'20px 20px calc(32px + env(safe-area-inset-bottom,0px))',
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
        <div style={{ fontWeight:800, fontSize:16 }}>Install rideJi</div>
        <button onClick={dismiss} style={{ background:'none',border:'none',fontSize:24,cursor:'pointer',color:'#aaa' }}>×</button>
      </div>
      {[
        { icon:'⬆️', text:'Tap the Share button at the bottom' },
        { icon:'📲', text:'Tap "Add to Home Screen"' },
        { icon:'✅', text:'Tap "Add" — opens fullscreen!' },
      ].map((s,i) => (
        <div key={i} style={{ display:'flex', alignItems:'center', gap:14, padding:'10px 0', borderBottom:'1px solid #f0f0f0' }}>
          <div style={{ fontSize:22, width:36, textAlign:'center' }}>{s.icon}</div>
          <div style={{ fontSize:14, color:'#333' }}>{s.text}</div>
        </div>
      ))}
    </div>
  )

  return (
    <div style={{
      position:'fixed', bottom:0, left:0, right:0, zIndex:9999,
      background:'#fff', borderTop:'1px solid #f0f0f0',
      boxShadow:'0 -6px 24px rgba(0,0,0,0.12)',
      padding:`14px 16px calc(14px + env(safe-area-inset-bottom,0px))`,
      display:'flex', alignItems:'center', gap:14,
      animation:'slideUpFast 0.3s cubic-bezier(0.16,1,0.3,1)',
    }}>
      <style>{`@keyframes slideUpFast{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
      {/* App icon */}
      <div style={{ width:52, height:52, borderRadius:14, background:'linear-gradient(135deg,#FF5F1F,#FF8C00)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, flexShrink:0, boxShadow:'0 4px 14px rgba(255,95,31,0.4)' }}>⚡</div>
      <div style={{ flex:1 }}>
        <div style={{ fontWeight:800, fontSize:15 }}>Install rideJi</div>
        <div style={{ fontSize:12, color:'#888', marginTop:2 }}>
          {isIOS ? 'Add to Home Screen for fullscreen' : 'Faster · Fullscreen · Works offline'}
        </div>
      </div>
      <div style={{ display:'flex', gap:8, flexShrink:0 }}>
        <button onClick={install} style={{
          padding:'10px 18px', background:'linear-gradient(135deg,#FF5F1F,#FF8C00)',
          color:'#fff', border:'none', borderRadius:12, fontWeight:700, fontSize:14,
          cursor:'pointer', fontFamily:'inherit',
          boxShadow:'0 4px 14px rgba(255,95,31,0.4)',
        }}>
          {isIOS ? 'How?' : 'Install'}
        </button>
        <button onClick={dismiss} style={{ background:'none', border:'none', color:'#bbb', cursor:'pointer', fontSize:24, padding:'0 4px' }}>×</button>
      </div>
    </div>
  )
}
