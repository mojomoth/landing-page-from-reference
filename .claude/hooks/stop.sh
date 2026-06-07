#!/usr/bin/env bash
# Stop 훅 — 조기 정지 방지 벽 (수렴). RALPH_LOOP=1 일 때만 작동(대화형 세션은 가두지 않음).
set -u
root="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# 대화형 세션 보호: 헤드리스 Ralph 루프(loop.sh)만 RALPH_LOOP=1 을 export 한다.
if [ "${RALPH_LOOP:-0}" != "1" ]; then
  exit 0
fi

# 완료 센티넬이 있으면 정상 종료 허용.
if [ -f "$root/.harness/state/ONESHOT_COMPLETE" ]; then
  exit 0
fi

# 미완료 → exit 2 로 정지 차단. stderr 가 다음 턴 컨텍스트로 주입됨.
echo "완료 조건 미충족. GOAL.md 완료 조건과 PROGRESS.md 의 다음 미완료 단계를 진행하라. 모든 조건 충족 + 'bash harness/verify.sh' exit 0 이면 .harness/state/ONESHOT_COMPLETE 를 생성하고 <promise>ONESHOT COMPLETE</promise> 를 출력하라." 1>&2
exit 2
