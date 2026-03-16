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
 * PostgREST の exposed schemas を更新する（マージ方式）
 * 既存の公開スキーマを維持したまま、指定スキーマを追加する。
 * 他プロジェクトのスキーマを上書きで消す事故を防止する。
 *
 * @param {string[]} schemas - 追加で公開するスキーマ名の配列
 */
export async function updatePostgrest(schemas) {
  assertEnv();
  const url = `https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/postgrest`;
  const headers = {
    Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  };

  // 現在の設定を取得
  const getRes = await fetch(url, { headers });
  if (!getRes.ok) {
    const err = await getRes.json().catch(() => getRes.text());
    throw new Error(`PostgREST 取得エラー: ${JSON.stringify(err)}`);
  }
  const current = await getRes.json();
  const existingSchemas = (current.db_schema || 'public')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // マージ（既存 + 追加、重複除去）
  const merged = [...new Set([...existingSchemas, ...schemas])];

  const patchRes = await fetch(url, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ db_schema: merged.join(', ') }),
  });
  if (!patchRes.ok) {
    const err = await patchRes.json().catch(() => patchRes.text());
    throw new Error(`PostgREST 更新エラー: ${JSON.stringify(err)}`);
  }
  return patchRes.json();
}
