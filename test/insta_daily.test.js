const test = require('node:test');
const assert = require('node:assert');
const { issueFromDraft, planDay, caption, groupByDate, koreanDate } = require('../scripts/insta_daily');

const mk = (slot, title, extra = []) => ({
  title, category: '정책·지원금', slot, publish_at: `2026-10-20 ${slot}`, tags: ['태그 하나'],
  blocks: [
    { type: 'text', content: '첫 문단이에요.' },
    { type: 'text', content: '✔ 기한 — 10월 26일까지\n✔ 방법 — 온라인' },
    { type: 'subtitle', content: '언제까지인가요?' },
    { type: 'text', content: '10월 26일까지 신청합니다. 둘째 문장이에요.' },
    ...extra,
    { type: 'text', content: '출처: 기관(2026-10-19 확인)' },
    { type: 'text', content: '면책' },
  ],
});

test('이슈 1장: 첫 소제목 답 문장·체크리스트 첫 항목, 사진 우선', () => {
  const it = issueFromDraft(mk('09:00', '글 A', [
    { type: 'image', path: 'input/images/cards/a.png', caption: '' },
    { type: 'image', path: 'input/photos/_mosaic/b.jpg', caption: '' },
  ]));
  assert.deepStrictEqual(it.sentences, ['10월 26일까지 신청합니다.', '둘째 문장이에요.']);
  assert.strictEqual(it.checkItem, '기한 — 10월 26일까지');
  assert.strictEqual(it.image.path, 'input/photos/_mosaic/b.jpg');
  assert.ok(!JSON.stringify(it).includes('면책'));
});

test('하루 묶음: 시각 순서, 1면 + 이슈 + 마지막 장', () => {
  const day = planDay('2026-10-20', [mk('15:00', '나중 글'), mk('07:00', '먼저 글')]);
  assert.deepStrictEqual(day.cards.map((c) => c.kind), ['front', 'issue', 'issue', 'back']);
  assert.strictEqual(day.issues[0].title, '먼저 글');
  const cap = caption(day);
  assert.match(cap, /10월 20일 월급날 브리핑/);
  assert.match(cap, /1\. 먼저 글\n2\. 나중 글/);
  assert.match(cap, /#태그하나/);
});

test('날짜 묶기·요일', () => {
  const g = groupByDate([{ dir: 'drafts/20261021-x', d: { title: 'x', blocks: [] } }, { dir: 'drafts/a', d: { publish_at: '2026-10-20 07:00' } }]);
  assert.deepStrictEqual(g.map(([d]) => d), ['2026-10-20', '2026-10-21']);
  assert.strictEqual(koreanDate('2026-10-20').full, '2026년 10월 20일 화요일');
});
