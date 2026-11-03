// 정보 카드용 일러스트 (직접 그린 SVG — 외부 이미지·저작권 없음, 네트워크 없음).
// 문장 키워드로 그림을 고른다. 실존 인물·로고·실제 앱 화면은 그리지 않는다 (writing-rules 5-8).
// 색: a 주색, b 보조색, k 선색, w 바탕(흰색 계열)

const S = (k) => `stroke="${k}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"`;

const ICONS = {
  coin: (a, b, k, w) => `<ellipse cx="60" cy="88" rx="38" ry="13" fill="${a}" ${S(k)}/><rect x="22" y="66" width="76" height="22" fill="${a}"/><path d="M22 66v22M98 66v22" ${S(k)}/><ellipse cx="60" cy="66" rx="38" ry="13" fill="${b}" ${S(k)}/><circle cx="60" cy="36" r="24" fill="${a}" ${S(k)}/><text x="60" y="45" text-anchor="middle" font-size="26" font-weight="900" fill="${k}">₩</text>`,
  calendar: (a, b, k, w) => `<rect x="14" y="24" width="92" height="82" rx="12" fill="${w}" ${S(k)}/><path d="M14 36a12 12 0 0 1 12-12h68a12 12 0 0 1 12 12v12H14z" fill="${a}" ${S(k)}/><path d="M38 14v18M82 14v18" ${S(k)}/><circle cx="60" cy="78" r="14" fill="${b}" ${S(k)}/><path d="M54 78l5 5 8-9" fill="none" ${S(k)}/>`,
  doc: (a, b, k, w) => `<path d="M28 12h46l22 22v74H28z" fill="${w}" ${S(k)}/><path d="M74 12v22h22" fill="${b}" ${S(k)}/><path d="M42 54h40M42 70h40M42 86h24" ${S(k)}/><circle cx="90" cy="92" r="16" fill="${a}" ${S(k)}/><path d="M83 92l5 5 9-10" fill="none" ${S(k)}/>`,
  house: (a, b, k, w) => `<path d="M12 58L60 18l48 40" fill="${a}" ${S(k)}/><rect x="26" y="54" width="68" height="52" fill="${w}" ${S(k)}/><rect x="50" y="76" width="20" height="30" fill="${b}" ${S(k)}/><rect x="32" y="64" width="14" height="14" fill="${b}" ${S(k)}/>`,
  ticket: (a, b, k, w) => `<path d="M10 34h100v16a10 10 0 0 0 0 20v16H10V70a10 10 0 0 0 0-20z" fill="${a}" ${S(k)}/><path d="M80 38v44" stroke="${k}" stroke-width="4" stroke-dasharray="6 6"/><path d="M44 44l5 10 11 1-8 7 3 11-11-6-10 6 3-11-8-7 11-1z" fill="${w}" ${S(k)}/>`,
  card: (a, b, k, w) => `<rect x="10" y="28" width="100" height="66" rx="10" fill="${a}" ${S(k)}/><rect x="10" y="42" width="100" height="14" fill="${k}"/><rect x="22" y="68" width="30" height="14" rx="3" fill="${b}"/>`,
  piggy: (a, b, k, w) => `<ellipse cx="58" cy="68" rx="40" ry="30" fill="${a}" ${S(k)}/><path d="M48 38h22" ${S(k)}/><circle cx="84" cy="62" r="4" fill="${k}"/><path d="M30 92v14M74 92v14" ${S(k)}/><circle cx="58" cy="18" r="11" fill="${b}" ${S(k)}/><text x="58" y="23" text-anchor="middle" font-size="13" font-weight="900" fill="${k}">₩</text>`,
  alert: (a, b, k, w) => `<path d="M60 14l50 88H10z" fill="${a}" ${S(k)}/><path d="M60 46v26" stroke="${k}" stroke-width="9" stroke-linecap="round"/><circle cx="60" cy="88" r="5" fill="${k}"/>`,
  chart: (a, b, k, w) => `<rect x="18" y="66" width="18" height="38" fill="${b}" ${S(k)}/><rect x="51" y="46" width="18" height="58" fill="${b}" ${S(k)}/><rect x="84" y="26" width="18" height="78" fill="${a}" ${S(k)}/><path d="M14 52l32-22 22 12 36-26" fill="none" ${S(k)}/>`,
  chartdown: (a, b, k, w) => `<rect x="18" y="26" width="18" height="78" fill="${a}" ${S(k)}/><rect x="51" y="50" width="18" height="54" fill="${b}" ${S(k)}/><rect x="84" y="70" width="18" height="34" fill="${b}" ${S(k)}/><path d="M14 22l34 22 22-6 36 26" fill="none" ${S(k)}/>`,
  bag: (a, b, k, w) => `<path d="M22 40h76l-6 66H28z" fill="${a}" ${S(k)}/><path d="M42 48V34a18 18 0 0 1 36 0v14" fill="none" ${S(k)}/><circle cx="60" cy="74" r="10" fill="${b}" ${S(k)}/>`,
  bowl: (a, b, k, w) => `<path d="M14 58h92a46 40 0 0 1-92 0z" fill="${a}" ${S(k)}/><path d="M40 46c0-10 8-10 8-20M60 46c0-10 8-10 8-20M80 46c0-10 8-10 8-20" fill="none" ${S(k)}/><rect x="44" y="96" width="32" height="10" rx="4" fill="${b}" ${S(k)}/>`,
  mic: (a, b, k, w) => `<rect x="44" y="12" width="32" height="56" rx="16" fill="${a}" ${S(k)}/><path d="M30 54a30 30 0 0 0 60 0M60 84v20M42 106h36" fill="none" ${S(k)}/><circle cx="96" cy="22" r="8" fill="${b}" ${S(k)}/>`,
  check: (a, b, k, w) => `<circle cx="60" cy="60" r="48" fill="${a}" ${S(k)}/><path d="M36 62l16 16 32-34" fill="none" stroke="${k}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>`,
  hospital: (a, b, k, w) => `<rect x="18" y="30" width="84" height="76" fill="${w}" ${S(k)}/><rect x="40" y="10" width="40" height="30" fill="${w}" ${S(k)}/><path d="M54 16h12v8h8v12h-8v8H54v-8h-8V24h8z" fill="${a}"/><rect x="50" y="78" width="20" height="28" fill="${b}" ${S(k)}/><rect x="28" y="50" width="16" height="14" fill="${b}" ${S(k)}/><rect x="76" y="50" width="16" height="14" fill="${b}" ${S(k)}/>`,
  baby: (a, b, k, w) => `<circle cx="60" cy="50" r="32" fill="#F6D2B0" ${S(k)}/><circle cx="49" cy="50" r="4" fill="${k}"/><circle cx="71" cy="50" r="4" fill="${k}"/><path d="M52 62q8 7 16 0" fill="none" ${S(k)}/><path d="M50 20q10-12 20 0" fill="none" ${S(k)}/><rect x="30" y="86" width="60" height="22" rx="11" fill="${a}" ${S(k)}/>`,
  briefcase: (a, b, k, w) => `<rect x="12" y="38" width="96" height="66" rx="10" fill="${a}" ${S(k)}/><path d="M42 38V26h36v12" fill="none" ${S(k)}/><path d="M12 62h96" ${S(k)}/><rect x="52" y="56" width="16" height="14" rx="3" fill="${b}" ${S(k)}/>`,
  plane: (a, b, k, w) => `<path d="M12 64l38-6 28-40c4-6 14-2 12 6l-12 38 30 6-6 12-30-4-16 26-10-2 4-28-36-4z" fill="${a}" ${S(k)}/><circle cx="26" cy="26" r="10" fill="${b}" ${S(k)}/>`,
  parcel: (a, b, k, w) => `<path d="M14 40l46-22 46 22v50l-46 22-46-22z" fill="${a}" ${S(k)}/><path d="M14 40l46 22 46-22M60 62v50" fill="none" ${S(k)}/><path d="M36 29l46 22v16" fill="none" stroke="${b}" stroke-width="8"/>`,
  shield: (a, b, k, w) => `<path d="M60 10l44 16v30c0 28-20 46-44 54-24-8-44-26-44-54V26z" fill="${a}" ${S(k)}/><path d="M42 60l12 12 24-26" fill="none" stroke="${w}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>`,
  percent: (a, b, k, w) => `<rect x="12" y="12" width="96" height="96" rx="24" fill="${a}" ${S(k)}/><circle cx="40" cy="42" r="12" fill="${w}" ${S(k)}/><circle cx="80" cy="80" r="12" fill="${w}" ${S(k)}/><path d="M84 34L36 88" stroke="${k}" stroke-width="9" stroke-linecap="round"/>`,
  receipt: (a, b, k, w) => `<path d="M22 8h76v104l-10-7-10 7-10-7-10 7-10-7-10 7-10-7-6 4z" fill="${w}" ${S(k)}/><path d="M36 30h48M36 46h48M36 62h30" ${S(k)}/><rect x="36" y="76" width="48" height="14" fill="${a}" ${S(k)}/>`,
  phone: (a, b, k, w) => `<rect x="34" y="8" width="52" height="104" rx="10" fill="${k}" ${S(k)}/><rect x="40" y="20" width="40" height="72" rx="3" fill="${a}"/><circle cx="60" cy="102" r="4" fill="${w}"/><path d="M48 56l8 8 16-18" fill="none" stroke="${w}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`,
  school: (a, b, k, w) => `<path d="M6 44l54-26 54 26-54 26z" fill="${a}" ${S(k)}/><path d="M28 56v26c18 14 46 14 64 0V56" fill="${b}" ${S(k)}/><path d="M108 46v30" ${S(k)}/><circle cx="108" cy="82" r="6" fill="${a}" ${S(k)}/>`,
  car: (a, b, k, w) => `<path d="M14 74l10-28c2-6 8-10 14-10h44c6 0 12 4 14 10l10 28v20H14z" fill="${a}" ${S(k)}/><path d="M30 50h60l6 18H24z" fill="${w}" ${S(k)}/><circle cx="34" cy="94" r="11" fill="${b}" ${S(k)}/><circle cx="86" cy="94" r="11" fill="${b}" ${S(k)}/>`,
  gift: (a, b, k, w) => `<rect x="16" y="46" width="88" height="62" fill="${a}" ${S(k)}/><rect x="10" y="32" width="100" height="18" fill="${a}" ${S(k)}/><path d="M60 32v76" stroke="${b}" stroke-width="12"/><path d="M60 32c-8-18-30-18-26-4 2 6 16 4 26 4 10 0 24 2 26-4 4-14-18-14-26 4z" fill="${b}" ${S(k)}/>`,
  people: (a, b, k, w) => `<circle cx="42" cy="38" r="16" fill="#F6D2B0" ${S(k)}/><circle cx="80" cy="42" r="14" fill="#F6D2B0" ${S(k)}/><path d="M14 104c0-24 12-38 28-38s28 14 28 38z" fill="${a}" ${S(k)}/><path d="M58 104c2-20 10-32 22-32s24 12 26 32z" fill="${b}" ${S(k)}/>`,
  clock: (a, b, k, w) => `<circle cx="60" cy="62" r="46" fill="${w}" ${S(k)}/><circle cx="60" cy="62" r="38" fill="${a}" opacity=".25"/><path d="M60 34v28l20 12" fill="none" stroke="${k}" stroke-width="7" stroke-linecap="round"/><path d="M40 12h40" ${S(k)}/>`,
  sparkle: (a, b, k, w) => `<path d="M60 8l10 34 34 10-34 10-10 34-10-34-34-10 34-10z" fill="${a}" ${S(k)}/><circle cx="98" cy="96" r="8" fill="${b}" ${S(k)}/>`,
};

// 앞쪽 규칙이 먼저 걸린다. '집'처럼 다른 단어 안에 들어가는 글자는 쓰지 않는다 ("이어집니다").
const RULES = [
  ['alert', /주의|조심|사기|피해|불법|막혀|못 받|안 돼|위험|암표|경고/],
  ['hospital', /병원|의료|진료|실손|요양|건강보험|난임|치료/],
  ['baby', /아동|출산|육아|부모급여|아이|신생아|첫만남/],
  ['school', /교육|학교|대학|학원|직업훈련|폴리텍|교육비/],
  ['parcel', /직구|택배|배송|관세|통관/],
  ['plane', /해외|여행|출국|면세|항공|일본|내한/],
  ['ticket', /티켓|예매|콘서트|공연|팬미팅|뮤지컬/],
  ['mic', /방송|드라마|예능|시청률|가수|배우/],
  ['bowl', /메뉴|치킨|김밥|맛집|외식|식당|음식|버거|커피|아이스크림/],
  ['bag', /립스틱|화장품|패션|옷|사이즈|브랜드|쇼핑|세일|블프/],
  ['house', /주택|전세|월세|청약|부동산|집값|내 집|집주인|입주|숙박|임대/],
  ['briefcase', /퇴직|직장|회사|근로|고용|일자리|연봉|월급/],
  ['shield', /보험|보장|보호|안심|예금자/],
  ['piggy', /적금|저축|예금|연금|이자|노후/],
  ['card', /카드|포인트|결제|상품권/],
  ['percent', /할인율|할인|%|퍼센트|세율|요율/],
  ['chartdown', /감소|하락|줄었|내렸|떨어/],
  ['chart', /금리|환율|물가|증가|상승|올랐|늘었|지표|통계/],
  ['receipt', /세금|공제|환급|연말정산|납부|영수증/],
  ['calendar', /\d+\s*월\s*\d+\s*일|기한|마감|기간|날짜|언제|시행/],
  ['clock', /시간|소요|며칠|걸리/],
  ['phone', /앱|온라인|모바일|홈페이지|신청|정부24|복지로/],
  ['people', /가구|가족|부부|대상|세대/],
  ['car', /자동차|주유|유가|휴게소|교통/],
  ['gift', /지원금|바우처|혜택|무료|경품/],
  ['doc', /서류|방법|순서|절차|제출|확인/],
  ['coin', /원|금액|돈|비용|가격/],
];

function pickIcon(text, avoid = new Set()) {
  const hits = RULES.filter(([, re]) => re.test(String(text))).map(([n]) => n);
  return hits.find((n) => !avoid.has(n)) || hits[0] || 'sparkle';
}

function iconSvg(name, { a, b, k, w = '#FFFFFF' }, size) {
  const draw = ICONS[name] || ICONS.sparkle;
  return `<svg width="${size}" height="${size}" viewBox="0 0 120 120">${draw(a, b, k, w)}</svg>`;
}

module.exports = { ICONS, RULES, pickIcon, iconSvg };
