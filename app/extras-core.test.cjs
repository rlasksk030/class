const test=require('node:test'),assert=require('node:assert/strict'),X=require('./extras-core.js');
const schedule=[{period:1,start:'09:00',end:'09:40'},{period:2,start:'09:50',end:'10:30'},{period:3,start:'10:40',end:'11:20'}];
test('period boundaries, breaks, removed periods and end of day',()=>{
 assert.ok(X.validSchedule(schedule));assert.deepEqual(X.currentPeriod(schedule,['1','2','3'],540),{period:'1',state:'current'});
 assert.deepEqual(X.currentPeriod(schedule,['1','2','3'],580),{period:'2',state:'next'});
 assert.deepEqual(X.currentPeriod(schedule,['1','3'],590),{period:'3',state:'next'});
 assert.equal(X.currentPeriod(schedule,['1','2','3'],680),null);
 assert.equal(X.validSchedule([{period:1,start:'09:50',end:'09:00'}]),false);
 assert.equal(X.validSchedule([schedule[0],{period:2,start:'09:30',end:'10:10'}]),false);
});
test('timer uses deadlines, pauses and resumes without accumulating drift',()=>{
 let t=X.timerAction({},'preset',0,60000);t=X.timerAction(t,'start',1000);assert.equal(X.timerRemaining(t,21000),40000);
 t=X.timerAction(t,'pause',21000);assert.equal(X.timerRemaining(t,90000),40000);
 t=X.timerAction(t,'start',90000);assert.equal(t.deadline,130000);t=X.timerAction(t,'tick',200000);assert.equal(t.state,'finished');assert.equal(t.remaining,0);
 t=X.timerAction(t,'restart',300000);assert.equal(t.deadline,360000);t=X.timerAction(t,'reset',310000);assert.equal(t.state,'idle');assert.equal(t.remaining,60000);
});
test('yesterday and D-Day use calendar dates across month, leap year and year boundaries',()=>{
 assert.equal(X.previousDay('2026-01-01'),'2025-12-31');assert.equal(X.previousDay('2024-03-01'),'2024-02-29');assert.equal(X.daysUntil('2026-10-01','2026-09-29'),2);
 const e=[{title:'지난 일정',date:'2026-09-28'},{title:'세 번째',date:'2026-10-30'},{title:'내일',date:'2026-09-30'},{title:'오늘',date:'2026-09-29'}];assert.deepEqual(X.nearestEvents(e,'2026-09-29').map(x=>x.title),['오늘','내일']);
});
