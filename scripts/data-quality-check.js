import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: 'yabai_travel' }
});

async function analyzeDataQuality() {
  console.log('🔍 YabaiTravel データ品質分析 - Cycle #9');
  console.log('='.repeat(60));

  try {
    // 1. 総レース件数と基本情報
    const { data: eventsData, error: eventsError, count: totalCount } = await supabase
      .from('events')
      .select('id, name, location, official_url, event_date, race_type', { count: 'exact' });

    if (eventsError) throw eventsError;
    const totalRaces = totalCount || eventsData?.length || 0;
    console.log(`\n📊 総レース件数: ${totalRaces}`);

    // 2. enrichment率（イベント level）
    // 定義: name, location, official_url, event_date, race_type の5つ中4つ以上が埋まっている
    let eventEnrichedCount = 0;
    eventsData?.forEach(e => {
      const fieldsPopulated = [
        !!e.name,
        !!e.location,
        !!e.official_url,
        !!e.event_date,
        !!e.race_type
      ].filter(Boolean).length;
      if (fieldsPopulated >= 4) eventEnrichedCount++;
    });
    const eventEnrichmentRate = eventsData?.length > 0 
      ? ((eventEnrichedCount / eventsData.length) * 100).toFixed(1) 
      : 0;

    console.log(`\n📈 Enrichment率（イベント）: ${eventEnrichmentRate}%`);
    console.log(`   (${eventEnrichedCount}/${eventsData?.length} enriched)`);

    // 3. enrichment率（カテゴリ level）
    const { data: categoryData, error: categoryError, count: categoryCount } = await supabase
      .from('categories')
      .select('id, name, elevation_gain, start_time, entry_fee', { count: 'exact' });

    if (categoryError) throw categoryError;

    let categoryEnrichedCount = 0;
    categoryData?.forEach(c => {
      const fieldsPopulated = [
        !!c.name,
        c.elevation_gain !== null,
        !!c.start_time,
        c.entry_fee !== null
      ].filter(Boolean).length;
      if (fieldsPopulated >= 3) categoryEnrichedCount++;
    });
    const categoryEnrichmentRate = categoryData?.length > 0 
      ? ((categoryEnrichedCount / categoryData.length) * 100).toFixed(1) 
      : 0;

    console.log(`\n📈 Enrichment率（カテゴリ）: ${categoryEnrichmentRate}%`);
    console.log(`   (${categoryEnrichedCount}/${categoryCount} enriched)`);

    // 4. official_url 汚染率
    // 定義: https:// または http:// で始まらない、または空の場合を汚染と判定
    const officialUrlInvalid = eventsData?.filter(e => {
      if (!e.official_url) return true; // 空も汚染
      const isValidFormat = /^https?:\/\//.test(e.official_url);
      return !isValidFormat;
    }).length || 0;

    const officialUrlPollutionRate = eventsData?.length > 0 
      ? ((officialUrlInvalid / eventsData.length) * 100).toFixed(1) 
      : 0;

    console.log(`\n⚠️  official_url 汚染率: ${officialUrlPollutionRate}%`);
    console.log(`   (汚染: ${officialUrlInvalid} / 全体: ${eventsData?.length})`);

    // 5. ソース別レース件数（crawl_snapshots から推定）
    // NOTE: 本来はソース情報を持つフィールドが必要だが、現在のスキーマにはないため、crawl_snapshots を参照
    const { data: snapshotData, error: snapshotError } = await supabase
      .from('crawl_snapshots')
      .select('source_url');

    if (!snapshotError && snapshotData?.length > 0) {
      const sourceCount = {};
      snapshotData.forEach(s => {
        // source_url から ドメイン を抽出
        const url = s.source_url;
        let domain = 'unknown';
        try {
          const urlObj = new URL(url);
          domain = urlObj.hostname.replace('www.', '');
        } catch (e) {
          domain = url.split('/')[0];
        }
        sourceCount[domain] = (sourceCount[domain] || 0) + 1;
      });

      const sortedSources = Object.entries(sourceCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      console.log(`\n📊 ソース別クロール数（TOP10）:`);
      sortedSources.forEach(([source, count], idx) => {
        console.log(`   ${idx + 1}. ${source}: ${count}`);
      });
    }

    // 6. 前回値比較
    console.log(`\n📊 前回値との比較（Cycle #8）:`);
    console.log(`   Enrichment率（イベント）: 76.0% → ${eventEnrichmentRate}%`);
    console.log(`   Enrichment率（カテゴリ）: 46.0% → ${categoryEnrichmentRate}%`);
    console.log(`   official_url汚染率: 70.9% → ${officialUrlPollutionRate}%`);

    // 変化判定
    const eventChange = parseFloat(eventEnrichmentRate) - 76;
    const categoryChange = parseFloat(categoryEnrichmentRate) - 46;
    const urlChange = parseFloat(officialUrlPollutionRate) - 70.9;

    console.log(`\n✅ 変化度:`);
    console.log(`   イベント: ${eventChange > 0 ? '+' : ''}${eventChange.toFixed(1)}pp`);
    console.log(`   カテゴリ: ${categoryChange > 0 ? '+' : ''}${categoryChange.toFixed(1)}pp`);
    console.log(`   URL汚染: ${urlChange > 0 ? '+' : ''}${urlChange.toFixed(1)}pp`);

    console.log('\n' + '='.repeat(60));

  } catch (err) {
    console.error('❌ エラー:', err.message);
    process.exit(1);
  }
}

analyzeDataQuality();
