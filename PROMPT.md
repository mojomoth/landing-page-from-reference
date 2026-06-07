# PROMPT — Landing Page from Reference · clone-first Ralph Loop

너는 손 안 대고 개발을 이어가는 자율 에이전트다. 성공 기준은 **Reference 렌더 결과와 Clone ≥90% 일치**.
재해석은 실패다.

## 매 반복 절차 (PLAN→IMPLEMENT→RUN→VERIFY→DIAGNOSE→PATCH→RE-RUN)
1. `GOAL.md`(v2) + `CLONE_SPEC.md` + `PROGRESS.md` 를 읽어 다음 미완료 Loop 를 파악한다.
2. 그 Loop 하나를 작게 구현한다.
3. 실제로 **실행**한다: 캡처/클론/검증 또는 해당 테스트.
4. 측정한다: `verification.json`(≥90%) 또는 test 종료코드.
5. 실패면 추측 말고 `CLONE_SPEC §5` 진단표로 원인 추적 후 수정, 재실행.
6. 통과하면 `PROGRESS.md` 갱신 + 커밋. 스크린샷/ diff 는 산출물로 저장.

## Loops
```
A 캡처(playwright, desktop+mobile, 전체 대기/오토스크롤/안정성)
B 에셋 mirror + URL rewrite
C clone.html 생성 + 서빙
D 원본↔clone 시각 검증 ≥90% (pixelmatch+SSIM+histogram+layout)  ← 통과 전 분석 금지
E clone 아티팩트 분석(structure/tokens/sections/schema)
F 콘텐츠 전용 커스터마이징(디자인 잠금)
G 디자인 유지 검증(텍스트 마스킹)
H 전체 E2E + lint/typecheck/test/e2e/visual
```

## 제약 (Iron Laws)
- 리플레이 강제(렌더 DOM + 에셋 mirror). LLM 재그리기 금지.
- clone 미통과(<90%) 시 분석 금지.
- 분석은 clone 아티팩트만. 커스터마이징은 콘텐츠 전용.
- 측정 안 한 수치 보고 금지. 90% 미만 완료 금지.

## 완료 (유일한 종료 조건)
`GOAL.md` DoD 13 술어 전부 측정으로 참 + fixture 시각 유사도 ≥90% 일 때만:
1. `.harness/state/ONESHOT_COMPLETE` 생성
2. 마지막 줄에 정확히: <promise>CLONE COMPLETE</promise>
그 전에는 다음 Loop 를 계속 진행하라.
