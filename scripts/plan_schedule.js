#!/usr/bin/env node
// 예약 발행 계획표 만들기 — 임시저장된(아직 발행 안 한) 글을 정해진 간격의 시각에 배정한다.
// 발행은 사람이 한다: 이 표를 보고 네이버 발행 설정에서 "예약"으로 직접 시각을 넣는다.
//
// 사용:
//   node scripts/plan_schedule.js                         # 내일 시각에 배정 (전날 저녁 루틴 · data/config.json의 schedule.slots)
//   node scripts/plan_schedule.js --today                 # 오늘 남은 시각에 배정
//   node scripts/plan_schedule.js --date 2026-10-08 --start 07:00 --every 120 --end 21:00
//   --no-rss                                              # 블로그 RSS로 발행 여부 확인을 건너뜀
//   node scripts/plan_schedule.js --published drafts/<글폴더>/draft.json   # 예약·발행 완료 표시 (계획에서 빠짐)

const fs = require('fs');
const path = require('path');
const { ROOT, DRAFTS_DIR, loadConfig, resolveFromRoot } = require('./lib/config');
const { localDate, nextDate, rssTitles, publishedByRss, readAllStatus, buildSlots, assignSlots, freeSlots, isPending } = require('./lib/schedule');

const pad = (n) => String(n).padStart(2, '0');
const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function markPublished(draftFile, note) {
  const statusFile = path.join(path.dirname(resolveFromRoot(draftFile)), 'status.json');
  if (!fs.existsSync(statusFile)) throw new Error(`status.json이 없습니다: ${statusFile}`);
  const s = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
  if (!s.saved) throw new Error('아직 임시저장되지 않은 초안입니다.');
  s.published = true;
  s.publishedMarkedAt = new Date().toISOString();
  if (note) s.publishedNote = note;
  fs.writeFileSync(statusFile, `${JSON.stringify(s, null, 2)}\n`);
  console.log(`✓ 예약·발행 완료로 표시: ${path.relative(ROOT, statusFile)}`);
}

// 블로그에 이미 공개된 글은 자동으로 발행 표시 (표시를 잊어 다음 날 계획에 남는 일 방지).
// 예약만 하고 아직 공개 전인 글은 RSS에 없으므로 --published로 직접 표시한다.
async function syncFromRss(blogId) {
  if (!blogId) return;
  try {
    const res = await fetch(`https://rss.blog.naver.com/${blogId}.xml`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const found = publishedByRss(readAllStatus(), rssTitles(await res.text()));
    for (const e of found) markPublished(e.draft, '블로그 RSS에서 공개 확인');
  } catch (e) {
    console.warn(`⚠ 블로그 RSS 확인 실패(${e.message}) — 이미 발행한 글은 --published로 직접 표시하세요.`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (n) => { const i = args.indexOf(n); return i === -1 ? null : args[i + 1]; };
  if (arg('--published')) return markPublished(arg('--published'));

  const config = loadConfig();
  if (!args.includes('--no-rss')) await syncFromRss(config.blogId);
  const cfg = config.schedule;

  // --next N: 다음 빈 예약 칸 N개 (/daily가 글마다 publish_at을 정할 때 쓴다)
  if (arg('--next')) {
    const list = freeSlots(readAllStatus(), cfg.slots || [], Number(arg('--next')));
    list.forEach((x) => console.log(`${x.key}\t${x.oddDay ? '홀수일' : '짝수일'}`));
    return;
  }
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
  const date = arg('--date') || (args.includes('--today') ? localDate(new Date()) : nextDate());
  const all = readAllStatus();
  // publish_at이 있는 글은 그 날짜·시각 그대로, 없는 예전 글은 date의 빈 칸에 배정
  const dated = all.filter((e) => isPending(e) && e.d.publish_at)
    .map((e) => ({ entry: e, slot: new Date(e.d.publish_at.replace(' ', 'T') + ':00') }));
  const usedOnDate = new Set(dated.filter((p) => localDate(p.slot) === date).map((p) => hhmm(p.slot)));
  const slots = buildSlots(date, opts).filter((t) => !usedOnDate.has(hhmm(t)));
  const { plan: legacy, overflow } = assignSlots(all.filter((e) => !e.d.publish_at), slots);
  const plan = [...dated, ...legacy].sort((a, b) => a.slot - b.slot);
  const now = new Date();

  const lines = [`# 예약 발행 계획 (${label})`, ''];
  if (plan.length === 0) lines.push('- 배정할 글이 없습니다 (임시저장됐고 아직 발행 표시가 없는 글이 0개).');
  let lastDay = '';
  plan.forEach(({ entry, slot }, i) => {
    const rel = path.relative(ROOT, entry.draft);
    const day = localDate(slot);
    if (day !== lastDay) { lines.push(`### ${day}`, ''); lastDay = day; }
    const late = slot < now ? ' ⚠ 이미 지난 시각 — 다른 시각으로 예약하거나 날짜를 바꾸기' : '';
    lines.push(`## ${i + 1}. ${day} ${hhmm(slot)} — ${entry.d.title}${late}`);
    lines.push(`- 카테고리: ${entry.d.category || '(초안에 없음 — 직접 고르기)'} · 주제: ${entry.d.naver_topic || config.naverTopics[entry.d.category] || '(직접 고르기)'}`);
    lines.push(`- 태그: ${(entry.d.tags || []).map((t) => `#${t}`).join(' ')}`);
    lines.push(`- 예약 후: \`node scripts/plan_schedule.js --published ${rel}\``);
    lines.push('');
  });
  if (overflow.length) {
    lines.push(`> 시각이 모자라 ${overflow.length}편은 배정하지 못했습니다 (draft.json에 publish_at을 넣어 날짜를 정하세요): ${overflow.map((e) => e.d.title).join(' / ')}`, '');
  }
  lines.push('발행 방법: 네이버 임시저장함에서 글 열기 → 내용 확인 → 발행 설정에서 카테고리·주제 선택·태그 확인 → 발행 시간 "예약"에 위 날짜·시각 입력 → 발행(예약) 버튼은 직접 누르기.');

  const out = path.join(DRAFTS_DIR, 'publish_plan.md');
  fs.mkdirSync(DRAFTS_DIR, { recursive: true });
  fs.writeFileSync(out, `${lines.join('\n')}\n`);
  console.log(lines.join('\n'));
  console.log(`\n저장: ${path.relative(ROOT, out)}`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(`✖ ${e.message}`);
    process.exit(1);
  });
}
