/**
 * マイグレーション実行
 * DATABASE_URL が設定されている場合、supabase/migrations/*.sql を順に実行
 * schema_migrations テーブルで適用済みを追跡し、未適用分のみ実行する（冪等性確保）
 * .env.local があれば読み込む（Vercel では DATABASE_URL を環境変数に設定）
 */
import pg from 'pg';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

// .env.local があれば読み込み（Vercel では DATABASE_URL を環境変数で設定）
const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath) && !process.env.DATABASE_URL) {
  readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  });
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '../supabase/migrations');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('');
  console.error('*** エラー: DATABASE_URL が設定されていません ***');
  console.error('');
  console.error('Vercel でデプロイする場合:');
  console.error('  Project Settings → Environment Variables → DATABASE_URL を追加');
  console.error('  値: Supabase Dashboard → Project Settings → Database → Connection string');
  console.error('');
  console.error('ローカルで実行する場合:');
  console.error('  .env.local に DATABASE_URL を設定');
  console.error('');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });

async function run() {
  try {
    await client.connect();

    // 適用済みマイグレーションを追跡するテーブルを作成（初回のみ）
    await client.query(`
      CREATE TABLE IF NOT EXISTS yabai_travel.schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    // 適用済みマイグレーション一覧を取得
    const { rows } = await client.query(
      'SELECT filename FROM yabai_travel.schema_migrations'
    );
    const applied = new Set(rows.map((r) => r.filename));

    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`${file}: スキップ（適用済み）`);
        continue;
      }
      const sql = readFileSync(join(migrationsDir, file), 'utf8');
      await client.query(sql);
      await client.query(
        'INSERT INTO yabai_travel.schema_migrations (filename) VALUES ($1)',
        [file]
      );
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
