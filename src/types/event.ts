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
