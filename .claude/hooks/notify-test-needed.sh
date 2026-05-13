#!/usr/bin/env bash
# Stop: 코드 변경이 있었는데 /test 또는 /verify 호출 흔적이 없으면 환기. 차단 X.
#
# 이 프로젝트는 자동 테스트 스위트가 없음 → "테스트" = `/test` 스킬 (node --check 문법 +
# npm install 무결성 + `npm start` 스모크 안내) 또는 `/verify` (Electron 보안·IPC 정적 검사).
# 둘 다 별도 서브에이전트(tester / verifier)에서 실행.
#
# 정확성 메모:
#   - git diff (working tree) + git diff --cached (staged) + 직전 커밋 (HEAD~1) 도 본다
#   - transcript schema 가정 실패 시 silent (알림 폭주 방지)
#   - jq 없으면 hook 자체 skip (require_jq)

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_lib.sh"

HOOK_NAME="notify-test-needed"
TURN_WINDOW_SECONDS="${TEST_NOTIFY_WINDOW:-1800}"

SCHEMA_MISMATCH_LOG="$HOOK_DIR/.notify-test-needed-schema-streak"
SCHEMA_MISMATCH_THRESHOLD="${TEST_NOTIFY_SCHEMA_THRESHOLD:-5}"

reset_schema_streak() {
  printf '0\n' > "$SCHEMA_MISMATCH_LOG" 2>/dev/null || true
}

require_jq || exit 0

if ! git rev-parse --git-dir > /dev/null 2>&1; then
  log_metric "$HOOK_NAME" "silent" "not-a-git-repo"
  exit 0
fi

# 코드 변경 검사: working + staged + HEAD~1 vs HEAD (이 프로젝트는 .js / .mjs / .cjs / .html)
CHANGE_RE='\.(mjs|cjs|jsx|tsx|ts|js|html)$'
WORKING=$(git diff --name-only 2>/dev/null | grep -E "$CHANGE_RE" || true)
STAGED=$(git diff --cached --name-only 2>/dev/null | grep -E "$CHANGE_RE" || true)
LAST_COMMIT=$(git diff --name-only HEAD~1 HEAD 2>/dev/null | grep -E "$CHANGE_RE" || true)

if [ -z "$WORKING" ] && [ -z "$STAGED" ] && [ -z "$LAST_COMMIT" ]; then
  log_metric "$HOOK_NAME" "silent" "no-code-change"
  exit 0
fi

INPUT=$(cat || echo "{}")
TRANSCRIPT_PATH=$(printf '%s' "$INPUT" | jq -r '.transcript_path // ""')

if [ -z "$TRANSCRIPT_PATH" ] || [ ! -f "$TRANSCRIPT_PATH" ]; then
  log_metric "$HOOK_NAME" "silent" "no-transcript"
  exit 0
fi

NOW_EPOCH=$(date +%s)
CUTOFF_EPOCH=$((NOW_EPOCH - TURN_WINDOW_SECONDS))

RECENT=$(tail -n 500 "$TRANSCRIPT_PATH" 2>/dev/null \
  | jq -rc --argjson cutoff "$CUTOFF_EPOCH" '
      select(
        (.timestamp // empty | tostring) as $t
        | (
            ( try ($t | tonumber) catch null ) as $epoch
            | if $epoch then $epoch >= $cutoff
              else
                ( $t | sub("\\+00:?00$"; "Z") | fromdateiso8601? ) as $iso
                | if $iso then $iso >= $cutoff else false end
              end
          )
      )
      | (.message.content // .content // .text // tostring)
    ' 2>/dev/null || echo "")

if [ -z "$RECENT" ]; then
  prev_streak=$(cat "$SCHEMA_MISMATCH_LOG" 2>/dev/null || echo 0)
  prev_streak=${prev_streak:-0}
  new_streak=$((prev_streak + 1))
  if [ "$new_streak" -ge "$SCHEMA_MISMATCH_THRESHOLD" ]; then
    notify "transcript schema 매칭 ${new_streak}회 연속 실패 — Claude Code 버전이 바뀌어 notify-test-needed hook 이 silent 로 죽었을 수 있음. .claude/hooks/.metrics.log 확인 / hook 점검 권장."
    log_metric "$HOOK_NAME" "notify" "schema-mismatch-streak=$new_streak"
    reset_schema_streak
  else
    printf '%s\n' "$new_streak" > "$SCHEMA_MISMATCH_LOG" 2>/dev/null || true
    log_metric "$HOOK_NAME" "silent" "transcript-schema-mismatch streak=$new_streak"
  fi
  exit 0
fi

reset_schema_streak

if printf '%s' "$RECENT" | grep -qE '/test|tester|/verify|verifier'; then
  log_metric "$HOOK_NAME" "silent" "test-already-called-in-window"
  exit 0
fi

notify "코드 변경 감지됨 (.js/.html). 'tester' 서브에이전트로 /test (node --check + 설치 무결성 + npm start 스모크) 또는 'verifier' 로 /verify (Electron 보안·IPC 정적 검사) 호출 권장."
log_metric "$HOOK_NAME" "notify" "test-missing"
