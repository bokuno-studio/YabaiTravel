import { RaceEvent } from './types'

export const events: RaceEvent[] = [
  {
    id: 'utmf-2026',
    name: 'Ultra-Trail Mt. Fuji',
    nameJa: 'ウルトラトレイル・マウントフジ',
    date: '2026-04-24',
    location: 'Yamanashi Prefecture',
    locationJa: '山梨県',
    prefecture: 'Yamanashi',
    raceType: 'trail',
    entryStatus: 'accepting',
    categories: [
      {
        id: 'utmf-165k',
        name: 'UTMF 165K',
        distance: '165km',
        elevation: '+7,500m',
        timeLimit: '46 hours',
        cutoffs: ['A1: 6h', 'A2: 12h', 'A3: 20h', 'A4: 28h', 'A5: 36h'],
        finishRate: 68,
        entryFee: 42000,
        description: 'The flagship 165km race around Mt. Fuji'
      },
      {
        id: 'utmf-100mi',
        name: 'KAI 70K',
        distance: '70km',
        elevation: '+3,800m',
        timeLimit: '20 hours',
        finishRate: 82,
        entryFee: 28000
      }
    ],
    description: 'One of the most prestigious trail races in Asia, circumnavigating Mt. Fuji through stunning mountain terrain.',
    descriptionJa: 'アジアで最も権威あるトレイルレースの一つ。富士山周辺の素晴らしい山岳地帯を走ります。',
    qualification: 'ITRA points required: 5 points for UTMF, 3 points for KAI',
    lastUpdated: '2026-01-15',
    access: [
      {
        id: 'utmf-out-1',
        type: 'outbound',
        from: 'Tokyo Station',
        to: 'Kawaguchiko Station',
        method: 'JR Chuo Line + Fujikyu Railway',
        duration: '2h 30min',
        cost: 2800,
        details: 'Take JR Chuo Line to Otsuki, transfer to Fujikyu Railway'
      },
      {
        id: 'utmf-out-2',
        type: 'outbound',
        from: 'Shinjuku Bus Terminal',
        to: 'Kawaguchiko Station',
        method: 'Highway Bus',
        duration: '2h',
        cost: 2000,
        details: 'Direct highway bus from Shinjuku'
      },
      {
        id: 'utmf-ret-1',
        type: 'return',
        from: 'Kawaguchiko Station',
        to: 'Tokyo Station',
        method: 'Highway Bus',
        duration: '2h',
        cost: 2000,
        details: 'Direct highway bus to Shinjuku'
      }
    ],
    accommodation: {
      id: 'utmf-accom',
      area: 'Kawaguchiko / Fujiyoshida',
      avgCostPerNight: 12000,
      recommendation: 'Book early as hotels fill up quickly during race week'
    },
    imageUrl: '/images/utmf.jpg',
    estimatedTotalCost: {
      min: 60000,
      max: 95000
    }
  },
  {
    id: 'hyrox-tokyo-2026',
    name: 'HYROX Tokyo',
    nameJa: 'ハイロックス東京',
    date: '2026-06-14',
    location: 'Tokyo Big Sight',
    locationJa: '東京ビッグサイト',
    prefecture: 'Tokyo',
    raceType: 'hyrox',
    entryStatus: 'accepting',
    categories: [
      {
        id: 'hyrox-individual',
        name: 'HYROX Individual',
        distance: '8km run + 8 workout stations',
        timeLimit: '3 hours',
        finishRate: 95,
        entryFee: 15000,
        description: '1km run between each workout station'
      },
      {
        id: 'hyrox-doubles',
        name: 'HYROX Doubles',
        distance: '8km run + 8 workout stations',
        timeLimit: '3 hours',
        finishRate: 98,
        entryFee: 12000,
        description: 'Team of 2, alternating stations'
      },
      {
        id: 'hyrox-pro',
        name: 'HYROX Pro',
        distance: '8km run + 8 workout stations',
        timeLimit: '2 hours',
        finishRate: 88,
        entryFee: 18000,
        description: 'Elite division with heavier weights'
      }
    ],
    description: 'The World Series of Fitness Racing. Complete 8 workout stations between 1km runs.',
    descriptionJa: 'フィットネスレーシングのワールドシリーズ。1kmのランの間に8つのワークアウトステーションを完了します。',
    lastUpdated: '2026-02-01',
    access: [
      {
        id: 'hyrox-out-1',
        type: 'outbound',
        from: 'Tokyo Station',
        to: 'Tokyo Big Sight',
        method: 'Rinkai Line',
        duration: '25min',
        cost: 340,
        details: 'Take Keiyo Line to Shin-Kiba, transfer to Rinkai Line'
      }
    ],
    accommodation: {
      id: 'hyrox-accom',
      area: 'Odaiba / Toyosu',
      avgCostPerNight: 15000,
      recommendation: 'Stay near Ariake or Toyosu for easy access'
    },
    estimatedTotalCost: {
      min: 20000,
      max: 45000
    }
  },
  {
    id: 'spartan-niigata-2026',
    name: 'Spartan Race Niigata',
    nameJa: 'スパルタンレース新潟',
    date: '2026-07-18',
    location: 'Myoko Kogen',
    locationJa: '妙高高原',
    prefecture: 'Niigata',
    raceType: 'spartan',
    entryStatus: 'accepting',
    categories: [
      {
        id: 'spartan-beast',
        name: 'Beast',
        distance: '21km',
        elevation: '+1,200m',
        timeLimit: '7 hours',
        finishRate: 75,
        entryFee: 22000,
        description: '30+ obstacles over mountainous terrain'
      },
      {
        id: 'spartan-super',
        name: 'Super',
        distance: '10km',
        elevation: '+600m',
        timeLimit: '4 hours',
        finishRate: 85,
        entryFee: 18000,
        description: '25+ obstacles'
      },
      {
        id: 'spartan-sprint',
        name: 'Sprint',
        distance: '5km',
        elevation: '+300m',
        timeLimit: '2 hours',
        finishRate: 92,
        entryFee: 14000,
        description: '20+ obstacles'
      }
    ],
    description: 'Test your limits on the challenging mountain course at Myoko Kogen ski resort.',
    descriptionJa: '妙高高原スキーリゾートのチャレンジングな山岳コースで限界に挑戦。',
    lastUpdated: '2026-01-20',
    access: [
      {
        id: 'spartan-out-1',
        type: 'outbound',
        from: 'Tokyo Station',
        to: 'Myoko Kogen',
        method: 'Shinkansen + Local Train',
        duration: '2h 45min',
        cost: 9800,
        details: 'Take Hokuriku Shinkansen to Joetsumyoko, then Myoko Haneuma Line'
      }
    ],
    accommodation: {
      id: 'spartan-accom',
      area: 'Myoko Kogen',
      avgCostPerNight: 8000,
      recommendation: 'Many pension-style accommodations available'
    },
    estimatedTotalCost: {
      min: 45000,
      max: 70000
    }
  },
  {
    id: 'tokyo-marathon-2026',
    name: 'Tokyo Marathon',
    nameJa: '東京マラソン',
    date: '2026-03-01',
    location: 'Tokyo',
    locationJa: '東京',
    prefecture: 'Tokyo',
    raceType: 'marathon',
    entryStatus: 'closed',
    categories: [
      {
        id: 'tokyo-full',
        name: 'Full Marathon',
        distance: '42.195km',
        timeLimit: '7 hours',
        finishRate: 96,
        entryFee: 23000,
        description: 'World Major Marathon through iconic Tokyo landmarks'
      },
      {
        id: 'tokyo-10k',
        name: '10K',
        distance: '10km',
        timeLimit: '1h 40min',
        finishRate: 99,
        entryFee: 6000,
        description: '10K race through central Tokyo'
      }
    ],
    description: 'One of the six World Marathon Majors, running through iconic Tokyo landmarks from Shinjuku to Tokyo Station.',
    descriptionJa: '世界6大マラソンの一つ。新宿から東京駅まで東京の象徴的なランドマークを駆け抜けます。',
    qualification: 'Lottery entry or charity/tour package required',
    lastUpdated: '2025-12-15',
    access: [
      {
        id: 'tokyo-out-1',
        type: 'outbound',
        from: 'Any Tokyo Station',
        to: 'Shinjuku (Start)',
        method: 'JR / Metro',
        duration: '15-30min',
        cost: 200,
        details: 'Race starts at Tokyo Metropolitan Government Building'
      }
    ],
    accommodation: {
      id: 'tokyo-accom',
      area: 'Shinjuku / Central Tokyo',
      avgCostPerNight: 18000,
      recommendation: 'Book very early - hotels fill up months in advance'
    },
    estimatedTotalCost: {
      min: 30000,
      max: 60000
    }
  },
  {
    id: 'izu-trail-2026',
    name: 'Izu Trail Journey',
    nameJa: '伊豆トレイルジャーニー',
    date: '2026-12-12',
    location: 'Izu Peninsula',
    locationJa: '伊豆半島',
    prefecture: 'Shizuoka',
    raceType: 'trail',
    entryStatus: 'accepting',
    categories: [
      {
        id: 'izu-72k',
        name: 'ITJ 72K',
        distance: '72km',
        elevation: '+3,800m',
        timeLimit: '18 hours',
        finishRate: 72,
        entryFee: 18000,
        description: 'Main race along the Izu Peninsula ridgeline'
      }
    ],
    description: 'Run along the beautiful ridgeline of the Izu Peninsula with views of Mt. Fuji and the Pacific Ocean.',
    descriptionJa: '富士山と太平洋を望む伊豆半島の美しい稜線を走ります。',
    lastUpdated: '2026-02-10',
    access: [
      {
        id: 'izu-out-1',
        type: 'outbound',
        from: 'Tokyo Station',
        to: 'Izu-kyu Shimoda Station',
        method: 'Shinkansen + Izu Kyuko',
        duration: '2h 30min',
        cost: 5500,
        details: 'Take Tokaido Shinkansen to Atami, transfer to Izu Kyuko Line'
      }
    ],
    accommodation: {
      id: 'izu-accom',
      area: 'Matsuzaki / Shimoda',
      avgCostPerNight: 10000,
      recommendation: 'Ryokan with onsen recommended for recovery'
    },
    imageUrl: '/images/izu.jpg',
    estimatedTotalCost: {
      min: 40000,
      max: 65000
    }
  },
  {
    id: 'ontake-100-2026',
    name: 'Ontake 100',
    nameJa: 'OSJ おんたけ100',
    date: '2026-07-04',
    location: 'Nagano Prefecture',
    locationJa: '長野県',
    prefecture: 'Nagano',
    raceType: 'ultra',
    entryStatus: 'waitlist',
    categories: [
      {
        id: 'ontake-100mi',
        name: 'Ontake 100 Mile',
        distance: '161km',
        elevation: '+9,000m',
        timeLimit: '36 hours',
        finishRate: 55,
        entryFee: 38000,
        description: 'One of Japan\'s toughest 100 milers'
      },
      {
        id: 'ontake-100k',
        name: 'Ontake 100K',
        distance: '100km',
        elevation: '+5,500m',
        timeLimit: '24 hours',
        finishRate: 65,
        entryFee: 28000
      }
    ],
    description: 'A challenging 100 mile race through the mountains around Mt. Ontake with significant elevation gain.',
    descriptionJa: '御嶽山周辺の山々を走る、大きな累積標高を持つ挑戦的な100マイルレース。',
    qualification: 'Previous 100km+ finish required',
    lastUpdated: '2026-01-25',
    access: [
      {
        id: 'ontake-out-1',
        type: 'outbound',
        from: 'Nagoya Station',
        to: 'Kiso-Fukushima',
        method: 'JR Shinano Limited Express',
        duration: '1h 45min',
        cost: 4500,
        details: 'Take JR Shinano to Kiso-Fukushima Station'
      }
    ],
    accommodation: {
      id: 'ontake-accom',
      area: 'Kiso-Fukushima / Otaki',
      avgCostPerNight: 9000,
      recommendation: 'Mountain lodges available near the race venue'
    },
    estimatedTotalCost: {
      min: 55000,
      max: 85000
    }
  }
]

export const raceTypeLabels: Record<string, { en: string; ja: string }> = {
  trail: { en: 'Trail', ja: 'トレイル' },
  hyrox: { en: 'HYROX', ja: 'ハイロックス' },
  spartan: { en: 'Spartan', ja: 'スパルタン' },
  marathon: { en: 'Marathon', ja: 'マラソン' },
  ultra: { en: 'Ultra', ja: 'ウルトラ' },
  triathlon: { en: 'Triathlon', ja: 'トライアスロン' }
}

export const entryStatusLabels: Record<string, { en: string; ja: string }> = {
  accepting: { en: 'Accepting Entries', ja: 'エントリー受付中' },
  closed: { en: 'Closed', ja: '締め切り' },
  waitlist: { en: 'Waitlist', ja: 'キャンセル待ち' }
}
