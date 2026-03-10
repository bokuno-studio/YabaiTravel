/**
 * Supabase Management API ユーティリティ
 * スキーマ作成・PostgREST設定変更など DDL 操作に使用する
 *
 * 使用方法:
 *   import { queryManagementAPI, updatePostgrest } from './supabase-api.js'
 *
 * 必要な環境変数（.env に記載）:
 *   SUPABASE_ACCESS_TOKEN  - https://supabase.com/dashboard/account/tokens で発行
 *   SUPABASE_PROJECT_REF   - Supabase プロジェクトの ref（URL の xxxx 部分）
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// .env または .env.local を読み込む
for (const envFile of ['.env', '.env.local']) {
  const envPath = resolve(process.cwd(), envFile);
  if (existsSync(envPath) && !process.env.SUPABASE_ACCESS_TOKEN) {
    readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    });
  }
}

const { SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF } = process.env;

function assertEnv() {
  if (!SUPABASE_ACCESS_TOKEN || !SUPABASE_PROJECT_REF) {
    console.error('SUPABASE_ACCESS_TOKEN と SUPABASE_PROJECT_REF が必要です');
    console.error('.env に記載してください（.env.example 参照）');
    process.exit(1);
  }
}

/**
 * Management API 経由で SQL を実行する
 * @param {string} sql
 */
export async function queryManagementAPI(sql) {
  assertEnv();
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => res.text());
    throw new Error(`Management API エラー: ${JSON.stringify(err)}`);
  }
  return res.json();
}

/**
 * PostgREST の exposed schemas を更新する
 * @param {string[]} schemas - 公開するスキーマ名の配列
 */
export async function updatePostgrest(schemas) {
  assertEnv();
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/postgrest`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ db_schema: schemas.join(', ') }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => res.text());
    throw new Error(`PostgREST 更新エラー: ${JSON.stringify(err)}`);
  }
  return res.json();
}
