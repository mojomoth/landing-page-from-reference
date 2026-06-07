#!/usr/bin/env bash
# 검증 사다리 (clone-first) — 싼 것 먼저. typecheck → lint → unit → build.
# 시각 회귀/Loop D·E·F·G 검증(가장 비쌈)은 별도: npm run test:visual / npm run test:e2e.
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p .harness/state
fail() { echo "✗ 검증 실패 @ $1"; exit 1; }

echo "── 1/4 · typecheck (tsc --noEmit) ──"
npx --no-install tsc --noEmit || fail "typecheck"
touch .harness/state/typecheck.ok

echo "── 2/4 · lint (eslint) ──"
npx --no-install eslint . || fail "lint"
touch .harness/state/lint.ok

echo "── 3/4 · unit (vitest) ──"
npx --no-install vitest run || fail "unit"
touch .harness/state/unit.ok

echo "── 4/4 · next build ──"
npm run build || fail "build"
touch .harness/state/build.ok

echo ""
echo "✅ 검증 사다리 통과: typecheck → lint → unit → build"
echo "   시각 회귀/E2E: npm run test:visual · npm run test:e2e"
