import { useState, useEffect, useRef } from 'react'

/*
  WHY ANDROID SHOWS "SHORTCUT" INSTEAD OF "INSTALL APP":
  Chrome shows the native install dialog ONLY when ALL criteria are met:
  1. ✅ HTTPS
  2. ✅ Valid manifest with name, start_url, display: standalone
  3. ✅ PNG icons at 192x192 AND 512x512 (SVG alone is NOT enough)
  4. ✅ Service Worker registered
  5. ✅ beforeinstallprompt event fired and captured

  This component captures that event and shows a custom banner
  so the user sees "Install" instead of burying it in browser menu.
*/

const isIOS        = /iphone|ipad|ipod/i.test(navigator.userAgent)
const isAndroid    = /android/i.test(navigator.userAgent)
const isInBrowser  = !window.matchMedia('(display-mode: standalone)').matches &&
                     !window.navigator.standalone

export default function PWAInstallBanner() {
  const [prompt,   setPrompt]   = useState(null)
  const [show,     setShow]     = useState(false)
  const [step,     setStep]     = useState('banner') // 'banner' | 'ios-guide'
  const [isDone,   setIsDone]   = useState(() => !!localStorage.getItem('jc_pwa_done'))
  const shownRef = useRef(false)

  /* -- Android: capture beforeinstallprompt -- */
  useEffect(() => {
    if (isDone || !isInBrowser) return

    const handler = e => {
      e.preventDefault()
      setPrompt(e)
      // Show banner after 4 seconds — let the user see the app first
      if (!shownRef.current) {
        shownRef.current = true
        setTimeout(() => setShow(true), 4000)
      }
    }
    window.addEventListener('beforeinstallprompt', handler)

    // Check if already missed the event (page loaded later)
    if (window.__pwaPrompt) {
      handler(window.__pwaPrompt)
    }

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [isDone])

  /* -- iOS: show manual guide after 5 seconds -- */
  useEffect(() => {
    if (isDone || !isInBrowser || !isIOS || shownRef.current) return
    const t = setTimeout(() => {
      shownRef.current = true
      setShow(true)
    }, 5000)
    return () => clearTimeout(t)
  }, [isDone])

  function handleInstall() {
    if (prompt) {
      prompt.prompt()
      prompt.userChoice.then(choice => {
        if (choice.outcome === 'accepted') dismiss()
      })
    } else if (isIOS) {
      setStep('ios-guide')
    }
  }

  function dismiss() {
    setShow(false)
    setIsDone(true)
    localStorage.setItem('jc_pwa_done', '1')
  }

  if (!show || isDone || !isInBrowser) return null

  /* -- iOS guide -- */
  if (step === 'ios-guide') return (
    <div className="pwa-banner" style={{ flexDirection:'column', alignItems:'stretch', gap:12 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ fontWeight:800, fontSize:15 }}>Install Jaldi Chalo</div>
        <button onClick={dismiss} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'#aaa', padding:'0 4px' }}>×</button>
      </div>
      {[
        { n:'1', icon:'⬆️', text: 'Tap the Share button at the bottom of Safari' },
        { n:'2', icon:'📲', text: 'Scroll down and tap "Add to Home Screen"' },
        { n:'3', icon:'✅', text: 'Tap "Add" — the app opens fullscreen!' },
      ].map(s => (
        <div key={s.n} style={{ display:'flex', alignItems:'center', gap:12, padding:'8px 0' }}>
          <div style={{ width:32, height:32, borderRadius:10, background:'#FFF0E8', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>{s.icon}</div>
          <div style={{ fontSize:14, color:'#333', lineHeight:1.4 }}>{s.text}</div>
        </div>
      ))}
      <div style={{ fontSize:12, color:'#aaa', textAlign:'center' }}>Once installed, it opens fullscreen — no browser bar!</div>
    </div>
  )

  /* -- Main banner -- */
  return (
    <div className="pwa-banner">
      <div style={{ width:46, height:46, borderRadius:14, background:'linear-gradient(135deg,#FF5F1F,#FF8C00)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, flexShrink:0 }}>⚡</div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontWeight:700, fontSize:14, color:'#111' }}>Install Jaldi Chalo</div>
        <div style={{ fontSize:12, color:'#888', marginTop:2, lineHeight:1.4 }}>
          {isIOS
            ? 'Add to Home Screen for fullscreen mode'
            : 'Install app — faster, fullscreen, works offline'
          }
        </div>
      </div>
      <div style={{ display:'flex', gap:6, flexShrink:0, alignItems:'center' }}>
        <button onClick={handleInstall}
          style={{ padding:'10px 16px', background:'linear-gradient(135deg,#FF5F1F,#FF8C00)', color:'#fff', border:'none', borderRadius:12, fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:'inherit', boxShadow:'0 3px 12px rgba(255,95,31,0.35)', whiteSpace:'nowrap' }}>
          {isIOS ? 'How to Install' : 'Install'}
        </button>
        <button onClick={dismiss}
          style={{ background:'none', border:'none', color:'#bbb', cursor:'pointer', fontSize:22, padding:'0 2px', display:'flex', alignItems:'center' }}>×</button>
      </div>
    </div>
  )
}
