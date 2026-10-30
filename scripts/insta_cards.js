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

// 아이콘 (직접 그린 SVG — 외부 이미지·저작권 없음). 문장 키워드로 고른다.
// a: 주색, b: 보조색, k: 선색
const ICONS = {
  calendar: (a, b, k) => `<rect x="14" y="22" width="92" height="84" rx="12" fill="${b}" stroke="${k}" stroke-width="6"/><rect x="14" y="22" width="92" height="26" rx="12" fill="${a}" stroke="${k}" stroke-width="6"/><line x1="38" y1="12" x2="38" y2="32" stroke="${k}" stroke-width="7" stroke-linecap="round"/><line x1="82" y1="12" x2="82" y2="32" stroke="${k}" stroke-width="7" stroke-linecap="round"/><circle cx="60" cy="78" r="14" fill="${a}" stroke="${k}" stroke-width="6"/>`,
  coin: (a, b, k) => `<ellipse cx="60" cy="86" rx="40" ry="14" fill="${a}" stroke="${k}" stroke-width="6"/><rect x="20" y="62" width="80" height="24" fill="${a}"/><line x1="20" y1="62" x2="20" y2="86" stroke="${k}" stroke-width="6"/><line x1="100" y1="62" x2="100" y2="86" stroke="${k}" stroke-width="6"/><ellipse cx="60" cy="62" rx="40" ry="14" fill="${b}" stroke="${k}" stroke-width="6"/><circle cx="60" cy="34" r="26" fill="${a}" stroke="${k}" stroke-width="6"/><text x="60" y="44" text-anchor="middle" font-size="30" font-weight="900" fill="${k}">₩</text>`,
  doc: (a, b, k) => `<path d="M28 12h46l22 22v74H28z" fill="${b}" stroke="${k}" stroke-width="6" stroke-linejoin="round"/><path d="M74 12v22h22" fill="${a}" stroke="${k}" stroke-width="6" stroke-linejoin="round"/><line x1="42" y1="56" x2="82" y2="56" stroke="${k}" stroke-width="6" stroke-linecap="round"/><line x1="42" y1="72" x2="82" y2="72" stroke="${k}" stroke-width="6" stroke-linecap="round"/><path d="M44 90l8 8 16-16" fill="none" stroke="${a}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`,
  house: (a, b, k) => `<path d="M14 58L60 18l46 40" fill="${a}" stroke="${k}" stroke-width="6" stroke-linejoin="round"/><rect x="26" y="54" width="68" height="52" fill="${b}" stroke="${k}" stroke-width="6"/><rect x="50" y="74" width="20" height="32" fill="${a}" stroke="${k}" stroke-width="6"/>`,
  ticket: (a, b, k) => `<path d="M12 36h96v14a10 10 0 0 0 0 20v14H12V70a10 10 0 0 0 0-20z" fill="${a}" stroke="${k}" stroke-width="6" stroke-linejoin="round"/><line x1="80" y1="40" x2="80" y2="80" stroke="${k}" stroke-width="5" stroke-dasharray="6 6"/><path d="M44 46l5 10 11 1-8 7 3 11-11-6-10 6 3-11-8-7 11-1z" fill="${b}" stroke="${k}" stroke-width="4" stroke-linejoin="round"/>`,
  card: (a, b, k) => `<rect x="12" y="28" width="96" height="64" rx="10" fill="${a}" stroke="${k}" stroke-width="6"/><rect x="12" y="42" width="96" height="14" fill="${k}"/><rect x="24" y="68" width="30" height="12" rx="3" fill="${b}"/>`,
  piggy: (a, b, k) => `<ellipse cx="58" cy="66" rx="40" ry="30" fill="${a}" stroke="${k}" stroke-width="6"/><rect x="48" y="30" width="24" height="7" rx="3" fill="${k}"/><circle cx="86" cy="60" r="4" fill="${k}"/><rect x="30" y="88" width="12" height="16" fill="${a}" stroke="${k}" stroke-width="5"/><rect x="70" y="88" width="12" height="16" fill="${a}" stroke="${k}" stroke-width="5"/><circle cx="42" cy="16" r="10" fill="${b}" stroke="${k}" stroke-width="5"/>`,
  alert: (a, b, k) => `<path d="M60 14l50 88H10z" fill="${a}" stroke="${k}" stroke-width="6" stroke-linejoin="round"/><line x1="60" y1="46" x2="60" y2="72" stroke="${k}" stroke-width="9" stroke-linecap="round"/><circle cx="60" cy="88" r="5" fill="${k}"/>`,
  chart: (a, b, k) => `<rect x="20" y="66" width="18" height="38" fill="${b}" stroke="${k}" stroke-width="5"/><rect x="51" y="46" width="18" height="58" fill="${b}" stroke="${k}" stroke-width="5"/><rect x="82" y="26" width="18" height="78" fill="${a}" stroke="${k}" stroke-width="5"/><path d="M16 50l32-22 22 12 34-26" fill="none" stroke="${k}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`,
  bag: (a, b, k) => `<path d="M22 40h76l-6 66H28z" fill="${a}" stroke="${k}" stroke-width="6" stroke-linejoin="round"/><path d="M42 48V34a18 18 0 0 1 36 0v14" fill="none" stroke="${k}" stroke-width="6" stroke-linecap="round"/><circle cx="60" cy="74" r="10" fill="${b}" stroke="${k}" stroke-width="5"/>`,
  bowl: (a, b, k) => `<path d="M14 58h92a46 40 0 0 1-92 0z" fill="${a}" stroke="${k}" stroke-width="6" stroke-linejoin="round"/><path d="M40 46c0-10 8-10 8-20M60 46c0-10 8-10 8-20M80 46c0-10 8-10 8-20" fill="none" stroke="${k}" stroke-width="5" stroke-linecap="round"/><rect x="44" y="96" width="32" height="10" rx="4" fill="${b}" stroke="${k}" stroke-width="5"/>`,
  mic: (a, b, k) => `<rect x="44" y="12" width="32" height="56" rx="16" fill="${a}" stroke="${k}" stroke-width="6"/><path d="M30 54a30 30 0 0 0 60 0" fill="none" stroke="${k}" stroke-width="6" stroke-linecap="round"/><line x1="60" y1="84" x2="60" y2="104" stroke="${k}" stroke-width="6"/><line x1="42" y1="106" x2="78" y2="106" stroke="${k}" stroke-width="6" stroke-linecap="round"/><circle cx="96" cy="22" r="8" fill="${b}" stroke="${k}" stroke-width="4"/>`,
  check: (a, b, k) => `<circle cx="60" cy="60" r="46" fill="${a}" stroke="${k}" stroke-width="6"/><path d="M38 62l15 15 30-32" fill="none" stroke="${k}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>`,
};
const ICON_RULES = [
  ['alert', /주의|조심|사기|피해|불가|막혀|못 |안 돼|위험|암표/],
  ['calendar', /\d+\s*(?:월|일)|기한|마감|기간|날짜|언제|지나면/],
  ['ticket', /티켓|예매|콘서트|공연|팬미팅|내한/],
  ['mic', /방송|드라마|예능|시청률|가수|배우/],
  ['bowl', /메뉴|치킨|김밥|맛집|외식|식당|음식|버거/],
  ['bag', /립스틱|화장품|패션|옷|사이즈|브랜드|쇼핑/],
  ['house', /주택|전세|월세|청약|부동산|집값|내 집|집주인|입주|숙박/],
  ['card', /카드|포인트|결제|할인/],
  ['piggy', /적금|저축|예금|연금|이자/],
  ['chart', /금리|환율|물가|오르|내리|상승|하락|%/],
  ['doc', /신청|서류|방법|순서|절차|제출|확인/],
  ['coin', /원|금액|돈|비용|가격|지원금|환급|세금/],
];
function pickIcon(text, used = new Set()) {
  const hits = ICON_RULES.filter(([, re]) => re.test(text)).map(([n]) => n);
  return hits.find((n) => !used.has(n)) || hits[0] || 'check';
}
const iconSvg = (name, a, b, k, size) => `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 120 120">${(ICONS[name] || ICONS.check)(a, b, k)}</svg>`;

// 글에 실제로 들어간 이미지만 쓴다 (직접 찍은 사진·정보 카드·AI 일러스트·공공누리 자료)
const IMAGE_DIRS = ['input/photos/_mosaic/', 'input/images/cards/', 'input/images/generated/', 'input/images/official/'];
function imageData(rel) {
  if (!rel || !IMAGE_DIRS.some((d) => rel.startsWith(d))) return null;
  const abs = resolveFromRoot(rel);
  if (!fs.existsSync(abs)) return null;
  const ext = path.extname(abs).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  return `data:${mime};base64,${fs.readFileSync(abs).toString('base64')}`;
}

const isSource = (t) => /^출처\s*:/.test(t);
const isChecklist = (t) => t.split('\n').filter((l) => l.trim().startsWith('✔')).length >= 2;

// draft.json → 카드 계획 (본문 문장만 사용)
function planFromDraft(d, { date } = {}) {
  const all = d.blocks || [];
  const blocks = all.filter((b) => b.type === 'text' || b.type === 'subtitle');
  const imgs = all.filter((b) => b.type === 'image' && b.path);
  // 소제목 구간(그 소제목 ~ 다음 소제목 전)에 들어간 첫 이미지
  const sectionImage = (sub) => {
    const i = all.indexOf(sub);
    for (let j = i + 1; j < all.length && all[j].type !== 'subtitle'; j += 1) if (all[j].type === 'image' && all[j].path) return all[j];
    return null;
  };
  const used = new Set();
  const take = (img) => (img && !used.has(img.path) ? (used.add(img.path), { path: img.path, caption: img.caption || '' }) : null);
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
  // 표지 사진: 직접 찍은 사진 → AI 일러스트 순 (정보 카드는 글자가 많아 표지에 쓰지 않음)
  cover.image = take(imgs.find((b) => b.path.startsWith('input/photos/_mosaic/')) || imgs.find((b) => b.path.startsWith('input/images/generated/')));
  cover.icon = pickIcon(d.title);
  cards.push(cover);

  const body = blocks.filter((b) => !(b.type === 'text' && (skip.has(b.content.trim()) || isSource(b.content.trim()))));
  const firstSub = body.findIndex((b) => b.type === 'subtitle');
  const intro = body.slice(0, firstSub === -1 ? body.length : firstSub).filter((b) => b.type === 'text');

  const opening = intro.find((b) => !isChecklist(b.content));
  if (opening) cards.push({ kind: 'text', label: '이런 분이라면', sentences: sentences(opening.content).slice(0, 3), icon: pickIcon(opening.content, new Set([cover.icon])) });

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
    cards.push({ kind: 'text', label: `Q${qa}`, title: b.content, sentences: sentences(next.content).slice(0, 3), image: take(sectionImage(b)), icon: pickIcon(`${b.content} ${next.content}`, new Set(cards.map((c) => c.icon))) });
  });

  const srcLine = source ? source.replace(/^출처\s*:\s*/, '').replace(/https?:\/\/\S+/g, '').replace(/\s*·\s*$/, '').trim() : '';
  cards.push({
    kind: 'cta',
    title: '저장해 두고 필요할 때 다시 보세요',
    icon: 'check',
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

  const icoA = themeName === 'purple' ? t.accent : themeName === 'night' ? base.accent : t.accent;
  const icoB = themeName === 'purple' ? t.point : themeName === 'night' ? '#FFFFFF' : '#FFFFFF';
  const icoK = themeName === 'purple' ? '#2E1A4A' : '#26313F';
  const ico = (size) => (card.icon ? `<span class="icowrap" style="width:${size}px;height:${size}px">${iconSvg(card.icon, icoA, icoB, icoK, Math.round(size * 0.72))}</span>` : '');
  const src = card.image ? imageData(card.image.path) : null;
  const credit = card.image && /출처/.test(card.image.caption) ? `<figcaption>${esc(card.image.caption)}</figcaption>` : '';
  const photo = (h) => (src ? `<figure class="ph" style="height:${f(h)}px"><img src="${src}">${credit}</figure>` : '');
  let main = '';
  if (kind === 'cover') {
    main = `<div class="cover">
      ${src ? photo(460) : `<div class="covico">${ico(300)}</div>`}
      ${card.label ? `<span class="chip">${esc(card.label)}</span>` : ''}
      <h1 class="ct">${esc(card.title).replace(NUM, (m) => `<span class="tn">${m}</span>`)}</h1>
      ${card.big ? `<div class="bigwrap"><span class="big">${esc(card.big)}</span></div>` : ''}
    </div>`;
  } else if (kind === 'list') {
    main = `<div class="head"><span class="chip">${esc(card.label || '')}</span><h2>${esc(card.title)}</h2></div><ul>${items}</ul>`;
  } else if (kind === 'cta') {
    main = `<div class="cta">${ico(220)}<h2>${esc(card.title)}</h2>${sents.map((s) => `<p class="cp">${hl(s)}</p>`).join('')}
      ${card.note ? `<div class="note">${esc(card.note)}</div>` : ''}</div>`;
  } else {
    const q = card.title ? `<h2 class="q"><span class="qm">“</span>${esc(card.title)}<span class="qm">”</span></h2>` : '';
    main = `<div class="head"><div class="hrow">${card.label ? `<span class="chip">${esc(card.label)}</span>` : '<span></span>'}${src ? '' : ico(150)}</div>${q}</div>${photo(440)}${answer}`;
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
  .covico{display:flex;justify-content:flex-end;margin:-40px 0 10px}
  .icowrap{flex:none;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;
    background:${themeName === 'purple' ? 'rgba(255,255,255,.08)' : themeName === 'night' ? 'rgba(245,197,24,.14)' : '#E6F6F3'};
    ${themeName === 'mint' ? 'border:5px solid #26313F;' : ''}}
  .hrow{display:flex;justify-content:space-between;align-items:flex-start}
  .hrow .chip{margin-top:12px}
  .head h2{margin-top:6px}
  .ph{margin-top:36px;border-radius:${themeName === 'mint' ? 8 : 22}px;overflow:hidden;position:relative;background:${themeName === 'mint' ? '#F1F4F7' : 'rgba(255,255,255,.08)'};
    ${themeName === 'purple' ? `box-shadow:10px 10px 0 ${t.accent};` : themeName === 'mint' ? 'border:5px solid #26313F;' : ''}}
  .ph img{width:100%;height:100%;object-fit:contain;display:block}
  .cover .ph{margin:0 0 40px}
  .cover .ph img{object-fit:cover}
  .ph figcaption{position:absolute;right:0;bottom:0;background:rgba(0,0,0,.6);color:#fff;font-size:22px;padding:6px 14px}
  .cta .icowrap{margin-bottom:40px}
  .ct{font-size:${f(src ? 76 : themeName === 'night' ? 112 : 100)}px;line-height:1.18;font-weight:900;letter-spacing:-3px;color:${t.title}}
  .tn{${themeName === 'mint' ? `background:linear-gradient(transparent 58%,${t.accent} 58%)` : `color:${themeName === 'night' ? t.accent : t.point}`}}
  .bigwrap{margin-top:${src ? 36 : 60}px}
  .big{display:inline-block;font-size:${f(src ? 96 : 132)}px;font-weight:900;letter-spacing:-3px;line-height:1;padding:22px 40px;border-radius:24px;
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
    if (c.sentences && c.sentences.length > 2) c.sentences.pop();
    else if (c.image && c.kind !== 'cover') delete c.image;
    else if (c.sentences && c.sentences.length > 1) c.sentences.pop();
    else if (c.items && c.items.length > 2) c.items.pop();
    else if (c.image) delete c.image;
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

module.exports = { planFromDraft, caption, sentences, html, themeFor, THEMES, pickIcon, iconSvg, imageData, isChecklist, isSource, NUM, esc, FONT, BRAND };
