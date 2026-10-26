const test=require('node:test'),assert=require('node:assert/strict'),C=require('./core.js');
const s={school:{ATPT_OFCDC_SC_CODE:'J10',SD_SCHUL_CODE:'123'},grade:3,classroom:2};
test('Korean midnight switches the date',()=>{assert.equal(C.dateKey(new Date('2026-09-29T14:59:59Z')),'2026-09-29');assert.equal(C.dateKey(new Date('2026-09-29T15:00:00Z')),'2026-09-30');});
test('overrides always win including deliberately empty menus',()=>{assert.deepEqual(C.display([], {data:['자동 메뉴']}),[]);assert.deepEqual(C.display(['수정'],{data:['자동']}),['수정']);assert.deepEqual(C.display(undefined,{data:['캐시']}),['캐시']);assert.equal(C.display(undefined,undefined),undefined);});
test('school, class, date and card caches are isolated',()=>{const base=C.dataKey(s,'2026-09-29','meal');assert.notEqual(base,C.dataKey({...s,classroom:3},'2026-09-29','meal'));assert.notEqual(base,C.dataKey(s,'2026-09-30','meal'));assert.notEqual(base,C.dataKey(s,'2026-09-29','timetable'));});
test('no-data differs from service error',()=>{assert.deepEqual(C.rows({RESULT:{CODE:'INFO-200'}},'meal'),[]);assert.throws(()=>C.rows({RESULT:{CODE:'ERROR-290',MESSAGE:'인증 오류'}},'meal'));assert.deepEqual(C.rows({meal:[{head:[]},{row:[{name:'밥'}]}]},'meal'),[{name:'밥'}]);});
test('morning content persists across dates and migrates the latest past note',()=>{
 const notes={'2026-09-28':{morning:'독서'},'2026-09-29':{morning:'글쓰기'},'2026-10-01':{morning:'미래'}};
 assert.equal(C.morningDefault(null,notes,'2026-09-30'),'글쓰기');
 assert.equal(C.morningDefault('수정한 활동',notes,'2026-10-02'),'수정한 활동');
 assert.equal(C.morningDefault('',notes,'2026-10-02'),'');
 assert.equal(C.morningDefault(null,{},'2026-09-30'),'');
});
