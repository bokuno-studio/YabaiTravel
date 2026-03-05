-- yabai_travel スキーマにテーブルを作成

set search_path to yabai_travel, public;

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_date date not null,
  location text,
  official_url text,
  entry_url text,
  race_type text,
  participant_count integer,
  weather_history jsonb,
  weather_forecast text,
  entry_start date,
  entry_end date,
  entry_start_typical date,
  entry_end_typical date,
  reception_place text,
  start_place text,
  prohibited_items text,
  course_map_url text,
  furusato_nozei_url text,
  collected_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  name text not null,
  elevation_gain integer,
  start_time time,
  reception_end time,
  reception_place text,
  start_place text,
  finish_rate real,
  time_limit interval,
  cutoff_times jsonb,
  required_pace text,
  required_climb_pace text,
  mandatory_gear text,
  recommended_gear text,
  prohibited_items text,
  poles_allowed boolean,
  entry_fee integer,
  collected_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists access_routes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  direction text not null, -- 'outbound' | 'return'
  route_detail text,
  total_time_estimate text,
  cost_estimate text,
  cash_required boolean,
  booking_url text,
  shuttle_available text,
  taxi_estimate text,
  updated_at timestamptz default now()
);

create table if not exists accommodations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  recommended_area text,
  avg_cost_3star integer,
  updated_at timestamptz default now()
);

create table if not exists change_requests (
  id uuid primary key default gen_random_uuid(),
  target_type text not null,
  target_id uuid not null,
  target_field text not null,
  proposed_value text,
  status text not null default 'pending',
  created_at timestamptz default now(),
  reviewed_at timestamptz
);

