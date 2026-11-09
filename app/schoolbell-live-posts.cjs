'use strict';
// Observed 2026-11-09: card wrapper data-letter-id agrees with the site's copied
// post link; the date tooltip is a displayed calendar date, not the app draft date.
const {classRoute}=require('./schoolbell-live-context.cjs');
const {createObservedPostBridge}=require('./schoolbell-observed-post.cjs');
function readPostIndex(document,title){
 const boards=document.querySelectorAll('app-group-board');
 if(boards.length!==1)return {known:false};
 const searches=document.querySelectorAll('input[placeholder="검색"]');
 const unfiltered=searches.length===1&&searches[0].value==='';
 const cards=Array.from(boards[0].querySelectorAll('app-letter-item-long'));
 const ids=[],matches=[];
 for(const card of cards){
  const wrapper=card.closest('div.notification-post[data-letter-id]');
  const id=wrapper?.getAttribute('data-letter-id');
  if(!/^\d+$/.test(id||'')||wrapper.querySelectorAll('app-letter-item-long').length!==1||ids.includes(id))return {known:false};
  ids.push(id);
  const titles=card.querySelectorAll('app-translation-viewer');
  if(titles.length!==1)return {known:false};
  if(titles[0].textContent.trim()!==title)continue;
  const dates=Array.from(card.querySelectorAll('p.text-muted.small.mb-1 span.mat-mdc-tooltip-trigger'));
  const values=dates.map(el=>{
   const keys=(el.getAttribute('aria-describedby')||'').trim().split(/\s+/);
   if(keys.length!==1)return null;
   const text=document.getElementById(keys[0])?.textContent.trim();
   const m=text?.match(/^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(AM|PM)\s+(\d{1,2}):(\d{2}):(\d{2})$/);
   if(!m||+m[5]<1||+m[5]>12||+m[6]>59||+m[7]>59)return null;
   const date=m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0');
   const parsed=new Date(date+'T00:00:00Z');
   return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===date?date:null;
  }).filter(Boolean);
  matches.push({id,date:values.length===1?values[0]:null});
 }
 const scrollers=boards[0].querySelectorAll('virtual-scroller');
 if(scrollers.length!==1)return {known:true,ids,matches,unfiltered,complete:false};
 const scroller=scrollers[0].closest('.document-wrapper');
 if(!scroller)return {known:true,ids,matches,unfiltered,complete:false};
 const rect=scroller.getBoundingClientRect();
 const ends=Array.from(scrollers[0].querySelectorAll('app-infinite-list-info p')).filter(e=>e.textContent.trim()==='더이상 글이 없습니다.');
 const end=ends.length===1?ends[0]:null,er=end?.getBoundingClientRect();
 const viewport={top:scroller.scrollTop,height:scroller.clientHeight,total:scroller.scrollHeight,
  end:!!er&&er.height>0&&er.top>=rect.top&&er.bottom<=rect.bottom+1};
 // A single DOM sample never proves coverage of a virtual list. The collector
 // walks overlapping viewports from the start to this observed server-end marker.
 return {known:true,ids,matches,viewport,unfiltered,complete:false};
}
// Ordinary UI scrolling only. No framework internals, private API or storage.
function moveList(document,reset){
 const nodes=document.querySelectorAll('app-group-board virtual-scroller');
 if(nodes.length!==1)throw Error('baseline-unverified');
 const e=nodes[0].closest('.document-wrapper');if(!e)throw Error('baseline-unverified');
 e.scrollTop=reset?0:Math.min(e.scrollHeight-e.clientHeight,e.scrollTop+Math.max(1,e.clientHeight*0.6));
}
function createLivePostProvider({getWebContents,createReader,target,tempRoot,timeoutMs=20000,diagnostic=()=>{}}={}){
 let pinned=null,reader=null,active=false,closed=false,baselineIds=null;
 const controller=new AbortController();
 function current(){const wc=getWebContents?.();if(closed||!wc||wc.isDestroyed())throw Error('publication-unverified');return wc;}
 function pin(){const wc=current(),route=classRoute(wc.getURL());if(!route)throw Error('context-unverified');
  if(pinned&&(pinned.origin!==route.origin||pinned.groupId!==route.groupId))throw Error('context-unverified');
  pinned=route;return route.base+'/boards/classnews';}
 async function collect(wc,url,title,signal,allowed){
  const check=()=>{if(signal.aborted||closed||!allowed()||wc.isDestroyed()||wc.getURL()!==url)throw Error('baseline-unverified');};
  check();const until=Date.now()+timeoutMs,all=new Map();let started=false,previous=null,stableEnd=null;
  while(Date.now()<until){
   check();const sample=await wc.executeJavaScriptInIsolatedWorld(17484,[{code:'('+readPostIndex.toString()+')(document,'+JSON.stringify(title||'')+')'}]);check();
   if(!sample?.known||!sample.viewport||sample.unfiltered!==true){await new Promise(r=>setTimeout(r,100));continue;}
   const v=sample.viewport;if(v.height<=0||!Number.isFinite(v.top)||v.total<v.height)throw Error('baseline-unverified');
   if(!started){if(v.top>1){await wc.executeJavaScriptInIsolatedWorld(17484,[{code:'('+moveList.toString()+')(document,true)'}]);continue;}started=true;}
   // Do not scroll past a viewport whose rows are still loading.
   if(!sample.ids.length&&!v.end){await new Promise(r=>setTimeout(r,100));continue;}
   // Overlap prevents silently jumping over virtualized rows as images resize.
   if(previous?.ids.length&&sample.ids.length&&v.top>previous.top&&!sample.ids.some(id=>previous.ids.includes(id)))throw Error('baseline-unverified');
   for(const id of sample.ids){const candidate=sample.matches.find(m=>m.id===id)||null;
    if(all.has(id)&&JSON.stringify(all.get(id))!==JSON.stringify(candidate))throw Error('baseline-unverified');all.set(id,candidate);}
   if(all.size>5000)throw Error('baseline-unverified');
   const signature=JSON.stringify([v.top,v.total,sample.ids,[...all.keys()]]);
   if(v.end){if(stableEnd===signature)return {ids:[...all.keys()],matches:[...all.values()].filter(Boolean)};stableEnd=signature;}
   else {stableEnd=null;await wc.executeJavaScriptInIsolatedWorld(17484,[{code:'('+moveList.toString()+')(document,false)'}]);}
   previous={ids:sample.ids,top:v.top};await new Promise(r=>setTimeout(r,150));
  }
  throw Error('baseline-unverified');
 }
 async function openCandidate(wc,url,candidate,title,signal,allowed){
  await wc.loadURL(url+'/posts/'+candidate.id);const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline){
   if(signal.aborted||!allowed()||wc.isDestroyed())throw Error('context-changed');
   const at=classRoute(wc.getURL());if(!at||at.groupId!==pinned.groupId)throw Error('context-changed');
   const index=await wc.executeJavaScriptInIsolatedWorld(17484,[{code:'('+readPostIndex.toString()+')(document,'+JSON.stringify(title)+')'}]);
   if(index?.matches?.some(m=>m.id===candidate.id&&m.date===candidate.date))return;
   await new Promise(r=>setTimeout(r,100));
  }
  throw Error('publication-unverified');
 }
 async function run(mode,request,external){
  if(active||closed)throw Error('driver-state');active=true;
  const signal=external?AbortSignal.any([external,controller.signal]):controller.signal;
  let abort,originals;
  const permitted=()=>!signal.aborted&&request.stillPermitted?.()===true;
  try{
   if(!permitted())throw Error('permission-unverified');
   if(mode==='baseline'){
    const url=pin(),owner=current(),initialURL=owner.getURL();
    reader=await createReader(owner.session);
    abort=()=>{if(reader&&!reader.isDestroyed())reader.destroy();};signal.addEventListener('abort',abort,{once:true});
    if(!permitted())throw Error('cancelled');
    const stillBound=()=>permitted()&&!owner.isDestroyed()&&owner.getURL()===initialURL;
    await reader.loadURL(url);
    const result=await collect(reader.webContents,url,request.note?.title,signal,stillBound);
    if(!stillBound())throw Error('context-changed');
    const scope={service:'schoolbell',schoolId:target.schoolId,classKey:target.classKey,boardId:pinned.groupId},posts=[];
    originals=createObservedPostBridge({getWebContents:()=>reader?.webContents,tempRoot,authorize:stillBound});
    for(const candidate of result.matches){
     if(!candidate.date)throw Error('date-unverified');
     // Reopen this observed post link in the SAME app session to bring a
     // virtualized candidate into view. Only matching-title bodies are read.
     await openCandidate(reader.webContents,url,candidate,request.note.title,signal,stillBound);
     const proof=await originals.readOriginalsForComparison({boardURL:url,postId:candidate.id,note:{title:request.note.title}},signal);
     posts.push({id:candidate.id,date:candidate.date,dateSource:'observed-service-ui',scope,kind:'published',title:proof.fields.title,body:proof.fields.body,attachments:proof.attachments});
    }
    if(!stillBound())throw Error('context-changed');baselineIds=result.ids;
    return {complete:true,refreshed:true,ids:baselineIds,filter:{title:request.note.title},posts};
   }
   if(!pinned||!baselineIds||!request.binding||request.binding.boardId!==pinned.groupId||typeof request.note?.title!=='string')throw Error('publication-unverified');
   const wc=current(),url=pinned.base+'/boards/classnews';
   // A click acknowledgement is not a saved post. Do not navigate away from
   // the composer while its ordinary upload/publish request is still running.
   // The observed service returns to classnews or schoolnews after sending.
   // Wait for that result screen, then perform the independent refreshed read.
   const until=Date.now()+timeoutMs;let completed=false,previous=null,lastResultRoute=false,lastOutcome=null;
   diagnostic({step:'published-result-screen',state:'waiting'});
   while(Date.now()<until){
    if(!permitted()||wc.isDestroyed())throw Error('publication-unverified');
    let at;try{at=new URL(wc.getURL());}catch{throw Error('publication-unverified');}
    if(at.origin!==pinned.origin||at.search||at.hash)throw Error('publication-unverified');
    const path=at.pathname,base='/ko/main/group/'+pinned.groupId+'/boards/';
    const resultRoute=path===base+'classnews'||path===base+'schoolnews'||
     new RegExp('^'+base+'(?:classnews|schoolnews)/posts/\\d+$').test(path);
    lastResultRoute=resultRoute;
    const outcome=await wc.executeJavaScriptInIsolatedWorld(17484,[{code:'('+require('./schoolbell-send-input.cjs').readSendOutcome.toString()+')(document)'}]);
    if(JSON.stringify(outcome)!==lastOutcome){diagnostic({step:'post-click-ui',...outcome});lastOutcome=JSON.stringify(outcome);}
    if(resultRoute){
     const ready=await wc.executeJavaScriptInIsolatedWorld(17484,[{code:'document.querySelectorAll("app-group-board").length===1&&document.querySelectorAll("app-boards-write").length===0'}]);
     if(ready&&previous===wc.getURL()){completed=true;break;}previous=ready?wc.getURL():null;
    }else if(path!==base+'write/classnews')throw Error('publication-unverified');
    await new Promise(r=>setTimeout(r,100));
   }
   diagnostic({step:'published-result-screen',state:completed?'complete':'unconfirmed',resultRoute:lastResultRoute});
   if(!completed)throw Error('publication-unverified');
   await wc.loadURL(url);
   const result=await collect(wc,url,request.note.title,signal,permitted);
   const matches=result.matches.filter(m=>!baselineIds.includes(m.id));
   diagnostic({step:'published-index',newTitleMatches:matches.length,dateKnown:matches.length===1&&!!matches[0].date});
   if(!permitted()||matches.length!==1||!matches[0].date)throw Error('publication-unverified');
   await openCandidate(wc,url,matches[0],request.note.title,signal,permitted);
   return {complete:true,refreshed:true,boardURL:url,...matches[0],dateSource:'observed-service-ui',scope:{service:'schoolbell',schoolId:target.schoolId,classKey:target.classKey,boardId:pinned.groupId}};
  }finally{originals?.close();if(abort){signal.removeEventListener('abort',abort);abort();}reader=null;active=false;}
 }
 return {readBaseline:(r,s)=>run('baseline',r,s),readPublishedMetadata:(r,s)=>run('published',r,s),
  close(){closed=true;controller.abort();if(reader&&!reader.isDestroyed())reader.destroy();return !active;}};
}
module.exports={readPostIndex,moveList,createLivePostProvider};
