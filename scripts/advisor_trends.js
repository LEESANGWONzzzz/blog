#!/usr/bin/env node
// 크리에이터 어드바이저 '트렌드' 탭을 내 계정으로 열어, 화면이 불러오는 데이터를 그대로 받아 적는다.
//   - 주제별 인기유입검색어 (검색 유입 트렌드) — 주제마다 1~20위 검색어와 순위 변동
//   - 네이버 메인에서 많이 유입된 콘텐츠 (메인 유입 트렌드) — 홈판 상위 글 제목
//   - 네이버 메인 유입률
//   - 우리 글 조회수 순위 (통합 데이터 > 조회수 순위, integrated-analysis#cv-ranks) — 2026-11-05 추가
// 결과: data/trends/<날짜>.md (+ 원본 JSON은 debug/advisor-<날짜>.json)
//
// 읽기 전용이다. 내 계정 통계 화면만 열고, 목록에 나온 남의 글은 열지 않는다 (크롤링 금지).
// 사용: node scripts/advisor_trends.js            (어제 날짜 — 오늘 데이터는 집계 전이라 비어 있음)
//       node scripts/advisor_trends.js 2026-10-22 (날짜 지정)
//       HEADLESS=0 node scripts/advisor_trends.js  (창을 띄워 확인)

const fs = require('fs');
const path = require('path');
const { ROOT, PROFILE_DIR, DEBUG_DIR, loadConfig } = require('./lib/config');
const { installGuard, safeClick } = require('./lib/publish_guard');
const { sessionStatus } = require('./lib/session');

const TRENDS_DIR = path.join(ROOT, 'data', 'trends');
const BASE = 'https://creator-advisor.naver.com';
// 우리 편성과 맞닿은 주제를 앞에 보여 준다 (나머지 주제도 받은 만큼 뒤에 붙인다).
const PRIORITY_TOPICS = ['스타·연예인', '방송', '공연·전시', '비즈니스·경제', '패션·미용', '맛집'];

// API 응답 모음({경로: JSON})을 사람이 읽는 마크다운으로 바꾼다.
function formatTrends(captured, { date = '', fetchedAt = '' } = {}) {
  const names = new Map();
  for (const [key, body] of Object.entries(captured)) {
    if (!key.includes('/accounts/preferred-category/')) continue;
    for (const group of body?.categoryTree || []) {
      for (const c of group.categories || []) names.set(String(c.id), c.name);
    }
  }
  const nameOf = (id) => names.get(String(id)) || String(id);
  const change = (v) => (v === undefined || v === null ? 'new' : v === 0 ? '-' : v > 0 ? `▲${v}` : `▼${-v}`);

  const topics = new Map();
  const mainContents = [];
  const referrers = [];
  let inflowOrder = [];
  for (const [key, body] of Object.entries(captured)) {
    const data = body?.data;
    if (/\/trend\/category\?/.test(key) && Array.isArray(data)) {
      for (const { category, queryList } of data) {
        if (Array.isArray(queryList) && queryList.length) topics.set(nameOf(String(category).replace('all', '')), queryList);
      }
    } else if (/\/trend\/main-inflow-content-ranks\?/.test(key) && Array.isArray(data)) {
      mainContents.push(...data);
    } else if (/\/trend\/main-inflow-referrer-domain\?/.test(key) && Array.isArray(data)) {
      referrers.push(...data);
    } else if (/\/trend\/category-inflow-ranks\?/.test(key) && Array.isArray(data)) {
      inflowOrder = data.map(nameOf);
    }
  }

  const ordered = [
    ...PRIORITY_TOPICS.filter((t) => topics.has(t)),
    ...[...topics.keys()].filter((t) => !PRIORITY_TOPICS.includes(t)),
  ];
  const lines = [`# 크리에이터 어드바이저 트렌드 — ${date || '날짜 미상'}`, ''];
  if (fetchedAt) lines.push(`- 가져온 시각: ${fetchedAt}`);
  lines.push('- 출처: 내 계정 크리에이터 어드바이저 > 트렌드 (네이버 제공 집계). 남의 글 본문은 열지 않았다.', '');
  if (inflowOrder.length) lines.push(`유입 많은 주제 순: ${inflowOrder.slice(0, 15).join(' · ')}`, '');

  lines.push('## 네이버 메인(홈판)에서 많이 유입된 콘텐츠', '');
  if (mainContents.length) {
    mainContents.slice(0, 20).forEach((c, i) => lines.push(`${i + 1}. ${c.title}`));
  } else lines.push('(받지 못함)');
  lines.push('');
  if (referrers.length) {
    lines.push(`메인 유입률: ${referrers.map((r) => `${r.referrerDomain} ${(r.ratio * 100).toFixed(1)}%`).join(' · ')}`, '');
  }

  lines.push('## 주제별 인기유입검색어', '');
  if (!ordered.length) lines.push('(받지 못함)', '');
  for (const t of ordered) {
    lines.push(`### ${t}`);
    for (const q of topics.get(t).slice(0, 20)) lines.push(`${q.rank ?? '-'}. ${q.query} (${change(q.rankChange)})`);
    lines.push('');
  }
  return { markdown: lines.join('\n'), counts: { topics: ordered.length, mainContents: mainContents.length } };
}

// ── 우리 글 조회수 순위 (통합 데이터 > 조회수 순위) ──────────────────────────
// API 형식을 아직 모르므로(2026-11-05 첫 연결) 응답 JSON에서 "제목 + 숫자"가 든 목록을 찾아 쓴다.
// 트렌드(/trend/) 응답은 남의 글 제목이라 여기서 제외한다.
const TITLE_KEYS = ['title', 'contentTitle', 'subject', 'postTitle', 'documentTitle'];
// 2026-11-08 확인: cv-ranks 응답은 data[{rank, title, metricValue(=조회수), contentId, createdAt(ms)}]
const VIEW_KEY = /^(metricValue|cv|pv|views?|viewCount|viewCnt|readCount|hit|hits|cnt|count|value)$/i;
const DATE_KEY = /(publish|created|write|reg|add).*(date|time|at)|^date$/i;

// 발행 시각: 문자열은 그대로, 밀리초 숫자는 한국 시각 'YYYY-MM-DD HH:MM'
function dateOf(o) {
  const k = Object.keys(o || {}).find((x) => DATE_KEY.test(x) && (typeof o[x] === 'string' || Number.isFinite(o[x])));
  if (!k) return '';
  const v = o[k];
  if (typeof v === 'string') return v;
  if (v < 1e11) return '';
  return new Date(v).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 16);
}

// 응답의 기준일·단위 (parameters.date / interval)
function periodOf(body) {
  const p = body?.parameters || {};
  return p.date ? `${p.date}${p.interval === 'day' ? ' 하루' : p.interval ? ` (${p.interval})` : ''}` : '';
}

function titleOf(o) {
  for (const k of TITLE_KEYS) if (typeof o?.[k] === 'string' && o[k].trim()) return o[k].trim();
  return '';
}

function viewOf(o) {
  const keys = Object.keys(o || {});
  const named = keys.find((k) => VIEW_KEY.test(k) && Number.isFinite(Number(o[k])) && o[k] !== '' && typeof o[k] !== 'boolean');
  return named === undefined ? null : Number(o[named]);
}

function rankLists(node, key, out) {
  if (Array.isArray(node)) {
    const rows = node.filter((x) => x && typeof x === 'object' && titleOf(x));
    if (rows.length && rows.length >= node.length / 2) out.push({ key, rows });
    node.forEach((x) => rankLists(x, key, out));
  } else if (node && typeof node === 'object') {
    for (const v of Object.values(node)) rankLists(v, key, out);
  }
  return out;
}

function formatOwnRanks(captured, { screenText = '' } = {}) {
  const lists = [];
  for (const [key, body] of Object.entries(captured)) {
    if (key.startsWith('/trend/')) continue;
    rankLists(body, key, lists);
  }
  // 조회수 숫자가 있는 목록 → 주소에 rank·cv가 든 목록 → 긴 목록 순
  const score = (l) => (l.rows.some((r) => viewOf(r) !== null) ? 4 : 0) + (/rank|cv|view/i.test(l.key) ? 2 : 0);
  lists.sort((a, b) => score(b) - score(a) || b.rows.length - a.rows.length);
  const best = lists[0];
  const lines = ['## 우리 글 조회수 순위 (통합 데이터 > 조회수 순위)', ''];
  if (best) {
    const period = periodOf(captured[best.key]);
    if (period) lines.push(`기준: ${period} 조회수 (내 계정 통합 데이터)`, '');
    best.rows.slice(0, 100).forEach((r, i) => {
      const v = viewOf(r);
      const d = dateOf(r);
      lines.push(`${i + 1}. ${titleOf(r)}${v === null ? '' : ` — 조회 ${v}`}${d ? ` (발행 ${d})` : ''}`);
    });
    lines.push('', `- 원본 응답: ${best.key.split('?')[0]} (형식이 이상하면 debug/advisor-*.json 의 own 항목을 Claude에게 보여 주세요)`);
  } else if (screenText.trim()) {
    lines.push('(API에서 목록을 찾지 못해 화면 글자를 그대로 남긴다)', '', screenText.trim().slice(0, 4000));
  } else lines.push('(받지 못함)');
  return { markdown: lines.join('\n') + '\n', count: best ? best.rows.length : 0 };
}

// 오늘 날짜 데이터는 아직 집계 전이라 비어 있다 ("조회한 기간의 데이터가 없습니다"). 기본은 어제.
function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// 받은 응답 중 실제 목록이 하나라도 있는지
function hasData(captured) {
  return Object.entries(captured).some(([k, b]) => k.startsWith('/trend/') && Array.isArray(b?.data) && b.data.length > 0);
}

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function main() {
  const { chromium } = require('playwright');
  const config = loadConfig();
  if (!config.blogId) throw new Error('data/config.json에 blogId가 없습니다.');
  if (!fs.existsSync(PROFILE_DIR)) throw new Error('naver-profile/이 없습니다. 먼저 node scripts/naver_login.js');

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: process.env.HEADLESS !== '0',
    viewport: { width: 1280, height: 900 },
    locale: 'ko-KR',
  });
  await installGuard(context);
  const captured = {};
  const own = {};
  const texts = {};
  let ownStage = false;
  try {
    if (!(await sessionStatus(context)).ok) throw new Error('로그인 세션이 없습니다. node scripts/naver_login.js 로 다시 로그인하세요.');
    const page = context.pages()[0] || (await context.newPage());
    page.on('response', async (res) => {
      const u = new URL(res.url());
      if (!u.pathname.startsWith('/api/v6/')) return;
      const key = u.pathname.replace('/api/v6', '') + u.search;
      if (ownStage) {
        if (!key.startsWith('/trend/')) try { own[key] = await res.json(); } catch { /* 본문 없는 응답 */ }
        return;
      }
      if (!/\/trend\/|\/accounts\/preferred-category\//.test(u.pathname)) return;
      try { captured[key] = await res.json(); } catch { /* 본문 없는 응답 */ }
    });

    const day = (process.argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a))) || yesterday();
    const qs = new URLSearchParams({ interval: 'day', startDate: day, endDate: day });
    const target = `${BASE}/naver_blog/${config.blogId}/trends?${qs}`;
    await page.goto(target, { waitUntil: 'networkidle', timeout: 45000 });
    // 어드바이저 자체 세션이 끊기면 소개 페이지로 보낸다. 네이버 로그인 쿠키가 살아 있으면
    // 로그인 페이지를 거쳐 돌아오는 것만으로 다시 연결된다 (비밀번호는 입력하지 않는다).
    if (/introduction/.test(page.url())) {
      await page.goto(`https://nid.naver.com/nidlogin.login?url=${encodeURIComponent(target)}`, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
      if (/nid\.naver\.com/.test(page.url())) {
        throw new Error('네이버 로그인이 만료됐습니다. node scripts/naver_login.js 로 다시 로그인하세요 ("로그인 상태 유지" 체크).');
      }
      if (!page.url().startsWith(target.split('?')[0])) await page.goto(target, { waitUntil: 'networkidle', timeout: 45000 });
    }
    // 주소의 날짜가 무시돼 오늘(빈 데이터)로 열렸으면 "이전 기간 조회"를 한 번 누른다.
    const prev = page.getByText('이전 기간 조회', { exact: true }).first();
    if (!hasData(captured) && await prev.count()) {
      for (const k of Object.keys(captured)) delete captured[k];
      await safeClick(prev);
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(1500);
    }
    if (/introduction|nidlogin/.test(page.url())) throw new Error(`트렌드 화면 대신 ${page.url()} 로 이동했습니다. 로그인 또는 블로그 연결을 확인하세요.`);
    texts.search = await page.locator('body').innerText().catch(() => '');

    const mainTab = page.getByText('메인 유입 트렌드', { exact: true }).first();
    if (await mainTab.count()) {
      await safeClick(mainTab);
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(1500);
      texts.main = await page.locator('body').innerText().catch(() => '');
    }

    // 우리 글 조회수 순위. 실패해도 트렌드 저장은 계속한다.
    try {
      ownStage = true;
      await page.goto(`${BASE}/naver_blog/${config.blogId}/integrated-analysis?${qs}#cv-ranks`, { waitUntil: 'networkidle', timeout: 45000 });
      await page.waitForTimeout(1500);
      const rankTab = page.getByText('조회수 순위', { exact: true }).first();
      if (await rankTab.count()) {
        await safeClick(rankTab);
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForTimeout(1500);
      }
      texts.own = await page.locator('body').innerText().catch(() => '');
    } catch (e) {
      texts.ownError = e.message;
    }
  } catch (e) {
    fs.mkdirSync(DEBUG_DIR, { recursive: true });
    const p = context.pages()[0];
    if (p) await p.screenshot({ path: path.join(DEBUG_DIR, 'advisor-error.png') }).catch(() => {});
    throw e;
  } finally {
    await context.close();
  }

  const dateKey = Object.keys(captured).map((k) => (k.match(/[?&]date=(\d{4}-\d{2}-\d{2})/) || [])[1]).find(Boolean) || today();
  const { markdown, counts } = formatTrends(captured, { date: dateKey, fetchedAt: new Date().toLocaleString('ko-KR') });
  fs.mkdirSync(TRENDS_DIR, { recursive: true });
  fs.mkdirSync(DEBUG_DIR, { recursive: true });
  fs.writeFileSync(path.join(DEBUG_DIR, `advisor-${dateKey}.json`), JSON.stringify({ captured, own, texts }, null, 2));
  let out = markdown;
  const ownRanks = formatOwnRanks(own, { screenText: texts.own || '' });
  out += `\n${ownRanks.markdown}`;
  // API 형식이 바뀌어 표를 못 만들었으면 화면 글자라도 남긴다.
  if (!counts.topics && !counts.mainContents) {
    out += `\n## 화면 글자 (자동 정리 실패 — 원본)\n\n${texts.search || ''}\n\n${texts.main || ''}\n`;
  }
  const file = path.join(TRENDS_DIR, `${dateKey}.md`);
  fs.writeFileSync(file, out);
  console.log(`✔ ${path.relative(ROOT, file)} (주제 ${counts.topics}개 · 홈판 상위 글 ${counts.mainContents}개 · 우리 글 조회수 ${ownRanks.count}편)`);
  if (!ownRanks.count) console.log(`⚠ 우리 글 조회수 목록을 정리하지 못했습니다${texts.ownError ? ` (${texts.ownError})` : ''}. 화면 글자를 대신 남겼습니다.`);
  if (!counts.topics && !counts.mainContents) {
    console.log('⚠ 데이터를 정리하지 못해 화면 글자만 저장했습니다. debug/advisor-*.json 을 Claude에게 보여 주세요.');
    process.exitCode = 2;
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(`✖ ${e.message}`);
    process.exitCode = 1;
  });
}

module.exports = { formatTrends, formatOwnRanks, hasData };
