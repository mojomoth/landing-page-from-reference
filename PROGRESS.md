# PROGRESS — 하네스 상태 (Git-as-DB)

> Ralph 루프와 SessionStart 훅이 읽는 현재 상태. 단계 완료 시 `[x]` 로 갱신하고 커밋한다.

## 현재 단계
Phase B 완료 (스캐폴드 빌드 green). 다음은 Phase C (코어 lib).

## 체크리스트
- [x] A. 하네스 구조 (GOAL/CLAUDE/AGENTS/schemas/hooks/verify/PROMPT/loop)
- [x] B. 의존성 설치 + Next.js 스캐폴딩 (next 15.5.19, playwright chromium, verify green)
- [ ] C. 코어 lib (schema/db/validate/mock/openai)
- [ ] D. UI Shell + 섹션 렌더러 + preview
- [ ] E. 에이전트(crawler/extractor/mapper/customizer/generator) + API 라우트
- [ ] F. 검증 사다리 실행 + 스크린샷 + 완료 센티넬

## 다음 행동
Phase C: lib/schema.ts(SSOT 타입) → lib/db.ts(node:sqlite) → lib/validate.ts(ajv) → lib/mock.ts(결정적 폴백) → lib/openai.ts(structured output + mock 게이트).

## 완료 조건 (GOAL.md 참조)
`bash harness/verify.sh` exit 0 + end-to-end 동작(mock 포함) + screenshots/ + `git status` clean
→ `.harness/state/ONESHOT_COMPLETE` 생성 → `<promise>ONESHOT COMPLETE</promise>`.
