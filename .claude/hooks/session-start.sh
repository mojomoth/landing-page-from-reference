#!/usr/bin/env bash
# SessionStart 훅 — 미션 재주입 (표류 방지 벽 1). stdout 이 세션 컨텍스트로 주입됨.
set -u
root="${CLAUDE_PROJECT_DIR:-$(pwd)}"

echo "════════ 하네스 미션 재주입 (Landing Page from Reference) ════════"
echo ""
echo "[GOAL.md — 절대 규칙(Iron Laws) 요약]"
if [ -f "$root/GOAL.md" ]; then
  awk '/^## 절대 규칙/{f=1} /^## 정식 해석 결정/{f=0} f' "$root/GOAL.md" 2>/dev/null | head -40
else
  echo "(GOAL.md 없음 — 먼저 GOAL.md 를 읽어라)"
fi
echo ""
echo "[PROGRESS.md — 현재 상태]"
if [ -f "$root/PROGRESS.md" ]; then
  head -30 "$root/PROGRESS.md" 2>/dev/null
else
  echo "(PROGRESS.md 없음)"
fi
echo ""
echo "→ 작업 전 반드시 GOAL.md + PROGRESS.md 를 읽고, CLAUDE.md 의 Context Loading Protocol 을 따른다."
echo "════════════════════════════════════════════════════════════════"
exit 0
