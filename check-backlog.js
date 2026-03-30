import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://hrzaxlwkxfjkgwyzb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhyemF4bHdreGZqa2d3eXpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDM4MjAwMDAsImV4cCI6MTczNTM1NjAwMH0.z3v3BN4LuBp5dKUNQmZlR3KqPqVD5xK6F5p5cN5lK4I';

const supabase = createClient(supabaseUrl, supabaseKey);

async function analyzeBacklog() {
  try {
    // 1. 全イベント数
    const { count: totalEvents } = await supabase
      .from('events')
      .select('*', { count: 'exact', head: true });

    // 2. 全カテゴリ数
    const { count: totalCategories } = await supabase
      .from('categories')
      .select('*', { count: 'exact', head: true });

    // 3. 未処理カテゴリ（collected_at IS NULL AND attempt_count < 3）
    const { count: unprocessedQueue } = await supabase
      .from('categories')
      .select('*', { count: 'exact', head: true })
      .is('collected_at', null)
      .lt('attempt_count', 3);

    // 4. 処理済みカテゴリ（collected_at IS NOT NULL）
    const { count: enrichedCategories } = await supabase
      .from('categories')
      .select('*', { count: 'exact', head: true })
      .not('collected_at', 'is', null);

    // 5. 処理失敗で除外（attempt_count >= 3）
    const { count: excludedCategories } = await supabase
      .from('categories')
      .select('*', { count: 'exact', head: true })
      .gte('attempt_count', 3)
      .is('collected_at', null);

    // 6. 直近7日の新規イベント
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: newEvents7d } = await supabase
      .from('events')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', sevenDaysAgo);

    // 7. 直近7日の新規カテゴリ
    const { count: newCategories7d } = await supabase
      .from('categories')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', sevenDaysAgo);

    console.log('\n=== Cycle #9 データ滞留・処理キャパ分析 ===\n');
    console.log('## 調査2: 滞留量\n');
    console.log(`| 項目 | 数値 |`);
    console.log(`|------|------|`);
    console.log(`| イベント総数 | ${totalEvents} |`);
    console.log(`| カテゴリ総数 | ${totalCategories} |`);
    console.log(`| 未処理キュー（collected_at=NULL, attempt_count<3） | ${unprocessedQueue} |`);
    console.log(`| 処理済み（collected_at NOT NULL） | ${enrichedCategories} |`);
    console.log(`| 処理失敗で除外（attempt_count≥3） | ${excludedCategories} |`);

    console.log(`\n## 調査3: フロー分析（日平均）\n`);
    console.log(`| 項目 | 数値 |`);
    console.log(`|------|------|`);
    console.log(`| 直近7日の新規イベント | ${newEvents7d} |`);
    console.log(`| 日平均イベント追加 | ${(newEvents7d / 7).toFixed(1)} |`);
    console.log(`| 直近7日の新規カテゴリ | ${newCategories7d} |`);
    console.log(`| 日平均カテゴリ追加 | ${(newCategories7d / 7).toFixed(1)} |`);
    
    console.log(`\n## 処理キャパ計算\n`);
    const dailyAvgCategories = newCategories7d / 7;
    const daysToProcess = unprocessedQueue > 0 ? Math.ceil(unprocessedQueue / 50) : 0;
    console.log(`未処理キュー消化（--limit 50 で1バッチ=約5分）:`);
    console.log(`  - キュー数: ${unprocessedQueue}件`);
    console.log(`  - 1日あたり処理可能（6バッチ/日）: 300件`);
    console.log(`  - 消化に要する日数: 約${daysToProcess}日`);

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

analyzeBacklog();
