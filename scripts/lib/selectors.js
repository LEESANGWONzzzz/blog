// 네이버 스마트에디터 ONE 셀렉터 모음.
//
// ⚠️ 실측 필요: 아래 값은 실제 로그인 화면에서 확인하지 않은 초기값이다.
// 첫 실행에서 실패하면 `debug/`에 남는 스크린샷·HTML을 보고 이 파일만 고친다.
// 네이버가 에디터를 바꾸면 여기만 갱신하면 되도록 모든 셀렉터를 한곳에 모아 두었다.
// 한 항목에 여러 후보를 두면 앞에서부터 처음 보이는 것을 쓴다.

module.exports = {
  // 글쓰기 진입 URL. {blogId}는 data/config.json 또는 NAVER_BLOG_ID 환경변수.
  writeUrl: (blogId) => `https://blog.naver.com/${blogId}?Redirect=Write`,
  loginUrl: 'https://nid.naver.com/nidlogin.login',
  // 로그인 판정에 쓰는 쿠키 이름
  sessionCookies: ['NID_AUT', 'NID_SES'],

  // 에디터가 들어 있는 iframe (없으면 페이지 자체를 쓴다)
  editorFrame: ['iframe#mainFrame'],

  // "작성 중인 글이 있습니다" 팝업
  draftPopupText: '작성 중인 글이 있습니다',
  draftPopupCancel: ['.se-popup-button-cancel', 'button:has-text("취소")'],

  // 첫 진입 시 뜨는 도움말 패널 닫기
  helpClose: ['.se-help-panel-close-button', 'button.se-help-close'],

  title: ['.se-documentTitle .se-text-paragraph', '.se-title-text .se-text-paragraph'],
  bodyParagraph: ['.se-component.se-text .se-text-paragraph'],
  // 본문 전체 텍스트 추출용 컨테이너 (검증 단계)
  contentRoot: ['.se-content', '.se-main-container'],
  titleRoot: ['.se-documentTitle', '.se-title-text'],

  toolbar: {
    quotation: ['button[data-name="quotation"]', 'button.se-insert-menu-button-quotation'],
    horizontalLine: ['button[data-name="horizontal-line"]', 'button.se-insert-menu-button-horizontalLine'],
    image: ['button[data-name="image"]', 'button.se-image-toolbar-button'],
  },

  // 본문 컴포넌트 종류 (구조 검사용). 제목 컴포넌트는 titleComponent로 제외한다.
  // text·quotation은 debug/2026-10-04T15-04-28 HTML에서 확인. horizontalLine·image는 아직 실측 전.
  titleComponent: '.se-documentTitle',
  componentTypes: {
    text: '.se-text',
    quotation: '.se-quotation',
    horizontalLine: '.se-horizontalLine',
    image: '.se-image',
  },
  // 인용구 구조 (실측): .se-component.se-quotation > … > .se-quotation-container
  //   ├ .se-module-text.se-quote  — 본문 칸 (소제목이 들어갈 곳)
  //   └ .se-module-text.se-cite   — 출처 칸 (비어 있으면 .se-is-empty, 안내문은 .se-placeholder)
  // 인용구를 넣으면 에디터가 그 아래에 빈 본문 컴포넌트(.se-text)를 자동으로 만든다.
  quoteCite: '.se-cite',
  placeholder: '.se-placeholder',

  // 커서 위치 판정: 에디터 입력은 숨은 iframe(input_buffer)으로 들어가서 window.getSelection()은
  // 이전 위치(인용구 안)에 머문다. 에디터가 실제 커서가 있는 섹션에 붙이는 이 클래스로 판정한다.
  focusedSection: '.se-is-focused',

  // 아래 두 항목은 "마지막 이미지/인용구 컴포넌트" 안에서 찾는 상대 셀렉터다.
  // (:last-of-type은 클래스가 아니라 태그 기준이라, 뒤에 빈 본문이 붙으면 못 찾는다)
  // 이미지 캡션 입력칸 — 실측 전
  lastImageCaption: ['.se-caption .se-text-paragraph'],
  // 인용구 본문 칸 (실측)
  lastQuoteParagraph: ['.se-quote .se-text-paragraph'],

  // 본문 맨 아래 "본문 추가" 버튼 — 마지막 컴포넌트 아래에 새 본문 문단을 만든다 (실측)
  canvasBottom: ['button.se-canvas-bottom-button'],

  // 임시저장 버튼 — "발행" 버튼과 혼동하지 않도록 safeClick()이 한 번 더 검사한다.
  saveButton: ['button[class*="save_btn"]', 'button:has-text("저장")'],
  saveToast: ['text=저장되었습니다', 'text=임시저장'],
};
