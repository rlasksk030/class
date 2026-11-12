'use strict';
// Schoolbell (학교종이) flow decisions: where the teacher is in the window, whether a class name
// matches the app's grade/class, and whether a new post is the one we sent.
// Pure functions only. No Electron, DOM or network access here, so everything is unit-tested.
const HOSTS = new Set(['schoolbell-e.com', 'www.schoolbell-e.com', 'v4.schoolbell-e.com']);
const HOME = 'https://schoolbell-e.com/ko/main';
const GUIDE = '학교종이에 로그인한 뒤 담당 학급페이지의 알림장을 열어 주세요.';
// Progress shown while a note is being published (same idea as the HiClass link steps).
const STEPS = ['알림장 게시판 열기', '작성 화면 열기', '제목·본문 입력', '사진 올리기', '수신대상·즉시발행 확인', '보내기', '게시 결과 확인'];

// Observed routes: class board /ko/main/group/{id}/boards/classnews, composer .../boards/write/classnews.
// After sending, the service lands on classnews or schoolnews of the same group.
function route(value) {
 let u;
 try { u = new URL(value); } catch { return {kind: 'outside'}; }
 if (u.protocol !== 'https:' || !HOSTS.has(u.hostname) || u.username || u.password || u.port) return {kind: 'outside'};
 const path = u.pathname;
 if (/\/(gate|login|signin)(\/|$)/.test(path)) return {kind: 'login'};
 let m = path.match(/^\/ko\/main\/group\/(\d+)\/boards\/write\/classnews$/);
 if (m) return {kind: 'composer', groupId: m[1], origin: u.origin};
 m = path.match(/^\/ko\/main\/group\/(\d+)\/boards\/(classnews|schoolnews)(?:\/posts\/(\d+))?$/);
 if (m) return {kind: m[2] === 'classnews' ? 'board' : 'result', groupId: m[1], origin: u.origin,
  boardUrl: u.origin + '/ko/main/group/' + m[1] + '/boards/classnews'};
 m = path.match(/^\/ko\/main\/group\/(\d+)(?:\/|$)/);
 if (m) return {kind: 'group', groupId: m[1], origin: u.origin};
 return {kind: 'home'};
}

// state: {url, login, board} from the adapter. Only a class notice board (classnews) can be linked.
function classify(state) {
 const r = route(state?.url || '');
 if (state?.login || r.kind === 'outside' || r.kind === 'login') return {step: 1, state: 'login', message: '학교종이 창에서 로그인해 주세요.'};
 if (r.kind === 'board' && state.board) return {step: 3, state: 'board', groupId: r.groupId, url: r.boardUrl, message: '학급 알림장을 찾았습니다.'};
 if (r.kind === 'home') return {step: 2, state: 'home', message: GUIDE};
 return {step: 2, state: 'class', groupId: r.groupId, message: '학급페이지는 확인했습니다. 이제 이 학급의 알림장을 열어 주세요.'};
}

// Saved link target: the board address only (no query, hash, login or composer address).
function boardLink(value) {
 const r = route(value);
 if (r.kind !== 'board') return null;
 const u = new URL(value);
 if (u.search || u.hash || u.href !== r.boardUrl) return null;
 return {url: r.boardUrl, groupId: r.groupId};
}

// "6학년 1반" in a class name. A name without the pattern is not treated as a mismatch.
function classOf(name) {
 const m = String(name || '').match(/(\d+)\s*학년\s*([가-힣A-Za-z0-9-]+?)\s*반/);
 return m ? {grade: m[1], classroom: m[2]} : null;
}
function titleMatches(name, grade, classroom) {
 const found = classOf(name);
 return !found || (found.grade === String(grade) && found.classroom === String(classroom));
}

// Text comparison that ignores only what the service may change by itself:
// line-ending style, non-breaking spaces, trailing spaces on a line and blank lines at both ends.
function normalizeBody(value) {
 return String(value ?? '').replace(/\r\n?/g, '\n').replace(/ /g, ' ').replace(/[ \t]+$/gm, '').replace(/^\n+|\n+$/g, '');
}
const looseBody = value => normalizeBody(value).replace(/\n{2,}/g, '\n');
function sameBody(actual, expected, approximate = false) {
 return approximate ? looseBody(actual) === looseBody(expected) : normalizeBody(actual) === normalizeBody(expected);
}
const sameNames = (actual, expected) => Array.isArray(actual) && actual.length === expected.length &&
 actual.every((name, i) => typeof name === 'string' && name.normalize('NFC') === expected[i].normalize('NFC'));
const sameTitle = (actual, expected) => String(actual ?? '').trim() === String(expected ?? '').trim();

// Upload names keep the photo order visible in the post: 사진01.jpg, 사진02.png ...
function uploadNames(photos) {
 return photos.map((photo, i) => '사진' + String(i + 1).padStart(2, '0') + '.' + String(photo.id).split('.').pop());
}

// A board card equals the note when title, body and attachment names (count and order) all match.
function cardMatches(card, expected) {
 return sameTitle(card.title ?? expected.title, expected.title) && sameBody(card.body, expected.body, card.approximate === true) &&
  sameNames(card.files, expected.files);
}
// before: {ids, matching} read before composing. after: {matches:[{id,body,files}]} after sending.
// Success needs exactly one matching card that did not exist before.
function judge(before, after, expected) {
 const known = new Set(before?.ids || []);
 const fresh = (after?.matches || []).filter(card => !(card.id && known.has(card.id)));
 const same = fresh.filter(card => cardMatches(card, expected));
 if (same.length === 1 && (before?.matching || 0) === 0) return {status: 'success', postId: same[0].id || null};
 if (same.length > 1) return {status: 'ambiguous'};
 if (fresh.length) return {status: 'mismatch'};
 return {status: 'missing'};
}

// A confirmation dialog that the service may show after 보내기. Only a plain "send?" question with
// exactly one affirmative button is confirmed; anything else stops the run for the teacher to check.
const AFFIRM = ['확인', '보내기', '발행', '발행하기', '전송', '예', '네'];
const SEND_WORDS = /(보내|발행|발송|전송)/;
const OTHER_WORDS = /(삭제|임시|예약|나가|취소하시|실패|오류|없습니다|입력해|선택해|초과|만료)/;
function confirmDialog(dialog) {
 const text = String(dialog?.text || '').replace(/\s+/g, ' ').trim();
 const buttons = (dialog?.buttons || []).map(b => String(b).replace(/\s+/g, '').trim());
 const yes = buttons.map((b, i) => AFFIRM.includes(b) ? i : -1).filter(i => i >= 0);
 if (yes.length !== 1 || !SEND_WORDS.test(text) || OTHER_WORDS.test(text)) return {action: 'unknown'};
 return {action: 'confirm', button: yes[0]};
}

module.exports = {HOSTS, HOME, GUIDE, STEPS, route, classify, boardLink, classOf, titleMatches, normalizeBody, sameBody,
 sameNames, sameTitle, uploadNames, cardMatches, judge, confirmDialog};
