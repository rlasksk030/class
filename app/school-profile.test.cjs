const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const profiles=require('./school-profile.cjs'),schools=require('./school.js');
function temp(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'classroom-188-unit-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;
}
test('legacy school keeps its session, media and post identity after switching schools and restarting',t=>{
 const root=temp(t),file='hiclass-links.json';
 fs.mkdirSync(path.join(root,'Partitions/hiclass-teacher'),{recursive:true});
 fs.writeFileSync(path.join(root,'Partitions/hiclass-teacher/Cookies'),'synthetic-session');
 fs.writeFileSync(path.join(root,file),'original');
 const first=profiles.initialize(root);first.hasLegacy=true;
 assert.equal(first.dir,root);assert.equal(first.hiclassPartition,'persist:hiclass-teacher');
 const other={...schools.legacy,ATPT_OFCDC_SC_CODE:'B10',SD_SCHUL_CODE:'7010001',SCHUL_NM:'가상초등학교'};
 assert.equal(profiles.select(other,'6','1'),true);
 const next=profiles.initialize(root);assert.notEqual(next.dir,root);
 assert.notEqual(next.hiclassPartition,first.hiclassPartition);assert.ok(next.partition);
 assert.equal(fs.existsSync(path.join(next.dir,file)),false);fs.writeFileSync(path.join(next.dir,file),'other');
 assert.ok(next.config.schools.some(s=>schools.id(s)===schools.id(schools.legacy)));
 assert.equal(profiles.select(schools.legacy,'6','1'),true);
 assert.equal(profiles.initialize(root).dir,root);assert.equal(fs.readFileSync(path.join(root,file),'utf8'),'original');
 assert.equal(fs.readFileSync(path.join(root,'migration-v187/Partitions/hiclass-teacher/Cookies'),'utf8'),'synthetic-session');
 fs.writeFileSync(path.join(root,file),'later');profiles.initialize(root);
 assert.equal(fs.readFileSync(path.join(root,'migration-v187',file),'utf8'),'original');
});
test('invalid codes and school types cannot select another storage directory',t=>{
 const root=temp(t);profiles.initialize(root);
 for(const school of [{...schools.legacy,SD_SCHUL_CODE:'../test'},{...schools.legacy,SCHUL_KND_SC_NM:'중학교'}])assert.throws(()=>profiles.select(school,'6','1'));
 assert.equal(fs.existsSync(path.join(root,'school-profile.json')),false);
});

test('foreign rows in a NEIS response never replace the selected school cache',()=>{
 const {schoolRows}=require('./core.js');
 const row={ATPT_OFCDC_SC_CODE:'P10',SD_SCHUL_CODE:'8342104',DDISH_NM:'가상 급식'};
 const data=r=>({mealServiceDietInfo:[{row:r}]});
 assert.deepEqual(schoolRows(data([row]),'mealServiceDietInfo',schools.legacy),[row]);
 assert.throws(()=>schoolRows(data([row,{...row,ATPT_OFCDC_SC_CODE:'B10'}]),'mealServiceDietInfo',schools.legacy));
});
