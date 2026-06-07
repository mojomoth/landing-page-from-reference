# CLAUDE.md — 에이전트 강제 규칙 (Landing Page from Reference) · v2 clone-first

> Claude Code 가 매 세션 자동 로드. Ralph 루프의 매 반복은 이 규칙 안에서만 일한다.

## 0. 가장 먼저

작업 전 반드시 `GOAL.md`(v2 clone-first) + `CLONE_SPEC.md` + `PROGRESS.md` 를 읽는다.
**성공 = Reference 렌더 결과와 Clone Preview ≥90% 일치. 재해석은 실패.**

## 1. Context Loading Protocol — 작업 트리거별 필수 읽기

| 트리거 | 읽을 파일 |
|---|---|
| 무엇이든 시작 | `GOAL.md`, `CLONE_SPEC.md`, `PROGRESS.md` |
| 캡처/클론 | `CLONE_SPEC.md`(§0,§3), `lib/clone-types.ts`, `lib/paths.ts`, `lib/capture/*` |
| 시각 검증 | `CLONE_SPEC.md`(§4,§5), `lib/thresholds.ts`, `lib/verify/*` |
| 분석 | `lib/analyze/*`, clone 아티팩트(`captures/{id}/*`) |
| 커스터마이징 | `lib/customize/*`, `analysis/{id}/customizable-schema.json` |
| 테스트 | `CLONE_SPEC.md`(§6), `tests/*`, `playwright.config.ts`, `vitest.config.ts` |

## 2. 절대 규칙 (요약 — 전문은 GOAL.md)

- **리플레이 강제**: 렌더 DOM + 에셋 mirror + URL rewrite. LLM 재그리기/텍스트-only 재구성 금지.
- **가드레일 차단**: clone 이 desktop&mobile ≥90% 일 때만 분석으로. 실패 → Ralph 루프(≤8) → `failure-report.md`.
- **분석은 clone 아티팩트만**. 원본 재크롤 금지.
- **커스터마이징은 콘텐츠 전용**, 디자인 잠금 + 유지 검증.
- **최종 생성은 clone 기반**. 새 템플릿 재디자인 금지.

## 3. 검증 사다리 (싼 것 먼저)

```
1) npm run typecheck && npm run lint && npm run test   # 단위 (가장 쌈)
2) bash harness/verify.sh                              # schema + typecheck + build
3) fixture capture→clone→verify (헤드리스)
4) npm run test:e2e && npm run test:visual             # 비쌈 (최후)
```

## 4. 완료 주장 전 자가검증

- 측정하지 않은 유사도 수치를 말하지 않는다. `verification.json` 의 실제 값으로만 보고.
- "통과했다"는 실제 test 종료코드 0 + 측정 ≥90% 로만 증명. **90% 미만 = 미완료.**
- 실패는 실패라고 말한다. 실사이트 한계는 `failure-report.md` 로 정직 보고.

## 5. 데이터 파괴 금지 / 조기 정지 금지

- `captures/`·`analysis/`·`customizations/`·`tests/fixtures/`·`GOAL.md`·`CLONE_SPEC.md` 파괴 금지(PreToolUse 훅).
- 외부 의존(네트워크/CSP/폰트) 실패 시 진단표(CLONE_SPEC §5)로 수정 후 재시도. 부분 결과라도 산출 후 진행.

## 6. 커밋 / 완료 신호

- Loop 단위 커밋. trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- DoD 13 술어(GOAL.md) 전부 측정으로 참 + fixture ≥90% 일 때만:
  `.harness/state/ONESHOT_COMPLETE` 생성 후 마지막 줄에 정확히 `<promise>CLONE COMPLETE</promise>`.
