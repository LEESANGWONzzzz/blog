const test = require('node:test');
const assert = require('node:assert');
const { localDate, nextDate, rssTitles, publishedByRss, countSavesOn, saveLimitFor, buildSlots, assignSlots } = require('../scripts/lib/schedule');

const entry = (title, at, extra = {}) => ({
  d: { title, tags: ['a'], ...(extra.d || {}) },
  s: { saved: true, steps: { save: { ok: true, at } }, ...(extra.s || {}) },
  draft: `/x/${title}/draft.json`,
});

test('그날 저장 횟수: 테스트 초안·실패 저장 제외', () => {
  const day = localDate(new Date(2026, 9, 8, 10, 0));
  const at = new Date(2026, 9, 8, 10, 0).toISOString();
  const entries = [
    entry('a', at),
    entry('b', at, { d: { test: true } }),
    entry('c', at, { s: { steps: { save: { ok: false, at } } } }),
    entry('d', new Date(2026, 9, 7, 10, 0).toISOString()),
  ];
  assert.strictEqual(countSavesOn(day, entries), 1);
});

test('시각 만들기: 2시간 간격, 지난 시각 제외', () => {
  const cfg = { start: '07:00', every: 120, end: '21:00' };
  const all = buildSlots('2026-10-08', cfg, new Date(2026, 9, 7, 23, 0));
  assert.deepStrictEqual(all.map((d) => d.getHours()), [7, 9, 11, 13, 15, 17, 19, 21]);
  const later = buildSlots('2026-10-08', cfg, new Date(2026, 9, 8, 12, 30));
  assert.deepStrictEqual(later.map((d) => d.getHours()), [13, 15, 17, 19, 21]);
});

test('배정: 저장 순서대로, 발행 표시된 글 제외, 남는 글은 넘김', () => {
  const slots = buildSlots('2026-10-08', { start: '07:00', every: 120, end: '09:00' }, new Date(2026, 9, 7));
  const entries = [
    entry('늦게', '2026-10-07T03:00:00Z'),
    entry('먼저', '2026-10-07T01:00:00Z'),
    entry('발행됨', '2026-10-07T00:00:00Z', { s: { published: true } }),
    entry('넘김', '2026-10-07T05:00:00Z'),
  ];
  const { plan, overflow } = assignSlots(entries, slots);
  assert.deepStrictEqual(plan.map((p) => [p.entry.d.title, p.slot.getHours()]), [['먼저', 7], ['늦게', 9]]);
  assert.deepStrictEqual(overflow.map((e) => e.d.title), ['넘김']);
});

test('고정 시각표: 07·09·17·19시, 순서 정렬', () => {
  const cfg = { start: '07:00', every: 120, end: '21:00', slots: ['19:00', '07:00', '17:00', '09:00'] };
  const all = buildSlots('2026-10-08', cfg, new Date(2026, 9, 7, 23, 0));
  assert.deepStrictEqual(all.map((d) => d.getHours()), [7, 9, 17, 19]);
});

test('저장 상한: 그날짜 예외값만 적용, 다른 날은 기본값', () => {
  const cfg = { dailySaveLimit: 4, dailySaveLimitOverrides: { '2026-10-07': 5 } };
  assert.strictEqual(saveLimitFor('2026-10-07', cfg), 5);
  assert.strictEqual(saveLimitFor('2026-10-08', cfg), 4);
  assert.strictEqual(saveLimitFor('2026-10-08', { dailySaveLimit: 4 }), 4);
});

test('계획표 기본 날짜는 내일 (월말·연말 넘김 포함)', () => {
  assert.strictEqual(nextDate(new Date(2026, 9, 8, 21, 0)), '2026-10-09');
  assert.strictEqual(nextDate(new Date(2026, 9, 31, 21, 0)), '2026-11-01');
  assert.strictEqual(nextDate(new Date(2026, 11, 31, 21, 0)), '2027-01-01');
});

test('RSS 제목으로 이미 공개된 글을 찾는다', () => {
  const xml = `<rss><channel><title>월급날 전에 읽는 경제</title>
    <item><title><![CDATA[적금 우대금리 조건 &amp; 함정]]></title></item>
    <item><title>유류세 인하 연장</title></item></channel></rss>`;
  assert.deepStrictEqual(rssTitles(xml), ['적금 우대금리 조건 & 함정', '유류세 인하 연장']);
  const entries = [
    entry('적금 우대금리 조건 & 함정', '2026-10-08T01:10:00'),
    entry('유류세  인하 연장', '2026-10-08T01:12:00'),
    entry('독감 무료접종', '2026-10-08T22:00:00'),
    entry('유류세 인하 연장', '2026-10-08T01:12:00', { s: { published: true } }),
  ];
  assert.deepStrictEqual(publishedByRss(entries, rssTitles(xml)).map((e) => e.d.title), ['적금 우대금리 조건 & 함정', '유류세  인하 연장']);
});
