# コースマップ

レース終了後に公式サイトから消えることが多いため、サイト内に保管します。

## 配置ルール

```
course-maps/
  {event_id}/           # 大会ID（UUID）
    2024_course.pdf     # 2024年版
    2025_course.pdf     # 2025年版
```

## 追加方法

1. course_map_files テーブルにレコードを追加
2. ファイルを `course-maps/{event_id}/` に配置
