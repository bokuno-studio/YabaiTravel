import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://wzkjnmowrlfgvkuzyiio.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6a2pubW93cmxmZ3ZrdXp5aWlvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTIxMzAyNCwiZXhwIjoyMDg2Nzg5MDI0fQ.nQPlrDgnYL0uHYfm48BX6qCfBPKzaKc2EERfjweUd7g';

const supabase = createClient(supabaseUrl, supabaseKey, {
  db: {
    schema: 'yabai_travel'
  }
});

async function investigateIssues() {
  try {
    console.log('\n=== Issue 調査レポート ===\n');
    
    // #450: デビルズサーキット（Devil's Circuit）0件
    console.log('【 #450 】デビルズサーキット（Devil\'s Circuit）が0件\n');
    
    const { data: devilsCircuit, error: err450 } = await supabase
      .from('events')
      .select('*')
      .ilike('name', '%devil%');
    
    if (err450) {
      console.log('Error:', err450.message);
    } else {
      console.log(`検索結果: ${devilsCircuit?.length || 0} 件`);
      if (devilsCircuit && devilsCircuit.length > 0) {
        devilsCircuit.forEach(e => {
          console.log(`  - ${e.name} (${e.race_type})`);
        });
      } else {
        console.log('  → クロール漏れの可能性あり（名前・スペル確認が必要）');
      }
    }
    
    // #451: ストロングバイキング（Strong Viking）9月レース欠落
    console.log('\n【 #451 】ストロングバイキング（Strong Viking）の9月レース欠落\n');
    
    const { data: strongViking, error: err451 } = await supabase
      .from('events')
      .select('*')
      .ilike('name', '%strong viking%')
      .order('event_date', { ascending: true });
    
    if (err451) {
      console.log('Error:', err451.message);
    } else {
      console.log(`検索結果: ${strongViking?.length || 0} 件`);
      if (strongViking && strongViking.length > 0) {
        strongViking.forEach(e => {
          console.log(`  - ${e.name} (${e.event_date || 'N/A'})`);
        });
        console.log('\n分析:');
        const september = strongViking.filter(e => e.event_date && e.event_date.includes('-09-'));
        console.log(`  → 9月レース: ${september.length} 件`);
        if (september.length === 0) {
          console.log('  → 9月分が欠落している可能性あり');
        }
      } else {
        console.log('  → クロール対象外または名前が異なる可能性');
      }
    }
    
    // #452: 「その他」カテゴリにマラソンが混入
    console.log('\n【 #452 】「その他」カテゴリにマラソンが混入\n');
    
    const { data: other, error: err452 } = await supabase
      .from('events')
      .select('*')
      .eq('race_type', 'other');
    
    if (err452) {
      console.log('Error:', err452.message);
    } else {
      console.log(`「その他」カテゴリ: ${other?.length || 0} 件\n`);
      if (other && other.length > 0) {
        other.forEach(e => {
          console.log(`  - ${e.name}`);
          console.log(`    URL: ${e.official_url || 'N/A'}`);
        });
        
        console.log('\n分析:');
        const possibleMarathon = other.filter(e => 
          e.name && e.name.toLowerCase().includes('marathon')
        );
        console.log(`  → マラソン疑い: ${possibleMarathon.length} 件`);
        possibleMarathon.forEach(e => {
          console.log(`     - ${e.name}`);
        });
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

investigateIssues();
