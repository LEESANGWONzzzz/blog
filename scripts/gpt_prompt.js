#!/usr/bin/env node
// GPT에 보낼 메시지를 만들어 화면에 출력하고, 맥이면 클립보드에도 복사한다 (ChatGPT에 바로 붙여넣기).
//
// 사용:
//   node scripts/gpt_prompt.js          # 작업 F — 다음 빈 예약 칸 6개 기획 요청
//   node scripts/gpt_prompt.js 4        # 칸 4개만
//   node scripts/gpt_prompt.js --review # 작업 H — 주간 성과 리뷰 (실험 기록표 첨부)
//   node scripts/gpt_prompt.js --money  # 작업 G — 수익화 경로 조사

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { ROOT, loadConfig } = require('./lib/config');
const { localDate, readAllStatus, freeSlots } = require('./lib/schedule');

function build(args) {
  if (args.includes('--money')) return '작업 G.';
  if (args.includes('--review')) {
    const table = fs.readFileSync(path.join(ROOT, 'docs', 'experiment-2026-10.md'), 'utf8');
    return `작업 H.\n${table}`;
  }
  const n = Number(args.find((a) => /^\d+$/.test(a)) || loadConfig().batchSize || 6);
  const entries = readAllStatus();
  const slots = freeSlots(entries, loadConfig().schedule.slots || [], n);
  const recent = entries.filter((e) => !e.d.test && e.s.saved)
    .sort((a, b) => String(b.s.steps.save.at).localeCompare(String(a.s.steps.save.at)))
    .slice(0, 20).map((e) => e.d.title);
  return [
    `작업 F. 조사일 ${localDate(new Date())}. 칸 목록:`,
    ...slots.map((s) => `- ${s.key} (${s.oddDay ? '홀수일' : '짝수일'})`),
    '트렌드: (크리에이터 어드바이저 메인/검색 유입 1~20위가 있으면 여기에 붙여넣기, 없으면 이 줄 지우기)',
    `최근 발행·저장 주제(겹치지 않게): ${recent.join(' / ') || '없음'}`,
  ].join('\n');
}

const text = build(process.argv.slice(2));
console.log(text);
if (process.platform === 'darwin') {
  try {
    execSync('pbcopy', { input: text });
    console.log('\n✓ 클립보드에 복사했습니다. ChatGPT 입력창에 붙여넣기(⌘V) 하세요.');
  } catch { /* 클립보드 실패는 무시 — 화면의 글을 직접 복사 */ }
}
