# デプロイ方法と結果確認の手順書

**対象**: 新規プロジェクト立ち上げ時、Cursor に読ませる用。Vercel + GitHub Actions でデプロイし、結果まで確実に確認するための指針。

---

## 1. 正しい構成: デプロイ結果を確実に検知する

### 原則

**「デプロイ成功」は、GitHub Actions のワークフローが成功した時点で判定する。**

- ビルドとデプロイを **同一ワークフロー内** で完結させる
- `gh run watch` で完了まで監視し、失敗時は即検知する

### 推奨構成（norm-changes / YabaiTravel 方式）

```
GitHub Actions ワークフロー:
  1. Checkout
  2. Setup Node
  3. npm ci
  4. Verify Secrets（必須シークレットの存在確認）
  5. vercel pull
  6. vercel build
  7. vercel deploy --prebuilt
```

- **staging**: `vercel deploy --prebuilt`（プレビュー）
- **main**: `vercel deploy --prebuilt --prod`（本番）

### 必要な GitHub Secrets

| Name | 用途 |
|------|------|
| `VERCEL_ORG_ID` | Vercel Team ID（Settings → General） |
| `VERCEL_PROJECT_ID` | Vercel Project ID（Settings → General） |
| `VERCEL_TOKEN` | Vercel Dashboard → Settings → Tokens で作成 |
| `DATABASE_URL` | ビルド時に DB が必要な場合 |
| `VITE_SUPABASE_URL` | フロント＋コースマップ Storage 用（Project URL、例: `https://xxxxx.supabase.co`） |
| `SUPABASE_SERVICE_ROLE_KEY` | コースマップ Storage アップロード用（Project Settings → API → service_role） |

---

## 2. 監視スクリプト（deploy:watch）

プッシュ後に **必ず** `npm run deploy:watch` を実行して完了まで待つ。

```bash
npm run deploy:watch
```

- `gh run watch` でワークフロー完了を監視
- **成功時**:  exit 0、「デプロイ成功」と表示
- **失敗時**: exit 1、失敗ログを表示

### 監視対象の設定

`scripts/watch-deploy.sh` で、ブランチに応じて監視するワークフローを切り替える:

- `staging` → `staging-deploy-vercel.yml`
- `main` → `deploy-vercel.yml`

---

## 3. やってはいけないこと（駄目なパターン）

### ❌ ビルドとデプロイを分離する

| 駄目な例 | 問題 |
|----------|------|
| GitHub Actions で `npm run build` のみ実行 | Vercel のデプロイは別（Git 連携）で動く。Actions が成功しても Vercel が失敗する可能性がある |
| Deploy Hook で `curl` するだけ | ビルド自体は Vercel 側。失敗時、GitHub Actions では検知できない |

**結果**: 「デプロイ成功」と表示されるのに、実際の Vercel デプロイは失敗している。**嘘の成功報告**になる。

### ❌ 監視せずに成功と報告する

- `gh run watch` で完了を待たずに「成功」と伝える
- ワークフローが失敗した場合、ユーザーは気づけない

### ❌ 大きなファイルをデプロイに含める

- Vercel のアップロード制限: **100MB**
- `public/` や `dist/` に大きな PDF 等を入れるとデプロイ失敗
- **対策**: Supabase Storage / Vercel Blob 等に分離し、URL を参照する

### ❌ シークレットをワークフローに渡し忘れる

- `VERCEL_ORG_ID` 等を `env:` に追加し忘れると、デプロイ失敗
- 最初のステップで `Verify Secrets` を実行し、失敗を早めに検知する

### ❌ Vercel の Git 連携と GitHub Actions の二重デプロイ

- 両方有効だと、同じプッシュで二重にデプロイされる
- GitHub Actions を主とするなら、Vercel の Git 連携を制限するか無効化

---

## 4. 新規プロジェクトのセットアップチェックリスト

1. **GitHub Actions ワークフロー**
   - [ ] `vercel build` + `vercel deploy --prebuilt` を同一ワークフローに含める
   - [ ] `Verify Secrets` ステップを追加
   - [ ] staging / main それぞれのワークフローを用意

2. **GitHub Secrets**
   - [ ] `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `VERCEL_TOKEN` を設定
   - [ ] ビルドに DB が必要なら `DATABASE_URL` も設定

3. **監視スクリプト**
   - [ ] `scripts/watch-deploy.sh` で `gh run watch` を実行
   - [ ] `package.json` に `deploy:watch` スクリプトを追加
   - [ ] プッシュ後は必ず `npm run deploy:watch` を実行

4. **Cursor ルール**
   - [ ] プッシュ後は `deploy:watch` を実行し、結果をユーザーに報告する旨を明記
   - [ ] 失敗時は Cursor 内でログ取得 → 原因分析 → 対策プラン → 修正 → 再プッシュ → 再監視を繰り返す旨を明記

---

## 5. 関連ファイル（このプロジェクト）

- `.github/workflows/staging-deploy-vercel.yml` — staging デプロイ
- `.github/workflows/deploy-vercel.yml` — main デプロイ
- `scripts/watch-deploy.sh` — デプロイ監視
- `docs/SETUP_VERCEL.md` — Vercel 初期設定手順
