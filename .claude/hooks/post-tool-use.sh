#!/usr/bin/env bash
# PostToolUse 훅 — SSOT 변경 감지 시 동기화 리마인더(비차단 컨텍스트 주입).
set -u
input="$(cat)"
path="$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_input.path // empty' 2>/dev/null)"

ctx=""
case "$path" in
  *schemas/*.schema.json)
    ctx="스키마(SSOT)가 변경됨: lib/schema.ts 타입을 동기화하고 'node harness/check-schemas.mjs' 로 검증하라. 변경은 schema→type→validate→render 순서로 전파." ;;
esac

if [ -n "$ctx" ]; then
  msg="$(jq -Rn --arg m "$ctx" '$m' 2>/dev/null)"
  printf '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":%s}}\n' "$msg"
fi
exit 0
