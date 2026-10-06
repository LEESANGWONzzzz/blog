# 네이버 블로그 초안 자동화 (Mac)

사진과 소재 메모 한 줄을 주면 Claude Code가 글을 쓰고, 네이버 블로그 **임시저장까지만** 하는 도구입니다.
발행 버튼은 사람이 직접 누릅니다. 이 도구는 발행 버튼을 코드에서 막아 둡니다.

```
/write 소재: …, 한줄 메모: …
   → 프로필 빈칸 질문 (첫 회만)
   → 사진 확인 · 수치 웹 검색 확인
   → drafts/<날짜-슬러그>/draft.json + review.md
   → 형식 검사 (lint) — 확인필요 마커가 있으면 여기서 멈춤
   → 에디터 입력 → 임시저장 → 텍스트 전문 대조 1회
   → 사람이 임시저장함에서 확인 후 발행 (태그 입력 포함)
```

---

## 1. 준비물

- macOS 13 이상
- **Claude Pro / Max / Team / Enterprise 계정.** 무료 플랜으로는 Claude Code를 쓸 수 없습니다 (공식 문서 기준).
- 본인 네이버 블로그 계정 (다른 사람 계정은 쓰지 마세요)

## 2. 설치 (터미널 앱에서)

**터미널 여는 법:** `⌘ + Space` → "터미널" 입력 → Enter.

### 2-1. Node.js — 이 도구의 스크립트용

Claude Code 자체는 Node.js가 필요 없습니다. 하지만 이 도구의 로그인·임시저장 스크립트(Playwright)에는 필요합니다.

- 방법 A: [nodejs.org](https://nodejs.org)에서 LTS `.pkg` 파일을 받아 설치
- 방법 B (Homebrew가 있다면): `brew install node`

확인: `node -v` (v18 이상)

### 2-2. Claude Code

공식 권장 방법 (네이티브 설치, 자동 업데이트 됨):

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

Homebrew로 설치해도 됩니다: `brew install --cask claude-code` (자동 업데이트 없음)

설치 후 **터미널을 새로 열고** `claude --version`으로 확인합니다.

> Windows 가이드의 PowerShell 보안 오류(`Set-ExecutionPolicy`)는 Mac에는 해당 없습니다.
> npm으로 설치할 경우 `sudo npm install -g`는 쓰지 마세요 (공식 문서 경고).

### 2-3. 이 저장소 받기 + 의존성 설치

```bash
cd ~/Desktop
git clone https://github.com/LEESANGWONzzzz/blog.git naver-blog-tool
cd naver-blog-tool
git checkout claude/relaxed-hypatia-w9ii7n   # main에 합쳐지기 전까지
npm install
npx playwright install chromium
cp data/config.example.json data/config.json
```

`data/config.json`을 열어 `blogId`를 블로그 주소 `blog.naver.com/<여기>` 값으로 바꿉니다.
(`open -e data/config.json` 하면 텍스트 편집기로 열립니다.)

### 2-4. 설치 확인

```bash
npm test
```

형식 검사 테스트와 발행 가드 테스트가 모두 `ok`이면 됩니다. 네이버에는 접속하지 않습니다.

## 3. 처음 한 번 — 네이버 로그인

```bash
node scripts/naver_login.js
```

1. 새로 뜬 크롬 창(프로젝트 전용 프로필)에서 아이디·비밀번호·2단계 인증을 **직접** 입력합니다.
2. 로그인이 끝나면 **터미널 창을 클릭**한 뒤 Enter를 누릅니다.
3. `✓ 로그인 세션 저장 완료`가 나오면 성공입니다.

- 비밀번호는 저장되지 않습니다. 세션은 `naver-profile/`에만 남고, 이 폴더는 git에서 제외돼 있습니다.
- 로그인은 반드시 Mac 앞에서 하세요. 원격(폰)으로는 2단계 인증을 처리할 수 없습니다.

## 4. Claude Code 실행과 모드

```bash
cd ~/Desktop/naver-blog-tool
claude
```

- 처음 실행하면 "이 폴더를 신뢰하시나요?"가 나옵니다 → **Yes**.
- `/model`로 모델을 고를 수 있습니다. 처음 손볼 때는 상위 모델, 반복 글쓰기는 가벼운 모델로 비용을 아끼세요.
- `Shift + Tab`을 누를 때마다 권한 모드가 바뀝니다 (편집 자동 승인, 플랜 모드 등). 현재 모드는 화면 아래에 표시됩니다.
- 채팅창에서 `!`로 시작하면 Claude가 아니라 컴퓨터가 직접 명령을 실행합니다. 예: `! node scripts/draft_status.js`

> 이 저장소에는 원본 가이드 5-1의 "만드는 프롬프트"를 실행한 결과물(스크립트·규칙·`/write` 명령)이 이미 들어 있습니다.
> 그래서 플랜 모드로 처음부터 만들 필요가 없습니다.

## 5. 첫 글

### 5-1. 동작 테스트 (사진 없음)

먼저 터미널에서 직접 실행해 봅니다:

```bash
node scripts/naver_draft.js drafts/example/draft.json --dry-run   # 입력 계획만 출력
node scripts/naver_draft.js drafts/example/draft.json             # 실제 임시저장
```

**첫 실행은 실패할 가능성이 높습니다 (정상).** 에디터 셀렉터(`scripts/lib/selectors.js`)를 실제 네이버 화면에서 아직 확인하지 않았기 때문입니다.
실패하면 `debug/`에 스크린샷과 HTML이 남습니다. Claude Code에 이렇게 요청하세요:

```
node scripts/draft_status.js 결과랑 debug/ 최신 파일 보고 selectors.js만 고쳐줘. 다시 돌리기 전에 물어봐줘.
```

성공하면 네이버 임시저장함에서 테스트 글을 확인하고 지우세요.

### 5-2. 실제 글

1. 모자이크 처리한 사진을 `input/photos/_mosaic/`에 넣습니다.
2. Claude Code에서 아래처럼 입력합니다:

```
/write 소재: 2026 연금저축 세액공제, 한줄 메모: 작년에 한도 몰라서 덜 넣은 얘기
```

첫 회에는 Claude가 프로필 빈칸(화자 톤, 경험담, 면책 문구 등)을 묻습니다. 답한 내용은 `data/blogger-profile.md`에 기록되고, 다음부터는 다시 묻지 않습니다.

3. 끝나면 `drafts/<글폴더>/publish_checklist.txt`를 보고 임시저장함에서 확인합니다. 태그를 입력하고 **직접 발행**하세요.

### 5-3. 성과 분석 (글이 10개 이상 쌓인 뒤)

조회수가 잘 나온 내 글들의 공통점(제목 유형, 도입 후킹, 자주 나온 단어)을 찾아 다음 글에 반영합니다. 자세한 방법은 `docs/performance-analysis.md`에 있습니다.

1. 네이버 크리에이터 어드바이저 → 조회수 순위에서 1~20위의 제목과 조회수를 확인합니다.
2. Claude Code에서 `/analyze`를 입력하고, 제목과 조회수를 붙여넣습니다.
3. 결과는 `data/analysis-latest.md`에 저장되고, 이후 `/write`가 이 결과를 참고합니다.

### 5-4. 이미지

`/write`·`/auto`는 사진이 부족하면 **정보 카드 이미지**(표지·핵심 숫자·신청 순서·체크리스트)를 자동으로 만들어 넣습니다.
- API 키도 비용도 필요 없습니다. 글자를 그대로 그리기 때문에 한글·숫자가 틀어지지 않습니다.
- 카드 숫자가 본문과 다르면 만들지 않고 멈춥니다.

그림 같은 일러스트를 더 넣고 싶으면 (선택):
- OpenAI API 키가 있으면 `.env`에 넣어 자동 생성 (ChatGPT 구독과 별도 결제)
- 없으면 ChatGPT에서 직접 그림을 만들어 `input/images/generated/`에 넣고, 맥 Claude에게 "이 그림을 표지로 넣어줘"라고 요청
- 공식 기관 카드뉴스는 공공누리 제1유형 표시가 있는 것만 씁니다. 다른 블로그·뉴스 이미지는 쓰지 않습니다.

### 5-5. 한 번에 자동으로 (`/auto`)

```
/auto (주제, 또는 GPT 작업 A·C 결과를 붙여넣기 — 비우면 오늘 이슈를 직접 찾음)
```
주제 선정 → 공식 자료로 수치 확인 → 이미지 → 글쓰기 → 형식 검사 → 임시저장까지 진행합니다. 확인 안 된 수치가 남거나 이미지가 준비되지 않으면 멈추고 알려 줍니다. 발행은 하지 않습니다.

## 6. 자주 막히는 곳 (Mac 기준)

| 증상 | 해결 |
|---|---|
| `claude: command not found` | 터미널을 새로 열기. 그래도 안 되면 `claude doctor` 또는 공식 문서의 PATH 항목 확인 |
| `/write`가 Unknown command | 이 폴더(`~/Desktop/naver-blog-tool`)에서 `claude`를 실행했는지 확인 |
| `Executable doesn't exist` (Playwright) | `npx playwright install chromium` |
| `Cannot find module 'playwright'` | 이 폴더에서 `npm install` |
| 로그인했는데 로그인 페이지로 다시 감 | 세션 만료. `node scripts/naver_login.js` 다시 실행 |
| 로그인 스크립트에서 Enter가 안 먹음 | 브라우저가 아니라 **터미널 창을 클릭**한 뒤 Enter |
| "형식 오류가 있어 임시저장하지 않습니다" | 출력된 ✖ 항목 수정. `[[확인필요]]` 마커는 값을 확인해 채워야 저장됨 |
| "이미 임시저장됐습니다" | 중복 방지 기능. 임시저장함 확인. 정말 다시 저장하려면 `--resave` |
| `[publish-guard] 가드 설치 실패` | 즉시 중단된 것이 정상 동작. 가드를 끄지 말고 원인 보고 |
| "작성 중인 글이 있습니다" 팝업 | 스크립트가 자동으로 "취소"를 누름. 안 되면 `selectors.js`의 `draftPopupCancel` 수정 |

## 7. 폴더 구조

```
CLAUDE.md                  프로젝트 지침 (규칙 파일·프로필을 불러옴)
docs/writing-rules.md      글쓰기 규칙 정본 (원본 가이드 5-1 수정판)
docs/prompt-review.md      원본 프롬프트에서 고친 점과 이유
data/blogger-profile.md    화자 사실 자산 — 빈칸은 첫 /write 때 채움
data/config.json           blogId (config.example.json 복사)
.claude/commands/write.md  /write 절차
scripts/naver_login.js     전용 프로필 로그인
scripts/naver_draft.js     검사 → 입력 → 임시저장 → 대조
scripts/lint_draft.js      형식 검사기
scripts/draft_status.js    재개 지점 안내
scripts/analyze_performance.js  조회수 상위 글 교집합 분석 (/analyze)
scripts/make_cards.js  정보 카드 이미지 (cards.json → input/images/cards/)
scripts/generate_image.js  AI 일러스트 생성, 선택 (images.json → input/images/generated/)
scripts/lib/publish_guard.js  발행 차단 가드 (제거·우회 금지)
scripts/lib/selectors.js   에디터 셀렉터 (실측 후 갱신)
input/photos/_mosaic/      모자이크 끝난 사진 (git 제외)
drafts/                    초안·검수 보고·상태 (git 제외, example만 포함)
```

## 8. 안전장치와 한계

- **발행 차단:** 브라우저 안에서 발행 버튼의 클릭·Enter 입력을 막고, 스크립트도 클릭 직전에 한 번 더 검사합니다. 가드는 실제로 숨긴 버튼을 눌러 막히는지 확인하고, 실패하면 중단합니다.
- **태그는 자동 입력하지 않습니다.** 네이버는 태그를 발행 설정 화면에서 받는데, 이 도구는 그 화면을 열지 않습니다. `publish_checklist.txt`에 정리된 태그를 발행할 때 넣으세요.
- **동영상·지도(장소)는 아직 지원하지 않습니다.**
- 네이버 약관상 자동화는 회색지대입니다. 본인 계정으로만, 하루 1~2건 정도로 쓰세요.
