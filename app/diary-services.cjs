// Local metadata only: never store credentials, remote page text or student records here.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {atomic} = require('./school-profile.cjs');
const {validateRef} = require('./media-store.cjs');
const HOME = 'https://schoolbell-e.com/';
const SERVICES = new Set(['hiclass', 'schoolbell']);
const sha = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function classKey(value) {
 if (typeof value !== 'string' || !/^[\p{L}\p{N}: _-]{1,100}$/u.test(value)) throw Error('학급 설정을 확인해 주세요.');
 return value;
}
function partition(school, service, key) {
 if (!SERVICES.has(service)) throw Error('발행 서비스를 확인해 주세요.');
 return 'persist:diary-' + service + '-' + sha([school, classKey(key)]);
}
function safeURL(value, board = false) {
 let u;
 try { u = new URL(value); } catch { throw Error('학교종이 공식 화면을 열어 주세요.'); }
 if (u.protocol !== 'https:' || !['schoolbell-e.com','www.schoolbell-e.com','v4.schoolbell-e.com'].includes(u.hostname) ||
     u.username || u.password || u.port || u.search || /[?=&]/.test(u.hash)) throw Error('학교종이 공식 화면 주소를 확인해 주세요.');
 // Never save auth tokens, login/reset links, or a landing page as a class board.
 if (board && (/\/(login|signin|signup|auth|oauth|password|reset|main)(\/|$)/i.test(u.pathname + u.hash) ||
     (u.pathname === '/' && !u.hash))) throw Error('로그인 후 담당 학급의 알림장 게시판을 열어 주세요.');
 return u.href;
}
function payload(value) {
 if (!value || typeof value.title !== 'string' || !value.title.trim() || value.title.length > 500 ||
     typeof value.body !== 'string' || value.body.length > 100000 ||
     !/^\d{4}-\d{2}-\d{2}$/.test(value.date) || !Array.isArray(value.photos) || value.photos.length > 20 ||
     (!value.body.trim() && !value.photos.length)) throw Error('날짜와 제목, 본문 또는 사진을 확인해 주세요.');
 return {classKey: classKey(value.classKey), date: value.date, title: value.title, body: value.body,
  photos: value.photos.map(p => ({id: validateRef(p)}))};
}
const fingerprint = (school, service, value) => sha([school, service, payload(value)]);
function matchTarget(expected, actual) {
 const clean = s => String(s || '').normalize('NFC').replace(/\s+/g, '');
 return clean(expected.schoolName) === clean(actual.schoolName) &&
  clean(expected.grade) === clean(actual.grade) && clean(expected.classroom) === clean(actual.classroom);
}
function createStore(profile) {
 const file = path.join(profile.dir, 'diary-services.json');
 const read = () => {
  if (!fs.existsSync(file)) return {version: 1, classes: {}};
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (data.version !== 1 || !data.classes || typeof data.classes !== 'object' || Array.isArray(data.classes)) throw Error('발행 기록 파일을 확인해 주세요. 기존 기록은 보존됩니다.');
  return data;
 };
 function edit(key, fn) {
  key = classKey(key);
  const data = read();
  const row = Object.hasOwn(data.classes,key) ? data.classes[key] : {service:'hiclass', posts:{}};
  const result = fn(row);
  Object.defineProperty(data.classes, key, {value:row,enumerable:true,writable:true,configurable:true});
  atomic(file, JSON.stringify(data));
  return result;
 }
 const get = key => {
  key = classKey(key); const data = read();
  return Object.hasOwn(data.classes,key) ? data.classes[key] : {service:'hiclass', posts:{}};
 };
 function select(key, service) {
  if (!SERVICES.has(service)) throw Error('발행 서비스를 확인해 주세요.');
  edit(key, row => { row.service = service; });
 }
 function link(key, url) {
  edit(key, row => { row.schoolbell = {url:safeURL(url,true),confirmation:'teacher-manual',time:Date.now()}; });
 }
 function prepare(value) {
  const note = payload(value), hash = fingerprint(profile.id, 'schoolbell', note);
  return edit(note.classKey, row => {
   if (row.service !== 'schoolbell' || !row.schoolbell) throw Error('학교종이 담당 학급을 먼저 확인해 주세요.');
   const existing = row.posts[hash];
   if (existing && existing.status !== 'manual-not-posted') return {blocked:true,hash,status:existing.status};
   // A changed title/body must not bypass an unresolved previous handoff.
   if (Object.values(row.posts).some(p => p.status === 'manual-pending')) return {blocked:true,status:'manual-pending'};
   row.posts[hash] = {status:'manual-pending',date:note.date,photoCount:note.photos.length,time:Date.now()};
   return {hash,status:'manual-pending'};
  });
 }
 function resolve(key, hash, outcome) {
  if (!['manual-confirmed','manual-not-posted'].includes(outcome)) throw Error('실제 게시 결과를 확인해 주세요.');
  return edit(key, row => {
   const post = row.posts[hash];
   if (!post || post.status !== 'manual-pending') throw Error('확인할 수동 발행 기록이 없습니다.');
   post.status = outcome; post.resolvedAt = Date.now();
   return {...post,hash};
  });
 }
 // Claim the pre-existing HiClass partition for exactly one existing class.
 // Other classes get empty partitions; no session data is copied or deleted.
 function hiclassPartition(key, legacyKey) {
  key = classKey(key);
  const data = read();
  if (!data.legacyHiclassClass && legacyKey) {
   data.legacyHiclassClass = classKey(legacyKey);
   atomic(file,JSON.stringify(data));
  }
  return data.legacyHiclassClass === key ? profile.hiclassPartition : partition(profile.id,'hiclass',key);
 }
 return {get,select,link,prepare,resolve,hiclassPartition};
}
module.exports = {HOME,partition,safeURL,payload,fingerprint,matchTarget,createStore,classKey};
