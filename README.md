# Landing Page from Reference

레퍼런스 URL을 입력하면 디자인 구조를 분석해 JSON으로 구조화하고,
사용자가 자연어와 UI로 커스터마이징한 뒤 새 랜딩페이지를 생성·저장·재수정할 수 있는
LLM 기반 랜딩 제작 도구.

---

## 개발 방식

- **하네스 one-shot**: 중간 Stop 없이 에이전트가 완주
- **Ralph Loop**: `while :; do cat PROMPT.md | claude -p; done` — 세션 격리 + 개발 지속
- **화면 구현마다**: `screenshots/` 폴더에 스크린샷 저장
- **기능 추가·수정마다**: Git commit

---

## Tech Stack

| 영역 | 기술 |
|---|---|
| Frontend | Next.js (App Router) + Tailwind CSS |
| Backend | Python (FastAPI or Next.js Route Handler) |
| LLM | OpenAI API — Structured Outputs |
| Browser Render | Playwright |
| DB | SQLite |
| 환경 변수 | `.env` (OPENAI_API_KEY) |

---

## 제품 흐름

```
1. Reference URL 입력
2. Playwright → screenshot + DOM 수집
3. OpenAI Structured Outputs → LandingReferenceAnalysis JSON
4. JSON Schema 검증
5. Customizing UI (섹션 트리 + 컨트롤 폼 + 자연어 textarea)
6. Natural Language → CustomizationPatch JSON
7. Make → Next.js 코드 생성
8. TypeScript build + Preview render
9. History 저장 (재커스터마이징 가능)
```

---

## 화면 구조

```
┌────────────────────────────────────────────────────────────┐
│ Header: Landing Page from Reference                        │
├───────────────┬───────────────────────────────┬────────────┤
│ History       │ Main Workspace                 │ Inspector  │
│               │                               │            │
│ - Run #3      │ Step 1: Reference Input        │ JSON       │
│ - Run #2      │ Step 2: Analysis Result        │ Controls   │
│ - Run #1      │ Step 3: Customize              │ Preview    │
│               │ Step 4: Make                  │            │
├───────────────┴───────────────────────────────┴────────────┤
│ Natural Language Composer: "이 섹션을 더 애플처럼 바꿔줘…"    │
└────────────────────────────────────────────────────────────┘
```

---

## 핵심 데이터 스키마

### LandingReferenceAnalysis

```ts
type LandingReferenceAnalysis = {
  source: { url: string; capturedAt: string; viewport: "desktop" | "tablet" | "mobile" };
  designSystem: {
    colors: { background: string[]; text: string[]; accent: string[]; border: string[] };
    typography: { fontFamilies: string[]; headingScale: string[]; bodyScale: string[] };
    spacing: { sectionGap: string; containerWidth: string; paddingPattern: string };
    visualStyle: {
      mood: string[];
      density: "compact" | "balanced" | "spacious";
      radius: "sharp" | "soft" | "round";
      shadow: "none" | "subtle" | "strong";
    };
  };
  structure: {
    sections: SectionSpec[];
  };
};
```

### SectionSpec

```ts
type SectionSpec = {
  id: string;
  type: "header" | "hero" | "feature" | "cards" | "testimonial" | "pricing" | "faq" | "footer" | "custom";
  label: string;
  order: number;
  enabled: boolean;
  layout: { mode: "centered" | "split" | "grid" | "asymmetric"; maxWidth: string; spacing: string };
  content: {
    headline?: string;
    body?: string;
    ctas?: Array<{ label: string; href: string; variant: "primary" | "secondary" | "ghost" }>;
    items?: Array<Record<string, unknown>>;
  };
  style: { background: string; textColor: string; accentColor?: string; radius?: string };
};
```

### CustomizationPatch

```ts
type CustomizationPatch = {
  target: { sectionId?: string; path?: string };
  instruction: string;
  operations: Array<{
    op: "add" | "replace" | "remove";
    path: string;
    value?: unknown;
    reason: string;
  }>;
};
```

### LandingRun (SQLite)

```ts
type LandingRun = {
  id: string;
  status: "created" | "capturing" | "analyzing" | "customizing" | "generating" | "verifying" | "completed" | "failed";
  referenceUrl: string;
  userGoal: string;
  analysisVersion: number;
  customizationVersion: number;
  generationVersion: number;
  createdAt: string;
  updatedAt: string;
};
```

---

## 에이전트 파이프라인

| 에이전트 | 역할 | 완료 조건 |
|---|---|---|
| **Reference Crawler** | Playwright로 URL 접속, screenshot, DOM 수집 | desktop/tablet/mobile 캡처 완료 |
| **Design Extractor** | 색상·타이포·간격·시각 스타일 추출 | JSON schema parse 성공 |
| **Structure Mapper** | 섹션 단위 구조 분류 | SectionSpec[] 생성 |
| **Customization Agent** | 자연어 → CustomizationPatch | patch JSON 생성 + 원본 적용 가능 |
| **Code Generator** | 최종 JSON → Next.js 컴포넌트 | 파일 생성 완료 |
| **QA Agent** | typecheck + build + preview + history | npm build 성공 + preview URL 정상 |

---

## 검증 사다리

```
1. URL 검증        → 접근 가능, 렌더링 성공
2. 렌더링 검증      → screenshot 1개 이상 생성
3. JSON Schema 검증 → LandingReferenceAnalysis parse 성공
4. Patch 검증      → 원본 JSON에 적용 가능
5. 코드 생성 검증   → 파일 생성 완료
6. Build 검증      → npm run build 성공
7. Preview 검증    → iframe 정상
8. UX QA          → 주요 섹션, CTA, 모바일 확인
9. History 검증    → run + analysis + generation + preview 저장
```

**원칙**: 싼 검증 먼저(schema → build), 비싼 검증(browser preview) 나중.

---

## 하네스 실패 모드 대응

| 실패 모드 | 제품 현상 | 대응 |
|---|---|---|
| 표류 | 레퍼런스와 전혀 다른 랜딩 생성 | GOAL.md + JSON Schema 고정 |
| 조기 정지 | "정보 부족"으로 멈춤 | fallback 규칙 + 부분 분석 허용 |
| 데이터 파괴 | 사용자 JSON 덮어씀 | versioning + patch 방식 + history |
| 예산 소진 | LLM 호출 과다 | 단계별 캐싱 + 싼 검증 먼저 |
| 저작권 리스크 | 원본 자산 그대로 복사 | structure/style 재해석만, asset 금지 |
| 렌더링 불일치 | JSON 맞는데 화면 깨짐 | build + screenshot QA |

---

## 개발 순서 (MVP 1차)

```
1. GOAL.md 작성
2. JSON Schema 고정 (LandingReferenceAnalysis, SectionSpec, CustomizationPatch)
3. SQLite 스키마 생성 (runs, history)
4. Next.js UI Shell (History Sidebar + Workspace + Inspector + Composer)
5. Playwright capture API (/api/capture)
6. Mock JSON으로 Customizing UI 구현
7. OpenAI Structured Outputs로 분석 JSON 생성 (/api/analyze)
8. JSON Patch 자연어 수정 (/api/patch)
9. JSON → Next.js page 생성기 (/api/generate)
10. npm build 검증 루프
11. Preview + History 저장
```

---

## 디렉터리 구조

```
/
├── app/                    # Next.js App Router
│   ├── page.tsx            # 메인 UI Shell
│   ├── preview/[runId]/    # 생성된 랜딩 프리뷰
│   └── api/
│       ├── capture/        # Playwright 캡처
│       ├── analyze/        # OpenAI 분석
│       ├── patch/          # JSON Patch 생성
│       ├── generate/       # 코드 생성
│       └── history/        # 히스토리 CRUD
├── agents/                 # Python 에이전트
│   ├── crawler.py
│   ├── extractor.py
│   ├── mapper.py
│   └── generator.py
├── schemas/                # JSON Schema 정의
│   ├── analysis.json
│   └── patch.json
├── runs/                   # 런 산출물 (screenshot, code snapshot)
│   └── {runId}/
│       ├── capture/
│       └── generated/
├── screenshots/            # 개발 중 UI 스크린샷
├── GOAL.md                 # 에이전트 북극성 미션
├── .env                    # OPENAI_API_KEY
└── db.sqlite               # 히스토리 DB
```

---

## 환경 설정

```bash
cp .env.example .env
# OPENAI_API_KEY=sk-...

npm install
pip install playwright openai
playwright install chromium

npm run dev
```

---

## GOAL.md 요약

> 레퍼런스 URL의 레이아웃 구조·섹션 구성·시각 리듬·디자인 토큰을 분석해 JSON으로 구조화하고,
> 사용자가 커스터마이징한 뒤 새로운 랜딩페이지를 생성·저장·재수정할 수 있게 한다.
>
> 원본 이미지·문구·로고는 복사하지 않는다. Structure와 Style만 참고한다.

**완료 조건**: URL 입력 → 캡처 → 분석 JSON → UI 편집 → 자연어 패치 → 코드 생성 → Preview → History → 재커스터마이징
