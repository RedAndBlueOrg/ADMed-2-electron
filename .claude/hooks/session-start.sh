#!/usr/bin/env bash
# SessionStart 통합 hook.
#   1. incident-log 활성(⚠/🔴)
#   2. recent 5 commits
#   3. progress.md 끝 30줄
#
# (Spring/React starter 의 worktree 포트 자동 할당 섹션은 이 Electron 프로젝트엔
#  backend/frontend 분리 dev 서버가 없어 제거함. worktree 자체는 `git worktree` 로 그냥 쓰면 됨.)

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_lib.sh"

HOOK_NAME="session-start"

require_jq || exit 0

INCIDENT_LOG="docs/development/incident-log.md"
PROGRESS_LOG="docs/progress.md"

inject_block=""
parts=""

# ─── 1. incident-log 활성 항목 ─────────────────────────────
if [ -f "$INCIDENT_LOG" ]; then
  active=$(grep -E '\| ⚠ \|?$|\| 🔴 \|?$' "$INCIDENT_LOG" 2>/dev/null || true)
  if [ -n "$active" ]; then
    count=$(printf '%s\n' "$active" | wc -l | tr -d ' ')
    inject_block+="[자동 주입] incident-log 활성 ${count}건 (⚠ + 🔴, ✅ 자동 차단은 제외):

${active}

진단·해결·회귀 검증 위치는 incident-log.md 본문.
"
    parts+="incident($count) "
  fi
fi

# ─── 2. recent 5 commits ───────────────────────────────────
if git rev-parse --git-dir > /dev/null 2>&1; then
  recent=$(git log -5 --pretty=format:'  %h %s' 2>/dev/null || true)
  if [ -n "$recent" ]; then
    inject_block+="
[자동 주입] 최근 5개 커밋:
${recent}
"
    parts+="commits "
  fi
fi

# ─── 3. progress.md 끝 30줄 ────────────────────────────────
if [ -f "$PROGRESS_LOG" ]; then
  tail_block=$(tail -30 "$PROGRESS_LOG" 2>/dev/null || true)
  if [ -n "$tail_block" ]; then
    inject_block+="
[자동 주입] progress.md 끝 30줄 (현재 진행 컨텍스트):
${tail_block}
"
    parts+="progress "
  fi
fi

if [ -n "$inject_block" ]; then
  emit_additional_context "$inject_block"
  log_metric "$HOOK_NAME" "injected" "$parts"
else
  log_metric "$HOOK_NAME" "silent"
fi
