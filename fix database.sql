-- ================================================================
-- JALDI CHALO — DATABASE FIX SQL
-- Run this FIRST, then run rls_and_functions.sql
-- ================================================================

-- Step 1: Drop ALL conflicting functions completely
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT oid::regprocedure AS sig
    FROM pg_proc
    WHERE proname IN (
      'find_nearby_drivers','create_ride','verify_ride_otp',
      'transition_ride_status','upsert_passenger','upsert_driver',
      'update_driver_acceptance','save_emergency_contact',
      'generate_share_token','create_driver_wallet',
      'get_driver_cancel_stats','cancel_ride',
      'get_driver_cancel_stats'
    )
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END$$;

-- Step 2: Ensure rides table has ALL required columns
CREATE TABLE IF NOT EXISTS rides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id uuid,
  driver_id uuid,
  pickup_address text,
  drop_address text,
  pickup_lat float,
  pickup_lng float,
  drop_lat float,
  drop_lng float,
  vehicle_type text,
  distance_km float,
  duration_min integer DEFAULT 0,
  fare numeric,
  platform_commission numeric DEFAULT 0,
  driver_earnings numeric DEFAULT 0,
  payment_method text DEFAULT 'cash',
  ride_status text DEFAULT 'searching_driver',
  otp_code text,
  otp_attempts integer DEFAULT 0,
  otp_expires_at timestamptz,
  booking_for_name text,
  booking_for_phone text,
  cancellation_reason text,
  cancelled_by text,
  cancelled_at timestamptz,
  penalty_amount numeric DEFAULT 0,
  penalty_charged boolean DEFAULT false,
  passenger_rating integer,
  driver_rating integer,
  accepted_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Add any missing columns safely
ALTER TABLE rides ADD COLUMN IF NOT EXISTS booking_for_name text;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS booking_for_phone text;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS platform_commission numeric DEFAULT 0;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS driver_earnings numeric DEFAULT 0;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS otp_code text;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS otp_attempts integer DEFAULT 0;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS otp_expires_at timestamptz;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS cancellation_reason text;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS penalty_amount numeric DEFAULT 0;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS penalty_charged boolean DEFAULT false;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS duration_min integer DEFAULT 0;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS cancelled_by text;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS passenger_rating integer;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS accepted_at timestamptz;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS started_at timestamptz;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- Step 3: Ensure passengers table exists with all columns
CREATE TABLE IF NOT EXISTS passengers (
  id uuid PRIMARY KEY,
  name text,
  phone text,
  email text,
  profile_photo_url text,
  rating float DEFAULT 5.0,
  total_rides integer DEFAULT 0,
  is_active boolean DEFAULT true,
  login_method text DEFAULT 'phone',
  phone_confirmed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Step 4: Ensure drivers table exists with all columns
CREATE TABLE IF NOT EXISTS drivers (
  id uuid PRIMARY KEY,
  name text,
  phone text,
  email text,
  vehicle_type text,
  vehicle_model text,
  vehicle_number text,
  license_url text,
  vehicle_plate_url text,
  rc_url text,
  profile_photo_url text,
  rating float DEFAULT 5.0,
  acceptance_rate float DEFAULT 100,
  total_rides integer DEFAULT 0,
  status text DEFAULT 'pending',
  is_online boolean DEFAULT false,
  current_lat float,
  current_lng float,
  last_seen timestamptz,
  daily_cancellations integer DEFAULT 0,
  cancellation_date date,
  rating_penalty_count integer DEFAULT 0,
  login_method text DEFAULT 'phone',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE drivers ADD COLUMN IF NOT EXISTS daily_cancellations integer DEFAULT 0;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS cancellation_date date;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS rating_penalty_count integer DEFAULT 0;

-- Step 5: Other tables
CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid REFERENCES rides(id) ON DELETE CASCADE,
  sender_id uuid,
  sender_role text,
  message text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS emergency_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  name text,
  phone text,
  role text DEFAULT 'passenger',
  relation text DEFAULT 'family',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS safety_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid,
  reporter_id uuid,
  reporter_role text,
  issue_type text,
  description text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sos_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid,
  passenger_id uuid,
  lat float,
  lng float,
  triggered_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS safety_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid,
  alert_type text,
  message text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS driver_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid UNIQUE,
  balance numeric DEFAULT 0,
  total_earnings numeric DEFAULT 0,
  outstanding_commission numeric DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid,
  type text,
  amount numeric,
  balance_after numeric,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Step 6: Enable RLS
ALTER TABLE rides             ENABLE ROW LEVEL SECURITY;
ALTER TABLE passengers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages     ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_wallets    ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;

-- Step 7: RLS Policies
DROP POLICY IF EXISTS "rides_all" ON rides;
CREATE POLICY "rides_all" ON rides FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "passengers_all" ON passengers;
CREATE POLICY "passengers_all" ON passengers FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "drivers_all" ON drivers;
CREATE POLICY "drivers_all" ON drivers FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "chat_all" ON chat_messages;
CREATE POLICY "chat_all" ON chat_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "ec_all" ON emergency_contacts;
CREATE POLICY "ec_all" ON emergency_contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "wallet_all" ON driver_wallets;
CREATE POLICY "wallet_all" ON driver_wallets FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "wtx_all" ON wallet_transactions;
CREATE POLICY "wtx_all" ON wallet_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Step 8: Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE rides;
ALTER PUBLICATION supabase_realtime ADD TABLE drivers;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE safety_alerts;

-- Step 9: Core Functions

CREATE OR REPLACE FUNCTION upsert_passenger(
  p_id uuid, p_name text, p_phone text,
  p_email text DEFAULT NULL, p_method text DEFAULT 'phone'
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO passengers(id,name,phone,email,phone_confirmed,login_method,created_at)
  VALUES(p_id,p_name,p_phone,p_email,true,p_method,now())
  ON CONFLICT(id) DO UPDATE SET
    name=EXCLUDED.name, phone=COALESCE(EXCLUDED.phone,passengers.phone),
    email=COALESCE(EXCLUDED.email,passengers.email),
    phone_confirmed=true, login_method=EXCLUDED.login_method;
END;$$;
GRANT EXECUTE ON FUNCTION upsert_passenger TO authenticated;

CREATE OR REPLACE FUNCTION upsert_driver(
  p_id uuid, p_name text, p_phone text, p_vehicle_type text,
  p_vehicle_model text, p_vehicle_number text,
  p_license_url text DEFAULT NULL, p_vehicle_plate_url text DEFAULT NULL,
  p_rc_url text DEFAULT NULL, p_email text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO drivers(id,name,phone,email,vehicle_type,vehicle_model,vehicle_number,
    license_url,vehicle_plate_url,rc_url,status,login_method,created_at)
  VALUES(p_id,p_name,p_phone,p_email,p_vehicle_type,p_vehicle_model,p_vehicle_number,
    p_license_url,p_vehicle_plate_url,p_rc_url,'pending','phone',now())
  ON CONFLICT(id) DO UPDATE SET
    name=EXCLUDED.name, phone=COALESCE(EXCLUDED.phone,drivers.phone),
    vehicle_type=EXCLUDED.vehicle_type, vehicle_model=EXCLUDED.vehicle_model,
    vehicle_number=EXCLUDED.vehicle_number,
    license_url=COALESCE(EXCLUDED.license_url,drivers.license_url),
    vehicle_plate_url=COALESCE(EXCLUDED.vehicle_plate_url,drivers.vehicle_plate_url),
    rc_url=COALESCE(EXCLUDED.rc_url,drivers.rc_url);
END;$$;
GRANT EXECUTE ON FUNCTION upsert_driver TO authenticated;

CREATE OR REPLACE FUNCTION find_nearby_drivers(
  p_lat float, p_lng float, p_radius float DEFAULT 5,
  p_limit int DEFAULT 20, p_vehicle_type text DEFAULT NULL
)
RETURNS TABLE(
  id uuid, name text, phone text, vehicle_type text, vehicle_model text,
  vehicle_number text, rating float, acceptance_rate float,
  current_lat float, current_lng float, last_seen timestamptz,
  profile_photo_url text, dist_km float
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT d.id, d.name, d.phone, d.vehicle_type, d.vehicle_model,
    d.vehicle_number, COALESCE(d.rating,4.5), COALESCE(d.acceptance_rate,80),
    d.current_lat, d.current_lng, d.last_seen, d.profile_photo_url,
    (6371 * acos(LEAST(1, cos(radians(p_lat)) * cos(radians(d.current_lat))
      * cos(radians(d.current_lng) - radians(p_lng))
      + sin(radians(p_lat)) * sin(radians(d.current_lat))))) AS dist_km
  FROM drivers d
  WHERE d.is_online = true
    AND d.status = 'approved'
    AND d.current_lat IS NOT NULL
    AND d.current_lng IS NOT NULL
    AND d.last_seen > now() - interval '20 seconds'
    AND (p_vehicle_type IS NULL OR d.vehicle_type = p_vehicle_type)
    AND d.current_lat BETWEEN p_lat - (p_radius/111.0) AND p_lat + (p_radius/111.0)
    AND d.current_lng BETWEEN p_lng - (p_radius/111.0) AND p_lng + (p_radius/111.0)
    AND (6371 * acos(LEAST(1, cos(radians(p_lat)) * cos(radians(d.current_lat))
      * cos(radians(d.current_lng) - radians(p_lng))
      + sin(radians(p_lat)) * sin(radians(d.current_lat))))) <= p_radius
  ORDER BY dist_km
  LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION find_nearby_drivers TO authenticated;

CREATE OR REPLACE FUNCTION create_ride(
  p_passenger_id uuid, p_pickup_address text, p_drop_address text,
  p_pickup_lat float, p_pickup_lng float, p_drop_lat float, p_drop_lng float,
  p_vehicle_type text, p_distance_km float, p_fare numeric,
  p_payment_method text DEFAULT 'cash', p_duration_min integer DEFAULT 0,
  p_booking_for_name text DEFAULT NULL, p_booking_for_phone text DEFAULT NULL
)
RETURNS SETOF rides LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  new_ride rides;
  otp_val  text;
  comm     numeric;
  drv_earn numeric;
BEGIN
  otp_val  := LPAD(FLOOR(RANDOM() * 10000)::text, 4, '0');
  comm     := ROUND(p_fare * 0.10, 2);
  drv_earn := ROUND(p_fare - comm, 2);
  INSERT INTO rides(
    passenger_id, pickup_address, drop_address,
    pickup_lat, pickup_lng, drop_lat, drop_lng,
    vehicle_type, distance_km, duration_min, fare,
    platform_commission, driver_earnings, payment_method,
    ride_status, otp_code, booking_for_name, booking_for_phone, created_at
  ) VALUES (
    p_passenger_id, p_pickup_address, p_drop_address,
    p_pickup_lat, p_pickup_lng, p_drop_lat, p_drop_lng,
    p_vehicle_type, p_distance_km, p_duration_min, p_fare,
    comm, drv_earn, p_payment_method,
    'searching_driver', otp_val, p_booking_for_name, p_booking_for_phone, NOW()
  ) RETURNING * INTO new_ride;
  RETURN NEXT new_ride;
END;$$;
GRANT EXECUTE ON FUNCTION create_ride TO authenticated;

CREATE OR REPLACE FUNCTION verify_ride_otp(ride_uuid uuid, entered text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE r rides;
BEGIN
  SELECT * INTO r FROM rides WHERE id = ride_uuid FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF r.ride_status NOT IN ('driver_assigned','accepted','driver_arrived','arrived') THEN RETURN false; END IF;
  UPDATE rides SET otp_attempts = COALESCE(otp_attempts,0)+1 WHERE id=ride_uuid;
  IF COALESCE(r.otp_attempts,0)+1 >= 5 THEN
    UPDATE rides SET ride_status='cancelled', cancelled_by='system_otp', cancelled_at=NOW() WHERE id=ride_uuid;
    RETURN false;
  END IF;
  IF r.otp_code = entered THEN
    UPDATE rides SET ride_status='otp_verified', otp_attempts=0 WHERE id=ride_uuid;
    RETURN true;
  END IF;
  RETURN false;
END;$$;
GRANT EXECUTE ON FUNCTION verify_ride_otp TO authenticated;

CREATE OR REPLACE FUNCTION update_driver_acceptance(p_driver_id uuid, p_accepted boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE drivers SET
    acceptance_rate = GREATEST(0, LEAST(100,
      COALESCE(acceptance_rate,80) * 0.9 + (CASE WHEN p_accepted THEN 10 ELSE 0 END)
    ))
  WHERE id = p_driver_id;
END;$$;
GRANT EXECUTE ON FUNCTION update_driver_acceptance TO authenticated;

CREATE OR REPLACE FUNCTION cancel_ride(
  p_ride_id uuid, p_actor_id uuid,
  p_actor_role text, p_reason text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  r rides; penalty numeric := 0;
  new_status text; cancels_today integer := 0;
  today date := CURRENT_DATE;
BEGIN
  SELECT * INTO r FROM rides WHERE id=p_ride_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','Not found'); END IF;
  IF r.ride_status IN ('ride_completed','completed') THEN
    RETURN jsonb_build_object('success',false,'error','Already completed'); END IF;

  IF p_actor_role='passenger' THEN
    new_status := 'cancelled_by_passenger';
    IF r.ride_status IN ('driver_assigned','accepted','driver_arrived','arrived') THEN
      penalty := CASE r.vehicle_type WHEN 'bike' THEN 20 WHEN 'auto' THEN 15 ELSE 40 END;
    END IF;
  ELSE
    new_status := 'cancelled_by_driver';
    UPDATE drivers SET
      daily_cancellations = CASE WHEN cancellation_date=today THEN COALESCE(daily_cancellations,0)+1 ELSE 1 END,
      cancellation_date = today
    WHERE id=p_actor_id RETURNING daily_cancellations INTO cancels_today;
    IF cancels_today > 3 THEN
      UPDATE drivers SET rating=GREATEST(1.0,COALESCE(rating,5.0)-0.1),
        rating_penalty_count=COALESCE(rating_penalty_count,0)+1 WHERE id=p_actor_id;
    END IF;
  END IF;

  UPDATE rides SET ride_status=new_status, cancelled_by=p_actor_role,
    cancelled_at=NOW(), cancellation_reason=p_reason,
    penalty_amount=penalty, penalty_charged=(penalty>0)
  WHERE id=p_ride_id;

  RETURN jsonb_build_object('success',true,'status',new_status,
    'penalty',penalty,'daily_cancellations',cancels_today,
    'rating_reduced',cancels_today>3);
END;$$;
GRANT EXECUTE ON FUNCTION cancel_ride TO authenticated;

CREATE OR REPLACE FUNCTION get_driver_cancel_stats(p_driver_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT jsonb_build_object(
    'daily_cancellations', COALESCE(daily_cancellations,0),
    'rating', COALESCE(rating,5.0),
    'rating_penalty_count', COALESCE(rating_penalty_count,0)
  ) FROM drivers WHERE id=p_driver_id;
$$;
GRANT EXECUTE ON FUNCTION get_driver_cancel_stats TO authenticated;

CREATE OR REPLACE FUNCTION save_emergency_contact(
  p_user_id uuid, p_name text, p_phone text, p_role text, p_relation text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO emergency_contacts(user_id,name,phone,role,relation)
  VALUES(p_user_id,p_name,p_phone,p_role,p_relation);
END;$$;
GRANT EXECUTE ON FUNCTION save_emergency_contact TO authenticated;

-- Step 10: Indexes
CREATE INDEX IF NOT EXISTS idx_rides_status ON rides(ride_status);
CREATE INDEX IF NOT EXISTS idx_rides_passenger ON rides(passenger_id);
CREATE INDEX IF NOT EXISTS idx_rides_driver ON rides(driver_id) WHERE driver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_drivers_online ON drivers(is_online,status,current_lat,current_lng) WHERE is_online=true;

SELECT 'Database ready! All tables and functions created.' AS result;
