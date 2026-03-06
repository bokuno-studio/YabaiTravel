# Supabase セットアップ（ハンズオン）

## 前提

- Organization / Project は共通利用
- 当アプリは `yabai_travel` スキーマで分離

---

## Step 1: Supabase にログイン

1. [supabase.com](https://supabase.com) を開く
2. **Sign in** → GitHub でログイン（推奨）

---

## Step 2: Organization の確認 or 作成

1. 左メニュー **Organization** を確認
2. 既存の Org を使う場合 → そのまま
3. 新規の場合 → **New organization** で作成（名前は任意、例: 個人用なら `personal`）

---

## Step 3: Project の確認 or 作成

1. 左メニュー **Project** を確認
2. **共通で使う Project** が既にある場合 → それを選択
3. 新規の場合 → **New Project**
   - Name: 任意（例: `my-apps`）
   - Database Password: 強めのパスワードを設定（控えておく）
   - Region: 近いリージョン（例: Northeast Asia (Tokyo)）
   - **Create new project** をクリック

---

## Step 4: API キーを控える

1. 対象 Project を開く
2. 左メニュー **Project Settings**（歯車アイコン）
3. **API** タブを開く
4. 以下を控える:
   - **Project URL**（例: `https://xxxxx.supabase.co`）
   - **anon public** のキー（**Reveal** で表示）

---

## Step 5: スキーマ作成

**方法A: SQL Editor（手動）**

1. 左メニュー **SQL Editor** を開く
2. **New query** をクリック
3. `supabase/migrations/001_create_schema.sql` の内容を貼り付けて **Run** を実行

**方法B: 接続文字列で実行**

`.env.local` に `DATABASE_URL` を設定後、`npm run db:migrate` を実行

---

## Step 6: API で yabai_travel スキーマを公開（必須）

フロントから `yabai_travel` スキーマのテーブルを参照するには、**Exposed schemas に `yabai_travel` を追加する必要がある**。未設定だと「Could not query the database for the schema cache」エラーになる。

1. **Project Settings** → **API** タブ
2. **Exposed schemas**（または **Schema**）のセクションを探す
3. `yabai_travel` を追加（`public` に加えて `yabai_travel` を指定）
4. 保存後、フロントが `yabai_travel.events` 等にアクセス可能になる

---

## Step 7: ローカルに環境変数を設定

プロジェクトルートに `.env.local` を作成（既にあれば追記）:

```
VITE_SUPABASE_URL=https://あなたのProjectURL.supabase.co
VITE_SUPABASE_ANON_KEY=あなたのanonキー
SUPABASE_SERVICE_ROLE_KEY=あなたのservice_roleキー
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres
```

- `VITE_*`: フロント用（Supabase クライアント）
- `SUPABASE_SERVICE_ROLE_KEY`: シード時のコースマップ Storage アップロード用（Project Settings > API > service_role）
- `DATABASE_URL`: マイグレーション・シード用（Supabase Dashboard > Project Settings > Database > Connection string）

※ `.env.local` は `.gitignore` に含まれていることを確認

---

## Step 8: Storage バケット作成（コースマップ用）

コースマップ（PDF/GPX）を Supabase Storage で保管する場合、バケットを作成する。

1. 左メニュー **Storage** を開く
2. **New bucket** をクリック
3. Name: `course-maps`
4. **Public bucket** にチェック（公開 URL で配信するため）
5. **Create bucket** をクリック

※ 既存バケットがある場合はスキップ

---

## Step 9: Vercel デプロイ時の自動マイグレーション

デプロイ時にマイグレーションを自動実行するには、**Vercel に以下を設定**する。

1. Vercel Dashboard → プロジェクト → **Settings** → **Environment Variables**
2. 以下を追加（Production / Preview / Development すべてに設定推奨）:

| 変数名 | 値 |
|--------|-----|
| `DATABASE_URL` | Supabase Dashboard > Project Settings > Database > Connection string（URI 形式） |
| `VITE_SUPABASE_URL` | Project URL（例: `https://xxxxx.supabase.co`） |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings > API > service_role（コースマップ Storage アップロード用） |

3. **GitHub Actions** でデプロイする場合、上記に加えて **GitHub Secrets** に `SUPABASE_URL`（= VITE_SUPABASE_URL と同じ値）と `SUPABASE_SERVICE_ROLE_KEY` を追加する。

設定後、`git push` でデプロイするとビルド時に以下が自動実行される:

- **マイグレーション**: スキーマ更新
- **シード**: `data/seed.json` の内容で DB を上書き。コースマップは DL → Supabase Storage にアップロード → 公開 URL を DB に保存
- **ビルド**: デプロイに大きなファイルを含めない（Storage に置くため）

※ 手動でデータを追加している場合は、`package.json` の build から `npm run db:seed` を外すこと。

---

## 完了後

「Supabase のセットアップ終わった」と伝えてください。次にテーブル作成（マイグレーション）を進めます。
