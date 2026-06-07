# GOAL.md — Clone-First 미션 (표류 방지 앵커) · v2

> ⚠️ 미션 전환(v1 → v2): 기존 "자산 미복사·재해석"은 **폐기**한다.
> 이제 성공 기준은 **예쁜 랜딩 생성이 아니라, Reference URL 의 실제 브라우저 렌더 결과와
> Clone Preview 가 ≥90% 시각적으로 일치하는 것**이다. 디자인 재해석은 **실패**로 간주한다.

## 한 줄 정의

Reference URL 을 실제 브라우저로 렌더링한 결과물을 기준으로 **로컬 Clone 을 먼저 만들고,
그 Clone 이 원본과 최소 90% 시각적으로 일치한 뒤에만** 분석/커스터마이징/최종 생성으로 넘어간다.

핵심 흐름:
```
Reference URL → Browser-Rendered Clone → Strict Visual Verification(≥90%)
  → Clone-based Analysis → Locked-Design Customization → Verified Final Generation
```

---

## 절대 규칙 (Iron Laws — 위반 시 실패)

1. **리플레이(replay)지 재구성(reconstruct)이 아니다.** Reference 의 *렌더된 DOM* + 모든 CSS/웹폰트/이미지/배경
   asset 을 **mirror 하고 URL 을 로컬로 rewrite** 하여 clone 을 만든다. clone 은 원본의 렌더 결과물을
   로컬로 재배치한 것 그 자체다.
   - ❌ HTML 소스만 파싱(Cheerio) · ❌ LLM 이 디자인 추측 재생성 · ❌ 텍스트만 추출해 새 Tailwind 재구성.

2. **캡처는 Playwright(Chromium).** desktop `1440x900` + mobile `390x844`.
   대기: `domcontentloaded` → `load` → `networkidle` → `document.fonts.ready` → 전체 오토스크롤(lazy 로딩)
   → 상단 복귀 → 레이아웃 안정성 2회 검사. cookie/modal 가리면 닫고, 못 닫으면 metadata 기록.

3. **Clone Verification Guardrail 이 진행을 차단한다.** 아래를 *모두* 만족해야 분석 단계로 간다:
   ```
   desktop visual similarity ≥ 0.90
   mobile  visual similarity ≥ 0.90
   major section count diff   ≤ 1
   primary palette overlap    ≥ 0.85
   font style similarity      ≥ 0.80
   layout bbox similarity     ≥ 0.85
   ```
   similarity 는 **최소 2개 지표 조합**(pixelmatch + SSIM + color histogram + layout bbox + OCR/text-block).
   단일 pixel diff 금지(AA/폰트 오탐). 실패 → Ralph 루프(≤8회) → 실패 시 `failure-report.md`. **clone 미통과 시 분석 금지.**

4. **분석은 Clone 아티팩트 기준.** `rendered-dom.html`, `computed-styles.json`, `layout-map.json`,
   `design-tokens.raw.json`, 원본/clone screenshot, `network.har`, mirrored assets 만 사용. **원본 텍스트 재크롤 금지.**

5. **커스터마이징은 콘텐츠 전용.** 텍스트/CTA/이미지/브랜드/섹션순서일부/accent일부/블록on-off 만 수정.
   **잠금**: layout · typography scale · spacing · grid/flex · animation timing · section rhythm · design language.
   커스터마이징 후 **디자인 유지 검증**(token/layout/typography/spacing/color/component retention, 텍스트 영역 마스킹).

6. **최종 생성은 Clone 에서 출발.** 새 Tailwind/shadcn 템플릿 재디자인 금지. clone HTML/CSS 구조 유지 + 사용자 수정 반영.

7. **검증 전 완료 선언 금지.** `lint`/`typecheck`/`test`/`test:e2e`/`test:visual` 을 **실제 실행**한다.
   측정하지 않은 수치를 말하지 않는다. **90% 미만이면 완료가 아니다.**

8. **Fixture = 결정적 DoD 앵커.** `tests/fixtures/reference-site/` (내가 통제) 는 clone ≥90% 가 **반드시** 나와야 한다.
   임의의 실사이트는 best-effort — CSP/CORS/anti-bot/웹폰트로 90% 미달 가능 → 정직하게 `failure-report.md`.

9. **단일 Node 프로세스 유지** (node:sqlite + playwright + Next). 기능/루프마다 커밋. 기존 코드는 필요시 전면 재구성.

10. **각 서브시스템을 Ralph 루프로**: `PLAN → IMPLEMENT → RUN → VERIFY → DIAGNOSE → PATCH → RE-RUN → EXIT(가드레일 통과 시에만)`.
    Loop A 캡처 · B 에셋 mirror · C clone 생성 · D 원본↔clone 검증 · E clone 분석 · F 커스터마이징 · G 유지검증 · H 전체 E2E.

---

## 완료 조건 (Definition of Done — 13 술어, 전부 측정으로 참)

```
[ ] 1. Reference URL 을 실제 브라우저 렌더링으로 캡처
[ ] 2. JS/CSS/Font/Image 적용 결과 기준으로 DOM/CSSOM/Assets 수집
[ ] 3. 로컬 Clone Preview 생성
[ ] 4. Desktop 원본 vs Clone 시각 유사도 ≥ 90%
[ ] 5. Mobile 원본 vs Clone 시각 유사도 ≥ 90%
[ ] 6. 유사도 실패 시 분석 단계로 넘어가지 않음 (가드레일 차단 동작 증명)
[ ] 7. 분석 JSON 이 Clone 결과물 기반으로 생성
[ ] 8. 커스터마이징이 Clone 디자인 구조 유지한 채 콘텐츠만 수정
[ ] 9. 커스터마이징 후 디자인 유지 검증 수행
[ ] 10. 최종 랜딩이 원본 디자인 DNA 유지
[ ] 11. Playwright E2E 테스트 존재
[ ] 12. Visual Regression 테스트 존재
[ ] 13. lint/typecheck/test/e2e/visual 통과
```

위가 **모두 측정으로 참**이고 fixture 에서 ≥90% 가 나올 때만
`.harness/state/ONESHOT_COMPLETE` 생성 + `<promise>CLONE COMPLETE</promise>` 출력.
그 전에는 Ralph 루프를 계속 돌린다. **검증 안 한 완료 선언 금지.**

---

## 실패 모드 → 벽

| 실패 모드 | 벽 |
|---|---|
| 재해석으로 표류 | 이 GOAL(리플레이 강제) + SessionStart 재주입 + CLONE_SPEC 계약 |
| clone 미흡한데 진행 | Verification Guardrail(≥90%) 가 분석 차단 |
| 과장 완료 | DoD 13 술어 + 실제 test 실행 + 측정 수치만 보고 |
| 커스터마이징이 디자인 파괴 | retention 검증 + design lock |
| 실사이트 불가능을 숨김 | failure-report.md 정직 보고 |
| 예산 소진 | 검증 사다리: 정적/유사도(싼 것) → 브라우저(비쌈) |
```
