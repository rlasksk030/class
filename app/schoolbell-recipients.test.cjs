const {test}=require('node:test'),assert=require('node:assert/strict');
const {recipientControl,probeRecipients,safeRecipientObservation}=require('./schoolbell-recipients.cjs');
test('an occluded recipient control cannot be clicked; a clear control opens once',()=>{
 let clicks=0,blocked=true;const label={textContent:'synthetic target'};
 const button={textContent:'변경',disabled:false,matches:()=>false,scrollIntoView(){},getBoundingClientRect:()=>({left:0,top:0,width:100,height:30}),contains:e=>e===button,click:()=>clicks++};
 const root={querySelectorAll:s=>s==='app-letter-simplified-target-text'?[label]:[button]};
 const document={querySelectorAll:s=>s==='app-boards-write'?[root]:[],elementFromPoint:()=>blocked?{}:button};
 assert.equal(recipientControl(document,'read').reason,'control-occluded');
 assert.equal(recipientControl(document,'open').ready,false);assert.equal(clicks,0);
 blocked=false;assert.equal(recipientControl(document,'open').opened,true);assert.equal(clicks,1);
});
test('missing/duplicate recipient dialogs are unknown, with a count and no target text',()=>{
 for(const count of [0,2]){const result=probeRecipients({},null,()=>({dialogs:Array.from({length:count},()=>({})),counts:{dialogCount:count}}));
  assert.deepEqual(result,{known:false,reason:'dialog-count',dialogCount:count});}
});

test('nonempty recipient list exposes only rendered row count, never verified recipients',()=>{
 const headers=['번호','이름','보호자 휴대폰1','보호자 휴대폰2','학생 휴대폰'].map(textContent=>({textContent}));
 const table={querySelectorAll:selector=>selector==='thead th'?headers:selector==='tbody tr'?[{},{}]:[]};
 const role=(name,checked,disabled)=>({checked,disabled,closest:()=>({textContent:name})});
 const controls=[role('관리자',true,true),role('보호자1',true,false),role('보호자2',false,false),role('학생',false,false)];
 const dialog={querySelectorAll:selector=>selector==='app-select-letter-targets table'?[table]:
  selector==='app-table-search input[placeholder="학생명 또는 전화번호"]'?[{value:''}]:
  selector==='input[type="checkbox"]'?controls:[]};
 const info=probeRecipients({},null,()=>({dialogs:[dialog],counts:{dialogCount:1,unknownCount:0,covered:false}}));
 assert.equal(info.known,true);
 assert.equal(info.empty,false);
 assert.equal(info.visibleRows,2);
 assert.equal(info.students,null);
 assert.equal(info.parents,null);
 assert.equal(Object.hasOwn(info,'recipientNames'),false);
});

test('recipient IPC observation preserves role toggles without identities or recipient totals',()=>{
 const roles={administrator:{checked:true,disabled:true,name:'PRIVATE_SENTINEL'},guardian1:{checked:true,disabled:false},
  guardian2:{checked:false,disabled:false},student:{checked:false,disabled:false},unknown:{checked:true,disabled:false}};
 const result=safeRecipientObservation({known:true,empty:false,unfiltered:true,visibleRows:2,roles,
  students:99,parents:99,targetLabel:'PRIVATE_SENTINEL',names:['PRIVATE_SENTINEL'],phone:'PRIVATE_SENTINEL',recipientsVerified:true});
 assert.deepEqual(result.roles,{administrator:{checked:true,disabled:true},guardian1:{checked:true,disabled:false},guardian2:{checked:false,disabled:false},student:{checked:false,disabled:false}});
 assert.equal(result.roleSelectionKnown,true);assert.equal(result.observedSearchClear,true);
 assert.equal(result.visibleRows,2);assert.equal(result.totalStudents,null);assert.equal(result.totalParents,null);
 assert.equal(result.mandatoryAdministrator,true);assert.equal(result.recipientsVerified,false);
 assert.equal(JSON.stringify(result).includes('PRIVATE_SENTINEL'),false);
});

test('unknown or incomplete observation cannot become known audience selection',()=>{
 const unknown=safeRecipientObservation({known:false,reason:'PRIVATE_SENTINEL',targetLabel:'PRIVATE_SENTINEL'});
 assert.deepEqual(unknown,{known:false,recipientsVerified:false});
 const partial=safeRecipientObservation({known:true,roles:{student:{checked:'yes',disabled:false}},visibleRows:-1});
 assert.equal(partial.roleSelectionKnown,false);assert.equal(partial.mandatoryAdministrator,null);
 assert.equal(partial.empty,null);assert.equal(partial.visibleRows,null);assert.equal(partial.recipientsVerified,false);
});
