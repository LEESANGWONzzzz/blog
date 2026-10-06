# 네이버 블로그 초안 자동화 — 프로젝트 지침

사진과 소재 메모를 받아 초안을 쓰고, 네이버 블로그 **임시저장까지만** 한다. 발행은 사람이 한다.

## 글쓰기 규칙 (정본)

@docs/writing-rules.md

## 화자 프로필

@data/blogger-profile.md

## 작업 방식

- 글쓰기는 `/write` 명령(`.claude/commands/write.md`) 절차를 따른다. 주제 선정부터 한 번에 할 때는 `/auto`, 여러 편을 미리 준비할 때는 `/batch`.
- 초안은 `drafts/YYYYMMDD-<영문슬러그>/draft.json`, 검수 보고는 같은 폴더의 `review.md`에 쓴다.
- 사진은 `input/photos/_mosaic/`에 있는 모자이크 처리된 파일만 쓴다.
- 프로필 항목이 비어 있어 질문하고 답을 받았다면, `data/blogger-profile.md`에 기록해 다시 묻지 않는다. 사용자가 말하지 않은 내용은 채우지 않는다.

## 스크립트

| 명령 | 하는 일 |
|---|---|
| `node scripts/naver_login.js` | 전용 프로필(`naver-profile/`)로 로그인. 사람이 직접 입력한다 |
| `node scripts/lint_draft.js <draft.json>` | 형식 검사. 오류가 있으면 저장 불가 |
| `node scripts/naver_draft.js <draft.json>` | 검사 → 에디터 입력 → 임시저장 → 텍스트 전문 대조 1회 |
| `node scripts/draft_status.js [draft.json]` | 단계별 진행 상황과 재개 지점 |
| `node scripts/make_cards.js --plan <cards.json> --draft <draft.json>` | 정보 카드 이미지 (기본, API 키 불필요) |
| `node scripts/generate_image.js --plan <images.json>` | AI 일러스트 생성 (키 없으면 수동용 프롬프트 파일) |
| `node scripts/plan_schedule.js [--date …]` | 임시저장된 글을 2시간 간격 예약 시각에 배정 → `drafts/publish_plan.md` (`/batch`) |
| `node scripts/analyze_performance.js <csv>` | 조회수 상위 글의 교집합 분석 → `data/analysis-latest.md` (`/analyze`) |
| `npm test` | 형식 검사·발행 가드·성과 분석 테스트 |

## 안전 규칙 (제거·우회 금지)

- `scripts/lib/publish_guard.js`가 발행 버튼 입력을 브라우저 안과 스크립트 양쪽에서 막는다. 이 파일을 지우거나, 가드를 끄거나, 발행 버튼을 누르는 코드를 추가하지 않는다. 가드 확인이 실패하면 즉시 중단한다.
- 로그인 비밀번호를 받거나 저장하지 않는다. `naver-profile/`과 `.env`(API 키)는 커밋·공유하지 않는다. 키 값을 출력하지 않는다.
- 이미 임시저장된 초안은 다시 저장하지 않는다 (중복 초안). 꼭 필요하면 사용자에게 묻고 `--resave`.
- 실패는 초안을 다시 쓸 이유가 아니다. `draft_status.js`로 실패 단계를 보고, 그 단계만 고쳐 다시 돌린다. 에디터 셀렉터 문제는 `scripts/lib/selectors.js`만 고친다 (`debug/`의 스크린샷·HTML 참고).
- 검증은 텍스트 전문 대조 1회가 기본이다. 반복 실행이나 스크린샷 검증이 필요하면 먼저 사용자에게 묻는다.
- 본인 계정만 쓴다. 자동 임시저장은 `data/config.json`의 `dailySaveLimit`(기본 2)건까지 — `naver_draft.js`가 강제한다. 상한을 올리는 것은 운영자 결정이다.
- 발행·예약 버튼은 운영자가 누른다. 여러 편은 `/batch`로 임시저장해 두고 `plan_schedule.js` 계획표대로 운영자가 예약한다.
- 타인 블로그를 크롤링하거나 학습 데이터를 자동으로 모으지 않는다.
