import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

try {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const result = await pool.query(`
    SELECT name, location, latitude, longitude, updated_at
    FROM yabai_travel.events
    WHERE updated_at > $1
    ORDER BY updated_at DESC
    LIMIT 20
  `, [fiveMinutesAgo]);

  console.log(`=== 過去5分以内に更新されたイベント (${result.rows.length}件) ===\n`);

  if (result.rows.length === 0) {
    console.log('(該当なし)');
  } else {
    result.rows.forEach((row, i) => {
      const timestamp = new Date(row.updated_at);
      const now = new Date();
      const diffSeconds = Math.round((now - timestamp) / 1000);

      console.log(`[${i+1}] ${row.name?.slice(0,45)}`);
      console.log(`    location: ${row.location?.slice(0,60) ?? 'NULL'}`);
      console.log(`    lat/lng: ${row.latitude ? `${row.latitude.toFixed(6)}, ${row.longitude.toFixed(6)}` : 'NO_LATLNG'}`);
      console.log(`    updated: ${diffSeconds}秒前`);
      console.log('');
    });
  }

  await pool.end();
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
