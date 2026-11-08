# AGENTS.md — Codex 작업 지침 (이지파파 육아 블로그 전용)

> 이 저장소에서 Codex는 **이지파파 육아 블로그(https://blog.naver.com/sweattogether)만** 맡는다.
> 같은 저장소의 경제 블로그("월급날 전에 읽는 경제")는 Claude Code가 맡는다 (`CLAUDE.md`). 경제 블로그 파일은 읽기만 하고 고치지 않는다.

## 0. 먼저 읽을 파일 (이 순서로)
1. `docs/parenting/voice-easypapa.md` — 이지파파 말투·글 구성·참고 형식
2. `docs/parenting/notion-inventory-2026-11.md` — 노션 33편 분류(A/B/C/D), 다시 확인할 부분, 노션 원문 주소
3. `drafts-easypapa/20261108-*/draft.json`, `cards.json` — 이미 만든 12편 (형식 견본)
4. `docs/writing-rules.md`의 2절(절대 규칙)·3절(사실 자산)·5-5(가독성)·5-8(이미지)·5-12(원스톱 기준)·6절(수치 무결성)·7절(출력 형식). 경제·연예·홈판 편성 규칙(5-9~5-11의 편성 부분)은 이 블로그에 적용하지 않는다.

## 1. 손대도 되는 곳 / 안 되는 곳
- 고쳐도 됨: `drafts-easypapa/`, `docs/parenting/`, `data/config-easypapa.json`, `input/images/cards/easypapa-*`
- 고치지 않음: `drafts/`, `data/config.json`, `data/blogger-profile.md`, `docs/experiment-2026-10.md`, `CLAUDE.md`, `.claude/`, `scripts/` (도구 버그는 고치기 전에 운영자에게 알린다)
- 절대 금지: `naver-profile/`, `naver-profile-*/`, `.env` 를 열람·커밋·공유. 로그인 비밀번호를 받거나 저장. `scripts/lib/publish_guard.js` 삭제·우회, 발행·예약 버튼을 누르는 코드 추가. 발행·예약은 운영자가 한다.
- 이미 임시저장된 초안을 다시 저장하지 않는다 (`--resave`는 운영자가 요청할 때만).
- 네이버 블로그 글(남의 블로그)을 직접 열거나 수집하지 않는다 (네이버 robots.txt가 AI 봇 접근·학습을 막음). 참고가 필요하면 운영자가 캡처나 "벤치마킹:" 메모로 준다.

## 2. 계정 분리 — 모든 명령 앞에 BLOG_ACCOUNT=easypapa
`BLOG_ACCOUNT=easypapa`를 붙이면 같은 스크립트가 육아 블로그용으로 동작한다.
- 로그인 프로필 `naver-profile-easypapa/` · 설정 `data/config-easypapa.json`(blogId `sweattogether`, 카드 브랜드 "이지파파 팩트체크 육아") · 초안 폴더 `drafts-easypapa/`
- 이 값을 빼고 실행하면 **경제 블로그 계정으로 저장된다.** 반드시 붙인다.

| 명령 | 하는 일 |
|---|---|
| `BLOG_ACCOUNT=easypapa node scripts/naver_login.js` | 이지파파 아이디로 로그인 (운영자가 직접 입력, "로그인 상태 유지" 체크) |
| `BLOG_ACCOUNT=easypapa node scripts/make_cards.js --plan <cards.json> --draft <draft.json>` | 카드 이미지 생성. 카드 숫자가 본문에 같은 형태로 없으면 실패 |
| `BLOG_ACCOUNT=easypapa node scripts/lint_draft.js <draft.json>` | 형식 검사. 오류 0이어야 저장 |
| `BLOG_ACCOUNT=easypapa node scripts/naver_draft.js <draft.json>` | 에디터 입력 → 임시저장 → 텍스트 대조 1회 |
| `BLOG_ACCOUNT=easypapa node scripts/export_manuscript.js <draft.json>` | 복사용 원고 `manuscript.txt` |
| `BLOG_ACCOUNT=easypapa node scripts/draft_status.js` | 단계별 진행·재개 지점 |
| `npm test` | 도구 테스트 (BLOG_ACCOUNT 없이) |

### Windows PowerShell에서 실행할 때 (2026-11-08, 운영자 Windows PC)
위 표의 `BLOG_ACCOUNT=easypapa node …` 는 Mac/Linux 문법이다. PowerShell에서는 창마다 먼저 한 번:
```powershell
$env:BLOG_ACCOUNT = "easypapa"
node scripts/lint_draft.js drafts-easypapa/20261108-hub/draft.json
```
여러 편 저장 (운영자가 "저장해"라고 했을 때만):
```powershell
$env:BLOG_ACCOUNT = "easypapa"
Get-ChildItem drafts-easypapa -Directory | ForEach-Object {
  $d = $_.FullName
  node scripts/make_cards.js --plan "$d\cards.json" --draft "$d\draft.json"
  if ($LASTEXITCODE -eq 0) { node scripts/naver_draft.js "$d\draft.json" }
  if ($LASTEXITCODE -eq 0) { node scripts/export_manuscript.js "$d\draft.json" }
}
```
- 이미 저장된 글은 naver_draft.js가 알아서 건너뛴다 (중복 저장 방지).
- 작업이 끝나면 `Remove-Item Env:BLOG_ACCOUNT` 또는 창을 닫는다.

실패하면 초안을 다시 쓰지 말고 `draft_status.js`로 실패 단계만 고쳐 다시 돌린다.

## 3. 이지파파 목소리 (요약 — 자세히는 voice-easypapa.md)
- 화자: 돌 지난 아들 키우는 아빠. 전문가 행세 안 함. "근거를 확인해서 정리한 아빠".
- 독자 호칭 "육아 동지님", 1인칭 "저", 가족은 "저희 아기", "이지파파 집에서는".
- `~해요`체, 짧은 문장(30자 안팎, 40자 넘으면 자르기), 한 문단 2~3문장. 권유형("꺼내보세요").
- 불안을 키우지 않는다("아기마다 달라요", "다시 돌아가도 괜찮아요").
- 모르는 건 모른다고 쓴다("자료마다 달라서 보수적으로 적었어요", "이번에 확인하지 못했어요").
- 경험 문장은 운영자가 말한 것만. 지금 확인된 경험: 13개월쯤 낮잠 1번 전환 / 양치할 때 양치 노래를 틀면 덜 울었음. 그 밖의 경험은 지어내지 말고 `owner_note_prompt`로 운영자에게 질문을 남긴다.
- 마지막 블록(서명, 고정):
  `이 글은 공식 자료를 확인해 정리한 일반 육아 정보예요. 아기마다 다를 수 있으니 걱정되면 소아청소년과 전문의와 꼭 상담하세요.\n💪 이지파파가 육아 동지님의 씩씩한 일상을 응원합니다! 인스타그램 @easy__papa`

## 4. 글 구성
도입 2~3문장(상황 공감 + "공식 자료를 확인해 봤어요" + 결론 미리) → 표지 카드 → 질문형 소제목 4~5개(각 소제목 바로 뒤 2~3문장에 답) → 비교(❌/⭕)·순서 카드 → `✔ 항목 — 내용` 체크리스트 → 이럴 땐 소아과·119 → 꼭 확인할 것 → 독자에게 가벼운 질문 한 줄 → `출처:` 문단 → 서명.
- 라벨 `근거:` `할 일:` `주의:`를 한 글에 2~4회.
- 텍스트만 400자 넘게 이어지지 않게 소제목·구분선·카드로 끊는다.
- 표·마크다운 기호(`**`, `##`, 백틱) 금지. 표는 카드 이미지 + 체크리스트로.
- 분량: 체크리스트형 900~1,500자도 괜찮다 (lint 분량 경고는 무시 가능).

## 5. 건강 정보 규칙 (가장 중요)
- 수치·기준·시기는 **공식 기관 원문**으로 그날 확인한 것만 쓴다: 질병관리청(nip.kdca.go.kr 포함) · 보건복지부 · 식품의약품안전처 · 대한소아청소년과학회 · 미국소아과학회(healthychildren.org) · 미국 CDC · 영국 NHS · WHO. 블로그·카페·제품 회사 글은 출처로 쓰지 않는다.
- 못 연 값은 `[[확인필요: 항목]]` 마커 → 그 글은 저장하지 않고 보고한다.
- 약 이름·용량·투약 방법은 쓰지 않는다 ("의사·약사와 상담"까지만). 증상 판단·진단은 하지 않는다. 위기감을 키우는 문장 금지.
- 노션 C그룹 글은 inventory에 적힌 "문제 있는 부분"을 그대로 옮기지 않는다 (예: 책읽기 "3천2백만 개 어휘력"은 틀린 문장, 이앓이 진통제 "절반 용량"·제품 용법 금지, 근거 없는 퍼센트 삭제).
- 노션·인스타 문장을 그대로 붙이지 않고 블로그용으로 새로 쓴다 (유사문서 방지).
- 아이 사진은 `input/photos/_mosaic/`의 얼굴 가린 파일만. 이름·어린이집 등 개인정보 금지.
- 제품 링크·협찬·쇼핑 커넥트가 있으면 `sponsored`와 첫 블록에 광고 표시 문구 (`data/blogger-profile.md`의 "광고 표시 문구" 중 맞는 것).

## 6. 파일 형식
폴더: `drafts-easypapa/YYYYMMDD-<영문슬러그>/` 안에 `draft.json` + `cards.json`.

draft.json 필수 필드:
```json
{
  "title": "25~32자, 한글·영문·숫자·공백만 (특수문자 금지)",
  "persona": {"연령직군": "돌 전후 아기를 키우는 30대 부모", "소득구간": "해당 없음 (육아 정보 글)", "자산단계": "해당 없음", "투자경험": "해당 없음", "현재감정": "이 글을 찾는 부모의 감정 한 줄"},
  "keywords": {"main": "본문에 띄어쓰기까지 같은 형태로 1~7회", "sub": ["소제목에 넣을 2~3개"]},
  "hook_pattern": "손실회피형|현장몰입형|반전형|공감형",
  "title_hook": "숫자형|비교형|손실회피형|질문형|반전형",
  "category": "지금 꼭 보세요|감기·건강|겨울 생활|먹기·자기·양치|체크리스트 모음",
  "naver_topic": "육아·결혼",
  "sponsored": null,
  "blocks": [
    {"type": "text", "content": "문장. 문장."},
    {"type": "subtitle", "content": "질문형 소제목인가요?"},
    {"type": "divider"},
    {"type": "image", "path": "input/images/cards/easypapa-<슬러그>-01.png", "caption": "선택, 절반 정도만"}
  ],
  "tags": ["띄어쓰기없는태그 5~10개", "이지파파"],
  "place": null, "video": null,
  "owner_note_prompt": "어느 소제목 아래에: 운영자에게 물을 경험 질문 한 줄"
}
```
cards.json: 배열, 카드 3~5장 (표지 + 설명 + 활용).
- `file`: `input/images/cards/easypapa-<슬러그>-0N.png`
- `kind`: cover · hero · list · steps · timeline("시점 — 내용") · number(big) · table(rows: [[항목, 값]] 6줄 이하) · compare(left/right: {title, items 1~4개}) · chart
- `theme`: classic · navy · mint · sunset · night (한 글에 2개 이상, 같은 테마 3장 연속 금지)
- `icon`: 표지·hero·number만 내용에 맞게 (hospital, baby, house, bowl, clock, car, alert, shield, check, gift, calendar 등 `scripts/lib/illust.js` 목록). 나머지 카드는 `"none"` (분위기용 장식 그림 금지).
- items는 5개 이하, 짧게. 카드의 숫자는 본문에 같은 형태로 있어야 한다.

## 7. 한 편 작업 순서
1. inventory에서 다음 글을 고른다 (C그룹 순서: 수유량 → 이유식 2편 합쳐 1편 → 핑거푸드 → 밤중 수유 → 이앓이 → 피부 발진 → 분리불안·낯가림 → 손빨기 → 책읽기 → 6~12주 → 수면 퇴행 → 분유). `drafts-easypapa/`에 같은 주제가 있으면 건너뛴다.
2. 노션 원문을 읽는다 (Notion 연결이 없으면 운영자에게 해당 페이지 내용을 붙여 달라고 요청).
3. 공식 기관 원문으로 수치·기준을 확인하고 `drafts-easypapa/<폴더>/facts.md`에 `값 / 기관 / 페이지 / URL / 확인일`로 남긴다.
4. draft.json · cards.json 작성 → `make_cards.js` → `lint_draft.js` (오류 0) → 카드 이미지를 직접 열어 글자 잘림·숫자 확인.
5. 운영자가 저장을 요청하면 `naver_draft.js` → `export_manuscript.js`.
6. 허브 글(`20261108-hub`)의 목록에 새 글 제목을 추가한다 (발행 뒤 링크는 운영자가 붙인다).
7. 커밋: `drafts-easypapa/`와 `docs/parenting/`만. `git pull --no-rebase` 후 push. 커밋 메시지는 한국어로 무엇을 했는지.

## 8. 보고 (짧게)
편마다: 제목 · 카테고리 · 카드 목록 · 확인한 공식 출처(URL) · 확인 못 한 값 · 운영자 한 줄 질문 · 저장 결과. 하지 않은 일을 했다고 쓰지 않는다.
