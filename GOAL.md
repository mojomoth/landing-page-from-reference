# GOAL.md — 북극성 미션 (표류 방지 앵커)

> 이 파일은 하네스의 **벽 1**이다. SessionStart 훅이 매 세션·재개·컨텍스트 압축 시점마다
> 이 요약을 재주입한다. 에이전트는 이 목표를 절대 잊지 않는다.

## 한 줄 정의

레퍼런스 URL을 입력하면 디자인 구조를 분석해 JSON으로 구조화하고, 사용자가 자연어·UI로
커스터마이징한 뒤 새 랜딩페이지를 **생성·저장·재수정**할 수 있는 LLM 기반 랜딩 제작 도구.

---

## 절대 규칙 (틀리면 안 되는 사실 — Iron Laws)

1. **단일 프로세스.** 전체 시스템은 **Node/TypeScript 단일 Next.js 프로세스**로 동작한다.
   별도 Python 런타임/FastAPI/Redis/Postgres를 띄우지 않는다. (doing.md "최대한 단일 프로세스")
   - DB는 **`node:sqlite` 내장 모듈** (네이티브 빌드 없음). better-sqlite3 금지.
   - 브라우저 캡처는 **`playwright` (Node)**. Python Playwright 아님.
   - "에이전트"는 **`lib/agents/*.ts` 모듈**이다. 별도 프로세스가 아니다.

2. **스키마는 단일 진실원천(SSOT).** `schemas/analysis.schema.json`,
   `schemas/patch.schema.json` 이 유일한 데이터 계약이다.
   - `lib/schema.ts` 의 TS 타입은 이 스키마와 **반드시 일치**해야 한다.
   - LLM 출력은 **OpenAI Structured Outputs(strict)** 로 이 스키마에 고정한다.
   - 타입을 다른 곳에서 재정의하지 않는다. 스키마를 깨는 변경은 금지.

3. **자산 미복사.** 원본 사이트의 이미지·문구·로고·브랜드 자산을 **그대로 복사하지 않는다.**
   레이아웃 구조·섹션 구성·시각 리듬·디자인 토큰만 **재해석**한다.

4. **데이터 파괴 금지.** 사용자 JSON은 **덮어쓰지 않고** patch + versioning 으로만 바꾼다.
   `runs/`·`schemas/`·`GOAL.md` 를 파괴적으로 다루지 않는다. (가드레일: PreToolUse 훅)

5. **조기 정지 금지 (fallback).** "정보 부족"으로 멈추지 않는다. 외부 의존(네트워크/LLM/브라우저)이
   실패하면 **결정적 mock 으로 폴백**해 파이프라인을 끝까지 흘려보낸다. (`lib/mock.ts`)
   - `OPENAI_API_KEY` 가 없으면 자동으로 mock 모드. 앱은 키 없이도 end-to-end 동작해야 한다.

6. **검증은 비용 순서.** 싼 검증 먼저: schema → typecheck → build → (마지막) browser preview.
   브라우저 검증을 1순위로 쓰지 않는다. (예산 소진 방지)

7. **기능마다 커밋.** 의미 있는 단위마다 Git commit. (doing.md)

8. **화면마다 스크린샷.** UI가 구현될 때마다 `screenshots/` 에 저장한다. (doing.md)

---

## 정식 해석 결정 (이 프로젝트의 canonical choice — 표류 방지용 고정)

README가 두 갈래를 허용하는 지점은 아래로 **고정**한다. 루프는 이를 재논의하지 않는다.

| 선택지 | 고정 결정 | 근거 |
|---|---|---|
| Backend: Python or Route Handler | **Next.js Route Handler** | Iron Law 1 (단일 프로세스) |
| Code Gen: 파일 생성+빌드 vs 런타임 렌더 | **데이터 기반 런타임 렌더 (주) + 코드 스냅샷 저장 (부)** | 런타임 빌드는 느리고 깨지기 쉬움(예산 소진). `/preview/[id]` 가 최종 JSON을 React로 렌더. `/api/generate` 가 `page.tsx` 소스 문자열을 산출물로 저장. |
| DB | **`node:sqlite`** | Node 26 내장, 의존성 0 |
| LLM | **OpenAI Structured Outputs (strict)** + mock fallback | 스키마 고정 |

---

## 완료 조건 (Definition of Done — 검사 가능한 술어)

아래가 **모두** 참일 때만 `<promise>ONESHOT COMPLETE</promise>` 를 출력하고
`.harness/state/ONESHOT_COMPLETE` 센티넬을 만든다.

1. `bash harness/verify.sh` 가 exit 0 (schema → typecheck → build 전부 통과).
2. URL 입력 → 캡처 → 분석 JSON → UI 편집 → 자연어 patch → 코드 생성 → preview → history
   end-to-end 가 동작한다 (mock 모드에서도).
3. 분석/패치 JSON 이 `schemas/*.schema.json` 검증을 통과한다.
4. `/preview/[runId]` 가 최종 JSON 으로 랜딩을 렌더한다.
5. History 에서 과거 run 을 다시 불러와 재커스터마이징할 수 있다.
6. `screenshots/` 에 메인 UI + 생성된 랜딩 preview 스크린샷이 있다.
7. 모든 작업이 커밋되어 `git status` clean.

---

## 실패 모드 → 벽 (요약)

| 실패 모드 | 벽 |
|---|---|
| 표류 | GOAL.md(이 파일) + 스키마 SSOT + SessionStart 훅 |
| 조기 정지 | mock fallback + 부분 분석 허용 |
| 데이터 파괴 | PreToolUse 훅 + patch/versioning |
| 예산 소진 | 검증 사다리(싼 것 먼저) + 단계 캐싱 |
| 저작권 | structure/style 재해석만, 원본 자산 금지 |
| 렌더 불일치 | build + screenshot QA |
