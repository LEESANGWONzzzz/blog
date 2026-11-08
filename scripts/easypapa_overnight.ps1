# 이지파파 밤샘 작업 (Windows PowerShell)
#   1) Codex가 남은 노션 글 초안을 만든다 (docs/parenting/codex-overnight-prompt.md)
#   2) 검사를 통과한 초안만 이지파파 블로그에 임시저장한다 ([[확인필요]]가 남은 글은 lint 오류로 자동 제외)
#   3) drafts-easypapa/와 docs/parenting/만 커밋·push
# 발행·예약은 하지 않는다. 운영자가 아침에 임시저장함에서 확인한다.
# 실행: powershell -ExecutionPolicy Bypass -File scripts\easypapa_overnight.ps1

$ErrorActionPreference = 'Continue'
Set-Location (Split-Path -Parent $PSScriptRoot)
$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
New-Item -ItemType Directory -Force debug | Out-Null
Start-Transcript -Path "debug\easypapa-overnight-$stamp.log" -Append

$env:BLOG_ACCOUNT = 'easypapa'
# 자는 동안 PC가 잠들지 않게 (끝나면 30분으로 되돌림)
powercfg /change standby-timeout-ac 0

# 커밋할 때 필요한 이름·메일이 없으면 이 저장소에만 설정
if (-not (git config user.name)) { git config user.name 'LEESANGWONzzzz' }
if (-not (git config user.email)) { git config user.email 'sangwon5275@gmail.com' }

git pull --no-rebase --no-edit

Write-Host "`n===== 1. Codex 초안 작성 =====" -ForegroundColor Cyan
# PowerShell 5.1 기록(Transcript)은 프로그램 출력을 그대로 담지 않아서 | ForEach-Object 로 넘겨 기록에 남긴다
if (-not (Get-Command codex -ErrorAction SilentlyContinue)) {
  Write-Host 'codex 명령이 없습니다 → npm install -g @openai/codex 후, codex 를 한 번 실행해 로그인하세요. Codex 단계 건너뜀.' -ForegroundColor Red
} else {
  codex exec --full-auto "docs/parenting/codex-overnight-prompt.md 파일을 읽고 그 지시를 끝까지 수행해. 운영자는 자고 있으니 질문하지 말고 진행해." 2>&1 | ForEach-Object { "$_" }
  Write-Host "codex 종료 코드: $LASTEXITCODE"
}

Write-Host "`n===== 2. 검사 통과한 초안만 임시저장 =====" -ForegroundColor Cyan
node scripts/session_check.js 2>&1 | ForEach-Object { "$_" }
$loggedIn = ($LASTEXITCODE -eq 0)
if (-not $loggedIn) { Write-Host '이지파파 네이버 로그인이 없어 임시저장을 건너뜁니다. 아침에 naver_login.js 로 다시 로그인하세요.' -ForegroundColor Red }
if ($loggedIn) { Get-ChildItem drafts-easypapa -Directory | ForEach-Object {
  $d = $_.FullName
  Write-Host "`n--- $($_.Name)" -ForegroundColor Yellow
  if (-not (Test-Path "$d\draft.json") -or -not (Test-Path "$d\cards.json")) { Write-Host '초안 파일 없음 → 건너뜀'; return }
  node scripts/make_cards.js --plan "$d\cards.json" --draft "$d\draft.json" 2>&1 | ForEach-Object { "$_" }
  if ($LASTEXITCODE -ne 0) { Write-Host '카드 실패 → 건너뜀'; return }
  node scripts/naver_draft.js "$d\draft.json" 2>&1 | ForEach-Object { "$_" }
  if ($LASTEXITCODE -eq 0) { node scripts/export_manuscript.js "$d\draft.json" } else { Write-Host '저장 안 함 (검사 오류·확인필요·로그인 문제)' }
} }
node scripts/draft_status.js 2>&1 | ForEach-Object { "$_" }

Write-Host "`n===== 3. 커밋·push =====" -ForegroundColor Cyan
git add drafts-easypapa docs/parenting
git commit -m "이지파파: 밤샘 작업 초안 ($stamp)"
git pull --no-rebase --no-edit
git push

powercfg /change standby-timeout-ac 30
Write-Host "`n끝. 로그: debug\easypapa-overnight-$stamp.log" -ForegroundColor Green
Stop-Transcript
