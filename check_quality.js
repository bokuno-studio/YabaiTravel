const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://wzkjnmowrlfgvkuzyiio.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6a2pubW93cmxmZ3ZrdXp5aWlvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTIxMzAyNCwiZXhwIjoyMDg2Nzg5MDI0fQ.nQPlrDgnYL0uHYfm48BX6qCfBPKzaKc2EERfjweUd7g';

const supabase = createClient(supabaseUrl, supabaseKey);

async function collectQualityBaseline() {
  try {
    console.log('\n=== データ品質ベースライン集計 (2026-03-29) ===\n');
    
    // すべてのレースを取得
    const { data: allRaces, error, count } = await supabase
      .from('races')
      .select('*', { count: 'exact' });
    
    if (error) {
      console.error('Error fetching races:', error);
      return;
    }
    
    const totalCount = count;
    console.log(`1. イベント総数: ${totalCount}`);
    
    // 2. official_url が NULL の件数
    const nullCount = allRaces.filter(r => !r.official_url).length;
    console.log(`2. official_url が NULL: ${nullCount} 件 (${((nullCount/totalCount)*100).toFixed(1)}%)`);
    
    // 3. アグリゲーター URL が入っている件数
    const aggregators = ['iko-yo.net', 'sportsentry.ne.jp', 'moshicom.com', 'e-moshicom.com', 'duv.org'];
    let aggregatorCount = 0;
    
    allRaces.forEach(race => {
      if (race.official_url && aggregators.some(agg => race.official_url.includes(agg))) {
        aggregatorCount++;
      }
    });
    
    console.log(`3. アグリゲーター URL が入っている件数: ${aggregatorCount} 件 (${((aggregatorCount/totalCount)*100).toFixed(1)}%)`);
    
    // 4. カテゴリ別イベント件数
    const categoryCount = {};
    allRaces.forEach(race => {
      const cat = race.category || 'unknown';
      categoryCount[cat] = (categoryCount[cat] || 0) + 1;
    });
    
    console.log(`\n4. カテゴリ別イベント件数:`);
    Object.entries(categoryCount)
      .sort((a, b) => b[1] - a[1])
      .forEach(([cat, count]) => {
        console.log(`   ${cat}: ${count} 件 (${((count/totalCount)*100).toFixed(1)}%)`);
      });
    
    // 5. enrich 関連ステータスの分布
    const enrichStatus = {};
    allRaces.forEach(race => {
      const status = race.enrich_status || 'null';
      enrichStatus[status] = (enrichStatus[status] || 0) + 1;
    });
    
    console.log(`\n5. enrich 関連ステータスの分布:`);
    Object.entries(enrichStatus)
      .sort((a, b) => b[1] - a[1])
      .forEach(([status, count]) => {
        console.log(`   ${status}: ${count} 件 (${((count/totalCount)*100).toFixed(1)}%)`);
      });
    
    // 品質スコア計算
    const qualityScore = ((totalCount - nullCount - aggregatorCount) / totalCount * 100).toFixed(1);
    console.log(`\n6. 初期品質スコア（公式URL率）: ${qualityScore}%`);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

collectQualityBaseline();
