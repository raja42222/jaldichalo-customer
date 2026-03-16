import { supabase } from './supabase'
import { reverseGeocode } from './geo'

// --- SOS --------------------------------------------------------
export async function triggerSOS({ rideId, userId, role, lat, lng }) {
  try {
    const address = lat ? await reverseGeocode(lat, lng) : null

    // 1. Log SOS event
    await supabase.from('sos_events').insert({
      ride_id: rideId, triggered_by: userId, triggered_role: role,
      lat, lng
    })

    // 2. Create safety report
    await supabase.from('safety_reports').insert({
      ride_id: rideId, reporter_id: userId, reporter_role: role,
      report_type: 'sos_triggered',
      description: `SOS triggered at ${address || `${lat},${lng}`}`,
      location_lat: lat, location_lng: lng
    })

    // 3. Create safety alert for realtime push
    await supabase.from('safety_alerts').insert({
      ride_id: rideId, alert_type: 'sos',
      details: { userId, role, lat, lng, address, time: new Date().toISOString() }
    })

    return { success: true, address }
  } catch (e) {
    console.error('SOS error:', e)
    return { success: false, error: e.message }
  }
}

// --- SAFETY REPORT -----------------------------------------------
export const REPORT_TYPES = [
  { id: 'unsafe_driving',      label: 'Unsafe Driving',       emoji: '🚗' },
  { id: 'wrong_route',         label: 'Wrong Route',           emoji: '🗺️' },
  { id: 'harassment',          label: 'Harassment',            emoji: '⚠️' },
  { id: 'suspicious_behavior', label: 'Suspicious Behaviour',  emoji: '👁️' },
  { id: 'overcharging',        label: 'Overcharging',          emoji: '💰' },
  { id: 'other',               label: 'Other',                 emoji: '📝' },
]

export async function submitSafetyReport({ rideId, reporterId, reporterRole, reportType, description, lat, lng }) {
  const { data, error } = await supabase.from('safety_reports').insert({
    ride_id: rideId, reporter_id: reporterId, reporter_role: reporterRole,
    report_type: reportType, description,
    location_lat: lat, location_lng: lng
  }).select().single()
  return { data, error }
}

// --- ROUTE DEVIATION ALERT ---------------------------------------
export async function triggerRouteDeviationAlert(rideId, lat, lng) {
  await supabase.from('safety_alerts').insert({
    ride_id: rideId, alert_type: 'route_deviation',
    details: { lat, lng, time: new Date().toISOString() }
  })
}

// --- LONG STOP ALERT ---------------------------------------------
export async function triggerLongStopAlert(rideId, lat, lng, stoppedMins) {
  await supabase.from('safety_alerts').insert({
    ride_id: rideId, alert_type: 'long_stop',
    details: { lat, lng, stopped_mins: stoppedMins, time: new Date().toISOString() }
  })
}

// --- RIDE SHARE LINK ---------------------------------------------
export function buildShareLink(shareToken) {
  return `${window.location.origin}/track/${shareToken}`
}

export async function generateShareToken(rideId) {
  const { data } = await supabase.rpc('generate_share_token', { ride_uuid: rideId })
  return data
}

// --- EMERGENCY CONTACTS -----------------------------------------
export async function getEmergencyContacts(userId) {
  const { data } = await supabase.from('emergency_contacts')
    .select('*').eq('user_id', userId).order('created_at')
  return data || []
}

export async function saveEmergencyContact({ userId, role, name, phone, relation }) {
  // Use SECURITY DEFINER RPC to bypass RLS
  const { data, error } = await supabase.rpc('save_emergency_contact', {
    p_user_id: userId, p_role: role, p_name: name, p_phone: phone, p_relation: relation
  })
  if (error) {
    // Fallback: direct insert (works if RLS policy allows)
    const { data: d2, error: e2 } = await supabase.from('emergency_contacts').insert({
      user_id: userId, role, name, phone, relation
    }).select().single()
    return { data: d2, error: e2 }
  }
  return { data: data?.[0] || data, error: null }
}

export async function deleteEmergencyContact(id, userId) {
  // Try RPC first
  const { error } = await supabase.rpc('delete_emergency_contact', { p_id: id, p_user_id: userId })
  if (error) {
    return supabase.from('emergency_contacts').delete().eq('id', id)
  }
  return { error: null }
}
