/**
 * マイグレーション実行
 * DATABASE_URL が設定されている場合、supabase/migrations/*.sql を順に実行
 */
import pg from 'pg';
import { readdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '../supabase/migrations');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL が設定されていません。');
  console.error('Supabase Dashboard > Project Settings > Database の Connection string を .env.local に設定してください。');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });

async function run() {
  try {
    await client.connect();
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const sql = readFileSync(join(migrationsDir, file), 'utf8');
      await client.query(sql);
      console.log(`${file}: 実行完了`);
    }
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
