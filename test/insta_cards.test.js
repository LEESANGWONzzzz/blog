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

test('테마: 카테고리별 기본값과 --theme 지정', () => {
  const { themeFor, html } = require('../scripts/insta_cards');
  assert.strictEqual(themeFor('정책·지원금'), 'mint');
  assert.strictEqual(themeFor('경제 뉴스 해설'), 'night');
  assert.strictEqual(themeFor('방송·연예'), 'purple');
  assert.strictEqual(themeFor('방송·연예', 'mint'), 'mint');
  assert.strictEqual(themeFor('없는 카테고리'), 'mint');
  for (const t of ['mint', 'night', 'purple']) {
    assert.match(html({ kind: 'cover', title: '60일 지나면', big: '60일' }, 0, 5, 1, t), /class="tn">60일</);
  }
});

test('이미지: 글에 들어간 사진은 표지, 소제목 구간 이미지는 그 Q 카드에. 아이콘은 키워드로', () => {
  const d = {
    title: '전세 보증금 60일 안에 돌려받을까요',
    category: '부동산·주거',
    blocks: [
      { type: 'text', content: '첫 문장이에요.' },
      { type: 'image', path: 'input/photos/_mosaic/a.jpg', caption: '' },
      { type: 'subtitle', content: '언제까지 신청하나요?' },
      { type: 'text', content: '10월 26일까지 신청합니다.' },
      { type: 'image', path: 'input/images/cards/b.png', caption: '출처: 기관' },
      { type: 'subtitle', content: '얼마인가요?' },
      { type: 'text', content: '최대 1천만원이 이어집니다.' },
      { type: 'text', content: '면책' },
    ],
  };
  const cards = planFromDraft(d);
  assert.strictEqual(cards[0].image.path, 'input/photos/_mosaic/a.jpg');
  const [q1, q2] = cards.filter((c) => /^Q/.test(c.label || ''));
  assert.strictEqual(q1.image.path, 'input/images/cards/b.png');
  assert.strictEqual(q2.image, null);
  assert.strictEqual(cards[0].icon, 'calendar');
  assert.strictEqual(q1.icon, 'doc'); // 표지와 같은 아이콘은 피함
  assert.notStrictEqual(q2.icon, 'house'); // "이어집니다"의 '집'에 걸리지 않게
});
