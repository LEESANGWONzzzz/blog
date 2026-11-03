#!/usr/bin/env node
// 정보 카드 이미지 만들기 — AI·API 키 없이, 브라우저로 그려 PNG로 저장한다.
// 글자를 그대로 그리기 때문에 한글 철자·숫자가 틀어지지 않는다.
//
// 사용:
//   node scripts/make_cards.js --plan drafts/<글폴더>/cards.json [--draft drafts/<글폴더>/draft.json]
//
// cards.json: [{ "file": "input/images/cards/<글폴더>-01.png",
//                "kind": "cover|hero|list|steps|timeline|number|table|compare|chart",
//                "theme": "classic|navy|mint|sunset|night",
//                "icon": "그림 이름 (scripts/lib/illust.js) — 비우면 글자 내용으로 자동 선택, \"none\"이면 그림 없음",
//                "label": "작은 머리말", "title": "제목", "sub": "한 줄 설명 (hero·cover·number)",
//                "items": ["…"] (timeline은 "11월 4일 — 신청 시작"처럼 "시점 — 내용"), "big": "월 50만 원",
//                "rows": [["항목", "값"]], "formula": ["1,000주", "×", "500원", "=", "50만 원"],
//                "left": {"title": "A안", "items": ["…"]}, "right": {...},
//                "chart": {"type": "bar|line", "unit": "%", "points": [{"label": "2025", "value": "3.0"}]},
//                  (value는 문자열로 쓰면 적은 그대로 표시된다: "3.0" → 3.0%)
//                "bg": "input/photos/_mosaic/…jpg (선택, 흐리게 깔리는 배경)",
//                "note": "출처: 금융위원회 · 2026-10-06 기준" }, ...]
// 디자인 기준은 docs/image-style.md.
// --draft를 주면, 카드에 적힌 숫자가 본문에도 같은 형태로 있는지 확인한다 (없으면 만들지 않고 실패).

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { resolveFromRoot } = require('./lib/config');
const { ICONS, pickIcon, iconSvg } = require('./lib/illust');

const KINDS = new Set(['cover', 'hero', 'list', 'steps', 'timeline', 'number', 'table', 'compare', 'chart']);
const THEMES = new Set(['classic', 'navy', 'mint', 'sunset', 'night']);
const BG_DIRS = ['input/photos/_mosaic/', 'input/images/official/'];
const FONT = "'Pretendard','Apple SD Gothic Neo','Noto Sans KR','Malgun Gothic','WenQuanYi Zen Hei',sans-serif";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function validatePlan(plan) {
  if (!Array.isArray(plan) || plan.length === 0) throw new Error('cards.json은 비어 있지 않은 배열이어야 합니다.');
  plan.forEach((c, i) => {
    const at = `cards.json[${i}]`;
    if (!c.file || !c.file.startsWith('input/images/cards/') || !c.file.endsWith('.png')) {
      throw new Error(`${at}: file은 input/images/cards/…png 이어야 합니다.`);
    }
    if (!KINDS.has(c.kind)) throw new Error(`${at}: kind는 ${[...KINDS].join('/')} 중 하나입니다.`);
    if (c.theme && !THEMES.has(c.theme)) throw new Error(`${at}: theme은 ${[...THEMES].join('/')} 중 하나입니다.`);
    if (c.bg && !BG_DIRS.some((d) => c.bg.startsWith(d))) {
      throw new Error(`${at}: bg 사진은 ${BG_DIRS.join(' 또는 ')} 안의 파일만 씁니다 (직접 찍은 사진·공공누리 자료).`);
    }
    if (!c.title) throw new Error(`${at}: title이 필요합니다.`);
    if (['list', 'steps', 'timeline'].includes(c.kind) && !(Array.isArray(c.items) && c.items.length)) {
      throw new Error(`${at}: ${c.kind} 카드는 items가 필요합니다.`);
    }
    if (c.kind === 'timeline' && !c.items.every((x) => /\s—\s/.test(x))) {
      throw new Error(`${at}: timeline items는 "11월 4일 — 신청 시작"처럼 "시점 — 내용"입니다.`);
    }
    if (c.icon && c.icon !== 'none' && !ICONS[c.icon]) {
      throw new Error(`${at}: icon은 ${Object.keys(ICONS).join('/')} 또는 none 중 하나입니다.`);
    }
    if (c.kind === 'number' && !c.big) throw new Error(`${at}: number 카드는 big이 필요합니다.`);
    if (Array.isArray(c.items) && c.items.length > 5) throw new Error(`${at}: items는 5개 이하 (폰에서 읽히게).`);
    if (c.kind === 'table') {
      const okRows = Array.isArray(c.rows) && c.rows.length && c.rows.every((r) => Array.isArray(r) && r.length === 2);
      if (!okRows && !Array.isArray(c.formula)) throw new Error(`${at}: table 카드는 rows([[항목, 값], …]) 또는 formula가 필요합니다.`);
      if (Array.isArray(c.rows) && c.rows.length > 6) throw new Error(`${at}: rows는 6줄 이하.`);
      if (c.formula && !(Array.isArray(c.formula) && c.formula.length >= 3 && c.formula.length <= 7)) {
        throw new Error(`${at}: formula는 ["1,364주", "×", "14,010원", "=", "결과"]처럼 3~7칸입니다.`);
      }
    }
    if (c.kind === 'compare') {
      for (const side of ['left', 'right']) {
        const v = c[side];
        if (!v || !v.title || !Array.isArray(v.items) || !v.items.length || v.items.length > 4) {
          throw new Error(`${at}: compare 카드는 ${side}: { title, items(1~4개) }가 필요합니다.`);
        }
      }
    }
    if (c.kind === 'chart') {
      const ch = c.chart || {};
      if (!['bar', 'line'].includes(ch.type)) throw new Error(`${at}: chart.type은 bar 또는 line입니다.`);
      if (!Array.isArray(ch.points) || ch.points.length < 2 || ch.points.length > 8
        || !ch.points.every((p) => p && p.label !== undefined && Number.isFinite(Number(p.value)))) {
        throw new Error(`${at}: chart.points는 [{ "label": "2024", "value": 3.5 }, …] 2~8개입니다.`);
      }
      if (!c.note || !/출처/.test(c.note)) throw new Error(`${at}: chart 카드는 note에 "출처: 기관명 · 기준일"이 필요합니다.`);
    }
  });
}

// 카드 글자에서 숫자 표현 뽑기: "50만 원", "6%", "10월 7일", "1991년" 등
function numberTokens(text) {
  return (String(text).match(/\d[\d,.]*\s*(?:%p|%|만\s?원|억\s?원|원|년|월|일|세|개월|회|시|분|주|배|명|건)?/g) || [])
    .map((t) => t.replace(/\s/g, '').replace(/[.,]$/, ''));
}

const pointText = (ch, p) => `${p.value}${ch.unit || ''}`;

function cardTexts(card) {
  const parts = [card.label, card.title, card.sub, card.big, ...(card.items || [])];
  for (const r of card.rows || []) parts.push(...r);
  parts.push(...(card.formula || []));
  for (const side of ['left', 'right']) if (card[side]) parts.push(card[side].title, ...(card[side].items || []));
  if (card.chart) for (const p of card.chart.points || []) parts.push(String(p.label), pointText(card.chart, p));
  return parts.filter((x) => x !== undefined && x !== null && x !== '').join(' ');
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

function bgDataUri(rel) {
  const abs = resolveFromRoot(rel);
  if (!fs.existsSync(abs)) throw new Error(`bg 사진이 없습니다: ${rel}`);
  const ext = path.extname(abs).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  return `data:${mime};base64,${fs.readFileSync(abs).toString('base64')}`;
}

// 막대·꺾은선 그래프 (SVG). 값 글자는 본문 대조 대상이다.
function chartSvg(ch, t) {
  const W = 920; const H = 470; const top = 56; const bottom = 70; const side = 30;
  const vals = ch.points.map((p) => Number(p.value));
  const max = Math.max(...vals); const min = Math.min(...vals);
  const lo = ch.type === 'bar' ? Math.min(0, min) : min - (max - min || 1) * 0.25;
  const hi = max + (max - lo || 1) * 0.12;
  const y = (v) => top + (H - top - bottom) * (1 - (v - lo) / (hi - lo));
  const step = (W - side * 2) / ch.points.length;
  const x = (i) => side + step * i + step / 2;
  const last = ch.points.length - 1;
  const labels = ch.points.map((p, i) => `<text x="${x(i)}" y="${H - 22}" text-anchor="middle" class="cl">${esc(p.label)}</text>`).join('');
  const values = ch.points.map((p, i) => `<text x="${x(i)}" y="${y(Number(p.value)) - 26}" text-anchor="middle" class="cv${i === last ? ' hl' : ''}">${esc(pointText(ch, p))}</text>`).join('');
  let marks;
  if (ch.type === 'bar') {
    const bw = Math.min(110, step * 0.62);
    marks = ch.points.map((p, i) => {
      const v = Number(p.value); const y0 = y(Math.max(0, lo)); const y1 = y(v);
      return `<rect x="${x(i) - bw / 2}" y="${Math.min(y0, y1)}" width="${bw}" height="${Math.max(2, Math.abs(y0 - y1))}" rx="10" fill="${i === last ? t.accent : t.soft}"/>`;
    }).join('');
  } else {
    const pts = ch.points.map((p, i) => `${x(i)},${y(Number(p.value))}`).join(' ');
    marks = `<polyline points="${pts}" fill="none" stroke="${t.ink}" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/>`
      + ch.points.map((p, i) => `<circle cx="${x(i)}" cy="${y(Number(p.value))}" r="${i === last ? 14 : 10}" fill="${i === last ? t.accent : t.ink}"/>`).join('');
  }
  return `<svg width="100%" viewBox="0 0 ${W} ${H}"><line x1="${side}" x2="${W - side}" y1="${H - bottom}" y2="${H - bottom}" stroke="#C9D1DD" stroke-width="3"/>${marks}${values}${labels}</svg>`;
}

const THEME = {
  classic: { ink: '#1B2A4A', accent: '#F2B705', soft: '#C9D3E3', hl: '#1B2A4A', page: '#FBFAF6', blob: '#FFE7A3', ic: { a: '#F2B705', b: '#7FB3FF', k: '#1B2A4A' } },
  navy: { ink: '#1B2A4A', accent: '#E03131', soft: '#9FB3CF', hl: '#E03131', page: '#E9EEF5', blob: '#CFDCEE', ic: { a: '#3B82F6', b: '#FFC94D', k: '#1B2A4A' } },
  mint: { ink: '#1F2A3A', accent: '#FFE14D', soft: '#A8DCD3', hl: '#11806F', page: '#E4F5F1', blob: '#BDE8DF', ic: { a: '#2FB59E', b: '#FFE14D', k: '#1F2A3A' } },
  sunset: { ink: '#3A1F14', accent: '#FF8A3D', soft: '#F6C9A8', hl: '#D9480F', page: '#FFF3E8', blob: '#FFD9B8', ic: { a: '#FF8A3D', b: '#FFD43B', k: '#3A1F14' } },
  night: { ink: '#F2E8D0', accent: '#F5C518', soft: '#5A5A60', hl: '#F5C518', page: '#232326', blob: '#3A3A40', ic: { a: '#F5C518', b: '#FF8A3D', k: '#141414' }, dark: true },
};

// 카드 글자로 그림 고르기 (icon을 적지 않았을 때)
const cardIcon = (card) => (card.icon === 'none' ? null : card.icon || pickIcon(cardTexts(card)));

function html(card) {
  const theme = card.theme || 'classic';
  const t = THEME[theme];
  const kind0 = card.kind;
  const navy = theme === 'navy' && !['cover', 'hero', 'number'].includes(kind0);
  const navyTheme = theme === 'navy';
  const dark = !!t.dark;
  const panel = dark ? '#2E2E32' : '#fff';
  const icon = cardIcon(card);
  const ill = (size) => (icon ? iconSvg(icon, { ...t.ic, w: dark ? '#F2E8D0' : '#FFFFFF' }, size) : '');
  const kind = card.kind;
  // 내용이 적은 카드는 아래쪽 빈자리에 큰 그림, 많은 카드는 제목 옆 작은 그림
  const amount = Math.max((card.items || []).length, (card.rows || []).length);
  const sparse = ['list', 'steps', 'timeline', 'compare', 'table'].includes(kind) && amount <= 3 && !card.formula;
  const sticker = icon && !['cover', 'hero', 'number'].includes(kind) && !sparse
    ? `<div class="sticker">${ill(118)}</div>` : '';
  const corner = icon && sparse ? `<div class="corner"><div class="halo"></div>${ill(250)}</div>` : '';
  const items = (kind === 'timeline' ? [] : card.items || []).map((x, i) => (kind === 'steps'
    ? `<li><span class="n">${i + 1}</span><span>${esc(x)}</span></li>`
    : `<li><span class="dot"></span><span>${esc(x)}</span></li>`)).join('');
  const timeline = kind === 'timeline' ? `<div class="tl">${card.items.map((x) => {
    const [when, ...what] = x.split(/\s—\s/);
    return `<div class="te"><div class="tw">${esc(when)}</div><div class="tx">${esc(what.join(' — '))}</div></div>`;
  }).join('')}</div>` : '';
  const rows = (card.rows || []).map(([k, v]) => `<div class="row"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`).join('');
  const formula = card.formula
    ? `<div class="formula">${card.formula.map((f, i) => {
      const op = /^[×x*+\-−÷=]$/.test(f);
      return `<span class="${op ? 'op' : i === card.formula.length - 1 ? 'res' : 'term'}">${esc(f)}</span>`;
    }).join('')}</div>` : '';
  const side = (v, cls) => `<div class="side ${cls}"><div class="sh">${esc(v.title)}</div><ul>${v.items.map((x) => `<li><span class="dot"></span><span>${esc(x)}</span></li>`).join('')}</ul></div>`;
  const compare = kind === 'compare' ? `<div class="cmp">${side(card.left, 'a')}<div class="vs">VS</div>${side(card.right, 'b')}</div>` : '';
  const chart = kind === 'chart' ? `<div class="chart">${chartSvg(card.chart, t)}</div>` : '';
  const bg = card.bg ? `background-image:linear-gradient(rgba(255,255,255,.86),rgba(255,255,255,.86)),url('${bgDataUri(card.bg)}');background-size:cover;background-position:center;`
    : navyTheme ? 'background:repeating-linear-gradient(135deg,rgba(255,255,255,.35) 0 2px,transparent 2px 26px),linear-gradient(160deg,#F4F7FB,#D9E2EE);'
      : `background:radial-gradient(circle at 88% 12%,${t.blob} 0 150px,transparent 151px),radial-gradient(circle at 6% 94%,${t.blob} 0 110px,transparent 111px),radial-gradient(${dark ? 'rgba(255,255,255,.05)' : 'rgba(27,42,74,.06)'} 2px,transparent 2px) 0 0/26px 26px,${t.page};`;
  const titleSize = kind === 'cover' ? 82 : kind === 'hero' ? 68 : ['table', 'chart', 'compare'].includes(kind) ? 54 : 62;
  const sub = card.sub ? `<div class="sub">${esc(card.sub)}</div>` : '';
  const big = card.big ? `<div class="big"><em>${esc(card.big)}</em></div>` : '';
  let body;
  if (kind === 'cover') {
    body = `${card.label ? `<div class="label">${esc(card.label)}</div>` : ''}<h1>${esc(card.title)}</h1>${sub}${big}
      <div class="spacer"></div>${icon ? `<div class="scene"><div class="halo"></div><div class="main-ill">${ill(330)}</div>
      <div class="deco d1">${iconSvg('sparkle', t.ic, 70)}</div><div class="deco d2">${iconSvg('coin', t.ic, 84)}</div></div>` : ''}`;
  } else if (kind === 'hero') {
    body = `<div class="hero-ill"><div class="halo"></div>${ill(380)}</div>${card.label ? `<div class="label c">${esc(card.label)}</div>` : ''}<h1 class="c">${esc(card.title)}</h1>${sub}<div class="spacer"></div>`;
  } else if (kind === 'number') {
    body = `${card.label ? `<div class="label">${esc(card.label)}</div>` : ''}<h1>${esc(card.title)}</h1>
      <div class="numrow">${big}${icon ? `<div class="num-ill">${ill(250)}</div>` : ''}</div>${sub}${items ? `<ul>${items}</ul>` : ''}<div class="spacer"></div>`;
  } else {
    body = `${!navy && card.label ? `<div class="label">${esc(card.label)}</div>` : ''}${!navy ? `<h1 class="sh-pad">${esc(card.title)}</h1>` : ''}
      ${sub}${big}${items ? `<ul>${items}</ul>` : ''}${timeline}${rows ? `<div class="rows">${rows}</div>` : ''}${formula}${compare}${chart}<div class="spacer"></div>${corner}`;
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{width:1080px;height:1080px;${bg}font-family:${FONT};color:${t.ink}}
  .card{position:absolute;inset:56px;background:${navy ? 'rgba(255,255,255,.92)' : dark ? 'rgba(46,46,50,.94)' : 'rgba(255,255,255,.94)'};${navy ? 'box-shadow:0 18px 50px rgba(27,42,74,.18);' : `border:4px solid ${dark ? '#4A4A50' : t.ink};box-shadow:10px 10px 0 ${dark ? '#000' : t.soft};`}border-radius:36px;padding:${navy ? '0 0 64px' : '72px 80px'};display:flex;flex-direction:column;overflow:hidden}
  .inner{position:relative;padding:${navy ? '40px 64px 0' : '0'};display:flex;flex-direction:column;flex:1}
  .label{display:inline-block;align-self:flex-start;background:${navy ? '#DCE6F3' : t.accent};color:${dark ? '#141414' : t.ink};font-weight:800;font-size:32px;padding:10px 26px;border-radius:999px;margin-bottom:${navy ? 24 : 32}px}
  .label.c{align-self:center}
  h1{font-size:${titleSize}px;line-height:1.25;font-weight:900;letter-spacing:-1px;word-break:keep-all}
  h1.c{text-align:center}
  h1.sh-pad{padding-right:${sticker ? 150 : 0}px}
  .sub{margin-top:18px;font-size:38px;line-height:1.4;font-weight:700;color:${dark ? '#CFC6B0' : '#4A5670'};word-break:keep-all}
  .hero-ill+.label+h1.c+.sub,.hero-ill+h1.c+.sub{text-align:center}
  .band{position:relative;background:${t.ink};color:#fff;padding:36px ${sticker ? 200 : 64}px 34px 64px;border-left:14px solid #3B82F6}
  .band .label{background:rgba(255,255,255,.16);color:#fff}
  .sticker{position:absolute;right:${navy ? 40 : 0}px;top:${navy ? 26 : 0}px;width:150px;height:150px;border-radius:50%;background:${dark ? '#3A3A40' : t.blob};display:flex;align-items:center;justify-content:center;${navy ? 'border:4px solid #fff;' : ''}}
  .big{margin-top:36px;font-size:116px;font-weight:900;color:${t.hl};letter-spacing:-2px;line-height:1.1;word-break:keep-all}
  .big em{font-style:normal;${navy || dark ? '' : `background:linear-gradient(transparent 62%,${t.accent} 62%)`}}
  .numrow{display:flex;align-items:center;justify-content:space-between;gap:20px}
  .num-ill{flex:none;margin-top:30px;width:270px;height:270px;border-radius:50%;background:${dark ? '#3A3A40' : t.blob};display:flex;align-items:center;justify-content:center}
  .scene{position:relative;height:320px;margin:-30px -20px 44px auto;width:440px}
  .corner{position:absolute;right:-10px;bottom:36px;width:280px;height:280px;display:flex;align-items:center;justify-content:center}
  .corner .halo{inset:10px}
  .corner svg{position:relative}
  .halo{position:absolute;inset:20px 30px 0 40px;border-radius:50%;background:${dark ? '#3A3A40' : t.blob}}
  .main-ill{position:absolute;right:30px;bottom:0}
  .deco{position:absolute}.d1{left:0;top:30px}.d2{left:40px;bottom:10px}
  .hero-ill{position:relative;align-self:center;width:440px;height:440px;display:flex;align-items:center;justify-content:center;margin:-20px 0 10px}
  .hero-ill .halo{inset:20px}
  .hero-ill svg{position:relative}
  ul{list-style:none;margin-top:40px;display:flex;flex-direction:column;gap:26px}
  li{display:flex;gap:22px;align-items:flex-start;font-size:42px;line-height:1.35;font-weight:700;word-break:keep-all}
  .dot{flex:none;width:20px;height:20px;margin-top:16px;border-radius:50%;background:${navy ? '#3B82F6' : t.accent}}
  .n{flex:none;width:58px;height:58px;border-radius:50%;background:${dark ? t.accent : t.ink};color:${dark ? '#141414' : '#fff'};font-size:34px;display:flex;align-items:center;justify-content:center}
  .tl{margin-top:44px;display:flex;flex-direction:column;gap:30px;border-left:8px solid ${t.accent};margin-left:18px;padding-left:44px}
  .te{position:relative}
  .te:before{content:'';position:absolute;left:-64px;top:8px;width:32px;height:32px;border-radius:50%;background:${panel};border:8px solid ${t.hl}}
  .tw{font-size:36px;font-weight:900;color:${t.hl}}
  .tx{font-size:40px;font-weight:700;line-height:1.35;word-break:keep-all}
  .rows{margin-top:30px;border:3px solid #D5DCE6;border-radius:20px;overflow:hidden;background:${panel}}
  .row{display:flex;justify-content:space-between;align-items:center;gap:24px;padding:18px 30px;font-size:38px;border-top:3px solid #E3E8EF}
  .row:first-child{border-top:none}
  .k{font-weight:700;color:${dark ? '#CFC6B0' : '#3A475F'};background:transparent;word-break:keep-all}
  .v{font-weight:900;text-align:right;white-space:nowrap}
  .formula{margin-top:32px;display:flex;align-items:center;justify-content:center;gap:16px;flex-wrap:wrap;padding:24px;border:3px solid #D5DCE6;border-radius:20px;background:${panel};font-weight:900}
  .term{font-size:44px}.op{font-size:44px;color:#7A8599}.res{font-size:56px;color:${t.hl}}
  .cmp{margin-top:40px;display:flex;align-items:stretch;gap:44px;position:relative}
  .side{flex:1;border-radius:24px;padding:30px 30px 36px;background:${dark ? '#3A3A40' : '#F3F6FA'};border:3px solid ${dark ? '#55555C' : '#D5DCE6'}}
  .side.b{background:${dark ? '#4A3A20' : navy ? '#FFF1F1' : '#FFF8E1'};border-color:${navy ? '#F3C0C0' : '#F2D675'}}
  .sh{font-size:40px;font-weight:900;margin-bottom:6px;word-break:keep-all}
  .side ul{margin-top:18px;gap:18px}.side li{font-size:32px}.side .dot{width:16px;height:16px;margin-top:14px}
  .vs{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:64px;height:64px;border-radius:50%;background:${dark ? t.accent : t.ink};color:${dark ? '#141414' : '#fff'};font-weight:900;font-size:26px;display:flex;align-items:center;justify-content:center}
  .chart{margin-top:24px}
  .cl{font-size:30px;font-weight:700;fill:${dark ? '#CFC6B0' : '#55617A'}}.cv{font-size:32px;font-weight:900;fill:${t.ink};paint-order:stroke;stroke:${panel};stroke-width:10px;stroke-linejoin:round}.cv.hl{fill:${t.hl}}
  .spacer{flex:1}
  .foot{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;padding:${navy ? '0 64px' : '0'}}
  .note{font-size:26px;color:${dark ? '#A89F8C' : '#6B7486'};font-weight:600}
  .brand{font-size:26px;font-weight:800;color:${t.ink};white-space:nowrap}
  </style></head><body><div class="card">
  ${navy ? `<div class="band">${card.label ? `<div class="label">${esc(card.label)}</div>` : ''}<h1>${esc(card.title)}</h1>${sticker}</div>` : ''}
  <div class="inner">${navy ? '' : sticker}${body}</div>
  <div class="foot"><div class="note">${card.note ? esc(card.note) : ''}</div><div class="brand">월급날 전에 읽는 경제</div></div>
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

module.exports = { validatePlan, numberTokens, checkAgainstDraft, html, render, cardIcon };
