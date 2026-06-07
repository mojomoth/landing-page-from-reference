# PROGRESS — 하네스 상태 (Git-as-DB)

> Ralph 루프와 SessionStart 훅이 읽는 현재 상태. 단계 완료 시 `[x]` 로 갱신하고 커밋한다.

## 현재 단계
✅ 전 단계 완료 — one-shot 빌드 성공. verify 사다리 green + 실제 OpenAI end-to-end smoke 통과.

## 체크리스트
- [x] A. 하네스 구조 (GOAL/CLAUDE/AGENTS/schemas/hooks/verify/PROMPT/loop)
- [x] B. 의존성 설치 + Next.js 스캐폴딩 (next 15.5.19, playwright chromium, verify green)
- [x] C. 코어 lib (schema/db/validate/mock/openai) — typecheck green
- [x] D. UI Shell + 섹션 렌더러 + preview
- [x] E. 에이전트(crawler/analyzer/customizer/generator) + API 라우트
- [x] F. 검증 사다리 + 브라우저 smoke + screenshots/ + 완료 센티넬

## 결과
- end-to-end: create → capture(playwright) → analyze(openai vision) → patch(openai) → generate → preview → history 동작 확인.
- screenshots/01-ui-shell.png, 02-generated-preview.png 저장.
- `bash harness/verify.sh` exit 0 · `node harness/smoke.mjs` exit 0.

## 다음 행동
완료. 추가 개발은 `bash harness/loop.sh` (Ralph 루프, 헤드리스) 또는 대화형으로 이어갈 수 있음.

## 완료 조건 (GOAL.md 참조)
`bash harness/verify.sh` exit 0 + end-to-end 동작(mock 포함) + screenshots/ + `git status` clean
→ `.harness/state/ONESHOT_COMPLETE` 생성 → `<promise>ONESHOT COMPLETE</promise>`.
