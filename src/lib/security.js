/* ================================================================
   SECURITY MODULE — Jaldi Chalo v3.0
   
   1. Rate limiting — OTP/booking attempts
   2. Anti-duplicate booking 
   3. Device fingerprint
   4. Input sanitization
   5. Session integrity checks
   6. Ride state machine validation
================================================================ */

/* -- Rate Limiting ------------------------------------------ */
const _limits = new Map()

export function checkRateLimit(key, maxAttempts = 3, windowMs = 5 * 60 * 1000) {
  const now = Date.now()
  const entry = _limits.get(key) || { count: 0, windowStart: now }
  if (now - entry.windowStart > windowMs) {
    _limits.set(key, { count: 1, windowStart: now }); return true
  }
  if (entry.count >= maxAttempts) return false
  _limits.set(key, { ...entry, count: entry.count + 1 }); return true
}

export function resetRateLimit(key) { _limits.delete(key) }

export function getRemainingAttempts(key, maxAttempts = 3, windowMs = 5 * 60 * 1000) {
  const entry = _limits.get(key)
  if (!entry || Date.now() - entry.windowStart > windowMs) return maxAttempts
  return Math.max(0, maxAttempts - entry.count)
}

/* -- Anti-duplicate Booking --------------------------------- */
const _recentBookings = new Map()

export function isDuplicateBooking(userId, pickLat, pickLng, dropLat, dropLng, windowMs = 5 * 60 * 1000) {
  const key   = userId
  const entry = _recentBookings.get(key)
  const now   = Date.now()
  if (!entry || now - entry.ts > windowMs) return false
  const samePick = Math.abs(entry.pickLat - pickLat) < 0.001 && Math.abs(entry.pickLng - pickLng) < 0.001
  const sameDrop = Math.abs(entry.dropLat - dropLat) < 0.001 && Math.abs(entry.dropLng - dropLng) < 0.001
  return samePick && sameDrop
}

export function recordBooking(userId, pickLat, pickLng, dropLat, dropLng) {
  _recentBookings.set(userId, { pickLat, pickLng, dropLat, dropLng, ts: Date.now() })
}

/* -- Device Fingerprint ------------------------------------- */
export function getDeviceFingerprint() {
  try {
    const nav = window.navigator
    const raw = [
      nav.userAgent,
      nav.language,
      screen.width + 'x' + screen.height + 'x' + screen.colorDepth,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      nav.hardwareConcurrency || '',
      nav.platform || '',
    ].join('|')
    // Simple hash
    let hash = 0
    for (let i = 0; i < raw.length; i++) {
      hash = ((hash << 5) - hash) + raw.charCodeAt(i)
      hash |= 0
    }
    return Math.abs(hash).toString(36)
  } catch { return 'unknown' }
}

/* -- Input Sanitization ------------------------------------- */
export function sanitizeText(str, maxLen = 100) {
  if (typeof str !== 'string') return ''
  return str
    .trim()
    .replace(/[<>'"&]/g, '')   // strip basic XSS chars
    .replace(/\s+/g, ' ')       // collapse whitespace
    .slice(0, maxLen)
}

export function sanitizePhone(str) {
  return (str || '').replace(/\D/g, '').slice(-10)
}

export function isValidIndianPhone(phone) {
  const cleaned = sanitizePhone(phone)
  return cleaned.length === 10 && /^[6-9]/.test(cleaned)
}

export function isValidLicenseNo(str) {
  const c = (str || '').replace(/[\s\-\/]/g, '').toUpperCase()
  return c.length >= 9 && /^[A-Z]{2}/.test(c)
}

export function isValidVehicleNo(str) {
  const c = (str || '').replace(/[\s\-]/g, '').toUpperCase()
  return c.length >= 6 && /^[A-Z]{2}/.test(c)
}

/* -- Ride State Machine ------------------------------------- */
// Valid transitions: from → [allowed next states]
const RIDE_TRANSITIONS = {
  'searching_driver':  ['driver_assigned', 'cancelled', 'no_driver_found'],
  'searching':         ['driver_assigned', 'cancelled', 'no_driver_found'],
  'driver_assigned':   ['driver_arrived',  'cancelled'],
  'driver_arrived':    ['otp_verified',    'cancelled'],
  'otp_verified':      ['ride_started',    'cancelled'],
  'ride_started':      ['ride_completed',  'cancelled'],
  'ride_completed':    [],
  'cancelled':         [],
  'no_driver_found':   [],
}

export function isValidRideTransition(from, to) {
  const allowed = RIDE_TRANSITIONS[from] || []
  // Map shorthand to full status names
  const toFull = {
    'assigned':  'driver_assigned',
    'arrived':   'driver_arrived',
    'verified':  'otp_verified',
    'started':   'ride_started',
    'completed': 'ride_completed',
  }[to] || to
  return allowed.includes(toFull)
}

/* -- GPS Proximity Check ------------------------------------ */
// Verify driver is actually near pickup before OTP
export function isDriverNearPickup(driverLat, driverLng, pickupLat, pickupLng, thresholdKm = 0.5) {
  const R = 6371
  const dLat = (pickupLat - driverLat) * Math.PI / 180
  const dLng = (pickupLng - driverLng) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 +
    Math.cos(driverLat * Math.PI/180) * Math.cos(pickupLat * Math.PI/180) * Math.sin(dLng/2)**2
  const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  return dist <= thresholdKm
}

/* -- Session Integrity -------------------------------------- */
export function validateSession(profile, requiredRole) {
  if (!profile) return { valid: false, reason: 'No profile' }
  if (!profile.id) return { valid: false, reason: 'No user ID' }
  if (requiredRole === 'driver') {
    if (profile.status?.toLowerCase() !== 'approved')
      return { valid: false, reason: 'Driver not approved' }
  }
  return { valid: true }
}

/* -- Demo Mode ---------------------------------------------- */
export const IS_DEMO = import.meta.env.VITE_DEMO_MODE === 'true'
