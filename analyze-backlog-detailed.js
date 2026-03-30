import pg from 'pg';
const { Client } = pg;

// Parse DATABASE_URL explicitly
const dbUrl = new URL(process.env.DATABASE_URL);
const client = new Client({
  user: dbUrl.username,
  password: dbUrl.password,
  host: dbUrl.hostname,
  port: dbUrl.port || 5432,
  database: dbUrl.pathname.replace('/', ''),
  ssl: { rejectUnauthorized: false },
});

async function run() {
  try {
    await client.connect();
    console.log('Connected to database\n');

    // 1. Total counts
    const totalEvents = await client.query('SELECT COUNT(*) as count FROM yabai_travel.events');
    const totalCategories = await client.query('SELECT COUNT(*) as count FROM yabai_travel.categories');

    // 2. Queue status
    const unprocessedQueue = await client.query(
      'SELECT COUNT(*) as count FROM yabai_travel.categories WHERE collected_at IS NULL AND attempt_count < 3'
    );
    const processedCategories = await client.query(
      'SELECT COUNT(*) as count FROM yabai_travel.categories WHERE collected_at IS NOT NULL'
    );
    const excludedCategories = await client.query(
      'SELECT COUNT(*) as count FROM yabai_travel.categories WHERE attempt_count >= 3 AND collected_at IS NULL'
    );

    // 3. Last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const newEventsLast7Days = await client.query(
      'SELECT COUNT(*) as count FROM yabai_travel.events WHERE updated_at >= $1',
      [sevenDaysAgo]
    );
    const newCategoriesLast7Days = await client.query(
      'SELECT COUNT(*) as count FROM yabai_travel.categories WHERE updated_at >= $1',
      [sevenDaysAgo]
    );

    // 4. Daily breakdown (last 7 days)
    const dailyBreakdown = await client.query(`
      SELECT
        DATE(updated_at) as date,
        SUM(CASE WHEN table_name = 'events' THEN 1 ELSE 0 END) as events_count,
        SUM(CASE WHEN table_name = 'categories' THEN 1 ELSE 0 END) as categories_count
      FROM (
        SELECT updated_at, 'events' as table_name FROM yabai_travel.events WHERE updated_at >= $1
        UNION ALL
        SELECT updated_at, 'categories' as table_name FROM yabai_travel.categories WHERE updated_at >= $1
      ) combined
      GROUP BY DATE(updated_at)
      ORDER BY DATE(updated_at) DESC
    `, [sevenDaysAgo]);

    // 5. Processing speed analysis (batches from logs estimate)
    const attempt1 = await client.query('SELECT COUNT(*) as count FROM yabai_travel.categories WHERE attempt_count = 1');
    const attempt2 = await client.query('SELECT COUNT(*) as count FROM yabai_travel.categories WHERE attempt_count = 2');
    const attempt3Plus = await client.query('SELECT COUNT(*) as count FROM yabai_travel.categories WHERE attempt_count >= 3');

    console.log('=== BACKLOG SUMMARY ===\n');
    console.log('| 指標 | 値 |');
    console.log('|------|------|');
    console.log(`| イベント総数 | ${totalEvents.rows[0].count} |`);
    console.log(`| カテゴリ総数 | ${totalCategories.rows[0].count} |`);
    console.log(`| 未処理キュー（attempt < 3） | ${unprocessedQueue.rows[0].count} |`);
    console.log(`| 処理済みカテゴリ | ${processedCategories.rows[0].count} |`);
    console.log(`| 処理失敗で除外（attempt >= 3） | ${excludedCategories.rows[0].count} |`);
    console.log(`| **処理率** | **${((processedCategories.rows[0].count / totalCategories.rows[0].count) * 100).toFixed(1)}%** |`);

    console.log('\n=== 直近7日の累積 ===\n');
    console.log('| 指標 | 値 |');
    console.log('|------|------|');
    console.log(`| 新規イベント | ${newEventsLast7Days.rows[0].count} |`);
    console.log(`| 新規カテゴリ | ${newCategoriesLast7Days.rows[0].count} |`);
    console.log(`| 日平均イベント | ${(newEventsLast7Days.rows[0].count / 7).toFixed(0)} |`);
    console.log(`| 日平均カテゴリ | ${(newCategoriesLast7Days.rows[0].count / 7).toFixed(0)} |`);

    console.log('\n=== 日次トレンド（直近7日） ===\n');
    console.log('| 日付 | イベント | カテゴリ |');
    console.log('|------|---------|---------|');
    dailyBreakdown.rows.forEach(row => {
      const events = row.events_count || 0;
      const categories = row.categories_count || 0;
      console.log(`| ${row.date} | ${events} | ${categories} |`);
    });

    console.log('\n=== リトライ分布 ===\n');
    console.log('| attempt_count | 件数 |');
    console.log('|---------|------|');
    console.log(`| 1回目 | ${attempt1.rows[0].count} |`);
    console.log(`| 2回目 | ${attempt2.rows[0].count} |`);
    console.log(`| 3回目以上/除外 | ${attempt3Plus.rows[0].count} |`);

    console.log('\n=== キャパシティ計算 ===\n');
    const queueSize = parseInt(unprocessedQueue.rows[0].count);
    const dailyCategoryInflow = Math.round(newCategoriesLast7Days.rows[0].count / 7);

    // From test logs, typical batch processing: ~10 items takes ~2-3 min
    // Assuming 300-400 items/hour capacity based on test patterns
    const processCapacityPerDay = 5000; // Conservative estimate: 12 hours * 400 items/hour
    const netDailyReduction = processCapacityPerDay - (dailyCategoryInflow * 2.64); // rough estimate: categories = ~2.64x events

    console.log(`| 項目 | 値 |`);
    console.log(`|------|------|`);
    console.log(`| 現在の未処理キュー | ${queueSize} |`);
    console.log(`| 日次新規カテゴリ流入 | ${dailyCategoryInflow} |`);
    console.log(`| 推定処理キャパ（/日） | ${processCapacityPerDay} |`);
    if (netDailyReduction > 0) {
      console.log(`| **推定クリア日数** | **${Math.ceil(queueSize / netDailyReduction)}日** |`);
    } else {
      console.log(`| **推定クリア日数** | **追いつけない（要最適化）** |`);
    }

    await client.end();
  } catch (err) {
    console.error('Error:', err.message);
    console.error('Full error:', err);
    process.exit(1);
  }
}

run();
