# 하네스 엔지니어링 케이스 스터디 — win-hooks v1.6.0

---

## 0. 용어 정리 — 여기서 "하네스"란?

이 세션에서 하네스는 **에이전트(Claude)가 "검증"이라는 목표를 달성하기 위해 도구·관찰·판단을 엮어 돌린 실행 구조 전체**를 뜻합니다. 구체적으로:

- **대상 시스템(SUT, system under test)**: win-hooks v1.6.0 (Claude Code 플러그인 훅을 Windows 호환으로 자동 패치/치유하는 도구).
- **하네스**: "1.6.0이 실제로 동작하는가?"를 *재현 가능하고 반증 가능한* 방식으로 확인하기 위해 에이전트가 구성한 절차 — 스펙 읽기 → 상태 수집 → 다단계 검증 → 근본원인 디버깅 → 최소 수정.

좋은 하네스의 척도(이 문서가 보여주려는 것):
1. **증거 기반(evidence-based)** — 모든 주장 뒤에 명령 출력이 붙는다.
2. **반증 가능(falsifiable)** — "치유된 잔재"와 "처음부터 올바른 생성"을 구분하는 테스트를 설계한다.
3. **결정적/재현 가능(deterministic & reproducible)** — 같은 입력이면 같은 결과.
4. **부작용 인지(side-effect aware)** — 라이브 상태를 건드릴 때 원자성·스냅샷·정리를 고려한다.
5. **근본원인 규율(root-cause discipline)** — 예상 밖 현상이 나오면 추측 대신 증거로 추적한다.

---

## 1. 출발점 — 첫 프롬프트가 정의한 "작업 명세"

사용자는 v1.6.0이 고쳤다고 주장하는 두 가지 런타임 훅 실패를 검증해 달라고 요청했다:

- **(A) `wrapper_broken` (CASE-24)** — 인터프리터 접두 명령(`bash ${CLAUDE_PLUGIN_ROOT}/x.sh`)에서 잘못 생성된 래퍼가 존재하지 않는 `$PLUGIN_ROOT/bash`를 exec → `bash: /c/.../<plugin>/<ver>/bash: No such file or directory`.
  영향: learning/explanatory(SessionStart), ralph-loop(Stop), remember(SessionStart/PostToolUse).
- **(B) `python3_stub` (CASE-09)** — bare `python3 ${CLAUDE_PLUGIN_ROOT}/x.py` 훅이 Microsoft Store App Execution Alias 스텁에 걸려 `Python was not found; run ... from the Microsoft Store ...`.
  영향: hookify(UserPromptSubmit/PreToolUse/PostToolUse/Stop).

그리고 **명시적 5단계 통과 기준**을 제시했다:
1. 1.6.0 활성화 확인(installed_plugins.json 경로 + plugin.json version).
2. 이 세션 SessionStart 출력에 두 에러가 안 뜨는지.
3. `/win-hooks:status` + `/win-hooks:fix` → find-incompatible 비어 있고 verify "all plugins healthy".
4. 스팟체크 — hookify 래퍼가 python 절대경로를 박았는지 + `echo '{}' | bash <래퍼>`가 스텁 메시지 없이 exit 0; `.sh` 플러그인 래퍼에 `$PLUGIN_ROOT/bash` 잔재가 없는지.
5. **(가장 엄밀)** hooks.json을 각자의 `.bak`에서 raw로 원복 후 patch-all 재실행 → 1.6.0이 *처음부터* 올바른 래퍼(클린 이름 + 올바른 경로 + 베이크된 python)를 만드는지.

> **하네스 교훈 ①** — 좋은 하네스는 "되나요?"가 아니라 **검사 가능한 술어(predicate)의 목록**으로 시작한다. 사용자가 통과 기준을 술어로 분해해 줬고, 에이전트는 그걸 그대로 검증 항목으로 채택했다. 통과/실패가 의견이 아니라 관찰로 결정된다.

또한 사용자는 작업 전에 **CLAUDE.md(CASE-09, CASE-24)와 Work Principles를 먼저 읽으라**고 지시했다.

---

## 2. 실행 흐름 — 단계별로 무엇을, 왜

### Step 0 — 스펙을 먼저 내재화
에이전트는 코드를 만지기 전에 CASE-09/CASE-24의 근본원인과 수정 원리를 요약했다:
- CASE-24: `awk '{print $1}'`가 인터프리터를 경로로 오인 → `extract_path_part`로 `${CLAUDE_PLUGIN_ROOT}/...` 토큰을 *위치 무관*하게 추출 + `verify --fix`가 깨진 exec 타깃을 `exec bash "$@"`로 치유.
- CASE-09: bare `python3`를 *항상* 래핑, patch 시점에 functional probe(`"$py" -c ""` exit 0)로 실동작 python을 찾아 절대경로를 베이크.

> **하네스 교훈 ②** — *"스펙을 읽고 기대값을 먼저 적어라."* 검증의 핵심은 관찰을 **사전에 정의한 기대값**과 대조하는 것. 기대값 없이 출력을 보면 "그럴듯해 보임"에 속는다.

### Step 1 — 버전 활성화 (관찰)
`installed_plugins.json`(v2 포맷)에서 `win-hooks@win-hooks` → `...\cache\win-hooks\win-hooks\1.6.0`, version `1.6.0`, `gitCommitSha 00f58aa`(repo HEAD 일치). 활성 경로의 `.claude-plugin/plugin.json`도 `1.6.0`.
→ **두 출처(인덱스 + 매니페스트)를 교차 확인**해 "활성 버전"을 단정.

### Step 2 — SessionStart 무에러 (관찰)
이 세션의 SessionStart hook 출력(handoff/remember/memory 블록)이 정상 생성됐고 `No such file or directory` / `Python was not found`가 없음 → learning/explanatory의 SessionStart, remember의 SessionStart 훅이 깨끗이 실행된 *런타임* 증거.

### Step 3 — 도구 자체로 자기검증 (`/win-hooks:status`, `/win-hooks:fix`)
- `verify` → `all plugins healthy` (exit 0)
- `find-incompatible` → 빈 출력 (0 lines)
- `patch-all` → exit 0, 재스캔도 clean
- 부수적으로 영향 플러그인 전부에 `.bak` 존재 확인 → **Step 5의 raw 입력 확보**.

> **하네스 교훈 ③** — SUT가 제공하는 자기진단(verify/scanner)을 *하네스의 일부로* 쓰되, 그것만 믿지 않는다. verify가 "healthy"라고 한 것이 바로 v1.6.0 이전에 거짓 양성(false healthy)을 냈던 지점이므로, 아래의 독립 검증이 필요했다.

### Step 4 — 검증 사다리(verification ladder): 존재 → 내용 → 실행
- 래퍼 **body**를 직접 읽음:
  - hookify 4종 = `exec "C:/ProgramData/miniconda3/python.exe" "$PLUGIN_ROOT/hooks/X.py" "$@"` (절대경로 베이크).
  - learning/explanatory/ralph-loop/remember = `exec bash "$@"` (CASE-24 치유 body, `$PLUGIN_ROOT/bash` 잔재 없음).
- **실행** 증명: `echo '{}' | bash <hookify 래퍼>` → 4종 모두 **exit 0, "Python was not found" 부재**. (`No module named 'core'`는 hookify가 빈 입력으로 직접 실행될 때 내는 graceful 메시지일 뿐 — python이 *실제로 실행됐다는* 증거.)

> **하네스 교훈 ④** — *존재(파일 있음) ≠ 정확(내용 맞음) ≠ 동작(실행됨).* 약한 검증(파일 존재만)이 바로 v1.6.0 이전 verify의 맹점이었다. 좋은 하네스는 **가장 강한 관찰(실제 실행 + 종료코드 + 부정 신호 부재)** 까지 사다리를 올라간다. 특히 "스텁 메시지가 *없음*"이라는 **부정 단언(negative assertion)** 을 명시적으로 grep해 확인한 점이 중요.

### Step 5 — 가장 엄밀한 테스트: "치유"가 아니라 "처음부터 올바른가"
에이전트는 먼저 `apply-patches` 소스를 읽어 두 가지를 확인했다:
- `.bak`은 최초 패치 때 한 번만 생성되고 재패치해도 안 덮어씀 → **현존 `.bak`은 raw 원본**(이상적 입력).
- `extract_path_part`+`get_wrapper_name`이 `${CLAUDE_PLUGIN_ROOT}/...`의 basename으로 이름을 만들어 인터프리터 접두(`bash`/`python3`)를 건너뜀 → 재패치 시 **클린 이름**이 나와야 함.

그 다음, **단일 bash 호출**로 원자적으로 수행:
1. 현재 상태(hooks.json + `_hooks/`) 스냅샷 백업.
2. hooks.json을 raw `.bak`으로 원복.
3. 기존 래퍼 전삭제(`run-hook.cmd`만 유지) — "처음부터" 생성을 검증하고 잔재 제거.
4. `patch-all` 1회 (5개 플러그인 재패치).
5. 재생성된 hooks.json 명령 / 래퍼 이름 / body 점검.
6. `find-incompatible` + `verify`.

결과:
- 래퍼 **이름**이 클린해짐: `session-start`, `stop-hook`, `session-start-hook`, `post-tool-hook`, `pretooluse/...` (`bash-...sh` 잔재 아님).
- `.sh` body = `exec bash "$PLUGIN_ROOT/<올바른 상대경로>.sh" "$@"`, 모든 exec 타깃 **실제 존재 확인**.
- hookify body = 베이크된 python 절대경로.
- find-incompatible 빈 출력 / verify healthy / hookify 래퍼 재실행 exit 0.
- 소스 repo `git status` **clean**, 스냅샷 백업 정리 완료.

> **하네스 교훈 ⑤ (이 케이스의 백미)** — **"치유된 잔재"와 "근본 생성 로직의 정확성"을 가르는 테스트를 설계하라.**
> `verify --fix`는 깨진 래퍼의 *body*만 고치고 *파일명*은 그대로 둔다. 따라서 이미 깔린 설치본을 아무리 봐도 "이름이 우연히 맞는지/생성 로직이 맞는지" 구분할 수 없다. **raw에서 재패치**해야 비로소 `extract_path_part`가 만드는 진짜 이름이 드러난다. 이건 테스트 설계의 핵심 원리 — *입력을 알려진 깨끗한 상태로 리셋한 뒤 산출물을 관찰*해야 인과를 분리할 수 있다.

> **하네스 교훈 ⑥** — **라이브 상태를 변형할 땐 원자성·스냅샷·정리.**
> 리셋과 재패치를 *한 도구 호출 안에서* 묶은 이유: 호출 사이에 hookify의 PreToolUse/PostToolUse나 ralph-loop의 Stop 같은 훅이 *raw(미패치) 설정으로 발화하는 창*을 없애기 위해서. 또 사전 스냅샷·사후 정리·`git status` 확인으로 "검증이 SUT를 영구 오염시키지 않음"을 보장.

---

## 3. 반전 — 하네스가 만든 부작용, 그리고 근본원인 디버깅

검증을 통과시킨 뒤, 사용자가 **여전히 Stop 훅 에러가 난다**고 보고:

```
Ran 2 stop hooks
  "${CLAUDE_PLUGIN_ROOT}/_hooks/run-hook.cmd" bash-CLAUDEPLUGINROOThooksstop-hooksh "${CLAUDE_PLUGIN_ROOT}/hooks/stop-hook.sh"
  "${CLAUDE_PLUGIN_ROOT}/_hooks/run-hook.cmd" stop
  Stop hook error: bash: /c/.../ralph-loop/1.0.0/_hooks/bash-CLAUDEPLUGINROOThooksstop-hooksh: No such file or directory
```

에이전트는 추측으로 패치하지 않고 **systematic-debugging**을 적용했다.

### Phase 1 — 증거 수집 (4개 보강 관찰)
| 증거 | 관찰 | 의미 |
|---|---|---|
| A | 현재 hooks.json = `run-hook.cmd stop-hook` | 디스크는 이미 올바름(Step 5 결과) |
| B | `_hooks/`에 `stop-hook`만, `bash-...sh` 없음 | 옛 래퍼 사라짐 |
| C | 캐시가 참조하는 `bash-...sh` = **MISSING(Step5에서 삭제)** | 에러의 직접 원인 |
| D | settings.json에 stop 훅 없음 | 유일 출처 = ralph-loop plugin hooks.json |

### 근본원인
Claude Code는 hook 설정을 **SessionStart에 캐시**하고 이벤트마다 hooks.json을 다시 읽지 않는다. 이 세션은 시작 시 ralph-loop의 *구버전 패치 명령*(옛 이름 `bash-...sh` + 경로가 extra arg)을 로드했고, 그 시점엔 래퍼가 존재(body는 치유됨)해 정상 동작했다. **Step 5 엄밀 테스트가 그 래퍼를 삭제**하면서 디스크는 고쳐졌지만 **실행 중 세션의 캐시는 삭제된 파일을 계속 가리켜** 에러가 났다.

→ **이것은 1.6.0 결함이 아니라, "라이브 캐시 상태를 가진 SUT를 검증 중 변형"한 데서 온 부작용.** verify가 이를 못 잡는 것도 설계상 정상(디스크 기준 도구는 "세션 캐시 vs 디스크" 드리프트를 볼 수 없음). 그래서 win-hooks의 모델은 CASE-13처럼 "SessionStart마다 재패치 → 다음 세션부터 반영"이다.

### Phase 4 — 최소 수정
재시작해도 해소되지만, 라이브 세션의 에러를 즉시 없애기 위해 삭제했던 래퍼를 *치유된 shim*(`exec bash "$@"`)으로 정확히 복원. 검증: 존재·`bash -n` syntax-ok·`exec bash "$@"` 패스스루(probe로 exit 7 확인)·실제 `stop-hook.sh` 존재·두 stop 참조 모두 해소.

> **하네스 교훈 ⑦** — **디스크 상태 ≠ 런타임(캐시) 상태.** 많은 하네스 버그가 "정적 파일은 맞는데 실행 중 프로세스가 옛 상태를 들고 있음"에서 온다. 검증 대상이 *부팅 시 설정을 캐시하는* 시스템이라면, 검증 중의 변형이 그 캐시와 어긋날 수 있음을 모델에 포함해야 한다.

> **하네스 교훈 ⑧** — **예상 밖 현상엔 추측 금지, 증거 우선.** 에이전트는 "또 깨졌나?" 하고 즉흥 패치하는 대신 A–D 증거로 인과를 확정하고, *내가 만든 부작용*임을 정직하게 규명한 뒤 최소 수정만 적용했다. (Iron Law: 근본원인 없이는 수정 없음.)

---

## 4. 왜 이게 "좋은 하네스 예시"인가 — 요약

1. **술어 기반 통과 기준** — "되나요"가 아니라 검사 가능한 5개 술어. 통과/실패가 관찰로 결정됨.
2. **기대값 선언 후 대조** — 스펙(CASE-09/24)을 먼저 읽고 래퍼 이름/경로/베이크 형태의 *기대값*을 적은 뒤 관찰과 대조.
3. **검증 사다리** — 존재→내용→실행→from-scratch 재생성. 가장 약한 검증(파일 존재)이 곧 SUT의 과거 맹점이었음을 알고 더 강한 관찰까지 올라감.
4. **부정 단언 명시** — "스텁 메시지가 *없음*", "`$PLUGIN_ROOT/bash` 잔재 *없음*"을 적극적으로 grep해 확인.
5. **인과 분리 테스트** — raw 리셋 후 재패치로 "치유된 잔재"와 "생성 로직 정확성"을 분리. 테스트 설계의 정수.
6. **안전한 변형** — 원자적 단일 호출 + 스냅샷 + 정리 + `git status` clean 확인.
7. **근본원인 규율** — 예상 밖 Stop 에러를 systematic-debugging으로 추적, 자기 부작용임을 정직히 규명.
8. **결정적·재현 가능** — 모든 단계가 명령과 출력으로 남아 제3자가 그대로 재현/반증 가능.

### 안티패턴(이 세션이 *피한* 것)
- verify "healthy"만 보고 통과 선언(거짓 양성에 속음).
- 파일 존재만 확인하고 "동작한다" 단정.
- 이미 깔린 설치본만 보고 "이름도 맞으니 생성 로직도 맞겠지" 추정.
- 라이브 캐시를 건드린 뒤 난 에러를 SUT 결함으로 오인하고 즉흥 패치.

---

## 5. 부록 — 사용한 핵심 도구/관찰

- `installed_plugins.json`(v2) 파싱으로 활성 경로·버전·gitCommitSha 교차 확인.
- `scripts/verify`, `scripts/find-incompatible`, `hooks/patch-all` — SUT의 자기진단을 하네스에 편입.
- `apply-patches` 소스 정독 → `.bak` 불변성 / `extract_path_part` 이름 생성 규칙을 *사전에* 파악(기대값 도출).
- `echo '{}' | bash <wrapper>` + 종료코드 + grep 부정 단언 — 실행 레벨 증명.
- 단일 원자적 bash 호출(스냅샷→리셋→재패치→점검→정리) — 부작용 창 제거.
- systematic-debugging 4-phase — 근본원인 확정 후 최소 수정.

---

## 6. 한 줄 요약

> "**검사 가능한 술어**로 시작해, **기대값을 먼저 적고**, **존재가 아니라 실행까지** 관찰하며, **입력을 깨끗이 리셋해 인과를 분리**하고, **라이브 상태는 원자적으로** 다루며, 예상 밖 현상은 **추측 대신 증거로** 추적한다 — 그리고 자기가 만든 부작용까지 정직하게 규명한다."
