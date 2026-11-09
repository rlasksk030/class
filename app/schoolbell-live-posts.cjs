'use strict';
// Observed 2026-11-09: card wrapper data-letter-id agrees with the site's copied
// post link; the date tooltip is a displayed calendar date, not the app draft date.
const {classRoute}=require('./schoolbell-live-context.cjs');
function readPostIndex(document,title){
 const boards=document.querySelectorAll('app-group-board');
 if(boards.length!==1)return {known:false};
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
 // virtual-scroller only exposes rendered cards. Neither visible count nor
 // blank footer nodes prove that older records have all been loaded.
 return {known:true,ids,matches,complete:false,reason:'virtual-list-coverage-unverified'};
}
function createLivePostProvider({getWebContents,createReader,target,timeoutMs=12000}={}){
 let pinned=null,reader=null,active=false,closed=false;
 const controller=new AbortController();
 function current(){const wc=getWebContents?.();if(closed||!wc||wc.isDestroyed())throw Error('publication-unverified');return wc;}
 function pin(){const wc=current(),route=classRoute(wc.getURL());if(!route)throw Error('context-unverified');
  if(pinned&&(pinned.origin!==route.origin||pinned.groupId!==route.groupId))throw Error('context-unverified');
  pinned=route;return route.base+'/boards/classnews';}
 async function scan(wc,url,title,signal,waitForMatch=false){
  if(signal.aborted)throw Error('cancelled');
  await wc.loadURL(url); // Always a fresh ordinary UI navigation, no private API.
  const end=Date.now()+timeoutMs;
  while(Date.now()<end){
   if(signal.aborted||wc.isDestroyed()||wc.getURL()!==url)throw Error('publication-unverified');
   const result=await wc.executeJavaScriptInIsolatedWorld(17484,[{code:'('+readPostIndex.toString()+')(document,'+JSON.stringify(title||'')+')'}]);
   if(result?.known&&(!waitForMatch||result.matches.length>0))return result;
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw Error('publication-unverified');
 }
 async function run(mode,request,external){
  if(active||closed)throw Error('driver-state');active=true;
  const signal=external?AbortSignal.any([external,controller.signal]):controller.signal;
  let abort;
  try{
   if(mode==='baseline'){
    const url=pin(),owner=current(),initialURL=owner.getURL();
    reader=await createReader(owner.session);
    abort=()=>{if(reader&&!reader.isDestroyed())reader.destroy();};signal.addEventListener('abort',abort,{once:true});
    if(signal.aborted)throw Error('cancelled');
    const result=await scan(reader.webContents,url,request.note?.title,signal);
    if(owner.isDestroyed()||owner.getURL()!==initialURL)throw Error('context-changed');
    return {complete:false,refreshed:true,posts:[],observedIds:result.ids,reason:result.reason};
   }
   if(!pinned||!request.binding||request.binding.boardId!==pinned.groupId||typeof request.note?.title!=='string')throw Error('publication-unverified');
   const wc=current(),url=pinned.base+'/boards/classnews';
   // Send can land on schoolnews. Return to the pinned class board once, then
   // select a unique title + DOM post ID; the existing bridge checks all bytes.
   const result=await scan(wc,url,request.note.title,signal,true);
   if(result.matches.length!==1||!result.matches[0].date)throw Error('publication-unverified');
   return {complete:true,refreshed:true,boardURL:url,...result.matches[0],scope:{service:'schoolbell',schoolId:target.schoolId,classKey:target.classKey,boardId:pinned.groupId}};
  }finally{if(abort){signal.removeEventListener('abort',abort);abort();}reader=null;active=false;}
 }
 return {readBaseline:(r,s)=>run('baseline',r,s),readPublishedMetadata:(r,s)=>run('published',r,s),
  close(){closed=true;controller.abort();if(reader&&!reader.isDestroyed())reader.destroy();return !active;}};
}
module.exports={readPostIndex,createLivePostProvider};
