import { useParams, Link } from 'react-router-dom'
import '../App.css'

const GUIDES: Record<string, { ja: { title: string; body: string }; en: { title: string; body: string } }> = {
  marathon: {
    ja: {
      title: 'マラソン',
      body: `マラソンはロード（舗装路）を走るランニング競技です。フルマラソン（42.195km）、ハーフマラソン（21.0975km）、10km、5km など様々な距離があります。

初心者でも参加しやすい大会が多く、ウルトラマラソン（100km以上）まで挑戦の幅が広いのが特徴です。

【必要な装備】
・ランニングシューズ（ロード用）
・ウェア（速乾素材）
・GPSウォッチ（任意）

【初めての方へ】
まずは5kmや10kmの大会からスタートするのがおすすめ。練習期間は3ヶ月程度あれば十分です。`,
    },
    en: {
      title: 'Marathon',
      body: `Marathon is a road running event on paved surfaces. Distances range from 5K, 10K, Half Marathon (21.1km) to Full Marathon (42.195km) and beyond (Ultra Marathon 100km+).

It's the most accessible endurance sport with events for all levels.

【Essential Gear】
・Road running shoes
・Moisture-wicking apparel
・GPS watch (optional)

【Getting Started】
Start with a 5K or 10K event. 3 months of training is sufficient for beginners.`,
    },
  },
  trail: {
    ja: {
      title: 'トレイルランニング',
      body: `トレイルランニングは山や自然の中の未舗装路を走る競技です。距離は10km程度のショートレースから、100マイル（160km）を超えるウルトラトレイルまで。

標高差、技術的な地形、天候変化への対応が求められ、ロードマラソンとは異なる冒険的な要素が魅力です。

【必要な装備】
・トレイルランニングシューズ（グリップ重視）
・ハイドレーションパック/ベスト
・ヘッドランプ（ナイトセクションがある場合）
・必携品（大会指定のレインウェア、エマージェンシーキット等）

【初めての方へ】
まずは20km以下のショートトレイルから。山での走り方に慣れることが大切です。`,
    },
    en: {
      title: 'Trail Running',
      body: `Trail running takes you off-road into mountains and nature. Distances range from short 10K trails to ultra-trails over 100 miles (160km).

The sport demands navigation of elevation changes, technical terrain, and weather — offering an adventurous experience beyond road running.

【Essential Gear】
・Trail running shoes (grip-focused)
・Hydration pack/vest
・Headlamp (for night sections)
・Mandatory gear (rain jacket, emergency kit per race rules)

【Getting Started】
Begin with trails under 20K. Learning to run on varied terrain is key.`,
    },
  },
  triathlon: {
    ja: {
      title: 'トライアスロン',
      body: `トライアスロンはスイム・バイク・ランの3種目を連続して行う複合競技です。

距離は Sprint（スイム750m/バイク20km/ラン5km）から Ironman（スイム3.8km/バイク180km/ラン42.2km）まで。

【必要な装備】
・スイム: ウェットスーツ、ゴーグル
・バイク: ロードバイク or TTバイク、ヘルメット
・ラン: ランニングシューズ
・トランジション用品

【初めての方へ】
Sprint distance から始めるのがおすすめ。3種目それぞれの基礎練習を並行して行いましょう。`,
    },
    en: {
      title: 'Triathlon',
      body: `Triathlon combines swimming, cycling, and running in one continuous race.

Distances range from Sprint (750m swim / 20km bike / 5km run) to Ironman (3.8km swim / 180km bike / 42.2km run).

【Essential Gear】
・Swim: Wetsuit, goggles
・Bike: Road or TT bike, helmet
・Run: Running shoes
・Transition gear

【Getting Started】
Start with Sprint distance. Train all three disciplines in parallel.`,
    },
  },
  spartan: {
    ja: {
      title: 'スパルタンレース',
      body: `スパルタンレースは世界最大の障害物レース（OCR）シリーズです。コース上に設置された障害物（壁越え、ロープクライム、槍投げ等）をクリアしながらゴールを目指します。

カテゴリは Sprint（5km/20障害物）、Super（10km/25障害物）、Beast（21km/30障害物）、Ultra（50km/60障害物）。

【必要な装備】
・グリップ力のあるシューズ（トレイルシューズ推奨）
・動きやすいウェア（泥だらけになります）
・グローブ（任意）

【初めての方へ】
Sprint から始めましょう。障害物を失敗してもバーピー（罰則運動）で代替できるので、完走は誰でも可能です。`,
    },
    en: {
      title: 'Spartan Race',
      body: `Spartan Race is the world's largest obstacle course racing (OCR) series. Navigate obstacles like wall climbs, rope climbs, and spear throws across varied terrain.

Categories: Sprint (5km/20 obstacles), Super (10km/25), Beast (21km/30), Ultra (50km/60).

【Essential Gear】
・Grippy shoes (trail shoes recommended)
・Flexible clothing (you'll get muddy)
・Gloves (optional)

【Getting Started】
Start with Sprint. Failed obstacles can be replaced with burpees, so anyone can finish.`,
    },
  },
  hyrox: {
    ja: {
      title: 'HYROX',
      body: `HYROX は「フィットネスレース」として急成長中の競技です。1km ランニング × 8本の間に、ファンクショナルトレーニング（スキーエルゴ、ソリ押し、ファーマーズキャリー等）8種目を挟む構成。

室内開催のため天候に左右されず、初心者からエリートまで同じフォーマットで競えます。

【必要な装備】
・室内用ランニングシューズ
・グローブ（任意）
・速乾ウェア

【初めての方へ】
ジムでのファンクショナルトレーニングに慣れていれば十分参加可能。ペアカテゴリもあるので友人と一緒に始められます。`,
    },
    en: {
      title: 'HYROX',
      body: `HYROX is a fast-growing "fitness race" format. It alternates 8 × 1km runs with 8 functional exercises (ski erg, sled push, farmer's carry, etc.).

Held indoors, weather-independent, and accessible to all fitness levels.

【Essential Gear】
・Indoor running shoes
・Gloves (optional)
・Moisture-wicking apparel

【Getting Started】
If you're familiar with functional fitness, you're ready. Doubles category lets you race with a partner.`,
    },
  },
  obstacle: {
    ja: {
      title: 'オブスタクルレース（OCR）',
      body: `OCR（Obstacle Course Racing）は、コース上の様々な障害物を乗り越えながらゴールを目指す競技の総称です。スパルタンレース、Tough Mudder、Strong Viking 等が代表的なシリーズ。

泥・水・高所・重量物など、日常では味わえない体験ができるのが最大の魅力です。

【必要な装備】
・グリップ重視のシューズ
・汚れてもいい服装
・着替え一式

【初めての方へ】
多くの大会は初心者カテゴリがあります。完走率は高く、仲間と楽しむイベント要素が強いです。`,
    },
    en: {
      title: 'Obstacle Course Racing (OCR)',
      body: `OCR involves navigating various obstacles — mud, water, heights, heavy carries — while running a course. Major series include Spartan Race, Tough Mudder, and Strong Viking.

The unique physical challenges make it an unforgettable experience.

【Essential Gear】
・Grippy shoes
・Clothes you don't mind getting dirty
・Change of clothes

【Getting Started】
Most events have beginner categories with high completion rates. It's as much a social event as a race.`,
    },
  },
  cycling: {
    ja: {
      title: 'サイクリング',
      body: `エンデュランス系サイクリングには、ロードレース、クリテリウム、ヒルクライム、ロングライド、グラベルレースなど多様なカテゴリがあります。

自転車1台あれば始められ、長距離を移動する爽快感は他のスポーツにない魅力です。

【必要な装備】
・ロードバイク or グラベルバイク
・ヘルメット（必須）
・サイクルウェア
・パンク修理キット

【初めての方へ】
エンデューロ（周回コース）やファンライドイベントが参加しやすいです。`,
    },
    en: {
      title: 'Cycling',
      body: `Endurance cycling includes road races, criteriums, hill climbs, long rides, and gravel races.

All you need is a bike, and the thrill of covering long distances is unmatched.

【Essential Gear】
・Road or gravel bike
・Helmet (mandatory)
・Cycling apparel
・Puncture repair kit

【Getting Started】
Enduro (circuit) events and fun rides are beginner-friendly.`,
    },
  },
  duathlon: {
    ja: {
      title: 'デュアスロン',
      body: `デュアスロンはラン→バイク→ランの3セグメントで構成される複合競技です。トライアスロンからスイムを除いた形式で、泳ぎが苦手な方でもマルチスポーツに挑戦できます。

【必要な装備】
・ランニングシューズ
・ロードバイク + ヘルメット
・トランジション用品

【初めての方へ】
ランとバイクの2種目なので、トライアスロンより敷居が低いです。`,
    },
    en: {
      title: 'Duathlon',
      body: `Duathlon consists of Run → Bike → Run. It's multisport without the swim, making it accessible for non-swimmers.

【Essential Gear】
・Running shoes
・Road bike + helmet
・Transition gear

【Getting Started】
Lower barrier than triathlon — just run and bike.`,
    },
  },
  rogaining: {
    ja: {
      title: 'ロゲイニング',
      body: `ロゲイニングは地図とコンパスを使い、制限時間内にチェックポイントを巡ってポイントを競うナビゲーションスポーツです。

フォトロゲイニング（写真撮影型）はスマホだけで参加可能で、観光要素もあり初心者に人気です。

【必要な装備】
・動きやすい服装とシューズ
・スマートフォン（フォトロゲの場合）
・地図読み能力（本格的なロゲイニング）

【初めての方へ】
フォトロゲイニングイベントから始めましょう。街歩き感覚で楽しめます。`,
    },
    en: {
      title: 'Rogaining',
      body: `Rogaining is a navigation sport using maps and compasses to visit checkpoints within a time limit.

Photo-rogaining (using smartphones) is popular with beginners and combines sightseeing with competition.

【Essential Gear】
・Comfortable clothing and shoes
・Smartphone (for photo rogaining)
・Map reading skills (for serious rogaining)

【Getting Started】
Try a photo-rogaining event first — it's like a fun urban scavenger hunt.`,
    },
  },
  adventure: {
    ja: {
      title: 'アドベンチャーレース',
      body: `アドベンチャーレースはチーム制の長距離複合レースです。トレッキング、MTB、パドリング（カヤック等）、ロープワーク、ナビゲーションなど、多様なアウトドアスキルが求められます。

数時間のスプリントから数日間に及ぶエクスペディションまで、スケールも様々です。

【必要な装備】
・多数（レースにより異なる）
・チームメイト（2〜4人）

【初めての方へ】
まずはスプリント（3〜6時間）のレースを探しましょう。チームで挑戦する一体感が最大の魅力です。`,
    },
    en: {
      title: 'Adventure Racing',
      body: `Adventure racing is a team-based multidiscipline endurance event combining trekking, mountain biking, paddling (kayak), rope work, and navigation.

Events range from sprint (3-6 hours) to multi-day expeditions.

【Essential Gear】
・Varies greatly by race
・Teammates (2-4 people)

【Getting Started】
Find a sprint-format race. The team camaraderie is the biggest draw.`,
    },
  },
}

function SportGuide() {
  const { lang, sport } = useParams<{ lang: string; sport: string }>()
  const langPrefix = `/${lang || 'ja'}`
  const isEn = lang === 'en'

  const guide = sport ? GUIDES[sport] : null
  if (!guide) {
    return (
      <div className="event-list-page">
        <p>{isEn ? 'Guide not found.' : 'ガイドが見つかりません。'}</p>
        <Link to={langPrefix}>{isEn ? 'Back to list' : '一覧に戻る'}</Link>
      </div>
    )
  }

  const content = isEn ? guide.en : guide.ja

  return (
    <div className="event-list-page">
      <title>{content.title} {isEn ? '- Sports Guide | yabai.travel' : '- スポーツガイド | yabai.travel'}</title>
      <meta name="description" content={isEn ? `${content.title} guide - gear, tips, and getting started.` : `${content.title}ガイド - 必要な装備・始め方・レース情報。`} />
      <header className="app-header">
        <h1><Link to={langPrefix} style={{ textDecoration: 'none', color: 'inherit' }}>yabai.travel</Link></h1>
        <p className="app-subtitle">{isEn ? 'Sports Guide' : 'スポーツガイド'}</p>
      </header>

      <article style={{ maxWidth: '720px' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>{content.title}</h2>
        <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.8', color: '#334155', fontSize: '0.95rem' }}>
          {content.body}
        </div>

        <div style={{ marginTop: '2rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <p style={{ margin: 0, fontSize: '0.9rem' }}>
            <Link to={`${langPrefix}?type=${sport}`} style={{ color: '#3b82f6', textDecoration: 'none' }}>
              → {isEn ? `View ${content.title} events` : `${content.title}のレース一覧を見る`}
            </Link>
          </p>
        </div>
      </article>

      <p style={{ marginTop: '2rem' }}>
        <Link to={langPrefix} style={{ color: '#3b82f6', textDecoration: 'none', fontSize: '0.9rem' }}>
          ← {isEn ? 'Back to list' : '一覧に戻る'}
        </Link>
      </p>
    </div>
  )
}

export default SportGuide
