// Local metadata only: never store credentials, remote page text or student records here.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
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
     u.username || u.password || u.port || /[?=&]/.test(u.hash)) throw Error('학교종이 공식 화면 주소를 확인해 주세요.');
 // Observed public v4 login redirect. Allow only its exact public return destinations,
 // only while navigating. Never persist login query parameters as a board link.
 if (u.search && (board || u.hostname !== 'v4.schoolbell-e.com' ||
     !/^\/(ko|en)\/gate\/(home|login)$/.test(u.pathname) ||
     [...u.searchParams.keys()].length !== 1 || !u.searchParams.has('return_uri') ||
     !['https://schoolbell-e.com/ko/main','https://schoolbell-e.com/en/main'].includes(u.searchParams.get('return_uri'))))
  throw Error('학교종이 공식 화면 주소를 확인해 주세요.');
 // Never save auth tokens, login/reset links, or a landing page as a class board.
 if (board && (/\/(login|signin|signup|auth|oauth|password|reset|gate)(\/|$)/i.test(u.pathname + u.hash) ||
     /^\/(ko|en)\/main\/?(?:home)?\/?$/.test(u.pathname) ||
     (u.pathname === '/' && !u.hash))) throw Error('로그인 후 담당 학급의 알림장 게시판을 열어 주세요.');
 return u.href;
}
function payload(value) {
 if (!value || typeof value.title !== 'string' || !value.title.trim() || value.title.length > 500 ||
     typeof value.body !== 'string' || value.body.length > 100000 ||
     !/^\d{4}-\d{2}-\d{2}$/.test(value.date) || !Number.isFinite(Date.parse(value.date)) ||
     new Date(value.date).toISOString().slice(0,10)!==value.date || !Array.isArray(value.photos) || value.photos.length > 20 ||
     (!value.body.trim() && !value.photos.length)) throw Error('날짜와 제목, 본문 또는 사진을 확인해 주세요.');
 return {classKey: classKey(value.classKey), date: value.date, title: value.title, body: value.body,
  photos: value.photos.map(p => ({id: validateRef(p)}))};
}
const fingerprint = (school, service, value) => sha([school, service, payload(value)]);
function matchTarget(expected, actual) {
 const clean = s => String(s || '').normalize('NFC').replace(/\s+/g, '');
 return clean(expected.schoolName) === clean(actual.schoolName) &&
  clean(expected.grade) === clean(actual.grade) && clean(expected.classroom) === clean(actual.classroom) &&
  (expected.year === undefined || clean(expected.year) === clean(actual.year));
}
function createStore(profile) {
 const file = path.join(profile.dir, 'diary-services.json');
 function write(data) {
  const tmp=file+'.'+crypto.randomUUID()+'.tmp';let fd;
  try {
   fd=fs.openSync(tmp,'wx',0o600);fs.writeFileSync(fd,JSON.stringify(data));fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
   fs.renameSync(tmp,file);
  } finally {if(fd!==undefined)fs.closeSync(fd);fs.rmSync(tmp,{force:true});}
 }
 const read = () => {
  if (!fs.existsSync(file)) return {version: 1, classes: {}};
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (data.version !== 1 || !data.classes || typeof data.classes !== 'object' || Array.isArray(data.classes)) throw Error('발행 기록 파일을 확인해 주세요. 기존 기록은 보존됩니다.');
  const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
  for(const row of Object.values(data.classes)) {
   if(!object(row)||!SERVICES.has(row.service)||!object(row.posts)||
      Object.values(row.posts).some(p=>!object(p)||!['manual-pending','manual-confirmed','manual-not-posted'].includes(p.status))||
      row.automaticPosts!==undefined&&(!object(row.automaticPosts)||Object.values(row.automaticPosts).some(p=>
       !object(p)||!['auto-pending','auto-uncertain','auto-success','auto-user-confirmed','auto-user-not-posted'].includes(p.status)||!/^[a-f0-9]{64}$/.test(p.hash))))
    throw Error('발행 기록 파일을 확인해 주세요. 기존 기록은 보존됩니다.');
  }
  return data;
 };
 function edit(key, fn) {
  key = classKey(key);
  const data = read();
  const row = Object.hasOwn(data.classes,key) ? data.classes[key] : {service:'hiclass', posts:{}};
  const result = fn(row);
  Object.defineProperty(data.classes, key, {value:row,enumerable:true,writable:true,configurable:true});
  write(data);
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
   const auto = Object.values(row.automaticPosts || {});
   if (auto.some(p => ['auto-pending','auto-uncertain'].includes(p.status) ||
       p.hash === hash && p.status !== 'auto-user-not-posted')) return {blocked:true,status:'automatic-record'};
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
 function beginAutomatic(value) {
  const note=payload(value),hash=fingerprint(profile.id,'schoolbell',note);
  return edit(note.classKey,row=>{
   if(row.service!=='schoolbell')throw Error('발행 서비스가 변경되었습니다.');
   if(Object.values(row.posts).some(p=>p.status==='manual-pending') ||
      row.posts[hash] && row.posts[hash].status!=='manual-not-posted')return {blocked:true};
   const records=Object.values(row.automaticPosts||{});
   if(records.some(p=>['auto-pending','auto-uncertain'].includes(p.status) ||
      p.hash===hash && p.status!=='auto-user-not-posted'))return {blocked:true};
   const id=crypto.randomUUID();
   row.automaticPosts ||= {};
   row.automaticPosts[id]={hash,status:'auto-pending',stage:'prepared',date:note.date,photoCount:note.photos.length,time:Date.now()};
   return {id,hash};
  });
 }
 function automaticState(key,id,state) {
  const stages=['prepared','opening','input','attachments','review','submitting','verifying'];
  return edit(key,row=>{
   const post=Object.hasOwn(row.automaticPosts||{},id)?row.automaticPosts[id]:null;
   if(!post || post.status!=='auto-pending')throw Error('자동 등록 기록을 확인해 주세요.');
   if(state.status==='auto-success' && post.stage!=='verifying')throw Error('게시 결과를 확인해 주세요.');
   if(!['auto-pending','auto-uncertain','auto-success'].includes(state.status) ||
      !stages.includes(state.stage))throw Error('등록 상태를 확인해 주세요.');
   post.status=state.status;post.stage=state.stage;post.updatedAt=Date.now();
   return {...post};
  });
 }
 function resolveAutomatic(key,id,outcome) {
  if(!['auto-user-confirmed','auto-user-not-posted'].includes(outcome))throw Error('실제 게시 결과를 확인해 주세요.');
  return edit(key,row=>{
   const post=Object.hasOwn(row.automaticPosts||{},id)?row.automaticPosts[id]:null;
   if(!post || !['auto-pending','auto-uncertain'].includes(post.status))throw Error('확인할 자동 등록 시도가 없습니다.');
   post.status=outcome;post.resolvedAt=Date.now();
   return {...post};
  });
 }
 // Claim the pre-existing HiClass partition for exactly one existing class.
 // Other classes get empty partitions; no session data is copied or deleted.
 function hiclassPartition(key, legacyKey) {
  key = classKey(key);
  const data = read();
  if (!data.legacyHiclassClass && legacyKey) {
   data.legacyHiclassClass = classKey(legacyKey);
   write(data);
  }
  return data.legacyHiclassClass === key ? profile.hiclassPartition : partition(profile.id,'hiclass',key);
 }
 return {get,select,link,prepare,resolve,beginAutomatic,automaticState,resolveAutomatic,hiclassPartition};
}
module.exports = {HOME,partition,safeURL,payload,fingerprint,matchTarget,createStore,classKey};
