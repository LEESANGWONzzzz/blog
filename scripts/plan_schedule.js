#!/usr/bin/env node
// 예약 발행 계획표 만들기 — 임시저장된(아직 발행 안 한) 글을 정해진 간격의 시각에 배정한다.
// 발행은 사람이 한다: 이 표를 보고 네이버 발행 설정에서 "예약"으로 직접 시각을 넣는다.
//
// 사용:
//   node scripts/plan_schedule.js                         # 오늘 남은 시각에 배정 (data/config.json의 schedule.slots, 없으면 07:00부터 120분 간격)
//   node scripts/plan_schedule.js --date 2026-10-08 --start 07:00 --every 120 --end 21:00
//   node scripts/plan_schedule.js --published drafts/<글폴더>/draft.json   # 예약·발행 완료 표시 (계획에서 빠짐)

const fs = require('fs');
const path = require('path');
const { ROOT, DRAFTS_DIR, loadConfig, resolveFromRoot } = require('./lib/config');
const { localDate, readAllStatus, buildSlots, assignSlots } = require('./lib/schedule');

const pad = (n) => String(n).padStart(2, '0');
const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function markPublished(draftFile) {
  const statusFile = path.join(path.dirname(resolveFromRoot(draftFile)), 'status.json');
  if (!fs.existsSync(statusFile)) throw new Error(`status.json이 없습니다: ${statusFile}`);
  const s = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
  if (!s.saved) throw new Error('아직 임시저장되지 않은 초안입니다.');
  s.published = true;
  s.publishedMarkedAt = new Date().toISOString();
  fs.writeFileSync(statusFile, `${JSON.stringify(s, null, 2)}\n`);
  console.log(`✓ 예약·발행 완료로 표시: ${path.relative(ROOT, statusFile)}`);
}

function main() {
  const args = process.argv.slice(2);
  const arg = (n) => { const i = args.indexOf(n); return i === -1 ? null : args[i + 1]; };
  if (arg('--published')) return markPublished(arg('--published'));

  const cfg = loadConfig().schedule;
  const custom = arg('--start') || arg('--every') || arg('--end');
  const opts = {
    start: arg('--start') || cfg.start,
    every: Number(arg('--every') || cfg.every),
    end: arg('--end') || cfg.end,
    // --start/--every/--end를 직접 주면 고정 시각표(schedule.slots) 대신 간격 방식으로 계산
    slots: custom ? null : cfg.slots,
  };
  const label = opts.slots && opts.slots.length
    ? `시각 ${opts.slots.join('·')}`
    : `${opts.start}부터 ${opts.every}분 간격, ${opts.end}까지`;
  const date = arg('--date') || localDate(new Date());
  const slots = buildSlots(date, opts);
  const { plan, overflow } = assignSlots(readAllStatus(), slots);

  const lines = [`# 예약 발행 계획 — ${date} (${label})`, ''];
  if (plan.length === 0) lines.push('- 배정할 글이 없습니다 (임시저장됐고 아직 발행 표시가 없는 글이 0개).');
  plan.forEach(({ entry, slot }, i) => {
    const rel = path.relative(ROOT, entry.draft);
    lines.push(`## ${i + 1}. ${hhmm(slot)} — ${entry.d.title}`);
    lines.push(`- 태그: ${(entry.d.tags || []).map((t) => `#${t}`).join(' ')}`);
    lines.push(`- 예약 후: \`node scripts/plan_schedule.js --published ${rel}\``);
    lines.push('');
  });
  if (overflow.length) {
    lines.push(`> 시각이 모자라 ${overflow.length}편은 다음 날로 넘깁니다: ${overflow.map((e) => e.d.title).join(' / ')}`, '');
  }
  const free = slots.length - plan.length;
  if (free > 0) lines.push(`> 남은 빈 시각 ${free}개: ${slots.slice(plan.length).map(hhmm).join(', ')}`, '');
  lines.push('발행 방법: 네이버 임시저장함에서 글 열기 → 내용 확인 → 발행 설정에서 태그 입력 → "예약"에 위 시각 입력 → 발행(예약) 버튼은 직접 누르기.');

  const out = path.join(DRAFTS_DIR, 'publish_plan.md');
  fs.mkdirSync(DRAFTS_DIR, { recursive: true });
  fs.writeFileSync(out, `${lines.join('\n')}\n`);
  console.log(lines.join('\n'));
  console.log(`\n저장: ${path.relative(ROOT, out)}`);
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error(`✖ ${e.message}`);
    process.exit(1);
  }
}
