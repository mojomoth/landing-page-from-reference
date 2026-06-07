# CLONE_SPEC.md — 권위 있는 구현 계약 (clone-first)

모든 구현은 이 계약을 따른다. 충돌 시 우선순위: `GOAL.md` > `CLONE_SPEC.md` > 코드.

## 0. 핵심 기법 — Replay, not Reconstruct

Clone 충실도 ≥90% 의 유일한 현실적 방법:
1. Playwright 로 페이지를 **완전히 렌더**시킨다.
2. 페이지 컨텍스트에서 **렌더된 DOM** 직렬화(`document.documentElement.outerHTML` + `<style>`/`<link>` 내용 포함).
3. 참조된 **모든 CSS/웹폰트/이미지/배경 asset** 다운로드 → `captures/{id}/assets/` 로 저장.
4. HTML/CSS 안의 모든 URL(`href`, `src`, `srcset`, `url(...)`, `@font-face`) 을 로컬 경로로 **rewrite**.
5. 결과 `clone.html` 을 정적으로 서빙 → 같은 viewport 로 재캡처 → 원본과 비교.

LLM 은 clone 단계에 **관여하지 않는다**(분석/커스터마이징 단계에서만 사용).

---

## 1. 디렉터리 레이아웃 (런타임 산출물, gitignore)

```
captures/{captureId}/
  meta.json                 # url, status, viewports, timings, blockers, asset count
  original-desktop.png      # 1440x900 원본 스크린샷(full page)
  original-mobile.png       # 390x844
  rendered-dom.html         # 직렬화된 렌더 DOM(원본)
  computed-styles.json      # 주요 element 별 computed style
  layout-map.json           # 섹션/주요 element bounding box (desktop+mobile)
  design-tokens.raw.json    # 색/타이포/스페이싱/효과 원시 수집
  network.har               # 네트워크 리소스
  assets/...                # mirror된 css/font/img (로컬)
  clone.html                # rewrite된 clone (서빙 대상)
  clone-desktop.png         # clone 재캡처
  clone-mobile.png
  verification.json         # VerificationResult
  diff-desktop.png          # 시각 diff
  diff-mobile.png
  failure-report.md         # (실패 시) 지표/원인/제안

analysis/{captureId}/        structure.json · design-tokens.json · sections.json · customizable-schema.json
customizations/{captureId}/  customized-content.json · customized-page.html · customized-styles.css · verification.json
test-results/visual/         original-/clone-/diff- desktop|mobile .png
```

경로 상수는 `lib/paths.ts` 에 단일화. captureId 는 run id 와 1:1.

---

## 2. 데이터 모델 (lib/clone-types.ts — SSOT)

```ts
type Viewport = "desktop" | "mobile";
type CaptureStatus =
  | "pending" | "rendering" | "capturing" | "mirroring_assets"
  | "generating_clone" | "verifying" | "passed" | "failed";

interface ViewportScore {
  pixelSimilarity: number;   // 1 - (mismatchedPixels / totalPixels), pixelmatch
  ssim: number;              // ssim.js, 0..1
  layoutSimilarity: number;  // bbox IoU 평균
  paletteSimilarity: number; // color histogram overlap
  passed: boolean;           // pixel&ssim 평균 ≥0.90 && layout ≥0.85 && palette ≥0.85
}
interface VerificationResult {
  desktop: ViewportScore;
  mobile: ViewportScore;
  sectionCountDiff: number;
  fontSimilarity: number;
  overallPassed: boolean;    // desktop.passed && mobile.passed && sectionCountDiff<=1 && fontSimilarity>=0.80
  failureReasons: string[];
}
interface DesignRetentionResult {
  designTokenRetention: number; layoutRetention: number; typographyRetention: number;
  spacingRetention: number; colorRetention: number; componentRetention: number;
  passed: boolean; // token≥0.90 && layout≥0.88 && typo≥0.90 && spacing≥0.88 && color≥0.85 && component≥0.88
}
```

임계값 상수는 `lib/thresholds.ts`.

---

## 3. 모듈 인터페이스

```ts
// lib/capture/render.ts — Loop A
captureRendered(captureId, url, viewport): Promise<{ screenshotPath; renderedDom; computedStyles; layoutMap; rawTokens; har; meta }>

// lib/capture/mirror.ts — Loop B
mirrorAssets(captureId, baseUrl, html, cssTexts): Promise<{ html; assetCount; blocked: string[] }> // URL rewrite 포함

// lib/capture/clone.ts — Loop C
buildClone(captureId): Promise<{ clonePath }>  // rendered-dom + mirrored assets → clone.html

// lib/verify/similarity.ts — Loop D (순수 함수)
pixelScore(aPng, bPng): { score; diffPng }
ssimScore(aPng, bPng): number
paletteScore(aPng, bPng): number
layoutScore(aMap, bMap): number
// lib/verify/verify.ts
verifyClone(captureId): Promise<VerificationResult>   // 양 viewport 캡처+비교, diff 저장, verification.json 기록

// lib/analyze/* — Loop E (clone 아티팩트만 입력)
analyzeFromClone(captureId): Promise<{ structure; tokens; sections; schema }>

// lib/customize/* — Loop F/G
applyCustomization(captureId, content): Promise<{ html; css }>
verifyRetention(captureId): Promise<DesignRetentionResult>  // 텍스트 영역 마스킹 후 비교
```

비교 전 두 PNG 는 동일 해상도로 정규화(jimp resize). 텍스트 영역 마스킹은 layout-map 의 text block bbox 를 회색으로 칠해 제외.

---

## 4. 시각 유사도 계산 (단일 pixel diff 금지)

- **pixelmatch**(+pngjs): `score = 1 - mismatched/total`, threshold 0.1, includeAA off.
- **SSIM**(ssim.js): grayscale 후 0..1.
- **color histogram**: 채널별 16-bin 정규화 히스토그램 교집합(min) 합 → 0..1.
- **layout bbox**: 섹션 bbox IoU 평균.
- viewport 점수 = `pixel·ssim 평균`을 주 지표로, layout/palette 는 보조 게이트.
- diff 이미지는 pixelmatch 출력으로 저장(원본↔clone, 양 viewport).

---

## 5. Ralph 진단 표 (Loop D 실패 → 자동 수정)

| 실패 원인 | 수정 |
|---|---|
| external CSS not mirrored | `<link rel=stylesheet>` fetch+inline+rewrite |
| background image missing | computed `background-image` url() mirror |
| webfont not loaded | `@font-face`/`document.fonts` mirror, fonts.ready 대기 강화 |
| lazy image not captured | 오토스크롤 step↓·대기↑, `loading=eager` 강제 |
| fixed/sticky mismatch | position 보존, 스크롤 0 복귀 후 캡처 |
| section spacing mismatch | computed margin/padding 보존 확인 |
| viewport mismatch | DPR/뷰포트 고정, clone 동일 조건 |
| CSS var missing | `:root` 변수 수집/주입 |
| media query not preserved | 원본 CSS 통째 inline(미디어쿼리 포함) |
| JS-rendered element missing | networkidle+추가 대기, 캡처 시점 DOM 직렬화 |
| canvas/video/iframe | screenshot 기준 placeholder 시각 유지 |

---

## 6. 테스트 (npm scripts)

```
lint        → eslint .
typecheck   → tsc --noEmit
test        → vitest run            (tests/unit: url validate, url/css rewrite, token extract, layout map, similarity, threshold, schema)
test:e2e    → playwright test tests/e2e      (REFERENCE_URL env, 전체 플로우)
test:visual → playwright test tests/visual   (original/clone/diff PNG, fixture ≥90%)
```

Fixture: `tests/fixtures/reference-site/` (정적). `public/fixture/` 로 서빙되어 `/{base}/fixture/index.html` 에서 캡처 가능.
포함: hero · custom @font-face · background-image · gradient · card grid · responsive(media query) · CSS animation · button · `<img>` asset · lazy-loaded section. 이 fixture 의 clone 유사도가 ≥90% 여야 한다.

---

## 7. 검증 사다리(비용 순서) — 예산 소진 방지

```
1) typecheck + lint + vitest unit        (가장 쌈)
2) similarity 순수함수 단위 검증
3) fixture capture→clone→verify (헤드리스)  (중간)
4) playwright e2e/visual                   (비쌈, 최후)
```

`bash harness/verify.sh` 는 1~2 를, `npm run test:visual` 은 3~4 를 담당.
