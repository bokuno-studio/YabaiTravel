export type RaceType = 'trail' | 'hyrox' | 'spartan' | 'marathon' | 'ultra' | 'triathlon'

export type EntryStatus = 'accepting' | 'closed' | 'waitlist'

export interface RaceCategory {
  id: string
  name: string
  distance: string
  elevation?: string
  timeLimit: string
  cutoffs?: string[]
  finishRate?: number
  entryFee: number
  description?: string
}

export interface AccessRoute {
  id: string
  type: 'outbound' | 'return'
  from: string
  to: string
  method: string
  duration: string
  cost: number
  details: string
}

export interface Accommodation {
  id: string
  area: string
  avgCostPerNight: number
  recommendation?: string
}

export interface RaceEvent {
  id: string
  name: string
  nameJa?: string
  date: string
  location: string
  locationJa?: string
  prefecture?: string
  raceType: RaceType
  entryStatus: EntryStatus
  categories: RaceCategory[]
  description?: string
  descriptionJa?: string
  qualification?: string
  lastUpdated: string
  access?: AccessRoute[]
  accommodation?: Accommodation
  imageUrl?: string
  estimatedTotalCost?: {
    min: number
    max: number
  }
}
