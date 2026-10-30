#!/usr/bin/env node
// 인스타 카드뉴스 만들기 — 발행한 블로그 글(draft.json)의 문장만 옮겨 4:5(1080×1350) 카드 묶음과 캡션을 만든다.
// 새 사실·숫자를 만들지 않는다: 카드 글자는 모두 본문 문장을 그대로 잘라 쓴 것이다 (문장 단위로만 자름).
// 업로드는 운영자가 직접 한다 (인스타 자동 게시 없음). 기준: docs/learn/instagram-cardnews-2026-10.md
//
// 사용:
//   node scripts/insta_cards.js --all                 # 발행 표시된 글 전부 (status.json published)
//   node scripts/insta_cards.js --all --include-reserved   # 예약만 하고 아직 발행 전인 글도 포함
//   node scripts/insta_cards.js drafts/<글폴더>/draft.json …
// 결과: output/insta/<카테고리>/<글폴더>/01.png … + caption.txt

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { resolveFromRoot } = require('./lib/config');
const { readAllStatus } = require('./lib/schedule');

const W = 1080;
const H = 1350;
const BRAND = '월급날 전에 읽는 경제';
const FONT = "'Pretendard','Apple SD Gothic Neo','Noto Sans KR','Malgun Gothic','WenQuanYi Zen Hei',sans-serif";
const C = { ink: '#1B2A4A', accent: '#F2B705', page: '#FBFAF6', sub: '#55617A', line: '#E3E8EF' };
const MAX_QA = 4;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const NUM = /\d[\d,.]*\s*(?:%p|%|만\s?원|억\s?원|천\s?원|원|년|월|일|세|개월|회|시|분|주|배|명|건|호|점|장|만)?/g;

// 숫자에 형광펜 (글자는 그대로, 강조만)
const mark = (s) => esc(s).replace(NUM, (m) => `<b>${m}</b>`);

function sentences(text) {
  return String(text).split(/\n+/).flatMap((line) => line.match(/[^.?!]+[.?!]?(?:["'”’)]*)?/g) || [])
    .map((s) => s.trim()).filter(Boolean);
}

const isSource = (t) => /^출처\s*:/.test(t);
const isChecklist = (t) => t.split('\n').filter((l) => l.trim().startsWith('✔')).length >= 2;

// draft.json → 카드 계획 (본문 문장만 사용)
function planFromDraft(d, { date } = {}) {
  const blocks = (d.blocks || []).filter((b) => b.type === 'text' || b.type === 'subtitle');
  const texts = blocks.filter((b) => b.type === 'text').map((b) => b.content.trim());
  // 뺄 것: 광고 표시(첫 블록), 마지막 마무리·면책 문구, 출처 문단
  const lastText = texts[texts.length - 1];
  const skip = new Set([lastText]);
  if (d.sponsored) skip.add(texts[0]);
  const source = texts.find(isSource);

  const cards = [];
  const cover = { kind: 'cover', label: d.category || '', title: d.title };
  const firstNum = (d.title.match(NUM) || [])[0];
  if (firstNum) cover.big = firstNum.trim();
  cards.push(cover);

  const body = blocks.filter((b) => !(b.type === 'text' && (skip.has(b.content.trim()) || isSource(b.content.trim()))));
  const firstSub = body.findIndex((b) => b.type === 'subtitle');
  const intro = body.slice(0, firstSub === -1 ? body.length : firstSub).filter((b) => b.type === 'text');

  const opening = intro.find((b) => !isChecklist(b.content));
  if (opening) cards.push({ kind: 'text', label: '이런 분이라면', sentences: sentences(opening.content).slice(0, 3) });

  const checklist = body.find((b) => b.type === 'text' && isChecklist(b.content));
  if (checklist) {
    const items = checklist.content.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('✔'))
      .map((l) => l.replace(/^✔\s*/, '')).slice(0, 5);
    cards.push({ kind: 'list', label: '먼저 핵심만', title: '한눈에 보기', items });
  }

  let qa = 0;
  body.forEach((b, i) => {
    if (b.type !== 'subtitle' || qa >= MAX_QA) return;
    const next = body.slice(i + 1).find((x) => x.type === 'text' && !isChecklist(x.content));
    if (!next) return;
    qa += 1;
    cards.push({ kind: 'text', label: `Q${qa}`, title: b.content, sentences: sentences(next.content).slice(0, 3) });
  });

  const srcLine = source ? source.replace(/^출처\s*:\s*/, '').replace(/https?:\/\/\S+/g, '').replace(/\s*·\s*$/, '').trim() : '';
  cards.push({
    kind: 'cta',
    title: '저장해 두고 필요할 때 다시 보세요',
    sentences: [`자세한 계산과 순서는 블로그 「${BRAND}」에 정리했어요.`],
    note: [date ? `${date} 블로그 글 기준` : '', srcLine ? `출처: ${srcLine}` : ''].filter(Boolean).join(' · '),
  });
  return cards;
}

function caption(d, cards, { date } = {}) {
  const answers = cards.filter((c) => c.kind === 'text' && /^Q\d/.test(c.label)).map((c) => `· ${c.sentences[0]}`);
  const cta = cards[cards.length - 1];
  const tags = [...new Set((d.tags || []).map((t) => `#${String(t).replace(/^#/, '').replace(/\s/g, '')}`))].slice(0, 10);
  return [
    d.title,
    '',
    ...answers.slice(0, 3),
    '',
    cta.note || '',
    date ? `정보는 ${date} 기준이라 이후 바뀔 수 있어요. 결정 전에 공식 안내를 꼭 확인해 주세요.` : '',
    `자세한 내용은 프로필 링크의 블로그 「${BRAND}」에서 볼 수 있어요.`,
    '',
    tags.join(' '),
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n').trim() + '\n';
}

function html(card, idx, total, scale = 1) {
  const f = (n) => Math.round(n * scale);
  const counter = `${String(idx + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
  const isCover = card.kind === 'cover';
  const bg = isCover ? C.ink : C.page;
  const fg = isCover ? '#fff' : C.ink;
  const sentencesHtml = (card.sentences || []).map((s) => `<p>${mark(s)}</p>`).join('');
  const items = (card.items || []).map((x) => {
    const [k, ...v] = x.split(/\s+—\s+/);
    return `<li><span class="ck">✔</span><span><strong>${mark(k)}</strong>${v.length ? `<br><span class="iv">${mark(v.join(' — '))}</span>` : ''}</span></li>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{width:${W}px;height:${H}px;background:${bg};color:${fg};font-family:${FONT};word-break:keep-all}
  .wrap{position:absolute;inset:0;padding:96px 92px 88px;display:flex;flex-direction:column}
  .top{display:flex;justify-content:space-between;align-items:center;font-size:30px;font-weight:800}
  .chip{background:${C.accent};color:${C.ink};padding:10px 26px;border-radius:999px}
  .cnt{color:${isCover ? 'rgba(255,255,255,.7)' : C.sub};letter-spacing:1px}
  .main{flex:1;display:flex;flex-direction:column;justify-content:${isCover || card.kind === 'cta' ? 'center' : 'flex-start'};padding-top:${isCover || card.kind === 'cta' ? 0 : 80}px}
  h1{font-size:${f(isCover ? 92 : card.kind === 'cta' ? 72 : 64)}px;line-height:1.28;font-weight:900;letter-spacing:-1.5px}
  .bar{width:120px;height:14px;background:${C.accent};margin:${isCover ? '0 0 48px' : '0 0 40px'}}
  .big{margin-top:56px;font-size:${f(150)}px;font-weight:900;color:${C.accent};letter-spacing:-3px}
  .body{margin-top:56px;display:flex;flex-direction:column;gap:${f(34)}px}
  p{font-size:${f(46)}px;line-height:1.5;font-weight:600;color:${isCover ? '#fff' : '#2B3A57'}}
  p b,li b{font-weight:900;color:${C.ink};background:linear-gradient(transparent 60%,${C.accent}99 60%)}
  ul{list-style:none;margin-top:56px;display:flex;flex-direction:column;gap:${f(34)}px}
  li{display:flex;gap:24px;font-size:${f(42)}px;line-height:1.4;font-weight:700}
  .ck{flex:none;color:${C.accent};font-weight:900}
  .iv{font-weight:500;color:#2B3A57}
  .note{font-size:28px;line-height:1.45;color:${C.sub};font-weight:600;margin-top:48px}
  .foot{display:flex;justify-content:space-between;align-items:center;font-size:28px;font-weight:800;padding-top:28px;border-top:3px solid ${isCover ? 'rgba(255,255,255,.25)' : C.line}}
  .swipe{color:${isCover ? C.accent : C.sub}}
  </style></head><body><div class="wrap">
  <div class="top">${card.label ? `<span class="chip">${esc(card.label)}</span>` : '<span></span>'}<span class="cnt">${counter}</span></div>
  <div class="main">
    <div class="bar"></div>
    ${card.title ? `<h1>${esc(card.title)}</h1>` : ''}
    ${card.big ? `<div class="big">${esc(card.big)}</div>` : ''}
    ${sentencesHtml ? `<div class="body">${sentencesHtml}</div>` : ''}
    ${items ? `<ul>${items}</ul>` : ''}
    ${card.note ? `<div class="note">${esc(card.note)}</div>` : ''}
  </div>
  <div class="foot"><span>${BRAND}</span><span class="swipe">${idx + 1 < total ? '옆으로 넘기기 →' : ''}</span></div>
  </div></body></html>`;
}

// 넘치면 글자를 조금 줄이고, 그래도 넘치면 뒤 문장·항목을 통째로 뺀다 (문장 중간은 자르지 않음)
async function fit(page, card, idx, total) {
  const c = { ...card, sentences: card.sentences && [...card.sentences], items: card.items && [...card.items] };
  for (;;) {
    for (const scale of [1, 0.92, 0.85]) {
      await page.setContent(html(c, idx, total, scale));
      const over = await page.evaluate(() => {
        const m = document.querySelector('.main');
        return m.scrollHeight > m.clientHeight + 1;
      });
      if (!over) return true;
    }
    if (c.sentences && c.sentences.length > 1) c.sentences.pop();
    else if (c.items && c.items.length > 2) c.items.pop();
    else return false;
  }
}

async function renderDraft(browser, draftPath, entryStatus) {
  const d = JSON.parse(fs.readFileSync(draftPath, 'utf8'));
  const folder = path.basename(path.dirname(draftPath));
  const date = (d.publish_at || '').slice(0, 10) || (/^(\d{4})(\d{2})(\d{2})/.exec(folder) || []).slice(1).join('-') || '';
  const cards = planFromDraft(d, { date });
  const outDir = resolveFromRoot(path.join('output/insta', (d.category || '기타').replace(/[/\\]/g, '·'), folder));
  fs.mkdirSync(outDir, { recursive: true });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const kept = [];
  try {
    for (let i = 0; i < cards.length; i += 1) {
      if (await fit(page, cards[i], kept.length, cards.length)) kept.push(cards[i]);
      else console.warn(`  ⚠ ${folder}: ${i + 1}번 카드는 한 문장도 안 들어가서 뺐습니다.`);
    }
    for (let i = 0; i < kept.length; i += 1) {
      await fit(page, kept[i], i, kept.length);
      await page.screenshot({ path: path.join(outDir, `${String(i + 1).padStart(2, '0')}.png`) });
    }
  } finally {
    await page.close();
  }
  fs.writeFileSync(path.join(outDir, 'caption.txt'), caption(d, kept, { date }));
  return { folder, outDir, count: kept.length, status: entryStatus };
}

async function main() {
  const args = process.argv.slice(2);
  let targets = args.filter((a) => a.endsWith('.json')).map((a) => resolveFromRoot(a));
  if (args.includes('--all')) {
    const withReserved = args.includes('--include-reserved');
    targets = readAllStatus()
      .filter((e) => !e.d.test && e.s.saved && (e.s.published || withReserved))
      .map((e) => e.draft);
  }
  if (!targets.length) {
    console.error('사용법: node scripts/insta_cards.js --all [--include-reserved] | drafts/<글폴더>/draft.json …');
    console.error('(--all은 status.json에 published 표시된 글만 고릅니다.)');
    process.exit(2);
  }
  const executablePath = process.env.PW_CHROMIUM_PATH;
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  try {
    for (const t of targets) {
      const r = await renderDraft(browser, t);
      console.log(`✔ ${r.folder}: ${r.count}장 → ${path.relative(resolveFromRoot('.'), r.outDir)}`);
    }
  } finally {
    await browser.close();
  }
  console.log(`\n끝: ${targets.length}편. output/insta/ 폴더를 Google Drive에 올리고, 인스타 업로드는 직접 해 주세요.`);
}

if (require.main === module) main().catch((e) => { console.error(`✖ ${e.message}`); process.exit(1); });

module.exports = { planFromDraft, caption, sentences, html };
