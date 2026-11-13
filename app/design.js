// Dashboard sizes from design/우리교실_디자인적용_지시서.md (3장). Every size is its 1440×900 value × s,
// s = min(window width / 1440, window height / 900), recalculated whenever the window or a board
// changes. Values reach CSS only through custom properties (element.style.setProperty), never
// through HTML style attributes (CSP style-src 'self').
(() => {
 const root=document.documentElement,main=document.querySelector('main');
 const clamp=(x,min,max)=>Math.min(max,Math.max(min,x));
 const set=(el,name,value)=>el.style.setProperty(name,typeof value==='number'?Math.round(value)+'px':value);
 const pen=document.createElement('canvas').getContext('2d');
 let s=1,frame=0;

 // Width of a text at 1px, in the element's own font (Gowun Batang 700 for board titles).
 function widthAt1px(el,text){const cs=getComputedStyle(el);pen.font=`${cs.fontWeight} 100px ${cs.fontFamily}`;return pen.measureText(text).width/100;}

 function scale(){
  s=Math.min(innerWidth/1440,innerHeight/900);
  root.style.setProperty('--s',String(Math.round(s*1000)/1000));
  root.classList.toggle('scale-roomy',s>=.9); // "10:30까지" beside 지금 교시 only from s ≥ 0.9
 }

 // One formula for every board: head height, title size and inner padding (3-5).
 function card(c){
  const r=c.getBoundingClientRect();if(!r.width||!r.height)return null;
  const editing=document.body.classList.contains('layout-editing');
  const head=clamp(Math.min(62*s,r.height*.28),44,74),pad=clamp(Math.min(r.width,r.height)*.055,10,26);
  set(c,'--head-h',head);set(c,'--pad',pad);
  const h=c.querySelector('.cardhead'),h2=h.querySelector('h2'),text=h2.querySelector('.board-title-text')?.textContent||h2.textContent.trim();
  // Room for the title: the head minus its padding and the [수정]/[작성] button beside it.
  const edit=h.querySelector('[data-edit]'),editW=edit&&getComputedStyle(edit).display!=='none'?edit.getBoundingClientRect().width+10:0;
  const room=Math.max(40,r.width-pad-8-editW-4),icon=h2.querySelector('.uc-ico')?1.15:0;
  const size=clamp(Math.min(head*.46,room/(widthAt1px(h2,text)+icon)),15,38);
  set(c,'--title-fs',editing?clamp(size*.78,15,22):size);
  c.classList.toggle('layout-wide',r.width>400);
  c.classList.toggle('show-foot',r.height>=300*s);
  return {r,head,pad};
 }

 // Timetable: a vertical list while the body is at most 2.4 times wider than tall, otherwise six columns.
 function timetable(c){
  const el=document.getElementById('timetable'),rows=el.querySelectorAll('.lesson').length,n=Math.max(rows,6);
  const w=el.clientWidth-2*parseFloat(getComputedStyle(el).paddingLeft),h=el.clientHeight-2*parseFloat(getComputedStyle(el).paddingTop);
  if(w<=0||h<=0)return;
  const wide=w/h>2.4,scaleBy=window.boardFontScales?.timetable||1,gap=clamp(8*s,4,12);
  c.classList.toggle('tt-row',wide);
  set(el,'--row-gap',gap);
  if(wide){
   const cell=(w-gap*(n-1))/n;
   set(el,'--subject-fs',clamp(Math.min(h*.42,cell*.3)*scaleBy,13,Math.min(76,h*.55)));
  }else{
   const row=Math.floor((h-Math.round(gap)*(n-1))/n); // rounded down so six rows never overflow
   set(el,'--row-h',row);
   set(el,'--subject-fs',clamp(Math.min(row*.5,w*.17)*scaleBy,13,Math.min(76,row*.62)));
  }
  // The subject keeps its size while the start time gives way; a start time that no longer fits is
  // hidden rather than cut. Only a subject too long for its row (it would wrap past it) gets smaller.
  for(const time of el.querySelectorAll('.lesson-time')){time.hidden=false;if(time.textContent&&time.scrollWidth>time.clientWidth+1)time.hidden=true;}
  if(!wide){
   const tooTall=()=>[...el.querySelectorAll('.lesson')].some(r=>{const sp=r.querySelector('span');return sp&&sp.getBoundingClientRect().height>r.clientHeight+1;});
   let size=parseFloat(el.style.getPropertyValue('--subject-fs'));
   while(size>13&&tooTall()){size-=1;set(el,'--subject-fs',size);}
  }
 }

 // Meal: three columns above 2.4 (width ÷ height), two above 1.15, otherwise one.
 function meal(){
  const el=document.getElementById('meal'),items=[...el.querySelectorAll('.meal-item')];
  const cs=getComputedStyle(el),w=el.clientWidth-2*parseFloat(cs.paddingLeft),h=el.clientHeight-2*parseFloat(cs.paddingTop);
  if(!items.length||w<=0||h<=0)return;
  const ratio=w/h,cols=ratio>2.4?3:ratio>1.15?2:1,rows=Math.ceil(items.length/cols),gap=clamp(10*s,6,14);
  const colW=(w-gap*2*(cols-1))/cols,rowH=(h-gap*(rows-1))/rows;
  const longest=Math.max(...items.map(i=>Array.from(i.querySelector('.meal-name').textContent).length));
  const size=clamp(Math.min(rowH*.46,colW*.96/Math.max(longest,3))*(window.boardFontScales?.meal||1),13,Math.min(52,rowH*.7));
  el.style.setProperty('--meal-cols',String(cols));el.style.setProperty('--meal-rows',String(rows));
  set(el,'--meal-fs',size);set(el,'--meal-gap',gap);
 }

 function measure(){
  cancelAnimationFrame(frame);
  scale();
  // Morning and notices still shrink to fit (app.js fitContents), but never grow past clamp(40s, 22, 52).
  const max=String(Math.round(clamp(40*s,22,52)));
  for(const id of ['morning','notices'])document.getElementById(id).style.setProperty('--max-font',max);
  for(const c of main.querySelectorAll(':scope>.card'))if(getComputedStyle(c).display!=='none'&&card(c)){
   if(c.classList.contains('timetable'))timetable(c);
   if(c.classList.contains('meal'))meal();
  }
  window.fitContents?.();
 }
 const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(measure);};

 window.dashboardDesign={measure:schedule,scale:()=>s};
 addEventListener('resize',schedule);
 new ResizeObserver(schedule).observe(main);
 for(const c of main.querySelectorAll(':scope>.card'))new ResizeObserver(schedule).observe(c);
 for(const id of ['timetable','meal'])new MutationObserver(schedule).observe(document.getElementById(id),{childList:true});
 // The current period moves ("지금" tag): re-check which start times still fit.
 new MutationObserver(schedule).observe(document.getElementById('timetable'),{subtree:true,attributes:true,attributeFilter:['class']});
 for(const type of ['board-layout-change','layout-structure-change','board-font-change'])document.addEventListener(type,schedule);
 new MutationObserver(schedule).observe(document.body,{attributes:true,attributeFilter:['class']});
 document.fonts?.ready.then(schedule);
 measure();
})();
