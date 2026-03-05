#!/bin/sh
# デプロイワークフローを gh run watch で監視
# 使い方: ./scripts/watch-deploy.sh [main|staging]

set -e

BRANCH="${1:-$(git symbolic-ref --short HEAD 2>/dev/null)}"

if [ "$BRANCH" = "main" ]; then
  WORKFLOW="deploy-vercel.yml"
elif [ "$BRANCH" = "staging" ]; then
  WORKFLOW="staging-build.yml"
else
  echo "usage: $0 [main|staging]"
  echo "  または main/staging ブランチで実行"
  exit 1
fi

echo "監視対象: $WORKFLOW (branch: $BRANCH)"
echo ""

RUN_ID=$(gh run list --workflow="$WORKFLOW" --limit 1 --json databaseId,status,conclusion --jq '.[0].databaseId')
if [ -z "$RUN_ID" ] || [ "$RUN_ID" = "null" ]; then
  echo "直近の Run が見つかりません。"
  exit 1
fi

echo "Run ID: $RUN_ID"
echo "完了まで監視します..."
echo ""

gh run watch "$RUN_ID" --exit-status

EXIT=$?
if [ $EXIT -ne 0 ]; then
  echo ""
  echo "=============================================="
  echo "  デプロイ失敗。失敗ログを取得します"
  echo "=============================================="
  gh run view "$RUN_ID" --log-failed
  exit $EXIT
fi

echo ""
echo "デプロイ成功"
