# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**yabai.travel** — エンデュランス系大会（トレラン・スパルタン・ハイロックス等）の情報＋参戦ロジスティクスを提供する統合ポータルサイト。

- フロント: React 19 + TypeScript + Vite（Vercel デプロイ）
- DB: Supabase（スキーマ: `yabai_travel`）
- クロール: Node.js スクリプト群 + Anthropic SDK（LLM 抽出）
- チケット管理: **GitHub Issues のみ**（Linear・Notion 等の外部ツールは使わない）

## Commands

```bash
npm run dev           # 開発サーバー起動
npm run build         # DB マイグレーション → TypeScript ビルド → Vite ビルド
npm run build:skip-db # DB なしでビルド（マイグレーション不要時）
npm run lint          # ESLint
npm run test          # Vitest（全テスト）
npm run test:watch    # Vitest（ウォッチモード）

# DB操作
npm run db:migrate    # マイグレーション実行
npm run db:seed       # seed.json 投入（※既存データ全削除してから投入。ローカルリセット時のみ）
npm run db:reset      # DB リセット

# クロール
npm run crawl:run     # 収集スクリプト実行（本番データ投入推奨）
npm run crawl:fetch-all  # 全URL取得

# デプロイ監視
npm run deploy:watch  # Vercel デプロイ状況ウォッチ
```

単一テストファイルの実行:
```bash
npx vitest run src/pages/EventDetail.test.tsx
```

## Architecture

### フロントエンド

- `src/App.tsx` — ルーティング定義（react-router-dom v7）
- `src/pages/EventList.tsx` — 大会一覧（絞り込み付き）
- `src/pages/EventDetail.tsx` — 大会詳細
- `src/pages/CategoryDetail.tsx` — カテゴリ詳細
- `src/types/event.ts` — DB テーブル対応の TypeScript 型定義（Event, Category, AccessRoute, Accommodation）
- `src/lib/supabaseClient.ts` — Supabase クライアント（スキーマ `yabai_travel` 固定）

### バックエンド（クロールスクリプト群）

4種のスクリプトで構成（設計書: `docs/SPEC_BACKEND_FLOW.md`）:

| スクリプト | 役割 |
|-----------|------|
| `scripts/crawl/collect-races.js` | ① 各ソースからレース名・URL 収集 → `events` 投入 |
| `scripts/crawl/enrich-detail.js` | ② 公式ページ + LLM でカテゴリ・詳細収集 |
| `scripts/crawl/enrich-logi.js` | ③ アクセス・宿泊情報収集（東京起点） |
| `scripts/crawl/orchestrator.js` | ④ ②③を並列5件で全未処理を消化する司令塔 |

オーケストレータは GitHub Actions（`.github/workflows/crawl.yml`）で毎日 02:00 JST に自動実行。

### DB スキーマ（`yabai_travel`）

主要テーブル:
- `events` — 大会（1大会=1レコード）。`official_url` or `(name, event_date)` でユニーク
- `categories` — カテゴリ（`event_id` FK）
- `access_routes` — アクセス情報（往路/復路）
- `accommodations` — 宿泊情報
- `change_requests` — 課金ユーザーからの変更提案

**データ格納原則**: 確定情報のみ INSERT。既存レコードは上書き禁止。空フィールドへの追加のみ可。

### 環境変数

認証情報は `.env`（gitignore 済み）に記載する。`.env.example` を参照。

```
# フロントエンド（VITE_ プレフィックス必須）
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_SUPABASE_SCHEMA      # 本番: yabai_travel / ステージング: yabai_travel_staging

# サーバーサイド
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_ACCESS_TOKEN     # Management API 用（スキーマ作成・PostgREST設定など）
SUPABASE_PROJECT_REF      # Management API 用（Supabase プロジェクト ref）
ANTHROPIC_API_KEY         # クロールスクリプトの LLM 抽出用
GOOGLE_DIRECTIONS_API_KEY # ロジ収集用
DATABASE_URL              # マイグレーション・クロール用（PostgreSQL 直接接続）
```

### Supabase 操作ルール

- **スキーマ作成・PostgREST 設定変更など DDL 操作**: `scripts/supabase-api.js` の Management API 経由で自動実行する。ダッシュボードでの手動操作・SQL コピペは禁止。
- **データ操作（INSERT/UPDATE）**: クロールスクリプトから `DATABASE_URL` 経由で実行。
- **スキーマ分離**: 本番 `yabai_travel` / ステージング `yabai_travel_staging` を同一 Supabase プロジェクト内で管理する。

```bash
# Management API で SQL 実行する例
import { queryManagementAPI, updatePostgrest } from './scripts/supabase-api.js'
await queryManagementAPI('CREATE SCHEMA IF NOT EXISTS yabai_travel_staging')
await updatePostgrest(['yabai_travel', 'yabai_travel_staging'])
```

## 開発ワークフロー

### チケット駆動フロー

```
[ユーザーがやりたいことを伝える]
        ↓
[チケット作成 + pending-review]
        ↓
[ユーザーが内容確認 → 「問題ない」]
        ↓
[approved に変更]
        ↓
[ユーザーが「#XX 実装して」と指示]
        ↓
[実装 + 単体テスト → staging デプロイ → デプロイ完了監視]
        ↓
[staging-deployed に変更]
        ↓
[ユーザーがステージングで確認 → 「問題ない」]
        ↓
[staging-ok に変更]
        ↓
[ユーザーが「#XX main に出して」と指示]
        ↓
[main デプロイ → デプロイ完了監視 → エラーなし確認]
        ↓
[done を付与してクローズ]
```

### ラベル定義

| ラベル | 意味 | 遷移トリガー |
|--------|------|-------------|
| `pending-review` | チケット作成済み・ユーザーレビュー待ち | チケット作成時に付与 |
| `approved` | 内容確認OK・実装指示待ち | ユーザーが「問題ない」等と言った時 |
| `in-progress` | 実装中 | ユーザーが「#XX 実装して」と言った時 |
| `staging-deployed` | ステージングデプロイ完了・ユーザー確認待ち | staging デプロイ完了後 |
| `staging-ok` | ステージング確認OK・main デプロイ待ち | ユーザーが staging 確認OKを伝えた時 |
| `done` | 完了 | main デプロイ完了確認後にクローズ時付与 |

### 各ステップのルール

**チケット作成（pending-review）**
- チケットは必ず **GitHub Issues** で管理する。Linear・Notion 等の外部ツールは使わない
- ユーザーがやりたいことを伝えたら内容を整理してチケットを作成する
- 五月雨に伝えられた場合もまとめてチケット化してよい
- 実装指示があってもチケットが存在しない場合は、先にチケットを作成してから実装する

**実装（in-progress → staging-deployed）**
- ユーザーが「#XX 実装して」と指定したら実装開始
- `approved` ラベルがなくても、ユーザーからの明示的な実装指示があれば実装してよい
- 実装開始時に `in-progress` に変更する
- 実装完了後、単体テストを実行してすべて通ることを確認する
- `staging` ブランチにデプロイし、`npm run deploy:watch` 等でデプロイ完了を監視する
- staging デプロイ完了後、SAST・SCA を実行（指示なしで自動実行すること）:
  1. SAST: `gh workflow run sast-semgrep.yml` → アーティファクトからレポート取得・解析
  2. SCA: `gh workflow run sca-npm-audit.yml` → アーティファクトからレポート取得・解析
- レポートを解析し、改善が必要な問題があれば Issue 化 → 対応 → 再スキャンを繰り返す
- すべてのスキャンで新規 Issue なし → `staging-deployed` に変更してユーザーに報告する

**main デプロイ（staging-ok → done）**
- ユーザーが「#XX main に出して」と指示したら main にデプロイする
- デプロイ完了後、DAST を本番 URL で実行（指示なしで自動実行すること）:
  - `gh workflow run dast-zap.yml --field target_url="https://yabai-travel.vercel.app"`
  - ※ staging は Vercel パスワード保護により DAST 対象外（認証チャレンジしか見えないため）
- レポートを解析し、改善が必要な問題があれば Issue 化する（FAIL は必須対応、WARN はチケット化して別途対応）
- デプロイ完了・エラーなし確認後、`done` を付与してチケットをクローズする

### デプロイ

- `staging` ブランチ → Vercel プレビュー（ステージング）
- `main` ブランチ → Vercel 本番
- 「デプロイして」「プッシュして」= `staging` のみ。本番は「本番環境に移して」と明示された場合のみ

### DB マイグレーション

`npm run build` 実行時に自動でマイグレーションが走る。`staging` へのデプロイ時はビルドフックで適用される。

## 重要な制約

- `npm run db:seed` は **既存データを全削除してから投入**するため、本番・ステージングでは絶対に実行しない
- クロールスクリプトでは `collected_at IS NULL` のレコードのみを処理対象とする（冪等性確保）
- `spec-driven-root/` はテンプレートリポジトリのサブディレクトリ。本プロジェクトのコードは含まない

## 参照ドキュメント

詳細仕様は `docs/` 配下を参照:
- `OUTLINE.md` — プロジェクト概要
- `SPEC_DATA_STRUCTURE.md` — テーブル設計・更新原則
- `SPEC_BACKEND_FLOW.md` — クロールスクリプト全体フロー
- `SPEC_CRAWL_ORCHESTRATOR.md` — GitHub Actions 設定含むオーケストレータ詳細
- `WORKFLOW.md` — チケット駆動ワークフロー詳細
