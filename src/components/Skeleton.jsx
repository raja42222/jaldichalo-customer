export { AppSkeleton } from './SplashScreen'

/* ================================================================
   JALDI CHALO — Reusable Skeleton Loader System
   ----------------------------------------------------------------
   Uber-style skeleton patterns for all loading states.
   Uses our design system (no Tailwind — inline CSS + index.css).

   Exported components:
   - Sk              Base shimmer block (configurable)
   - SkeletonMap     Map loading overlay
   - SkeletonFare    Fare estimation rows (4 vehicle types)
   - SkeletonDriver  Driver search card
   - SkeletonRideCard  Single ride history card
   - SkeletonRideHistory  Full history list (3 cards)
   - SkeletonProfile  Driver/passenger profile page
   - SkeletonEarnings Driver earnings tab
   - AppSkeleton     Full-screen skeleton app shell
================================================================ */

import { useEffect, useState } from 'react'

/* -- keyframes injected once ----------------------------------- */
const STYLE_ID = 'jc-skeleton-styles'
function injectStyles() {
  if (document.getElementById(STYLE_ID)) return
  const s = document.createElement('style')
  s.id = STYLE_ID
  s.textContent = `
    @keyframes jcSkShimmer {
      0%   { background-position: -400px 0 }
      100% { background-position: 400px 0  }
    }
    @keyframes jcSkFade {
      0%, 100% { opacity: 1   }
      50%       { opacity: 0.4 }
    }
    @keyframes jcSkPulse {
      0%   { opacity: 0.6 }
      50%  { opacity: 1   }
      100% { opacity: 0.6 }
    }
    @keyframes jcSkSlideIn {
      from { opacity:0; transform:translateY(8px) }
      to   { opacity:1; transform:translateY(0)   }
    }
    .jc-sk-shimmer {
      background: linear-gradient(
        90deg,
        #f0f0f0 0%, #f0f0f0 25%,
        #e4e4e4 37%, #e8e8e8 50%,
        #f0f0f0 63%, #f0f0f0 100%
      );
      background-size: 800px 100%;
      animation: jcSkShimmer 1.6s ease-in-out infinite;
    }
    .jc-sk-slide { animation: jcSkSlideIn 0.28s cubic-bezier(0.16,1,0.3,1) both }
    .jc-sk-pulse { animation: jcSkFade 2s ease-in-out infinite }
  `
  document.head.appendChild(s)
}
injectStyles()

/* -- Base shimmer block --------------------------------------- */
export function Sk({ w, h = 14, r = 6, style, circle, block }) {
  const baseStyle = {
    display:      block ? 'block' : 'inline-block',
    width:        circle ? h : (w || '100%'),
    height:       h,
    borderRadius: circle ? '50%' : r,
    flexShrink:   0,
    ...style,
  }
  return <div className="jc-sk-shimmer" style={baseStyle} />
}

/* -- Row of two shimmer blocks ------------------------------- */
function SkRow({ children, gap = 8, style }) {
  return <div style={{ display:'flex', gap, alignItems:'center', ...style }}>{children}</div>
}

/* ================================================================
   1. MAP LOADING SKELETON
   Shown as overlay while MapLibre loads (~1-2s on first visit)
================================================================ */
export function SkeletonMap({ visible }) {
  if (!visible) return null
  return (
    <div style={{
      position:   'absolute',
      inset:      0,
      background: '#e8e4dc',
      zIndex:     5,
      display:    'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap:        16,
    }}>
      {/* Faux map tiles grid */}
      <div style={{ position:'absolute', inset:0, overflow:'hidden', opacity:0.6 }}>
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="jc-sk-shimmer" style={{
            position:     'absolute',
            width:        '34%',
            height:       '34%',
            borderRadius: 4,
            top:          `${Math.floor(i/3) * 33}%`,
            left:         `${(i%3) * 33}%`,
            margin:       2,
            animationDelay: `${(i * 0.12).toFixed(2)}s`,
          }} />
        ))}
      </div>
      {/* Center loading card */}
      <div style={{
        position:    'relative',
        background:  'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(12px)',
        borderRadius: 20,
        padding:      '18px 24px',
        display:      'flex',
        flexDirection: 'column',
        alignItems:   'center',
        gap:          10,
        boxShadow:    '0 8px 32px rgba(0,0,0,0.12)',
        minWidth:     180,
      }}>
        <div style={{ display:'flex', gap:6 }}>
          {[0, 0.2, 0.4].map(d => (
            <div key={d} style={{
              width:      8, height: 8, borderRadius: '50%',
              background: '#FF5F1F',
              animation:  `jcSkPulse 1.2s ease-in-out ${d}s infinite`,
            }} />
          ))}
        </div>
        <div style={{ fontSize:13, fontWeight:700, color:'#555' }}>Loading map...</div>
      </div>
    </div>
  )
}

/* ================================================================
   2. DRIVER SEARCH SKELETON
   Full panel while dispatch is finding a driver
================================================================ */
export function SkeletonDriverSearch({ message }) {
  return (
    <div className="jc-sk-slide" style={{ padding:'0 14px 14px', display:'flex', flexDirection:'column', gap:10 }}>

      {/* Searching animation bar */}
      <div style={{ height:4, background:'#F0F0F0', borderRadius:2, overflow:'hidden', marginBottom:4 }}>
        <div style={{
          height:    '100%',
          width:     '40%',
          background: 'linear-gradient(90deg,transparent,#FF5F1F,transparent)',
          animation: 'jcSkShimmer 1.4s ease-in-out infinite',
          backgroundSize: '200% 100%',
        }} />
      </div>

      {/* Status message */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0' }}>
        <div style={{ display:'flex', gap:5 }}>
          {[0, 0.15, 0.3].map(d => (
            <div key={d} style={{ width:7, height:7, borderRadius:'50%', background:'#FF5F1F', animation:`jcSkPulse 1s ease ${d}s infinite` }} />
          ))}
        </div>
        <span style={{ fontSize:14, fontWeight:700, color:'#555' }}>
          {message || 'Searching for captain...'}
        </span>
      </div>

      {/* Distance/Time stats row */}
      <div style={{ display:'flex', gap:8 }}>
        {['Distance','Ride time','ETA'].map((label, i) => (
          <div key={label} style={{ flex:1, background:'#fff', border:'1px solid #EDEDED', borderRadius:12, padding:'11px 10px' }}>
            <div style={{ fontSize:10, fontWeight:700, color:'#BBB', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6 }}>{label}</div>
            <Sk h={18} r={5} block style={{ animationDelay:`${i*0.1}s` }} />
          </div>
        ))}
      </div>

      {/* Driver card skeleton */}
      <div style={{ background:'#fff', border:'1px solid #EDEDED', borderRadius:14, padding:'12px 14px', display:'flex', alignItems:'center', gap:12 }}>
        <Sk h={44} circle style={{ animationDelay:'0.1s' }} />
        <div style={{ flex:1, display:'flex', flexDirection:'column', gap:7 }}>
          <Sk h={14} w="60%" r={6} block />
          <Sk h={11} w="40%" r={5} block style={{ animationDelay:'0.08s' }} />
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:5, alignItems:'flex-end' }}>
          <Sk h={12} w={50} r={6} />
          <Sk h={10} w={36} r={5} style={{ animationDelay:'0.1s' }} />
        </div>
      </div>

      {/* 4 vehicle fare rows skeleton */}
      <SkeletonFareRows />

      {/* Cancel button skeleton */}
      <Sk h={44} r={12} block style={{ marginTop:4, animationDelay:'0.25s' }} />
    </div>
  )
}

/* ================================================================
   3. FARE ESTIMATION SKELETON
   4 vehicle type rows with price placeholders
================================================================ */
export function SkeletonFareRows() {
  const emojis = ['🏍️','🛺','🚗','❄️']
  const labels = ['Bike','Auto','Cab Non-AC','Cab AC']
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      {emojis.map((e, i) => (
        <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'13px 14px', background:'#fff', border:'2px solid #EDEDED', borderRadius:13, animationDelay:`${i*0.06}s` }}>
          {/* Emoji */}
          <div style={{ width:40, height:40, borderRadius:10, background:'#F5F5F5', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>
            {e}
          </div>
          {/* Name + eta badge */}
          <div style={{ flex:1, display:'flex', flexDirection:'column', gap:6 }}>
            <SkRow>
              <Sk h={13} w={50} r={5} />
              <Sk h={18} w={48} r={8} style={{ animationDelay:'0.05s' }} />
            </SkRow>
            <Sk h={11} w={90} r={5} block style={{ animationDelay:'0.1s' }} />
          </div>
          {/* Price */}
          <div style={{ display:'flex', flexDirection:'column', gap:4, alignItems:'flex-end' }}>
            <Sk h={20} w={52} r={6} style={{ animationDelay:`${0.08 + i*0.04}s` }} />
            <Sk h={11} w={36} r={5} style={{ animationDelay:`${0.15 + i*0.04}s` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

/* ================================================================
   4. RIDE HISTORY SKELETON
   3 ride card skeletons
================================================================ */
export function SkeletonRideCard({ delay = 0 }) {
  return (
    <div className="jc-sk-shimmer" style={{ borderRadius:18, padding:16, marginBottom:10, animationDelay:`${delay}s` }}>
      {/* Header row */}
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:12 }}>
        <Sk h={11} w={100} r={6} />
        <Sk h={20} w={70} r={10} style={{ animationDelay:`${delay+0.05}s` }} />
      </div>
      {/* Pickup row */}
      <SkRow style={{ marginBottom:8 }}>
        <div style={{ width:10, height:10, borderRadius:'50%', background:'#D8D8D8', flexShrink:0 }} />
        <Sk h={13} r={6} style={{ flex:1, animationDelay:`${delay+0.05}s` }} />
      </SkRow>
      {/* Drop row */}
      <SkRow style={{ marginBottom:12 }}>
        <div style={{ width:10, height:10, borderRadius:'50%', background:'#D0D0D0', flexShrink:0 }} />
        <Sk h={13} r={6} style={{ flex:1, animationDelay:`${delay+0.1}s` }} />
      </SkRow>
      {/* Footer */}
      <div style={{ display:'flex', justifyContent:'space-between', paddingTop:12, borderTop:'1px solid rgba(0,0,0,0.04)' }}>
        <Sk h={20} w={60} r={8} style={{ animationDelay:`${delay+0.12}s` }} />
        <Sk h={20} w={40} r={8} style={{ animationDelay:`${delay+0.15}s` }} />
      </div>
    </div>
  )
}

export function SkeletonRideHistory() {
  return (
    <div className="jc-sk-slide" style={{ padding:'0 14px' }}>
      {[0, 0.08, 0.16].map(d => <SkeletonRideCard key={d} delay={d} />)}
    </div>
  )
}

/* ================================================================
   5. DRIVER PROFILE SKELETON
================================================================ */
export function SkeletonProfile({ role = 'passenger' }) {
  const isDriver = role === 'driver'
  return (
    <div className="jc-sk-slide" style={{ padding:'0 14px 80px' }}>

      {/* Avatar + name */}
      <div style={{ textAlign:'center', padding:'28px 0 24px', display:'flex', flexDirection:'column', alignItems:'center', gap:12 }}>
        <Sk h={80} circle />
        <Sk h={22} w={140} r={8} block />
        <Sk h={14} w={100} r={6} block style={{ animationDelay:'0.06s' }} />
        {/* Stats row */}
        <div style={{ display:'flex', gap:12, marginTop:6 }}>
          {['Rides','Rating', isDriver ? 'Earnings' : 'Saved'].map((label, i) => (
            <div key={label} style={{ padding:'10px 18px', background:'#F5F5F5', borderRadius:14, display:'flex', flexDirection:'column', gap:6, alignItems:'center' }}>
              <Sk h={18} w={40} r={6} style={{ animationDelay:`${0.08+i*0.05}s` }} />
              <div style={{ fontSize:11, color:'#BBB', fontWeight:600 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Menu items */}
      {Array.from({ length: isDriver ? 5 : 4 }).map((_, i) => (
        <div key={i} style={{ display:'flex', alignItems:'center', gap:14, padding:'15px 14px', background:'#fff', border:'1px solid #EDEDED', borderRadius:14, marginBottom:6 }}>
          <Sk h={32} w={32} circle style={{ animationDelay:`${0.04+i*0.04}s` }} />
          <Sk h={14} r={6} style={{ flex:1, animationDelay:`${0.06+i*0.04}s` }} />
          <Sk h={16} w={16} r={4} style={{ animationDelay:`${0.08+i*0.04}s` }} />
        </div>
      ))}

      {isDriver && (
        <>
          <Sk h={1} r={0} block style={{ margin:'16px 0', background:'#EDEDED' }} />
          {/* Vehicle info card */}
          <div style={{ background:'#F8F8F8', borderRadius:16, padding:16, display:'flex', flexDirection:'column', gap:10 }}>
            {['Vehicle','Plate number','Rating'].map((l, i) => (
              <div key={l} style={{ display:'flex', justifyContent:'space-between' }}>
                <span style={{ fontSize:12, color:'#BBB', fontWeight:600 }}>{l}</span>
                <Sk h={13} w={90} r={5} style={{ animationDelay:`${0.1+i*0.05}s` }} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/* ================================================================
   6. DRIVER EARNINGS SKELETON
================================================================ */
export function SkeletonEarnings() {
  return (
    <div className="jc-sk-slide" style={{ padding:'12px 14px 80px' }}>
      {/* Stats grid */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
        {['Today','All-time','Rides','Rating'].map((l, i) => (
          <div key={l} style={{ background:'#fff', borderRadius:18, padding:16, boxShadow:'0 4px 12px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize:11, color:'#BBB', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>{l}</div>
            <Sk h={24} w="65%" r={7} block style={{ animationDelay:`${i*0.06}s` }} />
            <Sk h={11} w="40%" r={5} block style={{ marginTop:6, animationDelay:`${0.05+i*0.06}s` }} />
          </div>
        ))}
      </div>
      {/* Recent rides header */}
      <Sk h={16} w={120} r={6} block style={{ marginBottom:12 }} />
      {/* Ride cards */}
      {[0, 0.08, 0.16].map(d => (
        <div key={d} style={{ background:'#fff', borderRadius:18, padding:16, boxShadow:'0 4px 12px rgba(0,0,0,0.06)', marginBottom:8 }}>
          <SkRow style={{ marginBottom:10 }}>
            <Sk h={11} w={110} r={6} style={{ animationDelay:`${d}s` }} />
            <div style={{ flex:1 }} />
            <Sk h={20} w={60} r={10} style={{ animationDelay:`${d+0.06}s` }} />
          </SkRow>
          <Sk h={14} r={6} block style={{ marginBottom:6, animationDelay:`${d+0.04}s` }} />
          <Sk h={12} w="70%" r={5} block style={{ marginBottom:12, animationDelay:`${d+0.08}s` }} />
          <SkRow>
            <Sk h={22} w={70} r={8} style={{ animationDelay:`${d+0.1}s` }} />
            <div style={{ flex:1 }} />
            <Sk h={20} w={40} r={8} style={{ animationDelay:`${d+0.12}s` }} />
          </SkRow>
        </div>
      ))}
    </div>
  )
}

/* ================================================================
   7. APP SKELETON — full-screen shell before auth resolves
   Looks like the real UI but with shimmer placeholders
================================================================ */
function _AppSkeletonOriginal({ isDriver = false }) {
  const brand = isDriver ? '#16A34A' : '#FF5F1F'
  const brand2 = isDriver ? '#22C55E' : '#FF8C00'

  return (
    <div style={{ position:'fixed', inset:0, background:'#fff', display:'flex', flexDirection:'column' }}>
      {/* Faux header */}
      <div style={{
        background:   `linear-gradient(135deg,${brand},${brand2})`,
        padding:      'calc(env(safe-area-inset-top,0px)+10px) 16px 14px',
        flexShrink:   0,
        display:      'flex', alignItems:'center', gap:12,
      }}>
        <div style={{ width:42, height:42, borderRadius:'50%', background:'rgba(255,255,255,0.25)' }} />
        <div style={{ flex:1, display:'flex', flexDirection:'column', gap:6 }}>
          <div style={{ height:14, width:100, borderRadius:6, background:'rgba(255,255,255,0.35)' }} />
          <div style={{ height:11, width:70, borderRadius:5, background:'rgba(255,255,255,0.22)' }} />
        </div>
        <div style={{ height:34, width:80, borderRadius:20, background:'rgba(255,255,255,0.25)' }} />
      </div>

      {/* Faux map area */}
      <div style={{ flex:1, position:'relative', overflow:'hidden', background:'#e8e4dc' }}>
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="jc-sk-shimmer" style={{
            position:    'absolute',
            width:       '34%', height:'34%',
            borderRadius: 4,
            top:          `${Math.floor(i/3)*33}%`,
            left:         `${(i%3)*33}%`,
            margin:       2,
            opacity:      0.7,
            animationDelay: `${(i*0.1).toFixed(1)}s`,
          }} />
        ))}
        {/* Search pill overlay */}
        <div style={{
          position:      'absolute',
          bottom:        'calc(50vh + 10px)',
          left:          14, right: 14,
          height:        50,
          borderRadius:  28,
          background:    'rgba(255,255,255,0.92)',
          boxShadow:     '0 4px 20px rgba(0,0,0,0.12)',
          display:       'flex', alignItems:'center',
          padding:       '0 18px', gap:12,
        }}>
          <div style={{ width:17, height:17, borderRadius:'50%', background:'#E0E0E0' }} />
          <div style={{ height:13, flex:1, borderRadius:6, background:'#E8E8E8' }} />
        </div>
      </div>

      {/* Bottom sheet skeleton */}
      <div style={{
        background:   '#fff',
        borderRadius: '22px 22px 0 0',
        boxShadow:    '0 -8px 32px rgba(0,0,0,0.10)',
        height:       '50vh',
        padding:      '8px 14px 0',
        flexShrink:   0,
      }}>
        <div style={{ width:38, height:4, background:'#E8E8E8', borderRadius:2, margin:'0 auto 16px' }} />
        {/* Location box skeleton */}
        <div style={{ background:'#F8F8F8', borderRadius:16, padding:1, marginBottom:12, overflow:'hidden' }}>
          {['Pickup','Drop'].map((l, i) => (
            <div key={l} style={{ padding:'14px 16px', display:'flex', alignItems:'center', gap:12, borderBottom: i===0 ? '1px solid #EDEDED' : 'none' }}>
              <div style={{ width:12, height:12, borderRadius:'50%', background: i===0 ? '#C8F0D8' : '#FFD8C0' }} />
              <div style={{ flex:1, display:'flex', flexDirection:'column', gap:5 }}>
                <div style={{ height:9, width:50, borderRadius:4, background:'#E0E0E0' }} />
                <div style={{ height:13, width:'70%', borderRadius:5, background:'#E8E8E8' }} />
              </div>
            </div>
          ))}
        </div>
        {/* Fare rows skeleton */}
        {[0, 0.06, 0.12].map(d => (
          <div key={d} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', background:'#fff', border:'1px solid #F0F0F0', borderRadius:12, marginBottom:6 }}>
            <div style={{ width:40, height:40, borderRadius:10, background:'#F0F0F0', flexShrink:0 }} />
            <div style={{ flex:1, display:'flex', flexDirection:'column', gap:6 }}>
              <div style={{ height:13, width:'55%', borderRadius:5, background:'#E8E8E8' }} />
              <div style={{ height:11, width:'35%', borderRadius:4, background:'#F0F0F0' }} />
            </div>
            <div style={{ height:20, width:50, borderRadius:8, background:'#E8E8E8' }} />
          </div>
        ))}
      </div>

      {/* Bottom nav skeleton */}
      <div style={{ height:`calc(56px + env(safe-area-inset-bottom,0px))`, background:'#fff', borderTop:'1px solid #EDEDED', display:'flex', alignItems:'center', flexShrink:0 }}>
        {[0,1,2,isDriver?3:null].filter(x=>x!==null).map(i => (
          <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:5, paddingTop:6 }}>
            <div style={{ width:22, height:22, borderRadius:6, background:'#E8E8E8' }} />
            <div style={{ width:28, height:8, borderRadius:4, background:'#F0F0F0' }} />
          </div>
        ))}
      </div>
    </div>
  )
}

/* ================================================================
   8. WALLET SKELETON (driver)
================================================================ */
export function SkeletonWallet() {
  return (
    <div className="jc-sk-slide" style={{ padding:'12px 14px 80px' }}>
      {/* Wallet card */}
      <div style={{ background:'linear-gradient(135deg,#E0E0E0,#D0D0D0)', borderRadius:20, padding:22, marginBottom:18 }}>
        <Sk h={11} w={90} r={5} block style={{ background:'rgba(255,255,255,0.3)', marginBottom:8 }} />
        <Sk h={42} w={140} r={10} block style={{ background:'rgba(255,255,255,0.35)' }} />
        <Sk h={36} w={130} r={12} block style={{ marginTop:14, background:'rgba(255,255,255,0.25)' }} />
      </div>
      {/* Commission info */}
      <div style={{ background:'#F8F8F8', borderRadius:16, padding:16, display:'flex', flexDirection:'column', gap:10 }}>
        {Array.from({length:6}).map((_,i) => (
          <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', paddingBottom:10, borderBottom:'1px solid #EDEDED' }}>
            <Sk h={12} w={120} r={5} style={{ animationDelay:`${i*0.05}s` }} />
            <Sk h={13} w={70} r={5} style={{ animationDelay:`${0.04+i*0.05}s` }} />
          </div>
        ))}
      </div>
    </div>
  )
}
