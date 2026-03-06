# Vercel セットアップ（ハンズオン）

## 前提

- **main** → 本番環境
- **staging** → 検証環境（プレビュー）
- 初期設定はユーザーが実施。以降の運用は任せる。

---

## Step 1: リポジトリを Vercel に連携

1. [vercel.com](https://vercel.com) にログイン（GitHub 推奨）
2. **Add New** → **Project**
3. **Import Git Repository** で `bokunon/YabaiTravel` を選択
4. **Import** をクリック

---

## Step 2: ビルド設定

- **Framework Preset**: Vite（自動検出される想定）
- **Root Directory**: そのまま
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`

---

## Step 3: 環境変数

**Settings** → **Environment Variables** で以下を追加:

| Name | Value | 適用環境 |
|------|-------|----------|
| `VITE_SUPABASE_URL` | Supabase の Project URL | Production, Preview |
| `VITE_SUPABASE_ANON_KEY` | Supabase の anon key | Production, Preview |
| `DATABASE_URL` | Supabase の接続文字列（ビルド時の migrate/seed 用） | Production, Preview |

※ 本番・検証で同じ Supabase を使う場合は同じ値でよい。

---

## Step 3.5: GitHub Secrets（デプロイ用）

GitHub Actions で Vercel にデプロイするため、**Repository** → **Settings** → **Secrets and variables** → **Actions** に以下を追加:

| Name | 取得方法 |
|------|----------|
| `VERCEL_ORG_ID` | Vercel Dashboard → Settings → General → Organization ID |
| `VERCEL_PROJECT_ID` | Vercel Dashboard → Settings → General → Project ID |
| `VERCEL_TOKEN` | Vercel Dashboard → Settings → Tokens で作成 |
| `DATABASE_URL` | Supabase → Project Settings → Database → Connection string |

---

## Step 4: ブランチと環境の対応

- **Production Branch**: `main` に設定（Settings → Git）
- **Preview**: それ以外のブランチ（`staging` 等）のプッシュでプレビューURLが発行される

**※ 二重デプロイを避ける場合**: 本プロジェクトは GitHub Actions でビルド＋デプロイする。Vercel の Git 連携で自動デプロイも有効だと二重になる。GitHub Actions のみにしたい場合は、Vercel の **Settings → Git** でリポジトリ連携を「Deploy only from Production Branch」等に制限するか、連携を解除して CLI デプロイのみにする。

---

## Step 5: 初回デプロイ

- **Deploy** をクリック
- main が本番、staging をプッシュすると検証用 URL ができる

---

## 完了後

「Vercel のセットアップ終わった」と伝えれば、以降は Cursor 側で自動的に進められる。
