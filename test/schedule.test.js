const test = require('node:test');
const assert = require('node:assert');
const { localDate, countSavesOn, buildSlots, assignSlots } = require('../scripts/lib/schedule');

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
