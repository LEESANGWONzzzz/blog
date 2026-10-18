// 임시저장 횟수 세기와 예약 발행 시간표 계산 (네이버 접속 없음, 순수 계산).
const fs = require('fs');
const path = require('path');
const { DRAFTS_DIR } = require('./config');

const pad = (n) => String(n).padStart(2, '0');

// 이 컴퓨터의 시간대 기준 날짜 (맥에서는 한국 시간)
function localDate(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

// 계획표 기본 날짜: 내일 (전날 저녁에 임시저장하고 예약해 두는 루틴)
function nextDate(d = new Date()) {
  const x = new Date(d);
  x.setDate(x.getDate() + 1);
  return localDate(x);
}

// 블로그 RSS에서 공개된 글 제목 뽑기 (CDATA·HTML 엔티티 처리)
function rssTitles(xml) {
  const items = String(xml).match(/<item>[\s\S]*?<\/item>/g) || [];
  return items.map((it) => {
    const m = it.match(/<title>([\s\S]*?)<\/title>/);
    if (!m) return '';
    return m[1].replace(/^<!\[CDATA\[|\]\]>$/g, '')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
      .trim();
  }).filter(Boolean);
}

// 임시저장했고 발행 표시가 없는데, 제목이 이미 블로그에 공개된 글 → 발행된 것으로 본다
const squashTitle = (t) => String(t).replace(/\s+/g, '');
function publishedByRss(entries, titles) {
  const live = new Set(titles.map(squashTitle));
  return entries.filter((e) => !e.d.test && e.s.saved && !e.s.published && live.has(squashTitle(e.d.title)));
}

function readAllStatus(dir = DRAFTS_DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .map((d) => ({ dir: path.join(dir, d), status: path.join(dir, d, 'status.json'), draft: path.join(dir, d, 'draft.json') }))
    .filter((x) => fs.existsSync(x.status) && fs.existsSync(x.draft))
    .map((x) => ({ ...x, s: JSON.parse(fs.readFileSync(x.status, 'utf8')), d: JSON.parse(fs.readFileSync(x.draft, 'utf8')) }));
}

// 그날 자동 임시저장한 횟수 (테스트 초안 제외)
function countSavesOn(date, entries) {
  return entries.filter((e) => !e.d.test && e.s.steps && e.s.steps.save && e.s.steps.save.ok
    && localDate(e.s.steps.save.at) === date).length;
}

// date(YYYY-MM-DD)의 저장 상한: 그날짜 예외값이 있으면 그것, 없으면 기본 상한
function saveLimitFor(date, { dailySaveLimit, dailySaveLimitOverrides = {} }) {
  const v = Number(dailySaveLimitOverrides[date]);
  return Number.isFinite(v) && v > 0 ? v : dailySaveLimit;
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// date의 예약 시각 목록. slots(["07:00", …])가 있으면 그대로, 없으면 start부터 every분 간격으로 end까지.
// now 이후만 남긴다 (같은 날이면 지난 시각 제외).
function buildSlots(date, { start, every, end, slots: fixed }, now = new Date()) {
  const minutes = Array.isArray(fixed) && fixed.length
    ? fixed.map(toMinutes).sort((a, b) => a - b)
    : (() => { const m = []; for (let t = toMinutes(start); t <= toMinutes(end); t += every) m.push(t); return m; })();
  const slots = [];
  for (const t of minutes) {
    const slot = new Date(`${date}T${pad(Math.floor(t / 60))}:${pad(t % 60)}:00`);
    if (slot > now) slots.push(slot);
  }
  return slots;
}

// 임시저장됐고 아직 발행 안 된 글을 시각에 배정.
// draft.json에 "slot": "19:00"이 있으면 그 시각에 먼저 넣고 (빈 칸이 있어도 당겨지지 않게),
// 나머지는 저장 순서대로 남은 시각을 채운다.
function assignSlots(entries, slots) {
  const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const pending = entries
    .filter((e) => !e.d.test && e.s.saved && !e.s.published)
    .sort((a, b) => String(a.s.steps.save.at).localeCompare(String(b.s.steps.save.at)));
  const free = [...slots];
  const plan = [];
  const rest = [];
  for (const e of pending) {
    const i = e.d.slot ? free.findIndex((t) => hhmm(t) === e.d.slot) : -1;
    if (i >= 0) plan.push({ entry: e, slot: free.splice(i, 1)[0] });
    else rest.push(e);
  }
  rest.forEach((e) => { if (free.length) plan.push({ entry: e, slot: free.shift() }); });
  const placed = new Set(plan.map((p) => p.entry));
  plan.sort((a, b) => a.slot - b.slot);
  return { plan, overflow: pending.filter((e) => !placed.has(e)) };
}

// ---- 여러 날에 걸친 예약 (draft.json의 "publish_at": "YYYY-MM-DD HH:MM") ----
// publish_at이 없고 slot만 있는 예전 초안은 defaultDate(보통 내일)의 그 시각을 차지한 것으로 본다.
function pendingKey(e, defaultDate) {
  if (e.d.publish_at) return e.d.publish_at;
  return e.d.slot ? `${defaultDate} ${e.d.slot}` : null;
}
const isPending = (e) => !e.d.test && e.s.saved && !e.s.published;

// 지금 이후 비어 있는 예약 칸을 앞에서부터 count개 (오늘 남은 칸 → 내일 → 모레 …).
// marginMin: 지금부터 이 시간(분) 안의 칸은 건너뛴다 (예약 넣을 시간 확보).
// from: 'YYYY-MM-DD'이면 그 날짜 이전 칸은 건너뛴다 ("19일 글부터"처럼 시작일을 정할 때).
function freeSlots(entries, slotTimes, count, { now = new Date(), defaultDate = nextDate(now), marginMin = 60, from = '' } = {}) {
  // 예약을 마쳐 발행 표시된 글도 publish_at 칸은 그대로 차지한다 (같은 시각 중복 예약 방지).
  const reserved = entries.filter((e) => !e.d.test && e.s.saved && e.s.published && e.d.publish_at);
  const taken = new Set([...entries.filter(isPending), ...reserved].map((e) => pendingKey(e, defaultDate)).filter(Boolean));
  const times = [...slotTimes].sort();
  const out = [];
  for (let d = 0; out.length < count && d < 60; d += 1) {
    const day = new Date(now); day.setDate(day.getDate() + d);
    const date = localDate(day);
    if (from && date < from) continue;
    for (const t of times) {
      if (out.length >= count) break;
      const at = new Date(`${date}T${t}:00`);
      if (at - now < marginMin * 60000) continue;
      const key = `${date} ${t}`;
      if (!taken.has(key)) out.push({ key, date, time: t, oddDay: at.getDate() % 2 === 1 });
    }
  }
  return out;
}

module.exports = { pendingKey, freeSlots, isPending, localDate, nextDate, rssTitles, publishedByRss, readAllStatus, countSavesOn, saveLimitFor, buildSlots, assignSlots, toMinutes };
