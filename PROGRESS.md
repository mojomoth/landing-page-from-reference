# PROGRESS — clone-first 상태 (Git-as-DB) · v2

## 현재 단계
✅ 전 Loop 완료 — clone-first 파이프라인 실측 통과. DoD 13 항목 충족.

## 체크리스트 (Loops)
- [x] 하네스 재정렬 (GOAL v2 / CLONE_SPEC / CLAUDE / PROMPT)
- [x] 의존성 설치 (pixelmatch/pngjs/ssim.js/jimp/vitest/@playwright/test/eslint/typescript-eslint)
- [x] Loop A · 캡처 (playwright desktop 1440x900 + mobile 390x844, 전체 대기/오토스크롤/안정성)
- [x] Loop B · 에셋 mirror + URL rewrite
- [x] Loop C · clone.html 생성 + 서빙(app/captures)
- [x] Loop D · 시각 검증 ≥90% (pixelmatch+SSIM+histogram+layout IoU) + diff + failure-report
- [x] Fixture 사이트(public/fixture) + unit(47)/e2e/visual 테스트
- [x] Loop E · clone 아티팩트 분석 (structure/design-tokens/sections/customizable-schema, 20필드)
- [x] Loop F/G · 콘텐츠 전용 커스터마이징 + 디자인 유지 검증(텍스트 마스킹, 6지표)
- [x] Loop H · 4단계 UI + e2e 관통 + 검증 사다리 green
- [x] DoD 13 술어 + lint/typecheck/test/test:e2e/test:visual 통과

## 실측 결과
- **Fixture clone**: desktop 100% / mobile 99.5% (sectionDiff 0, font 100%) → PASS.
- **example.com**: desktop 100% / mobile 100% → PASS.
- **news.ycombinator.com**(비반응형): desktop 92.2% / mobile 67.4% → FAIL → 가드레일이 분석 차단(409) + failure-report 생성.
- e2e retention(텍스트 1개 변경): 6지표 ~100% passed.
- `bash harness/verify.sh`(typecheck→lint→unit→build) green · `npm run test:visual`/`test:e2e` 통과.

## 남은 개선(정직)
- mirror URL 해석 edge case(일부 상대경로 에셋 blocked) — 실사이트 견고성 개선 여지.
- 비반응형 실사이트의 mobile은 90% 미달 가능(설계상 정상 — 가드레일이 정직히 실패 처리).

## 완료 조건 (GOAL.md v2)
DoD 13 + fixture ≥90% 충족 → `.harness/state/ONESHOT_COMPLETE` → `<promise>CLONE COMPLETE</promise>`.
