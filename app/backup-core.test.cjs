const test=require('node:test'),assert=require('node:assert/strict'),B=require('./backup-core.js');
const store=init=>{const m=new Map(Object.entries(init));return {getItem:k=>m.has(k)?m.get(k):null,setItem(k,v){if(this.fail&&k===this.fail)throw Error('quota');m.set(k,String(v));},removeItem:k=>m.delete(k),map:m};};
const sample=()=>store({settings:JSON.stringify({grade:'6',classroom:'2',apiKey:'SECRET',school:{SCHUL_NM:'x'},startup:true}),morningDefault:JSON.stringify('책 읽기'),boardTitles:JSON.stringify({morning:'오늘 할 일'}),classTimer:JSON.stringify({duration:60000,remaining:1000,deadline:Date.now()+1000,state:'running'}),cache:JSON.stringify({a:1}),lastLocation:JSON.stringify({lat:1,lon:2}),'weather:auto:1':'{}',ddayEvents:'[]',whiteboardContents:JSON.stringify({strokes:[],blocks:[{id:'a',x:.1,y:.2,text:'준비물',fontSize:40}]})});
test('backup keeps user data, drops caches, location and secrets',async()=>{const b=await B.create(sample().getItem,{appVersion:'1.8.2',now:new Date('2026-09-30T00:00:00Z')});
 assert.equal(b.schemaVersion,2);assert.equal(b.format,B.FORMAT);assert.deepEqual(b.data.settings,{grade:'6',classroom:'2'});assert.equal(b.data.cache,undefined);assert.equal(b.data.lastLocation,undefined);assert.equal(JSON.stringify(b).includes('SECRET'),false);
 assert.deepEqual(b.data.classTimer,{duration:60000,remaining:60000,deadline:null,state:'idle'});assert.equal(b.data.whiteboardContents.blocks[0].text,'준비물');assert.equal(b.grade,'6');});
test('restore validates format, version and checksum',async()=>{const b=await B.create(sample().getItem);const text=JSON.stringify(b);
 const {entries}=await B.parse(text);assert.ok(entries.some(([k])=>k==='boardTitles'));
 await assert.rejects(B.parse('not json'),/백업 파일이 아닙니다/);await assert.rejects(B.parse(JSON.stringify({...b,format:'x'})),/백업 파일이 아닙니다/);
 await assert.rejects(B.parse(JSON.stringify({...b,schemaVersion:99})),/새로운 버전/);
 const tampered=JSON.parse(text);tampered.data.morningDefault='변조';await assert.rejects(B.parse(JSON.stringify(tampered)),/손상/);
 const reordered={...b,data:Object.fromEntries(Object.entries(b.data).reverse())};await B.parse(JSON.stringify(reordered,null,2));});
test('restore is all-or-nothing',async()=>{const b=await B.create(sample().getItem);const {entries}=await B.parse(JSON.stringify(b));
 const s=store({morningDefault:JSON.stringify('기존'),boardTitles:JSON.stringify({notices:'기존'})});s.fail='whiteboardContents';
 assert.throws(()=>B.apply(s,entries));assert.equal(s.getItem('morningDefault'),JSON.stringify('기존'));assert.equal(s.getItem('settings'),null);assert.equal(s.getItem('boardTitles'),JSON.stringify({notices:'기존'}));
 s.fail=null;B.apply(s,entries);assert.equal(s.getItem('morningDefault'),JSON.stringify('책 읽기'));});
test('backup file name',()=>{assert.equal(B.fileName(new Date('2026-09-29T16:00:00Z')),'옥구초_학급대시보드_백업_2026-09-30.json');});
test('restore keeps settings that are never backed up',async()=>{const b=await B.create(sample().getItem);const {entries}=await B.parse(JSON.stringify(b));const s=store({settings:JSON.stringify({grade:'3',classroom:'4',apiKey:'LOCAL'})});B.apply(s,entries);assert.deepEqual(JSON.parse(s.getItem('settings')),{grade:'6',classroom:'2',apiKey:'LOCAL'});});
const Layout=require('./layout-core.js');
const signed=async data=>JSON.stringify({format:B.FORMAT,schemaVersion:2,appVersion:'1.8.12',createdAt:'2026-11-01T00:00:00.000Z',school:'',academicYear:'',grade:'6',classroom:'2',keys:Object.keys(data),checksum:await B.checksum(data),data});
test('board layout is backed up and restored as saved',async()=>{
 const layout=Layout.move(Layout.hide(Layout.defaults(),'meal').layout,'notices',6,5).layout;
 const s=sample();s.setItem('boardLayout',JSON.stringify(layout));
 const b=await B.create(s.getItem);assert.deepEqual(b.data.boardLayout,layout);assert.ok(b.keys.includes('boardLayout'));
 const {entries}=await B.parse(JSON.stringify(b));
 assert.deepEqual(entries.filter(([k])=>k==='boardLayout').map(([,v])=>JSON.parse(v)),[layout]);
});
test('a broken board layout is never exported and makes a restore file invalid',async()=>{
 const broken=Layout.defaults();broken.items.meal.x=9;broken.items.meal.w=4; // overlaps morning
 const s=sample();s.setItem('boardLayout',JSON.stringify(broken));
 assert.equal(B.collect(s.getItem).boardLayout,undefined);
 await assert.rejects(B.parse(await signed({morningDefault:'책 읽기',boardLayout:broken})),{message:B.INVALID});
});
test('a backup from before the layout editor restores its own hidden boards and sizes',async()=>{
 const {entries}=await B.parse(await signed({morningDefault:'책 읽기',boardPreferences:{meal:{visible:false,scale:1.2}},boardSizes:{columns:[100,300,200],row:.5,weatherWidth:260}}));
 const layout=JSON.parse(entries.find(([k])=>k==='boardLayout')[1]);
 assert.ok(Layout.isValid(layout));assert.equal(layout.items.meal.visible,false);assert.deepEqual(layout.items.morning,{x:3,y:1,w:6,h:3,visible:true});
 assert.equal(JSON.parse(entries.find(([k])=>k==='boardSizes')[1]).weatherWidth,260,'old keys are restored as they were');
 const plain=await B.parse(await signed({morningDefault:'책 읽기'}));
 assert.ok(Layout.equal(JSON.parse(plain.entries.find(([k])=>k==='boardLayout')[1]),Layout.defaults()));
});
test('raw profile data without a layout gets one from its own settings',()=>{
 const {entries,data}=B.fromRaw({morningDefault:JSON.stringify('책'),boardPreferences:JSON.stringify({notices:{visible:false,scale:1}})});
 assert.equal(data.morningDefault,'책');
 assert.equal(JSON.parse(entries.find(([k])=>k==='boardLayout')[1]).items.notices.visible,false);
 assert.deepEqual(B.fromRaw({cache:'{}'}).entries,[],'nothing to restore stays empty');
});
test('screen structure and the structure-B layout are backed up, checked and restored',async()=>{
 const a=Layout.hide(Layout.defaults('A'),'meal').layout,b=Layout.move(Layout.defaults('B'),'timetable',10,1).layout;
 const s=sample();s.setItem('boardLayout',JSON.stringify(a));s.setItem('boardLayoutB',JSON.stringify(b));s.setItem('layoutStructure',JSON.stringify('B'));
 const backup=await B.create(s.getItem);
 assert.ok(backup.keys.includes('boardLayoutB')&&backup.keys.includes('layoutStructure'));
 const {entries}=await B.parse(JSON.stringify(backup)),get=k=>JSON.parse(entries.find(([key])=>key===k)[1]);
 assert.deepEqual([get('layoutStructure'),get('boardLayout'),get('boardLayoutB')],['B',a,b]);
 // Unknown structures and broken B layouts are never exported and make a restore file invalid.
 const bad=sample();bad.setItem('layoutStructure',JSON.stringify('C'));bad.setItem('boardLayoutB',JSON.stringify({...b,columns:3}));
 assert.equal(B.collect(bad.getItem).layoutStructure,undefined);assert.equal(B.collect(bad.getItem).boardLayoutB,undefined);
 await assert.rejects(B.parse(await signed({morningDefault:'책',layoutStructure:'C'})),{message:B.INVALID});
 await assert.rejects(B.parse(await signed({morningDefault:'책',boardLayoutB:{...b,rows:3}})),{message:B.INVALID});
});
test('a backup from before the A/B structures opens in A and leaves the structure-B layout alone',async()=>{
 const {entries}=await B.parse(await signed({morningDefault:'책 읽기'}));
 assert.equal(JSON.parse(entries.find(([k])=>k==='layoutStructure')[1]),'A');
 assert.equal(entries.find(([k])=>k==='boardLayoutB'),undefined);
});
