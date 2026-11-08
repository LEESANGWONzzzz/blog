# Codex 밤샘 작업 지시 (운영자가 자는 동안 — 질문하지 말고 끝까지)

이 PC는 Windows, PowerShell이다. 명령 앞에는 `$env:BLOG_ACCOUNT = "easypapa"`가 이미 설정돼 있다.
먼저 `AGENTS.md`, `docs/parenting/voice-easypapa.md`, `docs/parenting/notion-inventory-2026-11.md`를 읽고 그대로 따른다.

## 목표
노션 글 중 아직 `drafts-easypapa/`에 초안이 없는 것을 이지파파 초안으로 만든다. 운영자는 아침에 임시저장함에서 확인한다.

## 순서 (하나씩 끝내고 다음으로)
1. 자녀장려금 — 기한 후 신청 2026-12-01 마감. 국세청 원문으로 기간·요건·금액 확인. category "지금 꼭 보세요".
2. C그룹 15편 — AGENTS.md 7절 순서. 구강건강은 기존 양치 글(20261108-toothpaste)과 겹치지 않는 내용만(첫 치과 검진 시기, 우유병 충치 예방 등).
3. 유보통합 — 교육부 원문으로 지금도 맞는 것만. 확인 안 되는 항목은 버린다.
4. 알집매트 → "유아매트 리콜 확인하는 법"으로 일반화 (제품안전정보센터 등 공식 자료).
5. 선크림 → 제휴 링크 없이 정보 글로 (미국소아과학회 자료). 제품 추천·링크 넣지 않음.
- 건너뜀: "아기랑 가기 좋은 카페"(운영자가 하위 페이지를 줘야 함), "집에서 쇼핑몰 시작하기 A to Z"(다른 사람 저작물 — 절대 쓰지 않음).

## 편마다
1. Notion 연결이 있으면 inventory 주소표의 노션 원문을 읽는다. 없으면 inventory의 주제·문제점 메모만 보고, 내용은 공식 자료로 새로 쓴다 (노션 내용을 추측해서 채우지 않는다).
2. 공식 기관 원문(AGENTS.md 5절 목록)으로 수치·기준 확인 → `drafts-easypapa/<폴더>/facts.md`에 `값 / 기관 / 페이지 / URL / 확인일`.
3. `draft.json`·`cards.json` 작성 (폴더명 `YYYYMMDD-<영문슬러그>`, 날짜는 오늘).
4. `node scripts/make_cards.js --plan <cards.json> --draft <draft.json>` → `node scripts/lint_draft.js <draft.json>` 오류 0까지 고친다.
5. 확인 못 한 값이 있으면 본문에 `[[확인필요: 항목]]`을 남긴다 → 아침 저장 단계에서 자동으로 제외된다. 지어내서 채우지 않는다.
6. 노션의 틀린 내용·근거 없는 숫자·투약 조언은 옮기지 않는다 (inventory C표).
7. 허브 글 `drafts-easypapa/20261108-hub/draft.json`의 해당 분류 문단에 새 글 제목을 추가한다. 허브 카드 숫자 검사가 깨지지 않게 make_cards·lint를 다시 돌린다.

## 하지 않는 것
- `naver_draft.js`(임시저장)는 실행하지 않는다. 작업이 끝나면 스크립트가 검사 통과한 글만 저장한다.
- git commit·push는 하지 않는다 (스크립트가 마지막에 한다).
- 경제 블로그 파일(`drafts/`, `data/config.json` 등), `scripts/`, `naver-profile*`, `.env`는 건드리지 않는다.

## 마지막에
`docs/parenting/overnight-report-<오늘날짜>.md`에 편마다 한 줄: 폴더 · 제목 · 확인한 공식 출처 URL · 남은 [[확인필요]] · 운영자 한 줄 질문. 하지 않은 일을 했다고 쓰지 않는다.
