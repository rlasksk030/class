// Local synthetic contracts only. No accounts, sessions, remote URLs or real-site actions.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const services=require('../app/diary-services.cjs');
const {createPreparedDriver}=require('../app/schoolbell-prepared-driver.cjs');
const {createPublisher}=require('../app/schoolbell-publish.cjs');
const {fail}=require('../app/schoolbell-driver-errors.cjs');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const copy=structuredClone;
function fixture(t,options={}) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'schoolbell-prepared-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const target={schoolId:'SYNTHETIC',schoolName:'합성 시험 학교',year:'2026',grade:'6',classroom:'1',classKey:'2026:6:1'};
 const profile={id:target.schoolId,dir},store=services.createStore(profile);store.select(target.classKey,'schoolbell');
 const originals=[Buffer.from('synthetic original one'),Buffer.from('synthetic original two')];
 const note={classKey:target.classKey,date:'2026-11-09',title:'합성 검증 제목',body:'한글 첫 줄\n\n둘째 줄  공백',photos:originals.slice(0,options.photoCount??2).map(b=>({id:hash(b)+'.png'}))};
 const state={events:[],posts:[],uploads:[],title:'',body:'',date:note.date,revision:0,clicks:0,
  context:{},dateVerified:true,dateWritable:true,permission:true,roots:1,duplicates:null,missing:null,sendEnabled:true,
  uploadComplete:true,baselineComplete:true,baselineRefreshed:true,resultComplete:true,resultRefreshed:true,closeResult:true};
 const scope={service:'schoolbell',schoolId:target.schoolId,classKey:target.classKey,boardId:'synthetic-diary',scopeType:'class',board:'diary',authenticated:true,teacher:true};
 const context=()=>({...target,...scope,identityVerified:true,authorityVerified:true,classApproved:true,
  testClassApproved:true,recipientsVerified:true,students:0,parents:0,externalNotifications:false,
  contextId:'synthetic-context',actorKey:'synthetic-teacher',observedAt:Date.now(),...state.context});
 const permission=()=>state.permission?{official:true,method:'electron-ui',evidenceRef:'LOCAL-FIXTURE-NOT-REAL-PERMISSION',
  schoolId:target.schoolId,classKey:target.classKey,approvedTestClass:true,actions:['read','input','attachments','submit'],...state.permissionFields}:null;
 function atomic(request,signal) {
  const c=context();
  if(signal.aborted||!request.stillPermitted())fail('permission-unverified');
  if(!['schoolId','schoolName','year','grade','classroom','classKey'].every(k=>c[k]===request.target[k])||
    !['boardId','contextId','actorKey'].every(k=>c[k]===request.binding[k])||c.teacher!==true||c.authenticated!==true||
    c.students!==0||c.parents!==0||c.externalNotifications!==false)fail('context-unverified');
 }
 const attachment=bytes=>({state:'complete',source:'original-download',bytes:Buffer.from(bytes)});
 const attachments=()=>({complete:state.uploadComplete,items:state.uploads.map(attachment)});
 function document() {
  const node=(attrs={},text='')=>({hasAttribute:k=>Object.hasOwn(attrs,k),getAttribute:k=>attrs[k]??null,textContent:text});
  const send=node(state.sendEnabled?{}:{disabled:''},'보내기'),save=node({},'임시저장');
  const entries={
   'input[placeholder="제목을 입력해 주세요."]':[node()],
   'div.fr-element.fr-view[contenteditable="true"]':[node()],
   'input[type="file"]':[node({accept:'.png,.jpg',multiple:''})],
   'button.btn-with-description':[send],button:[send,save]
  };
  if(state.missing)entries[state.missing]=[];
  if(state.duplicates)entries[state.duplicates]=[...(entries[state.duplicates]||[]),...(entries[state.duplicates]||[])];
  const root={querySelectorAll:s=>entries[s]||[]};return {querySelectorAll:s=>s==='app-boards-write'?Array.from({length:state.roots},()=>root):[]};
 }
 const bridge={
  async readContext(){state.events.push('context');return context();},
  async readStructure(probe){return probe(document());},
  async readDate(){return options.publicationMode==='immediate'?{verified:state.dateVerified,source:'observed-service-ui',meaning:'publication-mode',mode:state.scheduled?'scheduled':'immediate',writable:false,value:null}:{verified:state.dateVerified,writable:state.dateWritable,value:state.date};},
  async readBaseline(){return {complete:state.baselineComplete,refreshed:state.baselineRefreshed,posts:copy(state.posts)};},
  async openComposer(r,s){atomic(r,s);state.events.push('open');state.title='';state.body='';state.uploads=[];state.revision++;},
  async writeDate(r,s){atomic(r,s);state.events.push('date');state.date=r.value;state.revision++;},
  async writeTitle(r,s){atomic(r,s);state.events.push('title');state.title=r.value;state.revision++;},
  async writeBodyText(r,s){atomic(r,s);state.events.push('body');state.body=r.value;state.revision++;},
  async attachFiles(r,s){atomic(r,s);state.events.push('files');state.uploads=r.value.map(f=>Buffer.from(f.bytes));state.revision++;},
  async readContent(){return {title:state.title,body:state.body,revision:String(state.revision)};},
  async readUploads(){return attachments();},
  async commitOnce(r,s){
   state.beforeCommit?.();atomic(r,s);
   if(r.revision!==String(state.revision)||state.title!==r.note.title||state.body!==r.note.body||(options.publicationMode!=='immediate'&&state.date!==r.note.date)||state.scheduled||
     JSON.stringify(state.uploads.map(b=>({sha256:hash(b),bytes:b.length})))!==JSON.stringify(r.photos))fail('content-unverified');
   state.clicks++;state.events.push('submit');
   const row={id:'synthetic-post-'+state.clicks,kind:'published',scope:copy(scope),title:state.title,body:state.body,date:state.date,dateSource:'observed-service-ui',attachments:attachments()};
   state.posts.push(row);state.afterCommit?.(row);return {clicked:true};
  },
  async readPublished(){return {complete:state.resultComplete,refreshed:state.resultRefreshed,posts:copy(state.posts)};},
  async close(){state.events.push('close');return state.closeResult;}
 };
 const driver=createPreparedDriver({bridge,target,permission,publicationMode:options.publicationMode||'fixed',closeTimeoutMs:30});
 const args={profile,store,driver,readPhoto:ref=>originals.find(b=>hash(b)===ref.id.split('.')[0]),review:()=>true,gate:()=>({enabled:true}),timeoutMs:1000};
 const publisher=createPublisher(args);
 return {target,profile,store,originals,note,state,scope,bridge,driver,args,publisher,publish:n=>publisher.publish(n||note),hash};
}
module.exports={fixture};
