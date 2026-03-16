/** ステイタス（宿泊）判定 */
export type StayStatus = 'day_trip' | 'pre_stay_required' | 'post_stay_recommended'

/** 一覧用: カテゴリを埋め込んだ大会 */
export type EventWithCategories = Event & {
  categories?: Category[]
}

/** yabai_travel.course_map_files テーブルの型（サイト内保存） */
export type CourseMapFile = {
  id: string
  event_id: string
  file_path: string
  year: number | null
  display_name: string | null
  created_at: string | null
}

/** yabai_travel.events テーブルの型 */
export type Event = {
  id: string
  name: string
  event_date: string | null
  event_date_end?: string | null
  location: string | null
  location_en: string | null
  country: string | null
  country_en: string | null
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
  event_series_id: string | null
  total_cost_estimate: string | null
  entry_type: string | null
  required_qualification: string | null
  previous_edition_url: string | null
  visa_info: string | null
  recovery_facilities: string | null
  photo_spots: string | null
  description: string | null
  collected_at: string | null
  updated_at: string | null
  enrich_attempt_count?: number
  enrich_quality?: string | null
  // _en columns
  name_en?: string | null
  weather_forecast_en?: string | null
  reception_place_en?: string | null
  start_place_en?: string | null
  prohibited_items_en?: string | null
  total_cost_estimate_en?: string | null
  required_qualification_en?: string | null
  visa_info_en?: string | null
  recovery_facilities_en?: string | null
  photo_spots_en?: string | null
  description_en?: string | null
}

/** yabai_travel.access_routes テーブルの型 */
export type AccessRoute = {
  id: string
  event_id: string
  direction: 'outbound' | 'return'
  origin_type: 'tokyo' | 'nearest_airport'
  origin_name: string | null
  origin_airport_code: string | null
  route_detail: string | null
  total_time_estimate: string | null
  cost_estimate: string | null
  cash_required: boolean | null
  booking_url: string | null
  shuttle_available: string | null
  taxi_estimate: string | null
  transit_accessible: boolean | null
  updated_at: string | null
  // _en columns
  route_detail_en?: string | null
  shuttle_available_en?: string | null
  origin_name_en?: string | null
}

/** yabai_travel.accommodations テーブルの型 */
export type Accommodation = {
  id: string
  event_id: string
  recommended_area: string | null
  recommended_area_en: string | null
  avg_cost_3star: number | null
  updated_at: string | null
}

/** yabai_travel.categories テーブルの型 */
export type Category = {
  id: string
  event_id: string
  name: string
  stay_status: StayStatus | null
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
  entry_fee_currency: string | null
  itra_points: string | null
  collected_at: string | null
  updated_at: string | null
  // _en columns
  name_en?: string | null
  reception_place_en?: string | null
  start_place_en?: string | null
  required_pace_en?: string | null
  required_climb_pace_en?: string | null
  mandatory_gear_en?: string | null
  recommended_gear_en?: string | null
  prohibited_items_en?: string | null
}
