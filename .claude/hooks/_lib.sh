#!/usr/bin/env bash
# 공통 hook 유틸. 다른 hook 스크립트가 source 해서 사용.
#
# jq 강제: 모든 hook 은 jq 없으면 silent skip. fallback 경로 제거 (어느 쪽도
# 작동 보장 못 하던 이중 경로보다 명확히 한쪽 전제 + skip 이 안전).

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
METRICS_LOG="$HOOK_DIR/.metrics.log"

log_metric() {
  local hook_name="$1"
  local result="$2"
  local detail="${3:-}"
  printf '%s | %s | %s | %s\n' \
    "$(date '+%Y-%m-%d %H:%M:%S')" "$hook_name" "$result" "$detail" \
    >> "$METRICS_LOG"
}

notify() {
  local msg="$1"
  printf '\n[hook 환기] %s\n' "$msg" >&2
}

# jq 강제. 호출: require_jq || exit 0
require_jq() {
  if ! command -v jq >/dev/null 2>&1; then
    log_metric "${HOOK_NAME:-unknown}" "skipped" "jq-missing"
    return 1
  fi
  return 0
}

# JSON permission decision (PreToolUse deny)
# jq 없으면 emit_deny 자체가 실패해도 exit 1 로 hook 차단 (fail-safe deny)
emit_deny() {
  local reason="$1"
  if ! command -v jq >/dev/null 2>&1; then
    notify "[FAIL-SAFE DENY] $reason (jq 미설치로 deny JSON emit 실패. 명령 실행 차단을 위해 hook exit 1)"
    exit 1
  fi
  jq -nc --arg reason "$reason" \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $reason}}'
}

# JSON additionalContext 주입 (SessionStart)
emit_additional_context() {
  local text="$1"
  require_jq || return 0
  jq -nc --arg text "$text" \
    '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $text}}'
}
