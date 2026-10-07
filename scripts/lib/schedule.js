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

// 임시저장됐고 아직 발행 안 된 글을 저장 순서대로 시각에 배정
function assignSlots(entries, slots) {
  const pending = entries
    .filter((e) => !e.d.test && e.s.saved && !e.s.published)
    .sort((a, b) => String(a.s.steps.save.at).localeCompare(String(b.s.steps.save.at)));
  return {
    plan: pending.slice(0, slots.length).map((e, i) => ({ entry: e, slot: slots[i] })),
    overflow: pending.slice(slots.length),
  };
}

module.exports = { localDate, readAllStatus, countSavesOn, saveLimitFor, buildSlots, assignSlots, toMinutes };
