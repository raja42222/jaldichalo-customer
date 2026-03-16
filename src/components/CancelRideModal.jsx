import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { RIDE_STATUS } from '../lib/etaService'
import { fmtRsSymbol as fmtRs } from '../lib/fareEngine'

/* Penalty amounts per vehicle type */
const PENALTY = { bike: 20, auto: 15, cab: 40, 'cab-ac': 40 }

/* Cancellation reasons */
const PASSENGER_REASONS = [
  { id: 'wait_too_long',   label: 'Captain is taking too long',    emoji: '⏳' },
  { id: 'wrong_vehicle',   label: 'Wrong vehicle type shown',      emoji: '🚗' },
  { id: 'change_plans',    label: 'My plans changed',              emoji: '📋' },
  { id: 'booked_mistake',  label: 'Booked by mistake',             emoji: '😅' },
  { id: 'fare_issue',      label: 'Fare is too high',              emoji: '💰' },
  { id: 'other',           label: 'Other reason',                  emoji: '📝' },
]

const DRIVER_REASONS = [
  { id: 'passenger_unreachable', label: 'Passenger not reachable',   emoji: '📵' },
  { id: 'wrong_location',        label: 'Wrong pickup location',      emoji: '📍' },
  { id: 'vehicle_issue',         label: 'Vehicle problem',            emoji: '🔧' },
  { id: 'passenger_no_show',     label: 'Passenger did not show up',  emoji: '🚶' },
  { id: 'unsafe_area',           label: 'Unsafe pickup area',         emoji: '⚠️' },
  { id: 'other',                 label: 'Other reason',               emoji: '📝' },
]

/* ================================================================
   CANCEL RIDE MODAL
   role = 'passenger' | 'driver'
   ride = ride object from DB
================================================================ */
export default function CancelRideModal({ ride, role, userId, onCancelled, onClose }) {
  const [reason,   setReason]  = useState('')
  const [step,     setStep]    = useState('reason')   // reason | confirm | done
  const [loading,  setLoading] = useState(false)
  const [error,    setError]   = useState('')

  if (!ride) return null

  // Determine if penalty applies
  const driverAccepted = ['driver_assigned','accepted','driver_arrived','arrived',
    RIDE_STATUS.ASSIGNED, RIDE_STATUS.ARRIVED].includes(ride.ride_status)
  const penaltyAmt = (role === 'passenger' && driverAccepted)
    ? (PENALTY[ride.vehicle_type] || 20)
    : 0

  const reasons = role === 'passenger' ? PASSENGER_REASONS : DRIVER_REASONS

  async function doCancel() {
    if (!reason) { setError('Please select a reason'); return }
    setLoading(true); setError('')
    try {
      const { data, error: rpcErr } = await supabase.rpc('cancel_ride', {
        p_ride_id:    ride.id,
        p_actor_id:   userId,
        p_actor_role: role,
        p_reason:     reason,
      })
      if (rpcErr) throw rpcErr
      if (!data?.success) throw new Error(data?.error || 'Cancel failed')
      setStep('done')
      setTimeout(() => onCancelled(data), 400)
    } catch (e) {
      setError(e.message || 'Could not cancel. Please try again.')
      setLoading(false)
    }
  }

  const overlay = {
    position: 'fixed', inset: 0, zIndex: 200,
    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)',
    display: 'flex', alignItems: 'flex-end',
  }
  const sheet = {
    width: '100%', background: '#fff',
    borderRadius: '24px 24px 0 0',
    padding: '10px 20px calc(32px + env(safe-area-inset-bottom,0px))',
    maxHeight: '88vh', overflowY: 'auto',
    animation: 'slideUp 0.3s cubic-bezier(0.16,1,0.3,1)',
  }

  /* -- DONE screen -- */
  if (step === 'done') return (
    <div style={overlay}>
      <div style={sheet}>
        <div style={{ textAlign: 'center', padding: '28px 0' }}>
          <div style={{ fontSize: 52, marginBottom: 12 }}>✅</div>
          <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 6 }}>Ride Cancelled</div>
          <div style={{ fontSize: 14, color: '#888' }}>
            {penaltyAmt > 0 ? `A cancellation fee of ${fmtRs(penaltyAmt)} has been applied.` : 'No charges applied.'}
          </div>
        </div>
      </div>
    </div>
  )

  /* -- CONFIRM screen -- */
  if (step === 'confirm') return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={sheet}>
        <div style={{ width: 38, height: 4, background: '#E0E0E0', borderRadius: 2, margin: '0 auto 20px' }} />

        {/* Penalty warning */}
        {penaltyAmt > 0 && (
          <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 16, padding: '16px', marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 28, flexShrink: 0 }}>💸</span>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16, color: '#DC2626', marginBottom: 4 }}>
                  Cancellation Fee: {fmtRs(penaltyAmt)}
                </div>
                <div style={{ fontSize: 13, color: '#666', lineHeight: 1.6 }}>
                  Since the captain already accepted your ride, a cancellation fee applies.
                  This amount will be deducted from your next payment.
                </div>
                <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {[{ v:'Bike', a: 20 }, { v:'Auto', a: 15 }, { v:'Cab', a: 40 }].map(t => (
                    <div key={t.v} style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', background: ride.vehicle_type?.includes(t.v.toLowerCase()) ? '#DC2626' : '#F5F5F5', color: ride.vehicle_type?.includes(t.v.toLowerCase()) ? '#fff' : '#888', borderRadius: 20 }}>
                      {t.v}: {fmtRs(t.a)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {penaltyAmt === 0 && (
          <div style={{ background: '#ECFDF5', border: '1.5px solid #BBF7D0', borderRadius: 16, padding: '14px 16px', marginBottom: 20, display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 22 }}>✅</span>
            <div style={{ fontSize: 14, color: '#16A34A', fontWeight: 600 }}>Free cancellation — no charge will be applied.</div>
          </div>
        )}

        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8, color: '#555' }}>Reason</div>
        <div style={{ background: '#F8F8F8', borderRadius: 12, padding: '10px 14px', marginBottom: 20, fontSize: 14, color: '#333' }}>
          {reasons.find(r => r.id === reason)?.label || reason}
        </div>

        {error && <div style={{ color: '#DC2626', fontSize: 13, marginBottom: 14, padding: '10px 14px', background: '#FEF2F2', borderRadius: 10 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => { setStep('reason'); setError('') }}
            style={{ flex: 1, padding: '14px', borderRadius: 14, border: '1.5px solid #E0E0E0', background: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', color: '#555' }}>
            Go Back
          </button>
          <button onClick={doCancel} disabled={loading}
            style={{ flex: 2, padding: '14px', borderRadius: 14, border: 'none', background: loading ? '#E0E0E0' : '#DC2626', color: loading ? '#999' : '#fff', fontWeight: 800, fontSize: 15, cursor: loading ? 'default' : 'pointer', fontFamily: 'inherit' }}>
            {loading ? 'Cancelling...' : penaltyAmt > 0 ? `Cancel & Pay ${fmtRs(penaltyAmt)}` : 'Yes, Cancel Ride'}
          </button>
        </div>
      </div>
    </div>
  )

  /* -- REASON screen (default) -- */
  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={sheet}>
        <div style={{ width: 38, height: 4, background: '#E0E0E0', borderRadius: 2, margin: '0 auto 18px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>Why are you cancelling?</div>
          <button onClick={onClose}
            style={{ background: '#F5F5F5', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            ×
          </button>
        </div>

        {/* Free vs penalty indicator */}
        {role === 'passenger' && (
          <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 12, background: penaltyAmt > 0 ? '#FFF7ED' : '#ECFDF5', border: `1px solid ${penaltyAmt > 0 ? '#FED7AA' : '#BBF7D0'}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: penaltyAmt > 0 ? '#92400E' : '#16A34A' }}>
              {penaltyAmt > 0
                ? `⚠️ Late cancellation — ${fmtRs(penaltyAmt)} fee applies`
                : '✅ Free cancellation — captain not yet assigned'}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {reasons.map(r => (
            <div key={r.id} onClick={() => setReason(r.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px', borderRadius: 14, border: `2px solid ${reason === r.id ? '#DC2626' : '#EDEDED'}`, background: reason === r.id ? '#FEF2F2' : '#fff', cursor: 'pointer', transition: 'all 0.15s' }}>
              <span style={{ fontSize: 22, flexShrink: 0 }}>{r.emoji}</span>
              <span style={{ fontWeight: reason === r.id ? 700 : 500, fontSize: 14, color: reason === r.id ? '#DC2626' : '#333' }}>
                {r.label}
              </span>
              {reason === r.id && (
                <div style={{ marginLeft: 'auto', width: 20, height: 20, borderRadius: '50%', background: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
              )}
            </div>
          ))}
        </div>

        {error && <div style={{ color: '#DC2626', fontSize: 13, marginBottom: 12, padding: '10px 14px', background: '#FEF2F2', borderRadius: 10 }}>{error}</div>}

        <button
          onClick={() => { if (!reason) { setError('Please select a reason'); return } setError(''); setStep('confirm') }}
          style={{ width: '100%', padding: '15px', borderRadius: 16, border: 'none', background: reason ? '#DC2626' : '#E0E0E0', color: reason ? '#fff' : '#999', fontWeight: 800, fontSize: 16, cursor: reason ? 'pointer' : 'default', fontFamily: 'inherit', transition: 'all 0.15s' }}>
          Continue →
        </button>
      </div>
    </div>
  )
}
