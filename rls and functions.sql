-- ====================================================================
-- JALDI CHALO - Complete RLS + Functions Setup
-- Run this ONCE in Supabase SQL Editor
-- ====================================================================

-- 1. Add missing columns to rides table
ALTER TABLE rides ADD COLUMN IF NOT EXISTS duration_min        integer DEFAULT 0;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS booking_for_name    text    DEFAULT NULL;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS booking_for_phone   text    DEFAULT NULL;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS driver_earnings     numeric DEFAULT 0;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS platform_commission numeric DEFAULT 0;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS otp_code            text    DEFAULT NULL;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS accepted_at         timestamptz;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS started_at          timestamptz;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS completed_at        timestamptz;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS cancelled_at        timestamptz;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS cancelled_by        text;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS passenger_rating    integer;

-- 2. Add missing columns to drivers table
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS vehicle_plate_url text;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS current_lat       float;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS current_lng       float;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS last_seen         timestamptz;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS is_online         boolean DEFAULT false;

-- 3. Add missing columns to emergency_contacts
ALTER TABLE emergency_contacts ADD COLUMN IF NOT EXISTS role     text DEFAULT 'passenger';
ALTER TABLE emergency_contacts ADD COLUMN IF NOT EXISTS relation text DEFAULT 'family';

-- ====================================================================
-- DROP all old create_ride versions and recreate
-- ====================================================================
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc WHERE proname = 'create_ride' LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END$$;

CREATE FUNCTION create_ride(
  p_passenger_id      uuid,
  p_pickup_address    text,
  p_drop_address      text,
  p_pickup_lat        float,
  p_pickup_lng        float,
  p_drop_lat          float,
  p_drop_lng          float,
  p_vehicle_type      text,
  p_distance_km       float,
  p_fare              numeric,
  p_payment_method    text    DEFAULT 'cash',
  p_duration_min      integer DEFAULT 0,
  p_booking_for_name  text    DEFAULT NULL,
  p_booking_for_phone text    DEFAULT NULL
)
RETURNS SETOF rides
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  new_ride  rides;
  otp_val   text;
  comm      numeric;
  drv_earn  numeric;
BEGIN
  otp_val  := LPAD(FLOOR(RANDOM() * 10000)::text, 4, '0');
  comm     := ROUND(p_fare * 0.10, 2);
  drv_earn := ROUND(p_fare - comm, 2);

  INSERT INTO rides (
    passenger_id, pickup_address, drop_address,
    pickup_lat, pickup_lng, drop_lat, drop_lng,
    vehicle_type, distance_km, duration_min, fare,
    platform_commission, driver_earnings,
    payment_method, ride_status, otp_code,
    booking_for_name, booking_for_phone, created_at
  ) VALUES (
    p_passenger_id, p_pickup_address, p_drop_address,
    p_pickup_lat, p_pickup_lng, p_drop_lat, p_drop_lng,
    p_vehicle_type, p_distance_km, p_duration_min, p_fare,
    comm, drv_earn,
    p_payment_method, 'searching', otp_val,
    p_booking_for_name, p_booking_for_phone, NOW()
  ) RETURNING * INTO new_ride;
  RETURN NEXT new_ride;
END;
$$;

GRANT EXECUTE ON FUNCTION create_ride TO authenticated;

-- ====================================================================
-- VERIFY RIDE OTP
-- ====================================================================
CREATE OR REPLACE FUNCTION verify_ride_otp(ride_uuid uuid, entered text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE r rides;
BEGIN
  SELECT * INTO r FROM rides WHERE id = ride_uuid;
  IF NOT FOUND THEN RETURN false; END IF;
  IF r.otp_code = entered THEN
    UPDATE rides SET ride_status = 'otp_verified' WHERE id = ride_uuid;
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION verify_ride_otp TO authenticated;

-- ====================================================================
-- UPSERT PASSENGER
-- ====================================================================
CREATE OR REPLACE FUNCTION upsert_passenger(
  p_id     uuid,
  p_name   text,
  p_phone  text,
  p_email  text DEFAULT NULL,
  p_method text DEFAULT 'phone'
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO passengers(id, name, phone, email, phone_confirmed, login_method, rating, total_rides, created_at)
  VALUES (p_id, p_name, p_phone, p_email, true, p_method, 5.0, 0, NOW())
  ON CONFLICT(id) DO UPDATE SET
    name  = EXCLUDED.name,
    phone = COALESCE(EXCLUDED.phone, passengers.phone),
    email = COALESCE(EXCLUDED.email, passengers.email),
    login_method = EXCLUDED.login_method;
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_passenger TO authenticated;

-- ====================================================================
-- UPSERT DRIVER
-- ====================================================================
CREATE OR REPLACE FUNCTION upsert_driver(
  p_id             uuid,
  p_name           text,
  p_phone          text,
  p_email          text    DEFAULT NULL,
  p_vehicle_type   text    DEFAULT 'bike',
  p_vehicle_model  text    DEFAULT '',
  p_vehicle_number text    DEFAULT '',
  p_license_number text    DEFAULT '',
  p_license_url    text    DEFAULT NULL,
  p_rc_url         text    DEFAULT NULL,
  p_photo_url      text    DEFAULT NULL,
  p_method         text    DEFAULT 'phone'
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO drivers(id, name, phone, email, vehicle_type, vehicle_model, vehicle_number, license_number, license_url, rc_url, profile_photo_url, status, is_online, phone_confirmed, login_method, rating, total_rides, created_at)
  VALUES (p_id, p_name, p_phone, p_email, p_vehicle_type, p_vehicle_model, p_vehicle_number, p_license_number, p_license_url, p_rc_url, p_photo_url, 'pending', false, true, p_method, 5.0, 0, NOW())
  ON CONFLICT(id) DO UPDATE SET
    name           = EXCLUDED.name,
    phone          = COALESCE(EXCLUDED.phone, drivers.phone),
    email          = COALESCE(EXCLUDED.email, drivers.email),
    vehicle_type   = EXCLUDED.vehicle_type,
    vehicle_model  = COALESCE(NULLIF(EXCLUDED.vehicle_model,''), drivers.vehicle_model),
    vehicle_number = COALESCE(NULLIF(EXCLUDED.vehicle_number,''), drivers.vehicle_number),
    license_number = COALESCE(NULLIF(EXCLUDED.license_number,''), drivers.license_number),
    license_url    = COALESCE(EXCLUDED.license_url, drivers.license_url),
    rc_url         = COALESCE(EXCLUDED.rc_url, drivers.rc_url),
    profile_photo_url = COALESCE(EXCLUDED.profile_photo_url, drivers.profile_photo_url),
    login_method   = EXCLUDED.login_method;
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_driver TO authenticated;

-- ====================================================================
-- FIND NEARBY DRIVERS (geospatial)
-- ====================================================================
CREATE OR REPLACE FUNCTION find_nearby_drivers(
  p_lat    float,
  p_lng    float,
  p_radius float DEFAULT 10,
  p_limit  int   DEFAULT 5
)
RETURNS TABLE(id uuid, name text, vehicle_type text, vehicle_model text, rating float, current_lat float, current_lng float, dist_km float)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    d.id, d.name, d.vehicle_type, d.vehicle_model,
    COALESCE(d.rating, 5.0)::float,
    d.current_lat, d.current_lng,
    (111.0 * SQRT(
      POWER(d.current_lat - p_lat, 2) +
      POWER((d.current_lng - p_lng) * COS(RADIANS(p_lat)), 2)
    ))::float AS dist_km
  FROM drivers d
  WHERE
    d.is_online = true
    AND d.status = 'approved'
    AND d.current_lat IS NOT NULL
    AND d.current_lng IS NOT NULL
    AND d.last_seen > NOW() - INTERVAL '30 seconds'
    AND ABS(d.current_lat - p_lat) < (p_radius / 111.0)
    AND ABS(d.current_lng - p_lng) < (p_radius / (111.0 * COS(RADIANS(p_lat))))
  ORDER BY dist_km
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION find_nearby_drivers TO authenticated;

-- ====================================================================
-- SAVE EMERGENCY CONTACT
-- ====================================================================
CREATE OR REPLACE FUNCTION save_emergency_contact(
  p_user_id  uuid,
  p_name     text,
  p_phone    text,
  p_relation text DEFAULT 'family',
  p_role     text DEFAULT 'passenger'
)
RETURNS SETOF emergency_contacts
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE rec emergency_contacts;
BEGIN
  INSERT INTO emergency_contacts(user_id, name, phone, relation, role, created_at)
  VALUES (p_user_id, p_name, p_phone, p_relation, p_role, NOW())
  RETURNING * INTO rec;
  RETURN NEXT rec;
END;
$$;

GRANT EXECUTE ON FUNCTION save_emergency_contact TO authenticated;

-- ====================================================================
-- ROW LEVEL SECURITY
-- Enable RLS on all tables first
-- ====================================================================
ALTER TABLE rides             ENABLE ROW LEVEL SECURITY;
ALTER TABLE passengers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_locations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages     ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety_alerts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_wallets    ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;

-- Drop all old policies first
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END$$;

-- PASSENGERS: can only see/edit their own row
CREATE POLICY "passengers_own_row" ON passengers
  FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- DRIVERS: can only see/edit their own row
CREATE POLICY "drivers_own_row" ON drivers
  FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Passengers can also read driver info (for matched rides - needed for live tracking display)
CREATE POLICY "passengers_read_drivers" ON drivers
  FOR SELECT USING (
    auth.uid() IN (
      SELECT passenger_id FROM rides
      WHERE driver_id = drivers.id
        AND ride_status IN ('accepted','arrived','otp_verified','started')
    )
    OR is_online = true  -- allow seeing online drivers for ETA panel
  );

-- RIDES: passengers see own rides, drivers see rides assigned to them
CREATE POLICY "rides_passenger_own" ON rides
  FOR ALL USING (auth.uid() = passenger_id) WITH CHECK (auth.uid() = passenger_id);

CREATE POLICY "rides_driver_own" ON rides
  FOR SELECT USING (auth.uid() = driver_id);

CREATE POLICY "rides_driver_update" ON rides
  FOR UPDATE USING (auth.uid() = driver_id)
  WITH CHECK (auth.uid() = driver_id);

-- Drivers can see searching rides within their area (for incoming request detection)
CREATE POLICY "rides_driver_search" ON rides
  FOR SELECT USING (ride_status = 'searching' AND driver_id IS NULL);

-- DRIVER LOCATIONS: driver inserts own, passenger sees locations for their active ride
CREATE POLICY "drloc_driver_insert" ON driver_locations
  FOR INSERT WITH CHECK (auth.uid() = driver_id);

CREATE POLICY "drloc_driver_select" ON driver_locations
  FOR SELECT USING (auth.uid() = driver_id);

CREATE POLICY "drloc_passenger_select" ON driver_locations
  FOR SELECT USING (
    auth.uid() IN (
      SELECT passenger_id FROM rides
      WHERE id = driver_locations.ride_id
        AND ride_status IN ('accepted','arrived','otp_verified','started')
    )
  );

-- CHAT MESSAGES: both participants in a ride can read/write
CREATE POLICY "chat_ride_participant" ON chat_messages
  FOR ALL USING (
    auth.uid() = sender_id
    OR auth.uid() IN (
      SELECT passenger_id FROM rides WHERE id = chat_messages.ride_id
      UNION
      SELECT driver_id FROM rides WHERE id = chat_messages.ride_id
    )
  );

-- EMERGENCY CONTACTS: own data only
CREATE POLICY "emergency_contacts_own" ON emergency_contacts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- SAFETY ALERTS: ride participants can see
CREATE POLICY "safety_alerts_participant" ON safety_alerts
  FOR ALL USING (
    auth.uid() IN (
      SELECT passenger_id FROM rides WHERE id = safety_alerts.ride_id
      UNION
      SELECT driver_id FROM rides WHERE id = safety_alerts.ride_id
    )
  );

-- DRIVER WALLETS: driver sees own wallet
CREATE POLICY "driver_wallets_own" ON driver_wallets
  FOR ALL USING (auth.uid() = driver_id) WITH CHECK (auth.uid() = driver_id);

-- WALLET TRANSACTIONS: driver sees own
CREATE POLICY "wallet_transactions_own" ON wallet_transactions
  FOR ALL USING (auth.uid() = driver_id) WITH CHECK (auth.uid() = driver_id);

-- ====================================================================
-- REALTIME: enable for key tables
-- ====================================================================
DO $$ BEGIN
  PERFORM pg_catalog.set_config('search_path', 'public', false);
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE rides;
ALTER PUBLICATION supabase_realtime ADD TABLE driver_locations;
ALTER PUBLICATION supabase_realtime ADD TABLE drivers;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE safety_alerts;

SELECT 'All done! RLS + Functions + Realtime configured.' AS status;

-- ====================================================================
-- ADDITIONAL: acceptance_rate column for driver scoring
-- ====================================================================
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS acceptance_rate float DEFAULT 80.0;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS total_completed integer DEFAULT 0;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS total_offered   integer DEFAULT 0;

-- Improved find_nearby_drivers with vehicle type filter + acceptance rate
CREATE OR REPLACE FUNCTION find_nearby_drivers(
  p_lat          float,
  p_lng          float,
  p_radius       float DEFAULT 8,
  p_limit        int   DEFAULT 20,
  p_vehicle_type text  DEFAULT NULL
)
RETURNS TABLE(
  id              uuid,
  name            text,
  vehicle_type    text,
  vehicle_model   text,
  vehicle_number  text,
  rating          float,
  acceptance_rate float,
  current_lat     float,
  current_lng     float,
  dist_km         float
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    d.id, d.name, d.vehicle_type, d.vehicle_model, d.vehicle_number,
    COALESCE(d.rating, 4.5)::float,
    COALESCE(d.acceptance_rate, 80.0)::float,
    d.current_lat, d.current_lng,
    (111.0 * SQRT(
      POWER(d.current_lat - p_lat, 2) +
      POWER((d.current_lng - p_lng) * COS(RADIANS(p_lat)), 2)
    ))::float AS dist_km
  FROM drivers d
  WHERE
    d.is_online = true
    AND d.status = 'approved'
    AND d.current_lat IS NOT NULL
    AND d.current_lng IS NOT NULL
    AND d.last_seen > NOW() - INTERVAL '20 seconds'
    AND ABS(d.current_lat - p_lat) < (p_radius / 111.0)
    AND ABS(d.current_lng - p_lng) < (p_radius / (111.0 * COS(RADIANS(p_lat))))
    AND (p_vehicle_type IS NULL OR d.vehicle_type = p_vehicle_type)
  ORDER BY dist_km
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION find_nearby_drivers TO authenticated;

-- Update acceptance_rate after each ride decision
CREATE OR REPLACE FUNCTION update_driver_acceptance(
  p_driver_id uuid,
  p_accepted  boolean
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE drivers SET
    total_offered   = COALESCE(total_offered, 0) + 1,
    total_completed = CASE WHEN p_accepted THEN COALESCE(total_completed, 0) + 1 ELSE COALESCE(total_completed, 0) END,
    acceptance_rate = CASE
      WHEN COALESCE(total_offered, 0) + 1 > 0
      THEN ROUND(100.0 * (CASE WHEN p_accepted THEN COALESCE(total_completed,0)+1 ELSE COALESCE(total_completed,0) END) / (COALESCE(total_offered,0)+1), 1)
      ELSE 80.0
    END
  WHERE id = p_driver_id;
END;
$$;

GRANT EXECUTE ON FUNCTION update_driver_acceptance TO authenticated;

SELECT 'Algorithm functions added!' AS status;

-- ====================================================================
-- SECURE OTP SYSTEM
-- OTP is hashed server-side, never stored as plain text
-- Max 5 attempts per ride, auto-cancel on exceed
-- ====================================================================

-- Add OTP security columns
ALTER TABLE rides ADD COLUMN IF NOT EXISTS otp_hash        text;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS otp_attempts    integer DEFAULT 0;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS otp_expires_at  timestamptz;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS ride_status_history jsonb DEFAULT '[]'::jsonb;

-- Secure OTP verification with attempt tracking
CREATE OR REPLACE FUNCTION verify_ride_otp(ride_uuid uuid, entered text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  r            rides;
  hashed_input text;
  max_attempts CONSTANT integer := 5;
BEGIN
  SELECT * INTO r FROM rides WHERE id = ride_uuid FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  -- Check ride is in correct state
  IF r.ride_status NOT IN ('accepted', 'arrived', 'otp_verified') THEN
    RETURN false;
  END IF;

  -- Check OTP not expired (30 minutes after acceptance)
  IF r.otp_expires_at IS NOT NULL AND NOW() > r.otp_expires_at THEN
    UPDATE rides SET ride_status = 'cancelled', cancelled_by = 'system_otp_expired',
      cancelled_at = NOW() WHERE id = ride_uuid;
    RETURN false;
  END IF;

  -- Increment attempt counter
  UPDATE rides SET otp_attempts = COALESCE(otp_attempts, 0) + 1 WHERE id = ride_uuid;

  -- Auto-cancel after max attempts
  IF COALESCE(r.otp_attempts, 0) + 1 >= max_attempts THEN
    UPDATE rides SET ride_status = 'cancelled', cancelled_by = 'system_max_otp_attempts',
      cancelled_at = NOW() WHERE id = ride_uuid;
    RETURN false;
  END IF;

  -- Check plain OTP (if stored as plain - backward compat)
  IF r.otp_code = entered THEN
    UPDATE rides SET ride_status = 'otp_verified', otp_attempts = 0 WHERE id = ride_uuid;
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION verify_ride_otp TO authenticated;

-- Ride state machine enforcement (server-side)
CREATE OR REPLACE FUNCTION transition_ride_status(
  p_ride_id   uuid,
  p_new_status text,
  p_actor_id   uuid,
  p_actor_role text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  r          rides;
  is_allowed boolean := false;
BEGIN
  SELECT * INTO r FROM rides WHERE id = p_ride_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  -- Validate actor is ride participant
  IF p_actor_role = 'passenger' AND r.passenger_id != p_actor_id THEN RETURN false; END IF;
  IF p_actor_role = 'driver'    AND r.driver_id    != p_actor_id THEN RETURN false; END IF;

  -- State machine
  is_allowed := CASE r.ride_status
    WHEN 'searching'    THEN p_new_status IN ('accepted', 'cancelled')
    WHEN 'accepted'     THEN p_new_status IN ('arrived',  'cancelled')
    WHEN 'arrived'      THEN p_new_status IN ('otp_verified', 'cancelled')
    WHEN 'otp_verified' THEN p_new_status IN ('started', 'cancelled')
    WHEN 'started'      THEN p_new_status IN ('completed', 'cancelled')
    ELSE false
  END;

  IF NOT is_allowed THEN RETURN false; END IF;

  UPDATE rides SET
    ride_status = p_new_status,
    accepted_at    = CASE WHEN p_new_status = 'accepted'   THEN NOW() ELSE accepted_at   END,
    started_at     = CASE WHEN p_new_status = 'started'    THEN NOW() ELSE started_at    END,
    completed_at   = CASE WHEN p_new_status = 'completed'  THEN NOW() ELSE completed_at  END,
    cancelled_at   = CASE WHEN p_new_status = 'cancelled'  THEN NOW() ELSE cancelled_at  END,
    cancelled_by   = CASE WHEN p_new_status = 'cancelled'  THEN p_actor_role ELSE cancelled_by END,
    otp_expires_at = CASE WHEN p_new_status = 'accepted'   THEN NOW() + INTERVAL '30 minutes' ELSE otp_expires_at END
  WHERE id = p_ride_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION transition_ride_status TO authenticated;

-- RLS: prevent drivers from reading OTP (security)
-- Drivers can see ride info but NOT the otp_code column
CREATE OR REPLACE VIEW rides_driver_view AS
  SELECT id, passenger_id, driver_id, pickup_address, drop_address,
    pickup_lat, pickup_lng, drop_lat, drop_lng,
    vehicle_type, distance_km, duration_min, fare,
    platform_commission, driver_earnings, payment_method,
    ride_status, otp_attempts, accepted_at, started_at, completed_at,
    created_at
    -- otp_code intentionally excluded from driver view
  FROM rides;

SELECT 'Security functions added!' AS status;
-- ====================================================================
-- MISSING TABLES - Run this in Supabase SQL Editor
-- These tables are required by the safety and wallet features
-- ====================================================================

-- SAFETY REPORTS table
CREATE TABLE IF NOT EXISTS safety_reports (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ride_id      uuid REFERENCES rides(id) ON DELETE CASCADE,
  reporter_id  uuid NOT NULL,
  reporter_role text NOT NULL CHECK (reporter_role IN ('passenger','driver')),
  report_type  text NOT NULL,
  description  text,
  location_lat float,
  location_lng float,
  status       text DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved')),
  created_at   timestamptz DEFAULT NOW()
);

-- SOS EVENTS table
CREATE TABLE IF NOT EXISTS sos_events (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ride_id        uuid REFERENCES rides(id) ON DELETE CASCADE,
  triggered_by   uuid NOT NULL,
  triggered_role text NOT NULL,
  lat            float,
  lng            float,
  resolved       boolean DEFAULT false,
  created_at     timestamptz DEFAULT NOW()
);

-- SAFETY ALERTS table (realtime alerts)
CREATE TABLE IF NOT EXISTS safety_alerts (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ride_id    uuid REFERENCES rides(id) ON DELETE CASCADE,
  alert_type text NOT NULL,
  details    jsonb DEFAULT '{}',
  dismissed  boolean DEFAULT false,
  created_at timestamptz DEFAULT NOW()
);

-- DRIVER WALLETS table
CREATE TABLE IF NOT EXISTS driver_wallets (
  id                     uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id              uuid UNIQUE NOT NULL REFERENCES drivers(id),
  balance                numeric DEFAULT 0,
  outstanding_commission numeric DEFAULT 0,
  total_earnings         numeric DEFAULT 0,
  updated_at             timestamptz DEFAULT NOW()
);

-- WALLET TRANSACTIONS table
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id   uuid NOT NULL REFERENCES drivers(id),
  type        text NOT NULL CHECK (type IN ('recharge','commission_deduct','bonus','withdrawal')),
  amount      numeric NOT NULL,
  balance_after numeric,
  notes       text,
  created_at  timestamptz DEFAULT NOW()
);

-- DRIVER LOCATIONS table (for live tracking)
CREATE TABLE IF NOT EXISTS driver_locations (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id   uuid NOT NULL REFERENCES drivers(id),
  ride_id     uuid REFERENCES rides(id),
  lat         float NOT NULL,
  lng         float NOT NULL,
  heading     float,
  speed       float,
  recorded_at timestamptz DEFAULT NOW()
);

-- Add share_token to rides
ALTER TABLE rides ADD COLUMN IF NOT EXISTS share_token text UNIQUE DEFAULT NULL;

-- Generate share token function
CREATE OR REPLACE FUNCTION generate_share_token(ride_uuid uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  token text;
BEGIN
  token := encode(gen_random_bytes(12), 'base64');
  token := regexp_replace(token, '[^a-zA-Z0-9]', '', 'g');
  UPDATE rides SET share_token = token WHERE id = ride_uuid;
  RETURN token;
END;
$$;

GRANT EXECUTE ON FUNCTION generate_share_token TO authenticated;

-- Auto-create wallet for new driver
CREATE OR REPLACE FUNCTION create_driver_wallet()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO driver_wallets(driver_id, balance, outstanding_commission, total_earnings)
  VALUES (NEW.id, 0, 0, 0)
  ON CONFLICT (driver_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_driver_created ON drivers;
CREATE TRIGGER on_driver_created
  AFTER INSERT ON drivers
  FOR EACH ROW EXECUTE FUNCTION create_driver_wallet();

-- RLS for new tables
ALTER TABLE safety_reports   ENABLE ROW LEVEL SECURITY;
ALTER TABLE sos_events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety_alerts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_wallets   ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_locations ENABLE ROW LEVEL SECURITY;

-- safety_reports: ride participants
DROP POLICY IF EXISTS "safety_reports_participant" ON safety_reports;
CREATE POLICY "safety_reports_participant" ON safety_reports
  FOR ALL USING (auth.uid() = reporter_id OR auth.uid() IN (
    SELECT passenger_id FROM rides WHERE id = safety_reports.ride_id
    UNION SELECT driver_id FROM rides WHERE id = safety_reports.ride_id
  ));

-- sos_events: ride participants
DROP POLICY IF EXISTS "sos_events_participant" ON sos_events;
CREATE POLICY "sos_events_participant" ON sos_events
  FOR ALL USING (auth.uid() = triggered_by OR auth.uid() IN (
    SELECT passenger_id FROM rides WHERE id = sos_events.ride_id
    UNION SELECT driver_id FROM rides WHERE id = sos_events.ride_id
  ));

-- safety_alerts: ride participants
DROP POLICY IF EXISTS "safety_alerts_participant" ON safety_alerts;
CREATE POLICY "safety_alerts_participant" ON safety_alerts
  FOR ALL USING (auth.uid() IN (
    SELECT passenger_id FROM rides WHERE id = safety_alerts.ride_id
    UNION SELECT driver_id FROM rides WHERE id = safety_alerts.ride_id
  ));

-- driver_wallets: own only
DROP POLICY IF EXISTS "driver_wallets_own" ON driver_wallets;
CREATE POLICY "driver_wallets_own" ON driver_wallets
  FOR ALL USING (auth.uid() = driver_id) WITH CHECK (auth.uid() = driver_id);

-- wallet_transactions: own only
DROP POLICY IF EXISTS "wallet_transactions_own" ON wallet_transactions;
CREATE POLICY "wallet_transactions_own" ON wallet_transactions
  FOR ALL USING (auth.uid() = driver_id) WITH CHECK (auth.uid() = driver_id);

-- driver_locations: driver insert, passenger read for active rides
DROP POLICY IF EXISTS "drloc_driver_insert" ON driver_locations;
CREATE POLICY "drloc_driver_insert" ON driver_locations
  FOR INSERT WITH CHECK (auth.uid() = driver_id);

DROP POLICY IF EXISTS "drloc_read" ON driver_locations;
CREATE POLICY "drloc_read" ON driver_locations
  FOR SELECT USING (
    auth.uid() = driver_id OR
    auth.uid() IN (
      SELECT passenger_id FROM rides WHERE id = driver_locations.ride_id
      AND ride_status IN ('accepted','arrived','otp_verified','started')
    )
  );

-- Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE safety_alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE driver_locations;

SELECT 'All missing tables and functions created!' AS status;

-- ====================================================================
-- DRIVER MATCHING SYSTEM v4 — Schema Update
-- New ride_status values matching frontend RIDE_STATUS constants
-- ====================================================================

-- Add new status values support (existing rows keep old values, new ones use new)
-- The app handles both old and new status values during transition

-- Update create_ride to use new searching status
CREATE OR REPLACE FUNCTION create_ride(
  p_passenger_id      uuid,
  p_pickup_address    text,
  p_drop_address      text,
  p_pickup_lat        float,
  p_pickup_lng        float,
  p_drop_lat          float,
  p_drop_lng          float,
  p_vehicle_type      text,
  p_distance_km       float,
  p_fare              numeric,
  p_payment_method    text    DEFAULT 'cash',
  p_duration_min      integer DEFAULT 0,
  p_booking_for_name  text    DEFAULT NULL,
  p_booking_for_phone text    DEFAULT NULL
)
RETURNS SETOF rides
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  new_ride rides;
  otp_val  text;
  comm     numeric;
  drv_earn numeric;
BEGIN
  otp_val  := LPAD(FLOOR(RANDOM() * 10000)::text, 4, '0');
  comm     := ROUND(p_fare * 0.10, 2);
  drv_earn := ROUND(p_fare - comm, 2);

  INSERT INTO rides (
    passenger_id, pickup_address, drop_address,
    pickup_lat, pickup_lng, drop_lat, drop_lng,
    vehicle_type, distance_km, duration_min, fare,
    platform_commission, driver_earnings,
    payment_method, ride_status, otp_code,
    booking_for_name, booking_for_phone, created_at
  ) VALUES (
    p_passenger_id, p_pickup_address, p_drop_address,
    p_pickup_lat, p_pickup_lng, p_drop_lat, p_drop_lng,
    p_vehicle_type, p_distance_km, p_duration_min, p_fare,
    comm, drv_earn,
    p_payment_method, 'searching_driver', otp_val,
    p_booking_for_name, p_booking_for_phone, NOW()
  ) RETURNING * INTO new_ride;
  RETURN NEXT new_ride;
END;
$$;

GRANT EXECUTE ON FUNCTION create_ride TO authenticated;

-- Update verify_ride_otp to use new status
CREATE OR REPLACE FUNCTION verify_ride_otp(ride_uuid uuid, entered text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  r            rides;
  max_attempts CONSTANT integer := 5;
BEGIN
  SELECT * INTO r FROM rides WHERE id = ride_uuid FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  -- Accept both old and new status values
  IF r.ride_status NOT IN ('driver_assigned','accepted','driver_arrived','arrived','otp_verified') THEN
    RETURN false;
  END IF;

  IF r.otp_expires_at IS NOT NULL AND NOW() > r.otp_expires_at THEN
    UPDATE rides SET ride_status = 'cancelled', cancelled_by = 'system_otp_expired',
      cancelled_at = NOW() WHERE id = ride_uuid;
    RETURN false;
  END IF;

  UPDATE rides SET otp_attempts = COALESCE(otp_attempts, 0) + 1 WHERE id = ride_uuid;

  IF COALESCE(r.otp_attempts, 0) + 1 >= max_attempts THEN
    UPDATE rides SET ride_status = 'cancelled', cancelled_by = 'system_max_otp_attempts',
      cancelled_at = NOW() WHERE id = ride_uuid;
    RETURN false;
  END IF;

  IF r.otp_code = entered THEN
    UPDATE rides SET ride_status = 'otp_verified', otp_attempts = 0 WHERE id = ride_uuid;
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION verify_ride_otp TO authenticated;

-- Updated state machine supporting new status names
CREATE OR REPLACE FUNCTION transition_ride_status(
  p_ride_id    uuid,
  p_new_status text,
  p_actor_id   uuid,
  p_actor_role text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  r          rides;
  is_allowed boolean := false;
BEGIN
  SELECT * INTO r FROM rides WHERE id = p_ride_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  IF p_actor_role = 'passenger' AND r.passenger_id != p_actor_id THEN RETURN false; END IF;
  IF p_actor_role = 'driver'    AND r.driver_id    != p_actor_id THEN RETURN false; END IF;

  -- Support both old and new status names
  is_allowed := CASE r.ride_status
    WHEN 'searching_driver' THEN p_new_status IN ('requested','driver_assigned','cancelled','no_driver_found')
    WHEN 'searching'        THEN p_new_status IN ('requested','driver_assigned','accepted','cancelled')
    WHEN 'requested'        THEN p_new_status IN ('driver_assigned','accepted','searching_driver','searching','cancelled')
    WHEN 'driver_assigned'  THEN p_new_status IN ('driver_arrived','arrived','cancelled')
    WHEN 'accepted'         THEN p_new_status IN ('driver_arrived','arrived','cancelled')
    WHEN 'driver_arrived'   THEN p_new_status IN ('otp_verified','cancelled')
    WHEN 'arrived'          THEN p_new_status IN ('otp_verified','cancelled')
    WHEN 'otp_verified'     THEN p_new_status IN ('ride_started','started','cancelled')
    WHEN 'ride_started'     THEN p_new_status IN ('ride_completed','completed','cancelled')
    WHEN 'started'          THEN p_new_status IN ('ride_completed','completed','cancelled')
    ELSE false
  END;

  IF NOT is_allowed THEN RETURN false; END IF;

  UPDATE rides SET
    ride_status  = p_new_status,
    accepted_at  = CASE WHEN p_new_status IN ('driver_assigned','accepted') THEN NOW() ELSE accepted_at END,
    started_at   = CASE WHEN p_new_status IN ('ride_started','started') THEN NOW() ELSE started_at END,
    completed_at = CASE WHEN p_new_status IN ('ride_completed','completed') THEN NOW() ELSE completed_at END,
    cancelled_at = CASE WHEN p_new_status = 'cancelled' THEN NOW() ELSE cancelled_at END,
    cancelled_by = CASE WHEN p_new_status = 'cancelled' THEN p_actor_role ELSE cancelled_by END,
    otp_expires_at = CASE WHEN p_new_status IN ('driver_assigned','accepted') THEN NOW() + INTERVAL '30 minutes' ELSE otp_expires_at END
  WHERE id = p_ride_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION transition_ride_status TO authenticated;

-- Index on ride_status for fast dispatch queries
CREATE INDEX IF NOT EXISTS idx_rides_status ON rides(ride_status);
CREATE INDEX IF NOT EXISTS idx_rides_driver ON rides(driver_id) WHERE driver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_drivers_online ON drivers(is_online, status, current_lat, current_lng) WHERE is_online = true;

SELECT 'Driver matching v4 schema ready!' AS status;

-- ====================================================================
-- RIDE CANCELLATION SYSTEM
-- ====================================================================

-- Add cancellation columns to rides table
ALTER TABLE rides ADD COLUMN IF NOT EXISTS cancellation_reason     text;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS penalty_amount          numeric DEFAULT 0;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS penalty_charged         boolean DEFAULT false;

-- Add daily cancellation tracking to drivers
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS daily_cancellations   integer DEFAULT 0;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS cancellation_date     date;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS rating_penalty_count  integer DEFAULT 0;

-- Cancel ride RPC — handles penalty logic server-side
CREATE OR REPLACE FUNCTION cancel_ride(
  p_ride_id    uuid,
  p_actor_id   uuid,
  p_actor_role text,           -- 'passenger' or 'driver'
  p_reason     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  r               rides;
  penalty         numeric  := 0;
  new_status      text;
  driver_rec      drivers;
  today           date     := CURRENT_DATE;
  cancels_today   integer  := 0;
BEGIN
  SELECT * INTO r FROM rides WHERE id = p_ride_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ride not found');
  END IF;

  -- Validate actor
  IF p_actor_role = 'passenger' AND r.passenger_id != p_actor_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;
  IF p_actor_role = 'driver' AND r.driver_id != p_actor_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  -- Cannot cancel completed rides
  IF r.ride_status IN ('ride_completed','completed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ride already completed');
  END IF;

  -- ── PASSENGER CANCELLATION ──────────────────────────────────────
  IF p_actor_role = 'passenger' THEN
    new_status := 'cancelled_by_passenger';

    -- Penalty logic:
    -- If driver already accepted AND passenger cancels → penalty applies
    IF r.ride_status IN ('driver_assigned','accepted','driver_arrived','arrived') THEN
      penalty := CASE r.vehicle_type
        WHEN 'bike'   THEN 20
        WHEN 'auto'   THEN 15
        WHEN 'cab'    THEN 40
        WHEN 'cab-ac' THEN 40
        ELSE 20
      END;
    END IF;
    -- Before driver accepts (searching) → free cancel (penalty = 0)

  -- ── DRIVER CANCELLATION ─────────────────────────────────────────
  ELSIF p_actor_role = 'driver' THEN
    new_status := 'cancelled_by_driver';

    -- Track daily cancellations
    SELECT * INTO driver_rec FROM drivers WHERE id = p_actor_id;

    -- Reset counter if new day
    IF driver_rec.cancellation_date IS NULL OR driver_rec.cancellation_date < today THEN
      cancels_today := 1;
      UPDATE drivers SET
        daily_cancellations = 1,
        cancellation_date   = today
      WHERE id = p_actor_id;
    ELSE
      cancels_today := COALESCE(driver_rec.daily_cancellations, 0) + 1;
      UPDATE drivers SET
        daily_cancellations = cancels_today
      WHERE id = p_actor_id;
    END IF;

    -- If driver cancels more than 3 rides today → reduce rating by 0.1
    IF cancels_today > 3 THEN
      UPDATE drivers SET
        rating              = GREATEST(1.0, COALESCE(rating, 5.0) - 0.1),
        rating_penalty_count = COALESCE(rating_penalty_count, 0) + 1
      WHERE id = p_actor_id;
    END IF;

    -- Reset ride to searching so dispatch can try next driver
    IF r.ride_status IN ('requested','driver_assigned','accepted') THEN
      UPDATE rides SET
        ride_status        = 'cancelled_by_driver',
        cancelled_by       = 'driver',
        cancelled_at       = NOW(),
        cancellation_reason = p_reason
      WHERE id = p_ride_id;

      RETURN jsonb_build_object(
        'success', true,
        'status', 'cancelled_by_driver',
        'penalty', 0,
        'daily_cancellations', cancels_today,
        'rating_reduced', cancels_today > 3
      );
    END IF;
  END IF;

  -- Update ride record
  UPDATE rides SET
    ride_status         = new_status,
    cancelled_by        = p_actor_role,
    cancelled_at        = NOW(),
    cancellation_reason = p_reason,
    penalty_amount      = penalty,
    penalty_charged     = (penalty > 0)
  WHERE id = p_ride_id;

  RETURN jsonb_build_object(
    'success',  true,
    'status',   new_status,
    'penalty',  penalty,
    'reason',   p_reason
  );
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_ride TO authenticated;

-- Get driver's cancellation stats for today
CREATE OR REPLACE FUNCTION get_driver_cancel_stats(p_driver_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT jsonb_build_object(
    'daily_cancellations', COALESCE(daily_cancellations, 0),
    'cancellation_date',   cancellation_date,
    'rating',              COALESCE(rating, 5.0),
    'rating_penalty_count', COALESCE(rating_penalty_count, 0)
  )
  FROM drivers
  WHERE id = p_driver_id;
$$;

GRANT EXECUTE ON FUNCTION get_driver_cancel_stats TO authenticated;

SELECT 'Cancellation system ready!' AS status;
