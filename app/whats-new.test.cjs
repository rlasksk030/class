const test=require('node:test'),assert=require('node:assert/strict');
const W=require('./whats-new.js');
const notes={'1.8.17':{title:'a',items:['x']},'1.8.18':{title:'b',items:['y']},'1.8.20':{title:'c',items:['z']}};
test('version compare',()=>{
 assert.equal(W.compare('1.8.9','1.8.17'),-1);assert.equal(W.compare('1.10.0','1.9.9'),1);assert.equal(W.compare('1.8.17','1.8.17'),0);
 assert.ok(Number.isNaN(W.compare('1.8.11-validation.local','1.8.17')));
});
test('new install remembers the version and shows nothing',()=>{
 assert.deepEqual(W.decide({seen:null,current:'1.8.17',hasData:false,notes}),{show:[],remember:'1.8.17'});
});
test('first update with this feature shows only the current notes',()=>{
 assert.deepEqual(W.decide({seen:null,current:'1.8.17',hasData:true,notes}).show,['1.8.17']);
 assert.deepEqual(W.decide({seen:null,current:'1.8.19',hasData:true,notes}).show,[],'no notes for this version');
});
test('later updates show every skipped version with notes, newest first',()=>{
 assert.deepEqual(W.decide({seen:'1.8.17',current:'1.8.20',hasData:true,notes}).show,['1.8.20','1.8.18']);
 assert.deepEqual(W.decide({seen:'1.8.16',current:'1.8.18',hasData:true,notes}).show,['1.8.18','1.8.17']);
});
test('same version, downgrade or odd versions show nothing',()=>{
 assert.deepEqual(W.decide({seen:'1.8.17',current:'1.8.17',hasData:true,notes}).show,[]);
 assert.deepEqual(W.decide({seen:'1.8.20',current:'1.8.18',hasData:true,notes}),{show:[],remember:'1.8.20'},'downgrade keeps the newest seen');
 assert.deepEqual(W.decide({seen:'1.8.17',current:'1.8.18-validation.local',hasData:true,notes}),{show:[],remember:null});
 assert.deepEqual(W.decide({seen:'garbage',current:'1.8.17',hasData:true,notes}).show,['1.8.17']);
});
test('at most three versions',()=>{
 const many=Object.fromEntries([1,2,3,4,5].map(n=>['2.0.'+n,{title:'t',items:['i']}]));
 assert.deepEqual(W.pending('1.9.0','2.0.5',many),['2.0.5','2.0.4','2.0.3']);
});
test('shipped notes are short and well formed',()=>{
 for(const [v,n] of Object.entries(W.NOTES)){
  assert.ok(W.parse(v),v);assert.ok(n.title&&n.title.length<=40,v);
  assert.ok(Array.isArray(n.items)&&n.items.length>=1&&n.items.length<=5,v);
  for(const i of n.items)assert.ok(typeof i==='string'&&i.length>0&&i.length<=80,v+': '+i);
 }
});
