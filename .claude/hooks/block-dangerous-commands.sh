#!/usr/bin/env bash
# PreToolUse(Bash): settings.json `deny` (prefix 매칭) 가 못 잡는
# **정규식 우회 / 변종 패턴**만 책임. 일반 prefix 차단은 settings.json.
#
# 분담 (중복 방지):
#   settings.json deny → rm -rf:*, rm -fr:*, git push --force/-f, git reset --hard,
#                        git checkout ., git clean -fd, sudo rm:*
#   이 hook            → fork bomb, dd if=...of=/dev/, mkfs.,
#                        chmod 777 /, redirect to /dev/sdX

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_lib.sh"

HOOK_NAME="block-dangerous-commands"

INPUT=$(cat)
require_jq || exit 0
CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // ""')

if [ -z "$CMD" ]; then
  log_metric "$HOOK_NAME" "silent" "no-command"
  exit 0
fi

declare -a PATTERNS=(
  ':\(\)[[:space:]]*\{[[:space:]]*:\|:&[[:space:]]*\}[[:space:]]*;:'   # fork bomb
  'dd[[:space:]]+if=.*of=/dev/'                                          # raw device write
  'mkfs\.'                                                               # filesystem format
  'chmod[[:space:]]+777[[:space:]]+/'                                    # root chmod
  '>[[:space:]]*/dev/sd[a-z]'                                            # block device redirect
  'rm[[:space:]]+-[a-zA-Z]*r[a-zA-Z]*[[:space:]]+--force'                # rm -r --force 변종
)

for pat in "${PATTERNS[@]}"; do
  if printf '%s' "$CMD" | grep -qE "$pat"; then
    reason="위험 명령 차단: 패턴 [$pat] 매칭. 의도가 맞다면 명시 승인 후 진행."
    emit_deny "$reason"
    log_metric "$HOOK_NAME" "deny" "$pat"
    exit 0
  fi
done

log_metric "$HOOK_NAME" "silent"
