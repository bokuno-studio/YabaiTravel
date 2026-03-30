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
    console.log('Connected to database');

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

    // 3. Last 7 days - use updated_at which exists on both tables
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const newEventsLast7Days = await client.query(
      'SELECT COUNT(*) as count FROM yabai_travel.events WHERE updated_at >= $1',
      [sevenDaysAgo]
    );
    const newCategoriesLast7Days = await client.query(
      'SELECT COUNT(*) as count FROM yabai_travel.categories WHERE updated_at >= $1',
      [sevenDaysAgo]
    );

    console.log('\n=== BACKLOG ANALYSIS ===\n');
    console.log('イベント総数:', totalEvents.rows[0].count);
    console.log('カテゴリ総数:', totalCategories.rows[0].count);
    console.log('未処理キュー (attempt_count < 3):', unprocessedQueue.rows[0].count);
    console.log('処理済みカテゴリ:', processedCategories.rows[0].count);
    console.log('処理失敗で除外 (attempt_count >= 3):', excludedCategories.rows[0].count);
    console.log('\n=== 直近7日 ===\n');
    console.log('新規イベント:', newEventsLast7Days.rows[0].count);
    console.log('新規カテゴリ:', newCategoriesLast7Days.rows[0].count);

    await client.end();
  } catch (err) {
    console.error('Error:', err.message);
    console.error('Full error:', err);
    process.exit(1);
  }
}

run();
