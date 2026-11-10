const {test}=require('node:test'),assert=require('node:assert/strict');
const {recipientControl,probeRecipients}=require('./schoolbell-recipients.cjs');
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
 for(const count of [0,2]){const result=probeRecipients({querySelectorAll:()=>Array.from({length:count},()=>({querySelector:()=>({})}))});
  assert.deepEqual(result,{known:false,reason:'dialog-count',dialogCount:count});}
});
