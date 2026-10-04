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
  titleComponent: '.se-documentTitle',
  componentTypes: {
    text: '.se-text',
    quotation: '.se-quotation',
    horizontalLine: '.se-horizontalLine',
    image: '.se-image',
  },
  // 인용구 아래 "출처" 칸 — 소제목에서는 비어 있어야 한다
  quoteCite: '.se-cite',

  // 마지막으로 추가된 이미지의 캡션 입력칸
  lastImageCaption: ['.se-component.se-image:last-of-type .se-caption .se-text-paragraph'],
  // 마지막 인용구 컴포넌트의 본문
  lastQuoteParagraph: ['.se-component.se-quotation:last-of-type .se-quote .se-text-paragraph'],

  // 임시저장 버튼 — "발행" 버튼과 혼동하지 않도록 safeClick()이 한 번 더 검사한다.
  saveButton: ['button[class*="save_btn"]', 'button:has-text("저장")'],
  saveToast: ['text=저장되었습니다', 'text=임시저장'],
};
