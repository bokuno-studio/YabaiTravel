/** ステイタス（宿泊）判定 */
export type StayStatus = 'day_trip' | 'pre_stay_required' | 'post_stay_recommended'

/** 一覧用: カテゴリを埋め込んだ大会 */
export type EventWithCategories = Event & {
  categories?: Category[]
}

/** yabai_travel.events テーブルの型 */
export type Event = {
  id: string
  name: string
  event_date: string
  location: string | null
  official_url: string | null
  entry_url: string | null
  race_type: string | null
  participant_count: number | null
  stay_status: StayStatus | null
  weather_history: unknown
  weather_forecast: string | null
  entry_start: string | null
  entry_end: string | null
  entry_start_typical: string | null
  entry_end_typical: string | null
  reception_place: string | null
  start_place: string | null
  prohibited_items: string | null
  course_map_url: string | null
  furusato_nozei_url: string | null
  collected_at: string | null
  updated_at: string | null
}

/** yabai_travel.access_routes テーブルの型 */
export type AccessRoute = {
  id: string
  event_id: string
  direction: 'outbound' | 'return'
  route_detail: string | null
  total_time_estimate: string | null
  cost_estimate: string | null
  cash_required: boolean | null
  booking_url: string | null
  shuttle_available: string | null
  taxi_estimate: string | null
  updated_at: string | null
}

/** yabai_travel.accommodations テーブルの型 */
export type Accommodation = {
  id: string
  event_id: string
  recommended_area: string | null
  avg_cost_3star: number | null
  updated_at: string | null
}

/** yabai_travel.categories テーブルの型 */
export type Category = {
  id: string
  event_id: string
  name: string
  distance_km: number | null
  elevation_gain: number | null
  start_time: string | null
  reception_end: string | null
  reception_place: string | null
  start_place: string | null
  finish_rate: number | null
  time_limit: string | null
  cutoff_times: unknown
  required_pace: string | null
  required_climb_pace: string | null
  mandatory_gear: string | null
  recommended_gear: string | null
  prohibited_items: string | null
  poles_allowed: boolean | null
  entry_fee: number | null
  collected_at: string | null
  updated_at: string | null
}
