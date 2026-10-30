#!/usr/bin/env node
// 인스타 카드뉴스 만들기 — 발행한 블로그 글(draft.json)의 문장만 옮겨 4:5(1080×1350) 카드 묶음과 캡션을 만든다.
// 새 사실·숫자를 만들지 않는다: 카드 글자는 모두 본문 문장을 그대로 잘라 쓴 것이다 (문장 단위로만 자름).
// 업로드는 운영자가 직접 한다 (인스타 자동 게시 없음). 기준: docs/learn/instagram-cardnews-2026-10.md
//
// 사용:
//   node scripts/insta_cards.js --all                 # 발행 표시된 글 전부 (status.json published)
//   node scripts/insta_cards.js --all --include-reserved   # 예약만 하고 아직 발행 전인 글도 포함
//   node scripts/insta_cards.js drafts/<글폴더>/draft.json …
//   --theme mint|night|purple   # 지정하지 않으면 카테고리별 기본 테마 (THEME_BY_CATEGORY)
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
const MAX_QA = 4;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const NUM = /\d[\d,.]*\s*(?:%p|%|만\s?원|억\s?원|천\s?원|원|년|월|일|세|개월|회|시|분|주|배|명|건|호|점|장|만)?/g;

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

// 테마 3종 (2026-10-30 운영자가 보낸 레퍼런스에서 배색·레이아웃 원리만 가져옴, 캐릭터·로고는 쓰지 않음)
//  mint   — 민트 바깥 프레임 + 흰 판, 노란 형광 제목, 남색 박스 본문, 번호 탭 목록
//  night  — 짙은 회색·크림 판을 번갈아, 큰 굵은 제목, 노란 따옴표 질문
//  purple — 짙은 보라 바탕, 노란 헤드라인, 흰 박스, 분홍 포인트
const THEMES = {
  mint: {
    frame: '#5CC3B4', frameDeco: 'rgba(255,255,255,.18)', panel: '#FFFFFF', ink: '#1F2A3A', title: '#1F2A3A',
    accent: '#FFE14D', point: '#1F9E8D', box: '#26313F', boxInk: '#FFFFFF', boxMark: '#FFE14D', chip: '#26313F', chipInk: '#FFFFFF', sub: '#6B7686',
  },
  night: {
    frame: '#2B2B2D', frameDeco: 'rgba(255,255,255,.04)', panel: '#2B2B2D', ink: '#F2E8D0', title: '#F2E8D0',
    accent: '#F5C518', point: '#F5C518', box: '#3A3A3D', boxInk: '#F2E8D0', boxMark: '#F5C518', chip: '#F5C518', chipInk: '#2B2B2D', sub: '#B9AE96',
    alt: { frame: '#F2E8D0', panel: '#F2E8D0', ink: '#2B2B2D', title: '#2B2B2D', box: '#FFFFFF', boxInk: '#2B2B2D', boxMark: '#7A5BA8', chip: '#2B2B2D', chipInk: '#F2E8D0', sub: '#7D7362', point: '#7A5BA8' },
  },
  purple: {
    frame: '#2E1A4A', frameDeco: 'rgba(255,212,59,.07)', panel: '#3A2160', ink: '#FFFFFF', title: '#FFD43B',
    accent: '#FFD43B', point: '#FF6FB1', box: '#FFFFFF', boxInk: '#2E1A4A', boxMark: '#C2185B', chip: '#FF6FB1', chipInk: '#FFFFFF', sub: '#C9B8E6',
  },
};
// 카테고리별 기본 테마 (피드에서 주제가 색으로 구분되게)
const THEME_BY_CATEGORY = {
  '세금·연말정산': 'mint', '저축·예적금': 'mint', '정책·지원금': 'mint', '연금·투자 기초': 'mint',
  '부동산·주거': 'night', '경제 뉴스 해설': 'night', '월급 관리 (가계부·고정비)': 'night',
  '방송·연예': 'purple', '패션·미용': 'purple', '맛집·외식': 'purple',
};
const themeFor = (category, forced) => (forced && THEMES[forced] ? forced : THEME_BY_CATEGORY[category] || 'mint');

function html(card, idx, total, scale = 1, themeName = 'mint') {
  const base = THEMES[themeName] || THEMES.mint;
  const t = base.alt && idx % 2 === 1 && card.kind !== 'cover' ? { ...base, ...base.alt } : base;
  const f = (n) => Math.round(n * scale);
  const counter = `${idx + 1} / ${total}`;
  const kind = card.kind;
  const hl = (s) => esc(s).replace(NUM, (m) => `<b>${m}</b>`);
  const sents = card.sentences || [];
  const answer = sents.length
    ? `<div class="box"><p class="lead">${hl(sents[0])}</p>${sents.slice(1).map((s) => `<p>${hl(s)}</p>`).join('')}</div>` : '';
  const items = (card.items || []).map((x, i) => {
    const [k, ...v] = x.split(/\s+—\s+/);
    return `<li><span class="tab">${String(i + 1).padStart(2, '0')}</span><span class="it"><strong>${hl(k)}</strong>${v.length ? `<span class="iv">${hl(v.join(' — '))}</span>` : ''}</span></li>`;
  }).join('');

  let main = '';
  if (kind === 'cover') {
    main = `<div class="cover">
      ${card.label ? `<span class="chip">${esc(card.label)}</span>` : ''}
      <h1 class="ct">${esc(card.title).replace(NUM, (m) => `<span class="tn">${m}</span>`)}</h1>
      ${card.big ? `<div class="bigwrap"><span class="big">${esc(card.big)}</span></div>` : ''}
    </div>`;
  } else if (kind === 'list') {
    main = `<div class="head"><span class="chip">${esc(card.label || '')}</span><h2>${esc(card.title)}</h2></div><ul>${items}</ul>`;
  } else if (kind === 'cta') {
    main = `<div class="cta"><div class="qm">“</div><h2>${esc(card.title)}</h2>${sents.map((s) => `<p class="cp">${hl(s)}</p>`).join('')}
      ${card.note ? `<div class="note">${esc(card.note)}</div>` : ''}</div>`;
  } else {
    const q = card.title ? `<h2 class="q"><span class="qm">“</span>${esc(card.title)}<span class="qm">”</span></h2>` : '';
    main = `<div class="head">${card.label ? `<span class="chip">${esc(card.label)}</span>` : ''}${q}</div>${answer}`;
  }

  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{width:${W}px;height:${H}px;font-family:${FONT};word-break:keep-all;color:${t.ink};
    background:${t.frame};
    background-image:repeating-linear-gradient(135deg,${t.frameDeco} 0 3px,transparent 3px 34px)}
  .panel{position:absolute;inset:${themeName === 'mint' ? 54 : 40}px;background:${t.panel};border-radius:${themeName === 'mint' ? 10 : 28}px;
    ${themeName === 'mint' ? 'box-shadow:0 14px 0 rgba(0,0,0,.08);' : ''}${themeName === 'purple' ? `border:4px solid ${t.accent}22;` : ''}
    padding:72px 72px 60px;display:flex;flex-direction:column}
  .top{display:flex;justify-content:space-between;align-items:center;font-size:26px;font-weight:800;color:${t.sub}}
  .brand{letter-spacing:.5px}
  .cnt{border:3px solid ${t.sub};border-radius:999px;padding:4px 18px}
  .main{flex:1;display:flex;flex-direction:column;justify-content:${kind === 'cover' || kind === 'cta' ? 'center' : 'flex-start'};padding-top:${kind === 'cover' || kind === 'cta' ? 0 : 56}px}
  .chip{display:inline-block;align-self:flex-start;background:${t.chip};color:${t.chipInk};font-size:30px;font-weight:900;padding:10px 26px;border-radius:${themeName === 'mint' ? 6 : 999}px;margin-bottom:30px}
  .cover{display:flex;flex-direction:column}
  .ct{font-size:${f(themeName === 'night' ? 112 : 100)}px;line-height:1.18;font-weight:900;letter-spacing:-3px;color:${t.title}}
  .tn{${themeName === 'mint' ? `background:linear-gradient(transparent 58%,${t.accent} 58%)` : `color:${themeName === 'night' ? t.accent : t.point}`}}
  .bigwrap{margin-top:60px}
  .big{display:inline-block;font-size:${f(132)}px;font-weight:900;letter-spacing:-3px;line-height:1;padding:22px 40px;border-radius:24px;
    background:${themeName === 'mint' ? t.box : themeName === 'night' ? t.accent : t.point};color:${themeName === 'mint' ? t.accent : themeName === 'night' ? t.frame : '#fff'}}
  h2{font-size:${f(66)}px;line-height:1.28;font-weight:900;letter-spacing:-1.5px;color:${t.title}}
  .q .qm{color:${t.point}}
  .box{margin-top:48px;background:${t.box};color:${t.boxInk};border-radius:${themeName === 'mint' ? 8 : 24}px;padding:${f(48)}px ${f(52)}px;display:flex;flex-direction:column;gap:${f(26)}px;
    ${themeName === 'purple' ? `box-shadow:12px 12px 0 ${t.point};` : ''}${themeName === 'night' && !(base.alt && idx % 2 === 1) ? `border-left:12px solid ${t.accent};` : ''}}
  .box p{font-size:${f(42)}px;line-height:1.55;font-weight:500}
  .box p.lead{font-size:${f(46)}px;font-weight:800}
  b{font-weight:900;color:${t.boxMark}}
  ${themeName === 'mint' ? `.box b{color:${t.accent}}` : ''}
  ul{list-style:none;margin-top:44px;display:flex;flex-direction:column;gap:${f(22)}px}
  li{display:flex;align-items:stretch;border-radius:${themeName === 'mint' ? 8 : 18}px;overflow:hidden;background:${t.box};color:${t.boxInk}}
  .tab{flex:none;width:${f(108)}px;display:flex;align-items:center;justify-content:center;font-size:${f(36)}px;font-weight:900;background:${themeName === 'purple' ? t.accent : themeName === 'night' ? t.point : t.accent};color:${themeName === 'night' ? '#fff' : t.frame === '#5CC3B4' ? t.box : t.frame}}
  .it{padding:${f(26)}px ${f(32)}px;display:flex;flex-direction:column;gap:6px;font-size:${f(40)}px;line-height:1.38}
  .it strong{font-weight:900}
  .iv{font-weight:500;font-size:${f(36)}px;opacity:.92}
  .cta{text-align:center;align-items:center;display:flex;flex-direction:column}
  .cta .qm{font-size:160px;line-height:.7;font-weight:900;color:${t.point};height:90px}
  .cta h2{font-size:${f(70)}px}
  .cp{margin-top:36px;font-size:${f(42)}px;line-height:1.5;font-weight:600}
  .note{margin-top:40px;font-size:26px;line-height:1.5;color:${t.sub};font-weight:600}
  .foot{display:flex;justify-content:space-between;align-items:center;font-size:26px;font-weight:800;color:${t.sub};padding-top:24px}
  .swipe{color:${t.point}}
  </style></head><body><div class="panel">
  <div class="top"><span class="brand">${BRAND}</span><span class="cnt">${counter}</span></div>
  <div class="main">${main}</div>
  <div class="foot"><span></span><span class="swipe">${idx + 1 < total ? '넘겨 보기 →' : ''}</span></div>
  </div></body></html>`;
}

// 넘치면 글자를 조금 줄이고, 그래도 넘치면 뒤 문장·항목을 통째로 뺀다 (문장 중간은 자르지 않음)
async function fit(page, card, idx, total, theme) {
  const c = { ...card, sentences: card.sentences && [...card.sentences], items: card.items && [...card.items] };
  for (;;) {
    for (const scale of [1, 0.92, 0.85]) {
      await page.setContent(html(c, idx, total, scale, theme));
      const over = await page.evaluate(() => {
        const m = document.querySelector('.main');
        const p = document.querySelector('.panel');
        return m.scrollHeight > m.clientHeight + 1 || p.scrollHeight > p.clientHeight + 1;
      });
      if (!over) return true;
    }
    if (c.sentences && c.sentences.length > 1) c.sentences.pop();
    else if (c.items && c.items.length > 2) c.items.pop();
    else return false;
  }
}

async function renderDraft(browser, draftPath, { theme: forced } = {}) {
  const d = JSON.parse(fs.readFileSync(draftPath, 'utf8'));
  const folder = path.basename(path.dirname(draftPath));
  const date = (d.publish_at || '').slice(0, 10) || (/^(\d{4})(\d{2})(\d{2})/.exec(folder) || []).slice(1).join('-') || '';
  const cards = planFromDraft(d, { date });
  const theme = themeFor(d.category, forced);
  const outDir = resolveFromRoot(path.join('output/insta', (d.category || '기타').replace(/[/\\]/g, '·'), folder));
  fs.mkdirSync(outDir, { recursive: true });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const kept = [];
  try {
    for (let i = 0; i < cards.length; i += 1) {
      if (await fit(page, cards[i], kept.length, cards.length, theme)) kept.push(cards[i]);
      else console.warn(`  ⚠ ${folder}: ${i + 1}번 카드는 한 문장도 안 들어가서 뺐습니다.`);
    }
    for (let i = 0; i < kept.length; i += 1) {
      await fit(page, kept[i], i, kept.length, theme);
      await page.screenshot({ path: path.join(outDir, `${String(i + 1).padStart(2, '0')}.png`) });
    }
  } finally {
    await page.close();
  }
  fs.writeFileSync(path.join(outDir, 'caption.txt'), caption(d, kept, { date }));
  return { folder, outDir, count: kept.length, theme };
}

async function main() {
  const args = process.argv.slice(2);
  const ti = args.indexOf('--theme');
  const themeArg = ti === -1 ? null : args[ti + 1];
  if (themeArg && !THEMES[themeArg]) {
    console.error(`--theme은 ${Object.keys(THEMES).join('/')} 중 하나입니다.`);
    process.exit(2);
  }
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
      const r = await renderDraft(browser, t, { theme: themeArg });
      console.log(`✔ ${r.folder} [${r.theme}]: ${r.count}장 → ${path.relative(resolveFromRoot('.'), r.outDir)}`);
    }
  } finally {
    await browser.close();
  }
  console.log(`\n끝: ${targets.length}편. output/insta/ 폴더를 Google Drive에 올리고, 인스타 업로드는 직접 해 주세요.`);
}

if (require.main === module) main().catch((e) => { console.error(`✖ ${e.message}`); process.exit(1); });

module.exports = { planFromDraft, caption, sentences, html, themeFor, THEMES };
