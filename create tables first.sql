-- ====================================================================
-- JALDI CHALO — Step 1: Create All Tables
-- Run this FIRST in Supabase SQL Editor
-- ====================================================================

-- PASSENGERS
CREATE TABLE IF NOT EXISTS passengers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  phone            text,
  email            text,
  phone_confirmed  boolean DEFAULT false,
  login_method     text DEFAULT 'phone',
  rating           float DEFAULT 5.0,
  total_rides      integer DEFAULT 0,
  is_active        boolean DEFAULT true,
  created_at       timestamptz DEFAULT NOW()
);

-- DRIVERS
CREATE TABLE IF NOT EXISTS drivers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  phone               text,
  email               text,
  vehicle_type        text DEFAULT 'bike',
  vehicle_model       text DEFAULT '',
  vehicle_number      text DEFAULT '',
  license_number      text DEFAULT '',
  license_url         text,
  vehicle_plate_url   text,
  rc_url              text,
  profile_photo_url   text,
  status              text DEFAULT 'pending',
  is_online           boolean DEFAULT false,
  phone_confirmed     boolean DEFAULT false,
  login_method        text DEFAULT 'phone',
  rating              float DEFAULT 5.0,
  acceptance_rate     float DEFAULT 80.0,
  total_rides         integer DEFAULT 0,
  total_completed     integer DEFAULT 0,
  total_offered       integer DEFAULT 0,
  daily_cancellations integer DEFAULT 0,
  cancellation_date   date,
  rating_penalty_count integer DEFAULT 0,
  current_lat         float,
  current_lng         float,
  last_seen           timestamptz,
  created_at          timestamptz DEFAULT NOW()
);

-- RIDES
CREATE TABLE IF NOT EXISTS rides (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id        uuid REFERENCES passengers(id),
  driver_id           uuid REFERENCES drivers(id),
  pickup_address      text,
  drop_address        text,
  pickup_lat          float,
  pickup_lng          float,
  drop_lat            float,
  drop_lng            float,
  vehicle_type        text,
  distance_km         float DEFAULT 0,
  duration_min        integer DEFAULT 0,
  fare                numeric DEFAULT 0,
  platform_commission numeric DEFAULT 0,
  driver_earnings     numeric DEFAULT 0,
  payment_method      text DEFAULT 'cash',
  ride_status         text DEFAULT 'searching_driver',
  otp_code            text,
  otp_attempts        integer DEFAULT 0,
  otp_expires_at      timestamptz,
  booking_for_name    text,
  booking_for_phone   text,
  share_token         text UNIQUE,
  cancellation_reason text,
  cancelled_by        text,
  penalty_amount      numeric DEFAULT 0,
  penalty_charged     boolean DEFAULT false,
  passenger_rating    integer,
  accepted_at         timestamptz,
  started_at          timestamptz,
  completed_at        timestamptz,
  cancelled_at        timestamptz,
  created_at          timestamptz DEFAULT NOW()
);

-- DRIVER LOCATIONS
CREATE TABLE IF NOT EXISTS driver_locations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id   uuid NOT NULL REFERENCES drivers(id),
  ride_id     uuid REFERENCES rides(id),
  lat         float NOT NULL,
  lng         float NOT NULL,
  heading     float,
  speed       float,
  recorded_at timestamptz DEFAULT NOW()
);

-- CHAT MESSAGES
CREATE TABLE IF NOT EXISTS chat_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id     uuid NOT NULL REFERENCES rides(id),
  sender_id   uuid NOT NULL,
  sender_role text NOT NULL,
  message     text NOT NULL,
  read        boolean DEFAULT false,
  created_at  timestamptz DEFAULT NOW()
);

-- EMERGENCY CONTACTS
CREATE TABLE IF NOT EXISTS emergency_contacts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL,
  name       text NOT NULL,
  phone      text NOT NULL,
  relation   text DEFAULT 'family',
  role       text DEFAULT 'passenger',
  created_at timestamptz DEFAULT NOW()
);

-- SAFETY ALERTS
CREATE TABLE IF NOT EXISTS safety_alerts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id    uuid REFERENCES rides(id),
  alert_type text NOT NULL,
  details    jsonb DEFAULT '{}',
  dismissed  boolean DEFAULT false,
  created_at timestamptz DEFAULT NOW()
);

-- SAFETY REPORTS
CREATE TABLE IF NOT EXISTS safety_reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id       uuid REFERENCES rides(id),
  reporter_id   uuid NOT NULL,
  reporter_role text NOT NULL,
  report_type   text NOT NULL,
  description   text,
  location_lat  float,
  location_lng  float,
  status        text DEFAULT 'open',
  created_at    timestamptz DEFAULT NOW()
);

-- SOS EVENTS
CREATE TABLE IF NOT EXISTS sos_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id        uuid REFERENCES rides(id),
  triggered_by   uuid NOT NULL,
  triggered_role text NOT NULL,
  lat            float,
  lng            float,
  resolved       boolean DEFAULT false,
  created_at     timestamptz DEFAULT NOW()
);

-- DRIVER WALLETS
CREATE TABLE IF NOT EXISTS driver_wallets (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id              uuid UNIQUE NOT NULL REFERENCES drivers(id),
  balance                numeric DEFAULT 0,
  outstanding_commission numeric DEFAULT 0,
  total_earnings         numeric DEFAULT 0,
  updated_at             timestamptz DEFAULT NOW()
);

-- WALLET TRANSACTIONS
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id     uuid NOT NULL REFERENCES drivers(id),
  type          text NOT NULL,
  amount        numeric NOT NULL,
  balance_after numeric,
  notes         text,
  created_at    timestamptz DEFAULT NOW()
);

-- INDEXES for performance
CREATE INDEX IF NOT EXISTS idx_rides_status     ON rides(ride_status);
CREATE INDEX IF NOT EXISTS idx_rides_passenger  ON rides(passenger_id);
CREATE INDEX IF NOT EXISTS idx_rides_driver     ON rides(driver_id);
CREATE INDEX IF NOT EXISTS idx_drivers_online   ON drivers(is_online, status) WHERE is_online = true;
CREATE INDEX IF NOT EXISTS idx_drivers_location ON drivers(current_lat, current_lng) WHERE current_lat IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_drloc_ride       ON driver_locations(ride_id);
CREATE INDEX IF NOT EXISTS idx_chat_ride        ON chat_messages(ride_id);

SELECT 'All tables created successfully!' AS status;
