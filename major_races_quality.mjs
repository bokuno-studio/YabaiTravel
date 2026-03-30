import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://wzkjnmowrlfgvkuzyiio.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6a2pubW93cmxmZ3ZrdXp5aWlvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTIxMzAyNCwiZXhwIjoyMDg2Nzg5MDI0fQ.nQPlrDgnYL0uHYfm48BX6qCfBPKzaKc2EERfjweUd7g';

const supabase = createClient(supabaseUrl, supabaseKey, {
  db: {
    schema: 'yabai_travel'
  }
});

async function checkMajorRaces() {
  try {
    console.log('\n=== 大規模・有名レース品質チェック (2026-03-29) ===\n');
    
    const majorRaces = [
      { name: 'UTMB', keywords: ['UTMB', 'Ultra-Trail du Mont-Blanc'] },
      { name: 'Boston Marathon', keywords: ['Boston Marathon', 'ボストンマラソン'] },
      { name: 'Spartan World Championship', keywords: ['Spartan World Championship'] },
      { name: 'Spartan Race', keywords: ['Spartan', 'spartan'] },
      { name: 'Tokyo Marathon', keywords: ['Tokyo Marathon', '東京マラソン'] },
      { name: 'New York Marathon', keywords: ['New York Marathon'] },
      { name: 'London Marathon', keywords: ['London Marathon'] },
      { name: 'Berlin Marathon', keywords: ['Berlin Marathon'] },
      { name: 'Western States 100', keywords: ['Western States'] },
      { name: 'Four Deserts', keywords: ['Four Deserts', 'Gobi', 'Atacama', 'Kalahari', 'Sahara'] }
    ];
    
    for (const race of majorRaces) {
      console.log(`\n【${race.name}】`);
      
      let allRaces = [];
      for (const keyword of race.keywords) {
        const { data, error } = await supabase
          .from('events')
          .select('*')
          .ilike('name', `%${keyword}%`);
        
        if (data) {
          allRaces = [...allRaces, ...data];
        }
      }
      
      // 重複排除
      const uniqueRaces = Array.from(
        new Map(allRaces.map(r => [r.id, r])).values()
      );
      
      console.log(`検出: ${uniqueRaces.length} 件`);
      
      if (uniqueRaces.length === 0) {
        console.log('  ⚠️  クロール漏れの可能性');
      } else {
        // 品質チェック
        const withoutUrl = uniqueRaces.filter(r => !r.official_url).length;
        const withoutCategory = uniqueRaces.filter(r => !r.race_type || r.race_type === 'unknown').length;
        const incomplete = uniqueRaces.filter(r => 
          !r.description || !r.location || !r.event_date
        ).length;
        
        console.log(`  - official_url NULL: ${withoutUrl}/${uniqueRaces.length}`);
        console.log(`  - race_type 未分類: ${withoutCategory}/${uniqueRaces.length}`);
        console.log(`  - 説明/場所/日付不足: ${incomplete}/${uniqueRaces.length}`);
        
        // 実例表示
        uniqueRaces.slice(0, 3).forEach(r => {
          console.log(`    • ${r.name}`);
          console.log(`      URL: ${r.official_url ? '✅' : '❌'} | Type: ${r.race_type || 'null'}`);
        });
      }
    }
    
    // カテゴリ別の大規模レース分析
    console.log('\n\n=== 参加人口多いカテゴリの品質分析 ===\n');
    
    const categories = [
      { name: 'Marathon', type: 'marathon', count: 0 },
      { name: 'Trail Run', type: 'trail', count: 0 },
      { name: 'Ultra Marathon', type: 'ultra', count: 0 },
      { name: 'OCR/Spartan', type: 'spartan', count: 0 }
    ];
    
    for (const cat of categories) {
      const { data, error, count } = await supabase
        .from('events')
        .select('*', { count: 'exact' })
        .eq('race_type', cat.type);
      
      if (data) {
        const urlMissing = data.filter(r => !r.official_url).length;
        const descMissing = data.filter(r => !r.description || r.description === '').length;
        
        console.log(`【${cat.name}】 ${count} 件`);
        console.log(`  official_url 未取得: ${urlMissing} 件 (${((urlMissing/count)*100).toFixed(1)}%)`);
        console.log(`  description 未取得: ${descMissing} 件 (${((descMissing/count)*100).toFixed(1)}%)`);
        
        // サンプル抽出
        const withoutUrl = data.filter(r => !r.official_url);
        if (withoutUrl.length > 0) {
          console.log(`  未取得サンプル: ${withoutUrl.slice(0, 2).map(r => r.name).join(', ')}`);
        }
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

checkMajorRaces();
