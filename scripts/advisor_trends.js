#!/usr/bin/env node
// 크리에이터 어드바이저 '트렌드' 탭을 내 계정으로 열어, 화면이 불러오는 데이터를 그대로 받아 적는다.
//   - 주제별 인기유입검색어 (검색 유입 트렌드) — 주제마다 1~20위 검색어와 순위 변동
//   - 네이버 메인에서 많이 유입된 콘텐츠 (메인 유입 트렌드) — 홈판 상위 글 제목
//   - 네이버 메인 유입률
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
  const texts = {};
  try {
    if (!(await sessionStatus(context)).ok) throw new Error('로그인 세션이 없습니다. node scripts/naver_login.js 로 다시 로그인하세요.');
    const page = context.pages()[0] || (await context.newPage());
    page.on('response', async (res) => {
      const u = new URL(res.url());
      if (!u.pathname.startsWith('/api/v6/')) return;
      if (!/\/trend\/|\/accounts\/preferred-category\//.test(u.pathname)) return;
      try { captured[u.pathname.replace('/api/v6', '') + u.search] = await res.json(); } catch { /* 본문 없는 응답 */ }
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
  fs.writeFileSync(path.join(DEBUG_DIR, `advisor-${dateKey}.json`), JSON.stringify({ captured, texts }, null, 2));
  let out = markdown;
  // API 형식이 바뀌어 표를 못 만들었으면 화면 글자라도 남긴다.
  if (!counts.topics && !counts.mainContents) {
    out += `\n## 화면 글자 (자동 정리 실패 — 원본)\n\n${texts.search || ''}\n\n${texts.main || ''}\n`;
  }
  const file = path.join(TRENDS_DIR, `${dateKey}.md`);
  fs.writeFileSync(file, out);
  console.log(`✔ ${path.relative(ROOT, file)} (주제 ${counts.topics}개 · 홈판 상위 글 ${counts.mainContents}개)`);
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

module.exports = { formatTrends, hasData };
