#!/usr/bin/env bash
# Stop: progress.md 가 N일 (기본 7일) 이상 갱신 안 됐고, 그 사이에 커밋이
# 있었다면 메인에게 갱신을 환기. 차단 X.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_lib.sh"

HOOK_NAME="notify-progress-stale"
STALE_DAYS="${PROGRESS_STALE_DAYS:-7}"
PROGRESS_LOG="docs/progress.md"

if [ ! -f "$PROGRESS_LOG" ]; then
  log_metric "$HOOK_NAME" "silent" "no-progress-log"
  exit 0
fi

if ! git rev-parse --git-dir > /dev/null 2>&1; then
  log_metric "$HOOK_NAME" "silent" "not-a-git-repo"
  exit 0
fi

# progress.md 의 마지막 git 커밋 시각 (아직 커밋 안 된 새 파일이면 stale 아님 — skip)
PROGRESS_LAST=$(git log -1 --format=%ct -- "$PROGRESS_LOG" 2>/dev/null)
if [ -z "$PROGRESS_LAST" ]; then
  log_metric "$HOOK_NAME" "silent" "no-git-history"
  exit 0
fi
NOW=$(date +%s)
AGE_DAYS=$(( (NOW - PROGRESS_LAST) / 86400 ))

if [ "$AGE_DAYS" -lt "$STALE_DAYS" ]; then
  log_metric "$HOOK_NAME" "silent" "fresh($AGE_DAYS days)"
  exit 0
fi

# 그 사이 다른 커밋이 있었는지 (grep -c 는 0건일 때 exit 1 → || echo 0 이 두 번째 0 을 붙이는 버그가 있어 wc -l 사용)
COMMITS_SINCE=$(git log --since="$STALE_DAYS days ago" --oneline 2>/dev/null | wc -l | tr -d ' ')
COMMITS_SINCE=${COMMITS_SINCE:-0}

if [ "$COMMITS_SINCE" -le 1 ]; then
  log_metric "$HOOK_NAME" "silent" "no-activity"
  exit 0
fi

notify "progress.md 가 ${AGE_DAYS}일 갱신 안 됐고 그 사이 ${COMMITS_SINCE}건 커밋. 메인이 progress.md 1~3줄 갱신 권장 (SessionStart 자동 주입 stale 방지)."
log_metric "$HOOK_NAME" "notify" "stale=${AGE_DAYS}d/commits=${COMMITS_SINCE}"
