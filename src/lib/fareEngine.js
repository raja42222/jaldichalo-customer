/* ===============================================================
   JALDI CHALO - FARE ENGINE v2.0
   - Commission: flat 10% of total fare
   - UPI gateway fee: 0.10% of total fare (not flat)
   - Cash: driver collects full cash, owes commission to platform
   - UPI: platform collects, pays driver after deducting commission
   =============================================================== */

export const PRICING = Object.freeze({
  vehicles: {
    bike: {
      id:             'bike',
      name:           'Bike',
      emoji:          '🏍️',
      desc:           'Quick and affordable',
      seats:          1,
      perKmRate:      8,
      baseFare:       20,
      timeRatePerMin: 1,
    },
    auto: {
      id:             'auto',
      name:           'Auto',
      emoji:          '🛺',
      desc:           'Comfortable 3-seater',
      seats:          3,
      perKmRate:      12,
      baseFare:       35,
      timeRatePerMin: 1,
    },
    cab: {
      id:             'cab',
      name:           'Cab Non-AC',
      emoji:          '🚗',
      desc:           'Affordable sedan',
      seats:          4,
      perKmRate:      15,
      baseFare:       40,
      timeRatePerMin: 1,
    },
    'cab-ac': {
      id:             'cab-ac',
      name:           'Cab AC',
      emoji:          '❄️',
      desc:           'Air-conditioned comfort',
      seats:          4,
      perKmRate:      17,
      baseFare:       50,
      timeRatePerMin: 1.5,
    },
  },

  platform: {
    commissionPct:      0.10,    // 10% flat commission
    upiGatewayPct:      0.001,   // 0.10% UPI gateway fee
    minWalletBalance:   50,
  },

  rules: {
    timePricingThreshKm: 15,
    maxRideKm:           100,
  },

  surge: {
    multiplier: 1.0,
    label:      null,
  },
})

/* ===============================================================
   CORE FARE CALCULATOR
   =============================================================== */
export function calculateFare(vehicleId, distanceKm, durationMins, overrides = {}) {
  const cfg = PRICING.vehicles[vehicleId]
  if (!cfg) throw new Error(`Unknown vehicleId: "${vehicleId}"`)

  const dist = Math.max(0, distanceKm   || 0)
  const dur  = Math.max(0, durationMins || 0)

  const distanceFare       = +(dist * cfg.perKmRate).toFixed(2)
  const timeChargeApplied  = dist > PRICING.rules.timePricingThreshKm
  const timeChargeInternal = timeChargeApplied ? +(dur * cfg.timeRatePerMin).toFixed(2) : 0

  const surgeMultiplier = overrides.surgeMultiplier ?? PRICING.surge.multiplier
  const surgeLabel      = surgeMultiplier > 1 ? `${surgeMultiplier}x Surge` : null
  const afterSurge      = (distanceFare + timeChargeInternal) * surgeMultiplier

  const promoDiscount = Math.max(0, overrides.promoDiscount ?? 0)
  const afterPromo    = Math.max(0, afterSurge - promoDiscount)

  const baseFareApplied = afterPromo < cfg.baseFare
  const totalFare       = Math.ceil(baseFareApplied ? cfg.baseFare : afterPromo)
  const mrp             = Math.ceil(afterSurge < cfg.baseFare ? cfg.baseFare : afterSurge)

  // Commission split: 10% flat
  const platformCommission = +(totalFare * PRICING.platform.commissionPct).toFixed(2)
  const driverEarnings     = +(totalFare - platformCommission).toFixed(2)

  // UPI gateway: 0.10% (charged by payment processor, deducted from platform revenue)
  const upiGatewayFee      = +(totalFare * PRICING.platform.upiGatewayPct).toFixed(2)
  const platformNetRevenue = +(platformCommission - upiGatewayFee).toFixed(2)

  return {
    vehicleId, vehicleName:cfg.name, emoji:cfg.emoji, desc:cfg.desc, seats:cfg.seats,
    distanceKm:  +dist.toFixed(2),
    durationMins: Math.ceil(dur),
    distanceFare,
    timeChargeInternal,
    timeChargeApplied,
    baseFareApplied,
    promoDiscount,
    surgeMultiplier,
    surgeLabel,
    totalFare,
    mrp,
    platformCommission,
    driverEarnings,
    upiGatewayFee,
    platformNetRevenue,
    // DB columns
    distance_charge:      distanceFare,
    time_charge_internal: timeChargeInternal,
    base_fare_applied:    baseFareApplied,
    platform_commission:  platformCommission,
    driver_earnings:      driverEarnings,
  }
}

export function getAllFareOptions(distanceKm, durationMins, overrides = {}) {
  return Object.keys(PRICING.vehicles).map(id => calculateFare(id, distanceKm, durationMins, overrides))
}

export function instantFareEstimate(straightLineKm) {
  const roadKm  = +(Math.max(0.5, straightLineKm) * 1.3).toFixed(2)
  const durMins = Math.max(2, Math.round((roadKm / 22) * 60))
  return getAllFareOptions(roadKm, durMins)
}

/* ===============================================================
   COMMISSION BREAKDOWN (wallet logic)
   =============================================================== */
export function getCommissionBreakdown(totalFare, paymentMethod) {
  const commission    = +(totalFare * PRICING.platform.commissionPct).toFixed(2)
  const driverEarning = +(totalFare - commission).toFixed(2)
  const upiGateway    = +(totalFare * PRICING.platform.upiGatewayPct).toFixed(2)

  if (paymentMethod === 'cash') {
    return {
      driverCollects:        totalFare,
      outstandingCommission: commission,
      deductFromWallet:      commission,
      driverNetEarning:      driverEarning,
      platformRevenue:       commission,
      gatewayFeeDeducted:    0,
    }
  }
  // UPI
  return {
    driverCollects:        0,
    outstandingCommission: 0,
    deductFromWallet:      0,
    driverNetEarning:      driverEarning,
    platformRevenue:       +(commission - upiGateway).toFixed(2),
    gatewayFeeDeducted:    upiGateway,
  }
}

/* ===============================================================
   FARE DISPLAY HELPERS
   =============================================================== */
export const fmtRs = n => `Rs.${Math.round(n)}`
export const fmtRsSymbol = n => `₹${Math.round(n)}`
export const getSaving = f => Math.max(0, (f.mrp||0) - (f.totalFare||0))

/* Passenger sees: what they pay + how it's split */
export function passengerBreakdown(f, payMethod) {
  const commission = +(f.totalFare * PRICING.platform.commissionPct).toFixed(2)
  const driverEarns = +(f.totalFare - commission).toFixed(2)
  const upiGw = payMethod === 'upi' ? +(f.totalFare * PRICING.platform.upiGatewayPct).toFixed(2) : 0

  const lines = [
    { label:'Total Fare',         value:fmtRsSymbol(f.totalFare),     highlight:true  },
    { label:`Distance (${f.distanceKm?.toFixed(1)||'?'} km)`, value:fmtRsSymbol(f.distanceFare||0), highlight:false },
  ]
  if (f.baseFareApplied)
    lines.push({ label:'Minimum fare applied', value:'Yes', small:true })
  if (f.surgeLabel)
    lines.push({ label:'Pricing', value:f.surgeLabel, small:true })
  if (f.promoDiscount > 0)
    lines.push({ label:'Discount', value:`-${fmtRsSymbol(f.promoDiscount)}`, highlight:false })
  lines.push(
    { label:'Driver earns',          value:fmtRsSymbol(driverEarns),   highlight:false },
    { label:'Platform commission',   value:fmtRsSymbol(commission),    small:true },
  )
  if (payMethod === 'upi' && upiGw > 0)
    lines.push({ label:'UPI gateway (0.1%)', value:fmtRsSymbol(upiGw), small:true })
  lines.push({ label:'Payment',       value:payMethod==='cash'?'Cash':'UPI', highlight:false })
  return lines
}

/* Driver sees: what they earn clearly */
export function driverBreakdown(f, payMethod) {
  const commission = f.platformCommission || +(f.totalFare * PRICING.platform.commissionPct).toFixed(2)
  const driverEarns = f.driverEarnings || +(f.totalFare - commission).toFixed(2)
  const upiGw = payMethod==='upi' ? +(f.totalFare * PRICING.platform.upiGatewayPct).toFixed(2) : 0

  const lines = [
    { label:'Passenger paid',      value:fmtRsSymbol(f.totalFare||0),  highlight:false },
    { label:'Platform commission (10%)', value:`-${fmtRsSymbol(commission)}`, highlight:false },
  ]
  if (payMethod==='upi' && upiGw>0)
    lines.push({ label:'UPI gateway (0.1%)', value:`-${fmtRsSymbol(upiGw)}`, small:true })
  lines.push(
    { label:'Your Earnings',       value:fmtRsSymbol(driverEarns),     highlight:true  },
    { label:'Payment method',      value:payMethod==='cash'?'Cash':'UPI', highlight:false },
  )
  if (payMethod==='cash')
    lines.push({ label:'Note', value:'Commission deducted from wallet on next recharge', small:true })
  else
    lines.push({ label:'Note', value:'Earnings will be credited after ride completion', small:true })
  return lines
}
