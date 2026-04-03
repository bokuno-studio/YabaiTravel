const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function analyzeInvalidUrls() {
  try {
    console.log('🔍 eventsテーブルのofficial_url を分析中...\n');

    // 1. すべてのofficial_urlを取得
    const { data, error } = await supabase
      .from('events')
      .select('id, official_url');

    if (error) throw error;

    console.log(`📊 総レコード数: ${data.length}\n`);

    // 2. 無効URLのパターン分類
    const patterns = {
      facebook: [],
      portal: [],
      htmlTag: [],
      empty: [],
      validUrl: []
    };

    data.forEach(row => {
      const url = row.official_url?.trim();

      if (!url || url === '' || url === 'null') {
        patterns.empty.push(row.id);
      } else if (url.toLowerCase() === 'facebook' || url.includes('facebook.com')) {
        patterns.facebook.push({ id: row.id, url });
      } else if (/^(ランネット|スポーツエントリー|ローソン|Runnet|Sports Entry|Lawson)/i.test(url) || url.match(/^[^:\/]+$/)) {
        patterns.portal.push({ id: row.id, url });
      } else if (url.includes('<') || url.includes('img src') || url.includes('href')) {
        patterns.htmlTag.push({ id: row.id, url });
      } else if (url.startsWith('http://') || url.startsWith('https://')) {
        patterns.validUrl.push({ id: row.id, url });
      } else {
        patterns.portal.push({ id: row.id, url });
      }
    });

    // 3. 結果出力
    console.log('📋 無効URLパターン分類:\n');
    
    console.log(`❌ Facebook/SNS (${patterns.facebook.length}件):`);
    patterns.facebook.slice(0, 5).forEach(item => console.log(`   - [${item.id}] ${item.url}`));
    if (patterns.facebook.length > 5) console.log(`   ... 他 ${patterns.facebook.length - 5}件`);
    
    console.log(`\n❌ ポータルサイト名 (${patterns.portal.length}件):`);
    patterns.portal.slice(0, 5).forEach(item => console.log(`   - [${item.id}] ${item.url}`));
    if (patterns.portal.length > 5) console.log(`   ... 他 ${patterns.portal.length - 5}件`);
    
    console.log(`\n❌ HTMLタグ混在 (${patterns.htmlTag.length}件):`);
    patterns.htmlTag.slice(0, 5).forEach(item => console.log(`   - [${item.id}] ${item.url}`));
    if (patterns.htmlTag.length > 5) console.log(`   ... 他 ${patterns.htmlTag.length - 5}件`);
    
    console.log(`\n⚪ 空値/NULL (${patterns.empty.length}件)`);
    
    console.log(`\n✅ 有効なHTTP(S)URL (${patterns.validUrl.length}件)`);

    // 4. サマリー
    const invalidCount = patterns.facebook.length + patterns.portal.length + patterns.htmlTag.length + patterns.empty.length;
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📊 クリーニング対象: ${invalidCount}件 (${((invalidCount / data.length) * 100).toFixed(1)}%)`);
    console.log(`✅ 有効なURL: ${patterns.validUrl.length}件 (${((patterns.validUrl.length / data.length) * 100).toFixed(1)}%)`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    // JSON出力（次フェーズで利用）
    console.log('JSON形式での詳細:');
    console.log(JSON.stringify({
      facebook: patterns.facebook,
      portal: patterns.portal,
      htmlTag: patterns.htmlTag,
      empty: patterns.empty.length
    }, null, 2));

  } catch (err) {
    console.error('❌ エラー:', err.message);
    process.exit(1);
  }
}

analyzeInvalidUrls();
