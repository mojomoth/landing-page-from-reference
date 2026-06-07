#!/usr/bin/env bash
# 검증 사다리 — 싼 것 먼저 (예산 소진 방지). schema → typecheck → build.
# 사용: bash harness/verify.sh
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p .harness/state

fail() { echo "✗ 검증 실패 @ $1"; exit 1; }

echo "── 1/3 · schema 검증 (가장 쌈) ──"
node harness/check-schemas.mjs || fail "schema"
touch .harness/state/schema.ok

echo "── 2/3 · typecheck (tsc --noEmit) ──"
npx --no-install tsc --noEmit || fail "typecheck"
touch .harness/state/typecheck.ok

echo "── 3/3 · next build ──"
npm run build || fail "build"
touch .harness/state/build.ok

echo ""
echo "✅ 검증 사다리 통과: schema → typecheck → build"
