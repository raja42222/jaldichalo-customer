import React, { useEffect, useRef, useState } from 'react'
import { fmtRsSymbol as fmtRs, getSaving, driverBreakdown } from '../lib/fareEngine'
import { Sk, SkeletonFareRows } from './Skeleton'

/* ============================================================
   ETA + FARE PANEL  ·  Jaldi Chalo
   Three-phase progressive display:
     Phase 1 (< 5ms) : haversine instant fares
     Phase 2 (~300ms): real driver distance
     Phase 3 (~500ms): OSRM refined fares + driver arrival ETA
   ============================================================ */

/* Skel imported from Skeleton.jsx */
const Skel = ({ w = 60, h = 15, r = 6, style }) => <Sk w={w} h={h} r={r} style={style} />

/* -- Animated number: cross-fades when value changes -- */
function LiveNum({ value, suffix = '', loading, color }) {
  const [shown,  setShown]  = useState(value)
  const [fading, setFading] = useState(false)
  const prev = useRef(value)

  useEffect(() => {
    if (value === prev.current || loading) return
    setFading(true)
    const t = setTimeout(() => { setShown(value); prev.current = value; setFading(false) }, 160)
    return () => clearTimeout(t)
  }, [value, loading])

  if (loading) return <Skel w={48} h={20} />
  return (
    <span style={{
      transition: 'opacity 0.16s',
      opacity: fading ? 0.15 : 1,
      fontVariantNumeric: 'tabular-nums',
      color: color || 'inherit',
    }}>
      {shown}{suffix}
    </span>
  )
}

/* ============================================================
   MAIN COMPONENT
   ============================================================ */
const _ETAPanel = function ETAPanel({ eta, selectedId, onSelectVehicle, nearbyByType: nearbyByTypeProp, style }) {
  const nearbyByType = nearbyByTypeProp || eta?.nearbyByType || {}
  if (!eta) return null

  const { rideInfo, fareOptions, driverInfo, loadingRide, loadingDriver } = eta
  const noDriver  = driverInfo && driverInfo.available === false
  const hasDriver = driverInfo?.available === true

  return (
    <>
      <style>{`
        @keyframes jc-shimmer { from{background-position:200%} to{background-position:-200%} }
        @keyframes jc-in { from{opacity:0;transform:translateY(5px)} to{opacity:1;transform:translateY(0)} }
        @keyframes jc-pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
        .jc-in   { animation: jc-in 0.26s cubic-bezier(.16,1,.3,1) both }
        .jc-pulse{ animation: jc-pulse 2s ease infinite }
      `}</style>

      <div className="jc-in" style={{ display:'flex', flexDirection:'column', gap:8, ...style }}>

        {/* -- ROUTE SUMMARY BAR -- */}
        <div style={{ display:'flex', background:'#fff', border:'1px solid #EDEDED', borderRadius:14, overflow:'hidden', boxShadow:'0 1px 8px rgba(0,0,0,.06)' }}>
          {[
            { icon:'🛣️', label:'Distance', val: rideInfo?.distance_km?.toFixed(1), sfx:' km',  loading:loadingRide },
            { icon:'⏱️', label:'Ride time', val: rideInfo?.duration_min,            sfx:' min', loading:loadingRide },
          ].map((s, i) => (
            <div key={s.label} style={{ flex:1, padding:'11px 14px', borderRight: i===0 ? '1px solid #F3F3F3' : 'none' }}>
              <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:3 }}>
                <span style={{ fontSize:12 }}>{s.icon}</span>
                <span style={{ fontSize:10, fontWeight:700, color:'#999', textTransform:'uppercase', letterSpacing:'0.05em' }}>{s.label}</span>
              </div>
              <div style={{ fontSize:18, fontWeight:900, color:'#111', lineHeight:1.1 }}>
                <LiveNum value={s.val} suffix={s.sfx} loading={s.loading} />
              </div>
            </div>
          ))}
        </div>

        {/* -- DRIVER STATUS -- */}
        {loadingDriver && (
          <div style={{ display:'flex', alignItems:'center', gap:10, background:'#fff', border:'1px solid #EDEDED', borderRadius:12, padding:'10px 14px' }}>
            <div style={{ width:32, height:32, borderRadius:'50%', border:'2.5px solid #FF5F1F', borderTopColor:'transparent', flexShrink:0, animation:'jc-shimmer 0.75s linear infinite' }} />
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
              <Skel w={100} h={13} />
              <Skel w={72}  h={11} />
            </div>
          </div>
        )}

        {!loadingDriver && hasDriver && (
          <div style={{ display:'flex', alignItems:'center', gap:10, background:'#fff', border:'1px solid #EDEDED', borderRadius:12, padding:'10px 14px', boxShadow:'0 1px 6px rgba(0,0,0,.04)' }}>
            <div style={{ position:'relative', flexShrink:0 }}>
              <div style={{ width:34, height:34, borderRadius:'50%', background:'linear-gradient(135deg,#FF5F1F,#FF8C00)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:17 }}>
                {driverInfo.driver?.vehicle_type === 'auto'   ? '🛺' :
                 driverInfo.driver?.vehicle_type === 'cab'    ? '🚗' :
                 driverInfo.driver?.vehicle_type === 'cab-ac' ? '❄️' : '🏍️'}
              </div>
              <div className="jc-pulse" style={{ position:'absolute', bottom:0, right:0, width:9, height:9, borderRadius:'50%', background:'#22C55E', border:'1.5px solid #fff' }} />
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ fontSize:13, fontWeight:700, color:'#111' }}>Captain nearby</span>
                {driverInfo.isDemo && (
                  <span style={{ fontSize:10, background:'#FFF7ED', color:'#FF5F1F', padding:'1px 6px', borderRadius:6, fontWeight:700 }}>DEMO</span>
                )}
              </div>
              <div style={{ fontSize:12, color:'#777', marginTop:1 }}>
                <span style={{ color:'#FF5F1F', fontWeight:800 }}>
                  <LiveNum value={driverInfo.distanceKm?.toFixed(1)} suffix=" km" />
                </span>
                {' away · arriving in '}
                <span style={{ color:'#FF5F1F', fontWeight:800 }}>
                  <LiveNum value={driverInfo.etaMins} suffix=" min" />
                </span>
              </div>
            </div>
            <div style={{ textAlign:'right', flexShrink:0 }}>
              <div style={{ fontSize:11, color:'#22C55E', fontWeight:700 }}>AVAILABLE</div>
              <div style={{ fontSize:10, color:'#bbb', marginTop:1 }}>{driverInfo.source === 'osrm' ? '✦ Road' : '↝ Est.'}</div>
            </div>
          </div>
        )}

        {!loadingDriver && noDriver && (
          <div style={{ display:'flex', alignItems:'center', gap:10, background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:12, padding:'10px 14px' }}>
            <span style={{ fontSize:22, flexShrink:0 }}>😔</span>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:'#DC2626', marginBottom:2 }}>No captains nearby</div>
              <div style={{ fontSize:11, color:'#999' }}>No drivers within 10 km. Please try again shortly.</div>
            </div>
          </div>
        )}

        {/* -- VEHICLE + FARE SELECTOR (Rapido style) -- */}
        {fareOptions?.length > 0 && (
          <FareSelector
            fareOptions={fareOptions}
            selectedId={selectedId}
            onSelect={onSelectVehicle}
            driverInfo={driverInfo}
            nearbyByType={nearbyByType}
            loading={loadingRide}
          />
        )}

        {(!fareOptions || fareOptions.length === 0) && loadingRide && <SkeletonFareRows />}

        {/* Data source footnote */}
        {rideInfo?.source && !loadingRide && (
          <div style={{ display:'flex', alignItems:'center', gap:4, fontSize:10, color:'#bbb', fontWeight:600, paddingLeft:2 }}>
            <span>⚡</span>
            {rideInfo.source === 'osrm'    ? 'Real road distance via OSRM' :
             rideInfo.source === 'instant' ? 'Estimating road route…' : 'Estimated'}
          </div>
        )}
      </div>
    </>
  )
}

const ETAPanel = React.memo(_ETAPanel)
export default ETAPanel

/* -- Fare selector rows -- */
function FareSelector({ fareOptions, selectedId, onSelect, driverInfo, nearbyByType, loading }) {
  // Per-vehicle arrival ETA from nearbyByType (each vehicle type has its own nearest driver)
  function getVehicleEta(vehicleId) {
    if (nearbyByType && nearbyByType[vehicleId]) {
      const d = nearbyByType[vehicleId]
      const etaMins = d.etaMins || Math.ceil((d.distKm || 2) / 0.4)
      return etaMins
    }
    if (driverInfo?.available && driverInfo.etaMins) {
      const offsets = { bike:0, auto:1, cab:2, 'cab-ac':3 }
      return driverInfo.etaMins + (offsets[vehicleId] || 0)
    }
    return null
  }
  const maxSaving = Math.max(...fareOptions.map(f => getSaving(f)))

  return (
    <div>
      {maxSaving > 0 && (
        <div style={{ background:'#ECFDF5', borderRadius:10, padding:'7px 12px', marginBottom:8, fontSize:12, color:'#16A34A', fontWeight:700, display:'flex', alignItems:'center', gap:6 }}>
          🎉 Save up to {fmtRs(maxSaving)} with Jaldi Chalo pricing!
        </div>
      )}

      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
        {fareOptions.map(f => {
          const isSelected = selectedId === f.vehicleId
          const saving     = getSaving(f)
          const arrivalEta = getVehicleEta(f.vehicleId)

          return (
            <div
              key={f.vehicleId}
              onClick={() => onSelect && onSelect(f.vehicleId)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                background:  isSelected ? '#FFF4EE' : '#fff',
                border:      `2px solid ${isSelected ? '#FF5F1F' : '#EDEDED'}`,
                borderRadius: 13, cursor: 'pointer', transition: 'all 0.15s',
                boxShadow:   isSelected ? '0 2px 12px rgba(255,95,31,.15)' : 'none',
              }}
            >
              <div style={{ fontSize:26, width:40, textAlign:'center', flexShrink:0 }}>{f.emoji}</div>

              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:5, flexWrap:'wrap' }}>
                  <span style={{ fontSize:14, fontWeight:700, color:'#111' }}>{f.vehicleName}</span>
                  <span style={{ fontSize:11, color:'#bbb' }}>👤{f.seats}</span>
                  {arrivalEta !== null && (
                    <span style={{ fontSize:11, background:'#ECFDF5', color:'#16A34A', padding:'1px 7px', borderRadius:6, fontWeight:700 }}>
                      {arrivalEta} min
                    </span>
                  )}
                  {/* Driver availability badge per vehicle type */}
                  {nearbyByType?.[f.vehicleId] ? (
                    <span style={{ fontSize:10, background:'#F0FDF4', color:'#16A34A', padding:'2px 7px', borderRadius:6, fontWeight:700, display:'flex', alignItems:'center', gap:3 }}>
                      <span style={{ width:5, height:5, borderRadius:'50%', background:'#22C55E', display:'inline-block', animation:'pulse 1.5s ease infinite' }} />
                      {nearbyByType[f.vehicleId].isDemo
                        ? `${nearbyByType[f.vehicleId].distKm?.toFixed(1) || '?'} km`
                        : `${nearbyByType[f.vehicleId].distKm?.toFixed(1) || '?'} km`}
                    </span>
                  ) : (
                    <span style={{ fontSize:10, background:'#FEF2F2', color:'#EF4444', padding:'2px 7px', borderRadius:6, fontWeight:700 }}>
                      No driver
                    </span>
                  )}
                  {f.baseFareApplied && (
                    <span style={{ fontSize:10, background:'#FFF7ED', color:'#FF5F1F', padding:'1px 6px', borderRadius:6, fontWeight:700 }}>
                      Min fare
                    </span>
                  )}
                  {f.timeChargeApplied && (
                    <span style={{ fontSize:10, background:'#F3F4F6', color:'#6B7280', padding:'1px 6px', borderRadius:6, fontWeight:600 }}>
                      Long ride
                    </span>
                  )}
                </div>
                <div style={{ fontSize:12, color:'#999', marginTop:2 }}>
                  {f.distanceKm.toFixed(1)} km · {f.durationMins} min
                </div>
              </div>

              <div style={{ textAlign:'right', flexShrink:0 }}>
                <div style={{ fontSize: isSelected ? 19 : 17, fontWeight:900, color: isSelected ? '#FF5F1F' : '#111', lineHeight:1.1 }}>
                  <LiveNum value={fmtRs(f.totalFare)} loading={loading} />
                </div>
                {saving > 0 && (
                  <div style={{ fontSize:11, color:'#bbb', textDecoration:'line-through', lineHeight:1.2 }}>
                    {fmtRs(f.mrp)}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* -- Driver earnings card (used in DriverApp active ride view) -- */
export function DriverFareCard({ fare, payMethod, style }) {
  if (!fare) return null
  const lines = driverBreakdown(fare, payMethod)

  return (
    <div style={{ background:'#fff', border:'1px solid #EDEDED', borderRadius:14, padding:'14px 16px', boxShadow:'0 1px 8px rgba(0,0,0,.06)', ...style }}>
      {lines.map((l, i) => (
        <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 0', borderBottom: i < lines.length - 1 ? '1px solid #F5F5F5' : 'none' }}>
          <span style={{ fontSize: l.small ? 11 : 13, color: l.small ? '#bbb' : '#666', fontStyle: l.small ? 'italic' : 'normal' }}>
            {l.label}
          </span>
          <span style={{ fontSize: l.highlight ? 17 : 13, fontWeight: l.highlight ? 900 : 600, color: l.highlight ? '#FF5F1F' : '#111' }}>
            {l.value}
          </span>
        </div>
      ))}
    </div>
  )
}
