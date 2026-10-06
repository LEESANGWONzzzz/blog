#!/usr/bin/env node
// 정보 카드 이미지 만들기 — AI·API 키 없이, 브라우저로 그려 PNG로 저장한다.
// 글자를 그대로 그리기 때문에 한글 철자·숫자가 틀어지지 않는다.
//
// 사용:
//   node scripts/make_cards.js --plan drafts/<글폴더>/cards.json [--draft drafts/<글폴더>/draft.json]
//
// cards.json: [{ "file": "input/images/cards/<글폴더>-01.png", "kind": "cover|list|steps|number",
//                "label": "작은 머리말", "title": "제목", "items": ["…"], "big": "월 50만 원",
//                "note": "출처: 금융위원회 · 2026-10-06 기준" }, ...]
// --draft를 주면, 카드에 적힌 숫자가 본문에도 같은 형태로 있는지 확인한다 (없으면 만들지 않고 실패).

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { resolveFromRoot } = require('./lib/config');

const KINDS = new Set(['cover', 'list', 'steps', 'number']);
const FONT = "'Pretendard','Apple SD Gothic Neo','Noto Sans KR','Malgun Gothic','WenQuanYi Zen Hei',sans-serif";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function validatePlan(plan) {
  if (!Array.isArray(plan) || plan.length === 0) throw new Error('cards.json은 비어 있지 않은 배열이어야 합니다.');
  plan.forEach((c, i) => {
    if (!c.file || !c.file.startsWith('input/images/cards/') || !c.file.endsWith('.png')) {
      throw new Error(`cards.json[${i}]: file은 input/images/cards/…png 이어야 합니다.`);
    }
    if (!KINDS.has(c.kind)) throw new Error(`cards.json[${i}]: kind는 ${[...KINDS].join('/')} 중 하나입니다.`);
    if (!c.title) throw new Error(`cards.json[${i}]: title이 필요합니다.`);
    if ((c.kind === 'list' || c.kind === 'steps') && !(Array.isArray(c.items) && c.items.length)) {
      throw new Error(`cards.json[${i}]: ${c.kind} 카드는 items가 필요합니다.`);
    }
    if (c.kind === 'number' && !c.big) throw new Error(`cards.json[${i}]: number 카드는 big이 필요합니다.`);
    if (Array.isArray(c.items) && c.items.length > 5) throw new Error(`cards.json[${i}]: items는 5개 이하 (폰에서 읽히게).`);
  });
}

// 카드 글자에서 숫자 표현 뽑기: "50만 원", "6%", "10월 7일", "1991년" 등
function numberTokens(text) {
  return (String(text).match(/\d[\d,.]*\s*(?:%p|%|만\s?원|억\s?원|원|년|월|일|세|개월|회|시|분)?/g) || [])
    .map((t) => t.replace(/\s/g, ''));
}

function cardTexts(card) {
  return [card.label, card.title, card.big, ...(card.items || [])].filter(Boolean).join(' ');
}

// 카드 숫자가 본문에 있는지 확인 (출처·기준일 note는 제외)
function checkAgainstDraft(plan, draft) {
  const body = (draft.blocks || [])
    .filter((b) => b.type === 'text' || b.type === 'subtitle')
    .map((b) => b.content)
    .join(' ')
    .replace(/\s/g, '');
  const missing = [];
  plan.forEach((c) => {
    for (const tok of numberTokens(cardTexts(c))) {
      if (!body.includes(tok)) missing.push(`${c.file}: "${tok}"`);
    }
  });
  return missing;
}

function html(card) {
  const items = (card.items || []).map((t, i) => (card.kind === 'steps'
    ? `<li><span class="n">${i + 1}</span><span>${esc(t)}</span></li>`
    : `<li><span class="dot"></span><span>${esc(t)}</span></li>`)).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{width:1080px;height:1080px;background:#FBFAF6;font-family:${FONT};color:#1B2A4A}
  .card{position:absolute;inset:56px;background:#fff;border:4px solid #1B2A4A;border-radius:36px;padding:72px 80px;display:flex;flex-direction:column}
  .label{display:inline-block;align-self:flex-start;background:#F2B705;color:#1B2A4A;font-weight:800;font-size:34px;padding:10px 26px;border-radius:999px;margin-bottom:36px}
  h1{font-size:${card.kind === 'cover' ? 86 : 64}px;line-height:1.25;font-weight:900;letter-spacing:-1px;word-break:keep-all}
  .big{margin-top:48px;font-size:120px;font-weight:900;color:#1B2A4A;letter-spacing:-2px}
  .big em{font-style:normal;background:linear-gradient(transparent 62%,#F2B705 62%)}
  ul{list-style:none;margin-top:48px;display:flex;flex-direction:column;gap:30px}
  li{display:flex;gap:24px;align-items:flex-start;font-size:44px;line-height:1.35;font-weight:700;word-break:keep-all}
  .dot{flex:none;width:22px;height:22px;margin-top:16px;border-radius:50%;background:#F2B705}
  .n{flex:none;width:58px;height:58px;border-radius:50%;background:#1B2A4A;color:#fff;font-size:34px;display:flex;align-items:center;justify-content:center}
  .spacer{flex:1}
  .note{font-size:28px;color:#6B7486;font-weight:600}
  .brand{position:absolute;right:80px;bottom:72px;font-size:28px;font-weight:800;color:#1B2A4A}
  </style></head><body><div class="card">
  ${card.label ? `<div class="label">${esc(card.label)}</div>` : ''}
  <h1>${esc(card.title)}</h1>
  ${card.big ? `<div class="big"><em>${esc(card.big)}</em></div>` : ''}
  ${items ? `<ul>${items}</ul>` : ''}
  <div class="spacer"></div>
  ${card.note ? `<div class="note">${esc(card.note)}</div>` : ''}
  <div class="brand">월급날 전에 읽는 경제</div>
  </div></body></html>`;
}

async function render(plan, { executablePath } = {}) {
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1080 } });
    for (const card of plan) {
      const abs = resolveFromRoot(card.file);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      await page.setContent(html(card));
      // 글자가 카드 밖으로 넘치면 실패 (폰에서 잘려 보이는 카드 방지)
      const overflow = await page.evaluate(() => {
        const c = document.querySelector('.card');
        return c.scrollHeight > c.clientHeight + 1;
      });
      if (overflow) throw new Error(`${card.file}: 글자가 카드에 다 안 들어갑니다 — 제목·항목을 줄이세요.`);
      await page.screenshot({ path: abs });
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };
  const planArg = arg('--plan');
  if (!planArg) {
    console.error('사용법: node scripts/make_cards.js --plan drafts/<글폴더>/cards.json [--draft drafts/<글폴더>/draft.json]');
    process.exit(2);
  }
  const plan = JSON.parse(fs.readFileSync(resolveFromRoot(planArg), 'utf8'));
  validatePlan(plan);
  const draftArg = arg('--draft');
  if (draftArg) {
    const missing = checkAgainstDraft(plan, JSON.parse(fs.readFileSync(resolveFromRoot(draftArg), 'utf8')));
    if (missing.length) {
      console.error('✖ 카드의 숫자가 본문에 같은 형태로 없습니다 (확인된 값만 카드에 쓰기):');
      missing.forEach((m) => console.error(`  - ${m}`));
      process.exit(1);
    }
  }
  await render(plan, { executablePath: process.env.PW_CHROMIUM_PATH });
  console.log(`✓ 카드 ${plan.length}장 생성: ${plan.map((c) => c.file).join(', ')}`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(`✖ ${e.message}`);
    process.exit(1);
  });
}

module.exports = { validatePlan, numberTokens, checkAgainstDraft, html, render };
