const test = require('node:test');
const assert = require('node:assert');
const { planFromDraft, caption, sentences } = require('../scripts/insta_cards');

const draft = {
  title: '지원금 신청기한 60일 지나면 못 받을까요',
  category: '정책·지원금',
  tags: ['지원금', '신청 기한'],
  blocks: [
    { type: 'text', content: '첫 문장이에요. 둘째 문장이에요.' },
    { type: 'text', content: '✔ 대상 — 가\n✔ 기한 — 60일 이내' },
    { type: 'subtitle', content: '60일 지나면 못 받나요?' },
    { type: 'text', content: '60일이 지나도 소급될 수 있습니다. 다음 문장이에요.' },
    { type: 'text', content: '출처: 기관 페이지(2026-10-01 확인) https://example.com' },
    { type: 'text', content: '면책 문구입니다.' },
  ],
};

test('본문 문장만 쓰고 면책·출처 문단은 카드 본문에서 뺀다', () => {
  const cards = planFromDraft(draft, { date: '2026-10-20' });
  assert.deepStrictEqual(cards.map((c) => c.kind), ['cover', 'text', 'list', 'text', 'cta']);
  assert.strictEqual(cards[0].big, '60일');
  const all = JSON.stringify(cards);
  assert.ok(!all.includes('면책 문구'));
  assert.ok(!all.includes('https://'));
  assert.match(cards[4].note, /2026-10-20 블로그 글 기준 · 출처: 기관 페이지\(2026-10-01 확인\)/);
});

test('캡션: 답 문장·기준일·해시태그(띄어쓰기 제거)', () => {
  const cards = planFromDraft(draft, { date: '2026-10-20' });
  const cap = caption(draft, cards, { date: '2026-10-20' });
  assert.match(cap, /· 60일이 지나도 소급될 수 있습니다\./);
  assert.match(cap, /#지원금 #신청기한/);
});

test('문장 나누기', () => {
  assert.deepStrictEqual(sentences('가요. 나요?\n다'), ['가요.', '나요?', '다']);
});
