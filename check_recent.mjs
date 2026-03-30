import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

try {
  const result = await pool.query(`
    SELECT name, location, latitude, longitude, updated_at
    FROM yabai_travel.events
    ORDER BY updated_at DESC
    LIMIT 15
  `);

  console.log('=== 最新15件のイベント ===\n');
  const now = new Date();

  result.rows.forEach((row, i) => {
    const timestamp = new Date(row.updated_at);
    const diffMinutes = Math.round((now - timestamp) / 60000);

    console.log(`[${i+1}] ${row.name?.slice(0,45)}`);
    console.log(`    location: ${row.location?.slice(0,60) ?? 'NULL'}`);
    console.log(`    lat/lng: ${row.latitude ? `${row.latitude.toFixed(6)}, ${row.longitude.toFixed(6)}` : 'NO_LATLNG'}`);
    console.log(`    updated: ${diffMinutes}分前`);
    console.log('');
  });

  await pool.end();
} catch (err) {
  console.error('Error:', err.message);
  console.error('Full error:', err);
  process.exit(1);
}
