# Windows PC에서 경제 블로그(/daily) 돌리기 (2026-11-09)

> Mac과 같은 저장소·같은 루틴. 다른 점은 PowerShell 문법과 "PC마다 따로 있는 폴더"뿐이다.
> 이지파파(육아) 블로그는 Codex 담당 — `AGENTS.md`.

## 1. 처음 한 번 (PowerShell)
```powershell
cd $HOME\naver-blog-tool          # 저장소 위치 (바탕화면이 OneDrive면 $HOME\Desktop 이 없음)
git pull
npm install
npx playwright install chromium
npm install -g @anthropic-ai/claude-code
node scripts/naver_login.js       # 경제 블로그(beforepayday) 아이디, "로그인 상태 유지" 체크
node scripts/session_check.js     # ✔ [기본(경제 블로그)] 네이버 로그인 있음 → 성공
```
- 한글 깨짐 방지: PowerShell 프로필(`notepad $PROFILE`)에 두 줄
  `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8` / `$OutputEncoding = [System.Text.Encoding]::UTF8`
- `.env`(네이버 검색광고·검색 API 키, `keyword_score.js`용)는 저장소에 없다. Mac의 `.env`를 USB·메신저 나에게 보내기 등으로 직접 옮긴다 (커밋 금지). 없어도 /daily는 돌아간다 (키워드 점수만 빠짐).

## 2. 매일 루틴 (PowerShell)
```powershell
cd $HOME\naver-blog-tool
git pull
node scripts/advisor_trends.js
node scripts/trend_summary.js
$y = (Get-Date).AddDays(-1).ToString('yyyy-MM-dd')
Get-Content "data\trends\$y.md" -Encoding UTF8 | Select-String -Pattern '우리 글 조회수 순위' -Context 0,14
claude
```
→ Shift+Tab으로 auto mode → `/daily YYYY-MM-DD부터` 블록 붙여 넣기 → 예약 → `예약 끝났어` → `커밋하고 push까지 해줘`

## 3. PC가 두 대일 때 지킬 것
| 폴더 | 커밋? | 뜻 |
|---|---|---|
| `drafts/` (초안·저장 기록) | 안 함 | PC마다 따로. 다른 PC에서 쓴 글은 안 보인다 |
| `data/trends/` (어드바이저 기록) | 안 함 | PC마다 따로 쌓인다 |
| `docs/experiment-2026-10.md` (실험 기록표) | **함** | 두 PC가 공유하는 유일한 "이미 쓴 글·예약한 칸" 목록 |
- 그래서 **예약을 마치면 반드시 "예약 끝났어 → 커밋하고 push"** 까지 한다. 그래야 다른 PC의 `/daily`가 그 칸과 주제를 피한다 (`plan_schedule.js --next`가 기록표의 날짜·시각을 빈 칸에서 뺀다, 2026-11-09).
- 같은 날 두 PC에서 동시에 `/daily`를 돌리지 않는다.
- 시작 전 항상 `git pull`.
