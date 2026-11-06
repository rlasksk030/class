const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const s=require('./diary-services.cjs');
function profile(t,id='B10-7010001'){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'diary-services-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return {id,dir,hiclassPartition:'persist:hiclass-legacy'};}
const note={classKey:'2026:6:1',date:'2026-11-06',title:'Synthetic title',body:'Synthetic body',photos:[]};
const board='https://schoolbell-e.com/ko/classes/synthetic/notes';
function ready(p){const store=s.createStore(p);store.select(note.classKey,'schoolbell');store.link(note.classKey,board);return store;}
test('service choice, links and manual history survive restart, default HiClass and isolate classes/schools',t=>{
 const p=profile(t),a=ready(p);const first=a.prepare(note);
 const b=s.createStore(p);assert.equal(b.get(note.classKey).service,'schoolbell');assert.equal(b.get(note.classKey).posts[first.hash].status,'manual-pending');
 assert.equal(b.get('2026:6:2').service,'hiclass');assert.deepEqual(b.get('2026:6:2').posts,{});
 assert.equal(s.createStore(profile(t,'J10-7010002')).get(note.classKey).service,'hiclass');
 assert.notEqual(s.fingerprint(p.id,'schoolbell',note),s.fingerprint(p.id,'hiclass',note));
 assert.notEqual(s.fingerprint(p.id,'schoolbell',note),s.fingerprint('J10-7010002','schoolbell',note));
});
test('uncertain handoff blocks duplicates and edited content, only explicit not-posted permits retry',t=>{
 const store=ready(profile(t)),p=store.prepare(note);
 assert.equal(store.prepare(note).blocked,true);assert.equal(store.prepare({...note,title:'Changed'}).blocked,true);
 assert.throws(()=>store.resolve(note.classKey,p.hash,'success'));
 store.resolve(note.classKey,p.hash,'manual-not-posted');assert.equal(store.prepare(note).status,'manual-pending');
 store.resolve(note.classKey,p.hash,'manual-confirmed');assert.equal(store.prepare(note).blocked,true);
 assert.equal(store.prepare({...note,body:'Another note'}).status,'manual-pending');
});
test('photo identity and order affect duplicate checks without storing private text or names',t=>{
 const p=profile(t),store=ready(p),a={id:'a'.repeat(64)+'.png',name:'student secret.png'},b={id:'b'.repeat(64)+'.jpg'};
 const one={...note,photos:[a,b]},two={...note,photos:[b,a]};
 assert.notEqual(s.fingerprint(p.id,'schoolbell',one),s.fingerprint(p.id,'schoolbell',two));
 store.prepare(one);const raw=fs.readFileSync(path.join(p.dir,'diary-services.json'),'utf8');
 for(const secret of ['Synthetic title','Synthetic body','student secret'])assert.ok(!raw.includes(secret));
 assert.throws(()=>store.prepare({...note,photos:[{id:'../../photo.png'}]}));
});
test('sessions isolate services, schools, year and class; legacy session belongs to only one class',t=>{
 const p=profile(t),store=s.createStore(p);
 assert.equal(store.hiclassPartition(note.classKey,note.classKey),p.hiclassPartition);
 assert.notEqual(store.hiclassPartition('2026:6:2','2026:6:2'),p.hiclassPartition);
 assert.equal(s.createStore(p).hiclassPartition(note.classKey,'2026:6:2'),p.hiclassPartition);
 const variants=[['a','hiclass','2026:6:1'],['a','schoolbell','2026:6:1'],['b','schoolbell','2026:6:1'],['a','schoolbell','2026:6:2'],['a','schoolbell','2027:6:1']];
 assert.equal(new Set(variants.map(x=>s.partition(...x))).size,variants.length);
});
test('class matching and official-page rules reject mismatches, auth links and unsafe URLs',()=>{
 const expected={schoolName:'가상 초등학교',grade:'6',classroom:'1'};
 assert.ok(s.matchTarget(expected,{...expected,schoolName:'가상초등학교'}));
 for(const change of [{schoolName:'다른초등학교'},{grade:'5'},{classroom:'2'}])assert.ok(!s.matchTarget(expected,{...expected,...change}));
 assert.equal(s.safeURL(board,true),board);
 for(const url of ['https://schoolbell-e.com.evil.org/classes/1','http://schoolbell-e.com/','file:///etc/passwd','https://schoolbell-e.com/?token=secret','https://user:secret@schoolbell-e.com/','https://schoolbell-e.com/#token=secret','https://schoolbell-e.com/ko/login','https://schoolbell-e.com/ko/main'])
  assert.throws(()=>s.safeURL(url,true),url);
});
test('corrupt state fails closed and file is preserved; prototype-like class names stay ordinary data',t=>{
 const p=profile(t),store=s.createStore(p);
 store.select('__proto__','schoolbell');assert.equal(store.get('__proto__').service,'schoolbell');assert.equal({}.service,undefined);
 const file=path.join(p.dir,'diary-services.json');fs.writeFileSync(file,'corrupt');assert.throws(()=>store.select(note.classKey,'schoolbell'));assert.equal(fs.readFileSync(file,'utf8'),'corrupt');
});
test('observed v4 login returns are navigation-only, unknown redirects and credentials are denied',()=>{
 const base='https://v4.schoolbell-e.com/ko/gate/login?return_uri=';
 const good=base+encodeURIComponent('https://schoolbell-e.com/ko/main');
 assert.equal(s.safeURL(good),good);assert.throws(()=>s.safeURL(good,true));
 for(const url of [base+encodeURIComponent('https://evil.invalid/'),good+'&token=secret',good+'&return_uri=x',
  base+encodeURIComponent('https://schoolbell-e.com/ko/main?token=secret'),base+encodeURIComponent('https://schoolbell-e.com@evil.invalid/ko/main'),
  'https://schoolbell-e.com/ko/classes/1?return_uri=x'])assert.throws(()=>s.safeURL(url));
 assert.throws(()=>s.safeURL('https://schoolbell-e.com/ko/main/home',true));
 const e={schoolName:'가상초등학교',year:'2026',grade:'6',classroom:'1'};
 assert.ok(s.matchTarget(e,e));assert.ok(!s.matchTarget(e,{...e,year:'2025'}));assert.ok(!s.matchTarget(e,{...e,year:undefined}));
 for(const date of ['2026-02-30','2026-13-01','2026-00-01'])assert.throws(()=>s.payload({...note,date}));
});
test('manual and automatic records block one another; unresolved restart cannot become success by user confirmation',t=>{
 const p=profile(t),store=ready(p),auto=store.beginAutomatic(note);
 assert.equal(s.createStore(p).get(note.classKey).automaticPosts[auto.id].status,'auto-pending');
 assert.equal(store.prepare({...note,title:'Changed'}).blocked,true);assert.equal(store.beginAutomatic({...note,title:'Changed'}).blocked,true);
 assert.throws(()=>store.automaticState(note.classKey,auto.id,{status:'auto-success',stage:'verifying'}));
 assert.throws(()=>store.resolveAutomatic(note.classKey,auto.id,'auto-success'));
 store.resolveAutomatic(note.classKey,auto.id,'auto-user-not-posted');
 const next=store.beginAutomatic(note);assert.notEqual(next.id,auto.id);assert.equal(Object.keys(store.get(note.classKey).automaticPosts).length,2);
 store.resolveAutomatic(note.classKey,next.id,'auto-user-confirmed');assert.equal(store.prepare(note).blocked,true);
 const other={...note,title:'New draft'},manual=store.prepare(other);assert.equal(store.beginAutomatic(other).blocked,true);
 store.resolve(note.classKey,manual.hash,'manual-not-posted');assert.ok(store.beginAutomatic(other).id);
});
test('malformed automatic state fails closed without overwriting audit data',t=>{
 const p=profile(t),store=ready(p);store.beginAutomatic(note);
 const file=path.join(p.dir,'diary-services.json'),data=JSON.parse(fs.readFileSync(file));
 Object.values(data.classes[note.classKey].automaticPosts)[0].status='invented';
 const raw=JSON.stringify(data);fs.writeFileSync(file,raw);
 assert.throws(()=>store.beginAutomatic(note));assert.equal(fs.readFileSync(file,'utf8'),raw);
});
