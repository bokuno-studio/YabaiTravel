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

## Step 5: スキーマ作成（SQL Editor）

1. 左メニュー **SQL Editor** を開く
2. **New query** をクリック
3. 以下を貼り付けて **Run** を実行:

```sql
-- yabai_travel スキーマを作成
CREATE SCHEMA IF NOT EXISTS yabai_travel;
```

4. 成功すれば「Success. No rows returned」と表示される

---

## Step 6: ローカルに環境変数を設定

プロジェクトルートに `.env.local` を作成（既にあれば追記）:

```
VITE_SUPABASE_URL=https://あなたのProjectURL.supabase.co
VITE_SUPABASE_ANON_KEY=あなたのanonキー
```

※ `.env.local` は `.gitignore` に含まれていることを確認（通常 Vite では含まれる）

---

## 完了後

「Supabase のセットアップ終わった」と伝えてください。次にテーブル作成（マイグレーション）を進めます。
