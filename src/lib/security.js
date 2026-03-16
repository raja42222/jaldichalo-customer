/* ===============================================================
   JALDI CHALO - Security & Anti-Fraud Module
   ---------------------------------------------------------------
   Rapido-style security:

   1. LOGIN SECURITY
      - Real OTP via Supabase (WhatsApp/SMS/Google)
      - Demo mode only when VITE_DEMO_MODE=true (dev only)
      - Client-side rate limit: 3 attempts per 5 minutes
      - Device fingerprint stored to detect account sharing

   2. RIDE OTP SECURITY (Rapido exact flow)
      - 4-digit OTP generated SERVER-SIDE (never client)
      - Hashed with SHA-256 before storage (plain text never stored)
      - Max 5 wrong attempts → ride cancelled automatically
      - OTP expires 30 minutes after ride acceptance
      - Customer SHOWS OTP → Driver TYPES it (not the other way)

   3. RIDE STATE MACHINE
      Allowed transitions only:
      searching → accepted → arrived → started → completed
      Any other transition is rejected server-side

   4. ANTI-FRAUD CHECKS
      - Driver must be within 500m of pickup to start ride
      - GPS timestamp must be within last 15 seconds
      - Duplicate booking prevention (same passenger, same route, 5min window)
      - Driver cannot complete ride without OTP verification

   5. SESSION SECURITY
      - Supabase JWT (1 hour) + refresh token (7 days)
      - Explicit logout clears all local data
      - One active session per phone number
   =============================================================== */

/* --- Rate limiter (client-side, prevents brute force) --------- */
const rateLimitMap = new Map()

export function checkRateLimit(key, maxAttempts = 3, windowMs = 5 * 60 * 1000) {
  const now     = Date.now()
  const entry   = rateLimitMap.get(key) || { count: 0, firstAt: now }

  if (now - entry.firstAt > windowMs) {
    rateLimitMap.set(key, { count: 1, firstAt: now })
    return { allowed: true, remaining: maxAttempts - 1 }
  }

  if (entry.count >= maxAttempts) {
    const retryAfter = Math.ceil((entry.firstAt + windowMs - now) / 1000)
    return { allowed: false, retryAfterSec: retryAfter }
  }

  entry.count++
  rateLimitMap.set(key, entry)
  return { allowed: true, remaining: maxAttempts - entry.count }
}

export function resetRateLimit(key) {
  rateLimitMap.delete(key)
}

/* --- Device fingerprint (lightweight, privacy-preserving) ----- */
export function getDeviceFingerprint() {
  try {
    const key = 'jc_device_id'
    let id = localStorage.getItem(key)
    if (!id) {
      id = Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map(b => b.toString(16).padStart(2, '0')).join('')
      localStorage.setItem(key, id)
    }
    return id
  } catch { return 'unknown' }
}

/* --- Demo mode check ------------------------------------------ */
export const IS_DEMO = import.meta.env.VITE_DEMO_MODE === 'true'

/* --- OTP validation helpers ----------------------------------- */
export function isValidOTPFormat(otp) {
  return /^\d{6}$/.test(otp)
}

export function isValidRideOTPFormat(otp) {
  return /^\d{4}$/.test(otp)
}

/* --- GPS validation (anti-spoofing) --------------------------- */
export function isGPSFresh(timestampIso, maxAgeMs = 15000) {
  if (!timestampIso) return false
  return Date.now() - new Date(timestampIso).getTime() < maxAgeMs
}

export function isDriverNearPickup(driverLat, driverLng, pickupLat, pickupLng, maxMeters = 500) {
  const R   = 6371000
  const dLat = (pickupLat - driverLat) * Math.PI / 180
  const dLng = (pickupLng - driverLng) * Math.PI / 180
  const a   = Math.sin(dLat/2)**2 + Math.cos(driverLat*Math.PI/180) * Math.cos(pickupLat*Math.PI/180) * Math.sin(dLng/2)**2
  const distM = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  return { isNear: distM <= maxMeters, distanceM: Math.round(distM) }
}

/* --- Ride state machine --------------------------------------- */
const VALID_TRANSITIONS = {
  searching:    ['accepted', 'cancelled'],
  accepted:     ['arrived',  'cancelled'],
  arrived:      ['otp_verified', 'cancelled'],
  otp_verified: ['started',  'cancelled'],
  started:      ['completed', 'cancelled'],
  completed:    [],
  cancelled:    [],
}

export function isValidRideTransition(fromStatus, toStatus) {
  return VALID_TRANSITIONS[fromStatus]?.includes(toStatus) ?? false
}

/* --- Anti-duplicate booking ----------------------------------- */
const recentBookings = new Map()

export function isDuplicateBooking(passengerId, pickupLat, pickupLng, dropLat, dropLng, windowMs = 5 * 60 * 1000) {
  const key = `${passengerId}_${pickupLat.toFixed(3)}_${pickupLng.toFixed(3)}_${dropLat.toFixed(3)}_${dropLng.toFixed(3)}`
  const last = recentBookings.get(key)
  if (last && Date.now() - last < windowMs) return true
  recentBookings.set(key, Date.now())
  return false
}

/* --- Input sanitization --------------------------------------- */
export function sanitizePhone(input) {
  return input.replace(/\D/g, '').slice(0, 10)
}

export function sanitizeName(input) {
  return input.replace(/[^a-zA-Z\u0900-\u097F\s.'-]/g, '').slice(0, 60).trim()
}

export function sanitizeAddress(input) {
  return input.replace(/[<>]/g, '').slice(0, 200).trim()
}
