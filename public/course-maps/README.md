# コースマップ

レース終了後に公式サイトから消えることが多いため、**Supabase Storage** に保管します。

## 保管先

- **Supabase Storage** バケット `course-maps`（Public）
- シード実行時に URL から DL → アップロード → 公開 URL を DB に保存
- `course_map_files.file_path` に Storage の公開 URL が入る

## バケット作成

Supabase Dashboard → Storage → New bucket → `course-maps`（Public）を作成。  
詳細は [SETUP_SUPABASE.md](../docs/SETUP_SUPABASE.md) Step 8 を参照。

## このディレクトリについて

`public/course-maps/` は Vercel 100MB 制限のため使用していません。  
ローカルで `SKIP_COURSE_MAP_DOWNLOAD=1 npm run db:seed` とすると外部 URL のままになります。
