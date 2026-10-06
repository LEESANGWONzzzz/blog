#!/usr/bin/env node
// 임시저장 진행 상황을 보고 재개 지점을 알려준다.
//
// 사용: node scripts/draft_status.js                         # drafts/ 아래 전체
//       node scripts/draft_status.js drafts/<글폴더>/draft.json

const fs = require('fs');
const path = require('path');
const { DRAFTS_DIR, ROOT, resolveFromRoot } = require('./lib/config');
const { STEPS, readStatus } = require('./naver_draft');

function nextAction(status) {
  if (status.saved) {
    if (status.steps.verify && !status.steps.verify.ok) {
      return '임시저장은 됐고 대조만 불일치 — 임시저장함에서 해당 부분을 직접 고치세요 (다시 저장하지 않음).';
    }
    return '완료 — 임시저장함에서 확인 후 직접 발행하세요.';
  }
  const failed = STEPS.find((s) => status.steps[s] && !status.steps[s].ok);
  if (failed === 'lint') return '형식 오류 — 초안 JSON의 해당 항목만 고친 뒤 naver_draft.js 재실행.';
  if (failed) {
    const autosave = failed === 'body' || failed === 'save' ? ' 네이버 자동저장으로 임시저장함에 중간본이 남았을 수 있으니 발행하지 말고 지우세요.' : '';
    return `[${failed}] 단계 실패 —${autosave} 에디터는 매번 처음부터 다시 입력합니다. 원인(대개 scripts/lib/selectors.js)만 고치고 naver_draft.js 재실행. 초안은 다시 쓰지 않습니다.`;
  }
  return '아직 실행 전 — node scripts/naver_draft.js <draft.json>';
}

function report(draftFile) {
  const status = readStatus(draftFile);
  console.log(`\n${path.relative(ROOT, draftFile)}`);
  for (const s of STEPS) {
    const st = status.steps[s];
    const mark = !st ? '·' : st.ok ? '✓' : '✖';
    const detail = st && st.detail ? ` — ${[].concat(st.detail).join(' / ').slice(0, 120)}` : '';
    console.log(`  ${mark} ${s}${detail}`);
  }
  console.log(`  → ${nextAction(status)}`);
}

const arg = process.argv[2];
if (arg) {
  report(resolveFromRoot(arg));
} else {
  const dirs = fs.existsSync(DRAFTS_DIR) ? fs.readdirSync(DRAFTS_DIR) : [];
  const files = dirs.map((d) => path.join(DRAFTS_DIR, d, 'draft.json')).filter((f) => fs.existsSync(f));
  if (!files.length) console.log('drafts/ 아래에 초안이 없습니다.');
  files.forEach(report);
}
