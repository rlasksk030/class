// Serialized into the HiClass renderer. Keep this function self-contained.
function findRecipientControls() {
 const selector='input[type="checkbox"],[role="checkbox"]';
 const visible=e=>!!e?.getClientRects().length;
 const normalize=s=>String(s||'').replace(/\s+/g,' ').trim();
 const kind=s=>/^학부모(?:\s*수신)?$/.test(normalize(s))?'parents':/^학생(?:\s*수신)?$/.test(normalize(s))?'students':null;
 const native=e=>e.matches('input[type="checkbox"]');
 const canonical=e=>{if(native(e))return e;const inputs=e.querySelectorAll('input[type="checkbox"]');return inputs.length===1?inputs[0]:e;};
 const controls=[...new Set([...document.querySelectorAll(selector)].map(canonical))];
 const candidates={parents:[],students:[]};
 for(const element of controls){
  const wrapper=element.closest('[role="checkbox"]');
  const labels=native(element)?[...(element.labels||[])]:[];
  const clickableLabel=labels.find(visible);
  const click=clickableLabel|| (visible(wrapper)?wrapper:null) || (visible(element)?element:null);
  if(!click)continue; // A hidden input is supported only through an observable click target.
  const ranks=new Map();
  const add=(name,rank)=>{if(name)ranks.set(name,Math.min(ranks.get(name)??Infinity,rank));};
  if(element.id==='target-parents-check')add('parents',0);
  if(element.id==='target-student-check')add('students',0);
  for(const label of labels)if(visible(label))add(kind(label.textContent),1);
  for(const node of new Set([element,wrapper].filter(Boolean))){
   add(kind(node.getAttribute('aria-label')),2);
   const ids=(node.getAttribute('aria-labelledby')||'').trim().split(/\s+/).filter(Boolean);
   if(ids.length&&ids.every(id=>document.getElementById(id)))add(kind(ids.map(id=>document.getElementById(id).textContent).join(' ')),2);
   if(node.getAttribute('role')==='checkbox')add(kind(node.textContent),3);
  }
  // Nearby text is accepted only in a small container with exactly one logical checkbox.
  let near=element.parentElement;
  for(let i=0;near&&i<2;i++,near=near.parentElement){
   const inside=[...new Set([...near.querySelectorAll(selector)].map(canonical))];
   if(inside.length!==1||inside[0]!==element)break;
   if(visible(near))add(kind(near.textContent),3);
  }
  if(ranks.size>1)return {error:'ambiguous',reason:'conflicting-label'};
  for(const [name,rank] of ranks)candidates[name].push({element,click,rank,wrapper});
 }
 if(Object.values(candidates).some(c=>c.length>1))return {error:'ambiguous',reason:'multiple-controls'};
 const result={},available={};let unreadable=false;
 for(const name of ['parents','students']){
  if(!candidates[name].length)continue;
  const control=candidates[name].sort((a,b)=>a.rank-b.rank)[0];
  const raw=(control.wrapper||control.element).getAttribute('aria-checked');
  const checked=native(control.element)?control.element.checked:raw==='true'?true:raw==='false'?false:null;
  if(checked===null){unreadable=true;continue;}
  available[name]=checked;
  if(native(control.element)&&raw!==null&&raw!==String(checked))return {error:'ambiguous',reason:'conflicting-state'};
  result[name]={...control,checked,disabled:control.element.disabled===true||control.element.getAttribute('aria-disabled')==='true'||control.wrapper?.getAttribute('aria-disabled')==='true'};
 }
 if(unreadable)return {error:'ambiguous',reason:'unreadable-state',available};
 if(!result.parents||!result.students)return {error:'missing',available};
 return result;
}
const messages={missing:'하이클래스 수신대상 항목을 찾지 못했습니다.',change:'하이클래스 수신대상 선택을 변경하지 못했습니다.',mismatch:'수신대상이 앱의 선택과 달라 등록을 중단했습니다.',ambiguous:'하이클래스 수신대상 화면 구조가 변경되어 안전하게 확인할 수 없습니다.'};
async function readRecipients(w,action){
 const result=await w.webContents.executeJavaScript(`(()=>{const r=(${findRecipientControls.toString()})();if(r.error)return {error:r.error};const action=${JSON.stringify(action||null)};if(action){const c=r[action.name];if(c.checked!==action.checked){if(c.disabled)return {error:'change'};c.click.click();}}return {parents:r.parents.checked,students:r.students.checked};})()`);
 if(result.error)throw Error(messages[result.error]);
 return result;
}
async function setRecipients(w,payload){
 for(const name of ['parents','students']){
  const checked=payload[name]!==false;
  const initial=await readRecipients(w);
  if(initial[name]===checked)continue;
  await readRecipients(w,{name,checked});
  let matched=false;
  for(let attempt=0;attempt<16;attempt++){
   await new Promise(r=>setTimeout(r,100));
   try{if((await readRecipients(w))[name]===checked){matched=true;break;}}
   catch(e){if(e.message===messages.ambiguous)throw e;if(e.message!==messages.missing)throw e;}
  }
  if(!matched)throw Error(messages.change);
 }
 await verifyRecipients(w,payload);
}
async function verifyRecipients(w,payload){
 const state=await readRecipients(w);
 if(state.parents!==payload.parents||state.students!==payload.students)throw Error(messages.mismatch);
}
module.exports={findRecipientControls,readRecipients,setRecipients,verifyRecipients,messages};
