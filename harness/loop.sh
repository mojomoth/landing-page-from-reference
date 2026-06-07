#!/usr/bin/env bash
# Ralph Loop 엔진 — 세션 격리 + 개발 지속 (doing.md / ghuntley.com/ralph).
# 같은 PROMPT.md 를 반복 투입; 에이전트는 파일·git 에 남은 이전 작업을 보고 수렴한다.
#
# 사용:  bash harness/loop.sh [MAX_ITER]    (기본 50)
# 중단:  Ctrl-C  또는  touch .harness/state/ONESHOT_COMPLETE
#
# 주의: RALPH_LOOP=1 을 export 하므로 Stop 훅이 조기 정지를 차단한다(헤드리스 전용).
set -u
cd "$(dirname "$0")/.."
export RALPH_LOOP=1
MAX="${1:-50}"
i=0

while [ "$i" -lt "$MAX" ]; do
  i=$((i + 1))
  echo "──────── Ralph iteration $i/$MAX ────────"
  # --dangerously-skip-permissions: 무인 실행(가드레일은 PreToolUse 훅이 담당).
  out="$(cat PROMPT.md | claude -p --dangerously-skip-permissions 2>&1 | tee /dev/tty)" || true
  if printf '%s' "$out" | grep -q '<promise>ONESHOT COMPLETE</promise>'; then
    echo "✅ 완료 프로미스 감지 — 루프 종료."
    break
  fi
  if [ -f .harness/state/ONESHOT_COMPLETE ]; then
    echo "✅ 완료 센티넬 감지 — 루프 종료."
    break
  fi
done

echo "Ralph 루프 종료 (${i} iterations)."
