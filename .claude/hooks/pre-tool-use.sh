#!/usr/bin/env bash
# PreToolUse 훅 — 데이터 파괴 방지 벽 (GOAL.md Iron Law 4). 파괴적 명령을 실행 전 deny.
set -u
input="$(cat)"
tool="$(printf '%s' "$input" | jq -r '.tool_name // empty' 2>/dev/null)"

deny() {
  reason="$(jq -Rn --arg m "$1" '$m' 2>/dev/null)"
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":%s}}\n' "$reason"
  exit 0
}

if [ "$tool" = "Bash" ]; then
  cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)"
  case "$cmd" in
    *"rm -rf"*|*"rm -fr"*|*"rm -r -f"*|*"rm -f -r"*)
      deny "데이터 파괴 방지: 'rm -rf' 금지 (Iron Law 4). 개별 파일 삭제 또는 'git rm' 사용." ;;
    *"git reset --hard"*)
      deny "데이터 파괴 방지: 'git reset --hard' 금지. 'git stash' 또는 개별 되돌리기 사용." ;;
    *"git clean -f"*|*"git clean -df"*|*"git clean -fd"*)
      deny "데이터 파괴 방지: 'git clean -f' 금지 (추적 안 된 산출물 보호)." ;;
    *"> schemas/"*|*">schemas/"*|*"> GOAL.md"*|*">GOAL.md"*)
      deny "SSOT 보호: schemas/ 또는 GOAL.md 를 쉘 리다이렉션으로 덮어쓰지 말 것. Edit 도구로 신중히 수정." ;;
  esac
fi
exit 0
