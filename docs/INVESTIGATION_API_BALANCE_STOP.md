# 検討: API 残高不足時のグレースフル停止

## 背景

Anthropic API をオートチャージなしで運用する方針。残高が尽きた際にパイプラインが安全に停止する仕組みが必要。

## 現状の挙動

### Anthropic API の残高不足レスポンス

残高不足時、Anthropic API は以下を返す:
- **HTTP 400** + `error.error.message` に `"credit"` を含むメッセージ
- または **HTTP 402** (Payment Required)（ドキュメント上の仕様）

### 現在のハンドリング（lib/enrich-utils.js）

```javascript
if (e.status === 400 && e.error?.error?.message?.includes('credit')) {
  throw new Error(`Anthropic クレジット残高不足: ${e.error.error.message}`)
}
```

- 残高不足を検知して throw → enrichEvent / enrichCategoryDetail が失敗扱い
- **しかし orchestrator は `Promise.allSettled` で個別失敗を無視して次のイベントに進む**
- 結果: 残高ゼロでも全イベントに対して LLM 呼び出しを試み、全て失敗する（無駄な API コールが発生しないが、無駄な fetch/DB 操作は続く）

## 対応方針

### 推奨案: orchestrator レベルでの即時停止

`callLlm` が残高不足エラーを投げた場合、orchestrator がバッチ処理を即時中断する。

### 実装方法

#### 1. 専用のエラークラスを作る

```javascript
// lib/enrich-utils.js
export class InsufficientBalanceError extends Error {
  constructor(message) {
    super(message)
    this.name = 'InsufficientBalanceError'
  }
}
```

callLlm 内で残高不足を検知したら `InsufficientBalanceError` を throw。

#### 2. enrichEvent / enrichCategoryDetail / translateEvent で伝播させる

各関数は `InsufficientBalanceError` を catch せずそのまま throw（通常エラーは catch して `{ success: false }` を返す）。

#### 3. orchestrator で catch して即時停止

```javascript
batch.map(async (event) => {
  try {
    await enrichEvent(event, ...)
    // ...
  } catch (e) {
    if (e instanceof InsufficientBalanceError) throw e  // 上位に伝播
    // 通常エラーはログして続行
  }
})
```

`Promise.allSettled` の結果を確認し、`InsufficientBalanceError` があればループを break:

```javascript
const results = await Promise.allSettled(batch.map(...))
const balanceError = results.find(r => r.status === 'rejected' && r.reason instanceof InsufficientBalanceError)
if (balanceError) {
  console.log('=== 残高不足により処理を中断します ===')
  break
}
```

#### 4. GitHub Actions の終了コード

残高不足で停止した場合:
- `process.exit(0)` で正常終了（次回実行を妨げない）
- ログに「残高不足により中断」を出力
- アラート Issue を起票（「残高不足」ラベル付き）

### 影響範囲

| ファイル | 変更内容 |
|---------|---------|
| `lib/enrich-utils.js` | `InsufficientBalanceError` クラス追加、callLlm で使用 |
| `enrich-event.js` | InsufficientBalanceError を伝播 |
| `enrich-category-detail.js` | InsufficientBalanceError を伝播 |
| `enrich-translate.js` | InsufficientBalanceError を伝播 |
| `orchestrator.js` | バッチ結果チェック → 残高不足で即時停止 + アラート起票 |

### コスト

- 実装コスト: 小（エラークラス追加 + catch 条件変更のみ）
- ランタイムコスト: なし
- 残高不足時: 最大5件分の無駄な LLM 呼び出し（1バッチ分）で停止

## 代替案（不採用）

### A. 事前に残高を API で確認
- Anthropic API に残高照会エンドポイントがない（2026年3月時点）
- 不採用

### B. 環境変数で日次上限を設定
- `MAX_DAILY_LLM_CALLS=500` 等で制限
- 実装可能だが、残高不足とは別の問題。併用は可能
- 今回は残高不足停止を優先

## 結論

推奨案（orchestrator レベルでの即時停止）で実装する。最大1バッチ（5件）分の無駄で停止でき、次回実行も正常に動作する。
