# PROGRESS — clone-first 상태 (Git-as-DB) · v2

## 현재 단계
미션 전환 v1 → v2 (clone-first). 하네스 재정렬 완료 → 의존성 설치 + 설계 워크플로우 → Loop A.

## 체크리스트 (Loops)
- [x] 하네스 재정렬 (GOAL v2 / CLONE_SPEC / CLAUDE / PROMPT / PROGRESS)
- [ ] 의존성 설치 (pixelmatch/pngjs/ssim.js/jimp/vitest/@playwright/test/eslint/typescript-eslint)
- [ ] Loop A · 캡처 (playwright desktop 1440x900 + mobile 390x844, 전체 대기/오토스크롤/안정성)
- [ ] Loop B · 에셋 mirror + URL rewrite
- [ ] Loop C · clone.html 생성 + 서빙 라우트
- [ ] Loop D · 시각 검증 ≥90% (pixelmatch+SSIM+histogram+layout) + diff + failure-report
- [ ] Fixture 사이트 (public/fixture) + unit/e2e/visual 테스트
- [ ] Loop E · clone 아티팩트 분석 (structure/design-tokens/sections/customizable-schema)
- [ ] Loop F/G · 콘텐츠 전용 커스터마이징 + 디자인 유지 검증
- [ ] Loop H · 4단계 UI + 전체 E2E + 측정 ≥90% 수렴
- [ ] DoD 13 술어 + lint/typecheck/test/e2e/visual 통과

## v1(재해석) — 대체/폐기 대상
- 교체: `lib/agents/analyzer`·`customizer`(재해석), `lib/mock`, 기존 `/api/analyze|patch|generate`, page 일부.
- 보존: `harness/*`, `.claude/hooks/*`, `lib/db.ts`(run/history), Next 스캐폴드, `lib/schema.ts`(일부).

## 다음 행동
deps 설치 → 설계/리스크 워크플로우(접근 확정 + 모듈 계약) → Loop A부터 구현+측정.

## 완료 조건 (GOAL.md v2)
DoD 13 술어 전부 측정 참 + fixture 시각 유사도 ≥90% → `.harness/state/ONESHOT_COMPLETE` → `<promise>CLONE COMPLETE</promise>`.
