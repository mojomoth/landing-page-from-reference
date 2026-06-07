# 개발 방법

- 하네스 구조를 생성해서 중간에 Stop없이 one shot 구현
- 하네스 구조의 Guide는 markdown, Guardrail은 hook
- Ralph Loop 를 사용해서 세션 격리와 개발 지속 `while :; do cat PROMPT.md | claude -p; done`
- 화면이 구현될 때마다 피드백이 가능하도록 screenshots/ 폴더에 저장

## 개발 조건

- 최대한 단일 프로세스로 개발
- Feature가 추가되거나 수정될 때 마다 Git에 Commit
- OpenAI API는 .env 파일 

## 완료 방식

- Demo Screenshot (선택)
- 프로젝트 루트 경로에 README.md 원페이저 요약 (선택)
- 구현 과정 전부 커밋 (선택)
