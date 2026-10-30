#!/usr/bin/env node
// 인스타 "데일리 브리핑" 카드뉴스 — 하루에 발행한 글들을 신문 한 부처럼 1세트(4:5, 1080×1350)로 묶는다.
// 구성: 1면(날짜·오늘의 이슈 목록) → 이슈마다 1장(헤드라인·핵심 문장·사진) → 오늘 챙길 것(체크리스트)
// 카드 글자는 모두 그 글 본문 문장을 그대로 옮긴 것이다 (새 사실·숫자 없음). 이미지는 그 글에 실제로 넣은 것만.
// 업로드는 운영자가 직접 한다. 기준: docs/learn/instagram-cardnews-2026-10.md
//
// 사용:
//   node scripts/insta_daily.js --all                     # 발행 표시된 글을 날짜별로 묶어 전부
//   node scripts/insta_daily.js --all --include-reserved  # 예약만 한 글도 포함
//   node scripts/insta_daily.js --all --date 2026-10-20   # 그 날짜만 (--from 2026-10-20 이면 그 날 이후)
// 결과: output/insta/daily/<YYYY-MM-DD>/01.png … + caption.txt

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { resolveFromRoot } = require('./lib/config');
const { readAllStatus } = require('./lib/schedule');
const {
  sentences, pickIcon, iconSvg, imageData, isChecklist, isSource, NUM, esc, FONT, BRAND,
} = require('./insta_cards');

const W = 1080;
const H = 1350;
const SERIF = "'Noto Serif KR','AppleMyungjo','Nanum Myeongjo','Batang',serif";
const P = { paper: '#F6F2E8', ink: '#141414', sub: '#5E5A52', red: '#D7263D', rule: '#141414', soft: '#E8E1D1', navy: '#1B2A4A' };
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const MAX_ISSUES = 8;

const hl = (s) => esc(s).replace(NUM, (m) => `<b>${m}</b>`);

function dateOf(d, folder) {
  return (d.publish_at || '').slice(0, 10) || (/^(\d{4})(\d{2})(\d{2})/.exec(folder) || []).slice(1).join('-') || '';
}
function koreanDate(iso) {
  const [y, m, dd] = iso.split('-').map(Number);
  const wd = DAYS[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()];
  return { full: `${y}년 ${m}월 ${dd}일 ${wd}요일`, short: `${m}월 ${dd}일` };
}

// 글 1편 → 이슈 1장 재료 (본문 문장 그대로)
function issueFromDraft(d) {
  const all = d.blocks || [];
  const texts = all.filter((b) => b.type === 'text').map((b) => b.content.trim());
  const skip = new Set([texts[texts.length - 1]]);
  if (d.sponsored) skip.add(texts[0]);
  const usable = (b) => b.type === 'text' && !skip.has(b.content.trim()) && !isSource(b.content.trim()) && !isChecklist(b.content);
  // 핵심 문장: 첫 소제목 바로 뒤 답 (AI 브리핑형 결론 문장), 없으면 첫 문단
  const firstSub = all.findIndex((b) => b.type === 'subtitle');
  const answer = firstSub === -1 ? null : all.slice(firstSub + 1).find(usable);
  const lead = answer || all.find(usable);
  const imgs = all.filter((b) => b.type === 'image' && b.path);
  const order = ['input/photos/_mosaic/', 'input/images/generated/', 'input/images/official/', 'input/images/cards/'];
  const image = order.map((dir) => imgs.find((b) => b.path.startsWith(dir))).find(Boolean) || null;
  const check = all.find((b) => b.type === 'text' && isChecklist(b.content));
  const checkItem = check ? check.content.split('\n').map((l) => l.trim()).find((l) => l.startsWith('✔')) : null;
  return {
    title: d.title,
    category: d.category || '',
    slot: d.slot || (d.publish_at || '').slice(11, 16),
    question: firstSub === -1 ? '' : all[firstSub].content,
    sentences: lead ? sentences(lead.content).slice(0, 3) : [],
    image: image ? { path: image.path, caption: image.caption || '' } : null,
    icon: pickIcon(`${d.title} ${lead ? lead.content : ''}`),
    checkItem: checkItem ? checkItem.replace(/^✔\s*/, '') : null,
    tags: d.tags || [],
  };
}

function planDay(date, drafts) {
  const issues = drafts.map(issueFromDraft)
    .sort((a, b) => (a.slot || '99').localeCompare(b.slot || '99'))
    .slice(0, MAX_ISSUES);
  const cards = [{ kind: 'front', date, issues }];
  issues.forEach((it, i) => cards.push({ kind: 'issue', date, no: i + 1, ...it }));
  const checks = issues.filter((it) => it.checkItem).map((it) => ({ item: it.checkItem, title: it.title })).slice(0, 5);
  cards.push({ kind: 'back', date, checks });
  return { date, issues, cards };
}

function caption({ date, issues }) {
  const kd = koreanDate(date);
  const tags = [...new Set(issues.flatMap((it) => it.tags).map((t) => `#${String(t).replace(/^#/, '').replace(/\s/g, '')}`))].slice(0, 10);
  return [
    `${kd.short} 월급날 브리핑 — 오늘의 이슈 ${issues.length}`,
    '',
    ...issues.map((it, i) => `${i + 1}. ${it.title}`),
    '',
    `${date} 기준으로 정리한 정보예요. 이후 바뀔 수 있으니 결정 전에 공식 안내를 꼭 확인해 주세요.`,
    `글마다 출처와 자세한 계산은 프로필 링크의 블로그 「${BRAND}」에 있어요.`,
    '',
    tags.join(' '),
  ].join('\n').trim() + '\n';
}

function shell(inner, { date, idx, total, scale = 1 }) {
  const kd = koreanDate(date);
  const f = (n) => Math.round(n * scale);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{width:${W}px;height:${H}px;background:${P.paper};color:${P.ink};font-family:${FONT};word-break:keep-all;
    background-image:radial-gradient(rgba(0,0,0,.035) 1px,transparent 1px);background-size:6px 6px}
  .pg{position:absolute;inset:0;padding:64px 72px 56px;display:flex;flex-direction:column}
  .mast{display:flex;justify-content:space-between;align-items:flex-end;font-size:26px;font-weight:800;padding-bottom:16px;border-bottom:6px solid ${P.rule};position:relative}
  .mast:after{content:'';position:absolute;left:0;right:0;bottom:-14px;border-bottom:2px solid ${P.rule}}
  .mast .name{font-family:${SERIF};font-size:30px;font-weight:900;letter-spacing:-.5px}
  .mast .dt{color:${P.sub}}
  .main{flex:1;display:flex;flex-direction:column;padding-top:44px;overflow:hidden}
  .foot{display:flex;justify-content:space-between;align-items:center;font-size:24px;font-weight:700;color:${P.sub};border-top:2px solid ${P.rule};padding-top:16px}
  .foot .nx{color:${P.red};font-weight:900}
  b{font-weight:900;background:linear-gradient(transparent 58%,rgba(215,38,61,.22) 58%)}
  .kicker{display:flex;align-items:center;gap:16px;font-size:${f(28)}px;font-weight:900;color:${P.red};letter-spacing:.5px}
  .kicker .cat{color:${P.ink};background:${P.soft};padding:6px 16px;border-radius:4px;font-size:${f(24)}px}
  /* 1면 */
  .title{font-family:${SERIF};font-size:${f(132)}px;font-weight:900;line-height:1;letter-spacing:-4px;margin-top:10px}
  .sub{margin-top:18px;font-size:${f(32)}px;font-weight:800;color:${P.sub}}
  .sub em{font-style:normal;color:${P.red}}
  .hero{margin-top:${f(30)}px;height:${f(330)}px;border:3px solid ${P.ink};overflow:hidden;background:#fff;position:relative}
  .hero img{width:100%;height:100%;object-fit:cover;display:block}
  .toc{margin-top:${f(26)}px;display:flex;flex-direction:column}
  .toc li{list-style:none;display:flex;gap:20px;align-items:flex-start;padding:${f(15)}px 0;border-bottom:2px dashed #CFC6B2}
  .toc .n{flex:none;width:${f(46)}px;height:${f(46)}px;border-radius:50%;background:${P.red};color:#fff;font-size:${f(26)}px;font-weight:900;display:flex;align-items:center;justify-content:center;margin-top:2px}
  .toc .t{font-size:${f(32)}px;font-weight:800;line-height:1.32}
  .toc .c{display:block;font-size:${f(22)}px;font-weight:700;color:${P.sub};margin-bottom:2px}
  /* 이슈 */
  .head{font-family:${SERIF};font-size:${f(64)}px;font-weight:900;line-height:1.24;letter-spacing:-1.5px;margin-top:18px}
  .q{margin-top:14px;font-size:${f(30)}px;font-weight:800;color:${P.sub}}
  .ph{margin-top:${f(30)}px;height:${f(470)}px;border:3px solid ${P.ink};background:#fff;overflow:hidden;position:relative;flex:none}
  .ph img{width:100%;height:100%;object-fit:contain;display:block}
  .ph.cover img{object-fit:cover}
  .ph figcaption{position:absolute;right:0;bottom:0;background:rgba(20,20,20,.75);color:#fff;font-size:20px;padding:6px 14px}
  .ph.ico{display:flex;align-items:center;justify-content:center;background:${P.soft}}
  .lead{margin-top:${f(30)}px;padding-left:28px;border-left:8px solid ${P.red};display:flex;flex-direction:column;gap:${f(16)}px}
  .lead p{font-size:${f(38)}px;line-height:1.52;font-weight:500}
  .lead p:first-child{font-weight:800}
  /* 마지막 장 */
  .bigt{font-family:${SERIF};font-size:${f(84)}px;font-weight:900;letter-spacing:-2px;margin-top:6px}
  .checks{margin-top:${f(36)}px;display:flex;flex-direction:column;gap:${f(22)}px}
  .checks li{list-style:none;background:#fff;border:3px solid ${P.ink};padding:${f(24)}px ${f(28)}px;display:flex;gap:20px}
  .checks .ck{flex:none;color:${P.red};font-size:${f(36)}px;font-weight:900}
  .checks .it{font-size:${f(34)}px;font-weight:800;line-height:1.4}
  .checks .from{display:block;font-size:${f(22)}px;font-weight:600;color:${P.sub};margin-top:6px}
  .cta{margin-top:auto;background:${P.ink};color:${P.paper};padding:${f(34)}px ${f(40)}px;display:flex;gap:28px;align-items:center}
  .cta .tx{font-size:${f(32)}px;font-weight:800;line-height:1.45}
  .cta .tx small{display:block;font-size:${f(24)}px;font-weight:600;opacity:.8;margin-top:6px}
  </style></head><body><div class="pg">
  <div class="mast"><span class="name">${BRAND}</span><span class="dt">${kd.full}</span></div>
  <div class="main">${inner}</div>
  <div class="foot"><span>${idx + 1} / ${total}</span><span class="nx">${idx + 1 < total ? '다음 이슈 →' : '저장해 두고 다시 보기'}</span></div>
  </div></body></html>`;
}

function htmlDay(card, idx, total, scale = 1) {
  const src = (img) => (img ? imageData(img.path) : null);
  const credit = (img) => (img && /출처/.test(img.caption) ? `<figcaption>${esc(img.caption)}</figcaption>` : '');
  let inner = '';
  if (card.kind === 'front') {
    const heroImg = card.noHero ? null : card.issues.map((it) => it.image).find((im) => im && !im.path.startsWith('input/images/cards/') && src(im));
    inner = `<div class="kicker">DAILY BRIEFING</div>
      <div class="title">월급날 브리핑</div>
      <div class="sub">출퇴근길 3분, <em>오늘의 이슈 ${card.issues.length}</em></div>
      ${heroImg ? `<figure class="hero"><img src="${src(heroImg)}">${credit(heroImg)}</figure>` : ''}
      <ul class="toc">${card.issues.map((it, i) => `<li><span class="n">${i + 1}</span><span class="t"><span class="c">${esc(it.category)}</span>${esc(it.title)}</span></li>`).join('')}</ul>`;
  } else if (card.kind === 'issue') {
    const s = card.noImage ? null : src(card.image);
    const isPhoto = card.image && /^input\/(photos|images\/generated)\//.test(card.image.path);
    const figure = s
      ? `<figure class="ph${isPhoto ? ' cover' : ''}">${`<img src="${s}">`}${credit(card.image)}</figure>`
      : `<figure class="ph ico" style="height:${Math.round(300 * scale)}px">${iconSvg(card.icon, '#F2B705', '#FFFFFF', P.ink, Math.round(220 * scale))}</figure>`;
    inner = `<div class="kicker">ISSUE ${String(card.no).padStart(2, '0')}<span class="cat">${esc(card.category)}</span></div>
      <div class="head">${esc(card.title)}</div>
      ${card.question ? `<div class="q">Q. ${esc(card.question)}</div>` : ''}
      ${figure}
      <div class="lead">${card.sentences.map((x) => `<p>${hl(x)}</p>`).join('')}</div>`;
  } else {
    inner = `<div class="kicker">TODAY'S CHECK</div>
      <div class="bigt">오늘 챙길 것</div>
      ${card.checks.length ? `<ul class="checks">${card.checks.map((c) => `<li><span class="ck">✔</span><span class="it">${hl(c.item)}<span class="from">${esc(c.title)}</span></span></li>`).join('')}</ul>` : ''}
      <div class="cta">${iconSvg('check', '#F2B705', '#FFFFFF', P.ink, 110)}<div class="tx">글마다 출처와 자세한 계산은 블로그에 있어요.<small>「${BRAND}」 · ${esc(card.date)} 기준 정보</small></div></div>`;
  }
  return shell(inner, { date: card.date, idx, total, scale });
}

// 넘치면: 글씨 조금 줄이기 → 문장 줄이기 → 사진·목록 줄이기 (문장 중간은 자르지 않음)
async function fitDay(page, card, idx, total) {
  const c = { ...card, sentences: card.sentences && [...card.sentences], checks: card.checks && [...card.checks] };
  for (;;) {
    for (const scale of [1, 0.92, 0.85]) {
      await page.setContent(htmlDay(c, idx, total, scale));
      const over = await page.evaluate(() => {
        const m = document.querySelector('.main');
        return m.scrollHeight > m.clientHeight + 1;
      });
      if (!over) return true;
    }
    if (c.kind === 'front' && !c.noHero) c.noHero = true;
    else if (c.sentences && c.sentences.length > 2) c.sentences.pop();
    else if (c.kind === 'issue' && !c.noImage && c.image) c.noImage = true;
    else if (c.sentences && c.sentences.length > 1) c.sentences.pop();
    else if (c.checks && c.checks.length > 2) c.checks.pop();
    else return false;
  }
}

async function renderDay(browser, day) {
  const outDir = resolveFromRoot(path.join('output/insta/daily', day.date));
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  let n = 0;
  try {
    for (let i = 0; i < day.cards.length; i += 1) {
      if (await fitDay(page, day.cards[i], i, day.cards.length)) {
        n += 1;
        await page.screenshot({ path: path.join(outDir, `${String(n).padStart(2, '0')}.png`) });
      } else console.warn(`  ⚠ ${day.date}: ${i + 1}번 카드가 넘쳐서 뺐습니다.`);
    }
  } finally {
    await page.close();
  }
  fs.writeFileSync(path.join(outDir, 'caption.txt'), caption(day));
  return { outDir, count: n };
}

function groupByDate(entries) {
  const days = new Map();
  for (const e of entries) {
    const date = dateOf(e.d, path.basename(e.dir));
    if (!date) continue;
    if (!days.has(date)) days.set(date, []);
    days.get(date).push(e.d);
  }
  return [...days.entries()].sort(([a], [b]) => a.localeCompare(b));
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };
  if (!args.includes('--all')) {
    console.error('사용법: node scripts/insta_daily.js --all [--include-reserved] [--date YYYY-MM-DD | --from YYYY-MM-DD]');
    process.exit(2);
  }
  const withReserved = args.includes('--include-reserved');
  const only = arg('--date');
  const from = arg('--from');
  const entries = readAllStatus().filter((e) => !e.d.test && e.s.saved && (e.s.published || withReserved));
  const days = groupByDate(entries)
    .filter(([date]) => (!only || date === only) && (!from || date >= from))
    .map(([date, drafts]) => planDay(date, drafts));
  if (!days.length) {
    console.error('대상 글이 없습니다. (발행 표시된 글만 고릅니다 — 예약만 한 글도 넣으려면 --include-reserved)');
    process.exit(1);
  }
  const executablePath = process.env.PW_CHROMIUM_PATH;
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  try {
    for (const day of days) {
      const r = await renderDay(browser, day);
      console.log(`✔ ${day.date}: 이슈 ${day.issues.length}개 · ${r.count}장 → ${path.relative(resolveFromRoot('.'), r.outDir)}`);
    }
  } finally {
    await browser.close();
  }
  console.log(`\n끝: ${days.length}일치. output/insta/daily/ 폴더를 Google Drive에 올리고, 인스타 업로드는 직접 해 주세요.`);
}

if (require.main === module) main().catch((e) => { console.error(`✖ ${e.message}`); process.exit(1); });

module.exports = { issueFromDraft, planDay, caption, htmlDay, groupByDate, koreanDate };
