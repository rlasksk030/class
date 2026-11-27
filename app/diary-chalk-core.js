// 알림장 칠판 모드: pure layout helpers (no DOM). The window measures text widths and passes them in,
// so the same rules run in the app and in unit tests.
//   - wrap(): how many rows one written line takes at a font size (word-break: keep-all; a word longer
//     than the row is broken, like overflow-wrap: anywhere). An empty line still takes one row.
//   - paginate(): split lines into pages by rows; a page never starts with an empty line.
//   - fit(): the largest body size (min..max) that shows everything on one page; when even the
//     minimum does not fit, the minimum size with pages.
(function(root){
 const LINE_HEIGHT=1.5,TITLE=1.15,DATE=.7,DATE_GAP=.25,TITLE_GAP=.35;
 const PREF_DEFAULT=Object.freeze({fontScale:null,showDate:true});
 const SCALE_MIN=.15,SCALE_MAX=3;
 const isObject=v=>!!v&&typeof v==='object'&&!Array.isArray(v);

 // Saved preference: {fontScale: null (auto fit) | number, showDate: boolean}. Anything else → default.
 function preferences(value){
  if(!isObject(value))return {...PREF_DEFAULT};
  const scale=value.fontScale===null||value.fontScale===undefined?null:Number(value.fontScale);
  return {fontScale:scale===null||!Number.isFinite(scale)||scale<SCALE_MIN||scale>SCALE_MAX?null:scale,showDate:value.showDate!==false};
 }
 const validPreferences=value=>isObject(value)&&(value.fontScale===null||(typeof value.fontScale==='number'&&Number.isFinite(value.fontScale)&&value.fontScale>=SCALE_MIN&&value.fontScale<=SCALE_MAX))&&typeof value.showDate==='boolean';

 // Rows taken by one line: measure(text) returns its width in px at the font size being tried.
 function wrap(line,width,measure){
  const text=String(line).replace(/\s+$/,'');
  if(!text.trim())return 1;
  if(width<=0)return Infinity;
  let rows=1,used=0;
  const space=measure(' ');
  for(const word of text.split(/(\s+)/)){
   if(!word)continue;
   if(/^\s+$/.test(word)){if(used>0)used+=space*word.length;continue;}
   const w=measure(word);
   if(used>0&&used+w<=width+.5){used+=w;continue;}
   if(used>0){rows++;used=0;}
   if(w<=width+.5){used=w;continue;}
   // A word longer than the row: break it by characters.
   for(const ch of Array.from(word)){const c=measure(ch);if(used>0&&used+c>width+.5){rows++;used=0;}used+=c;}
  }
  return rows;
 }

 // Lines → pages. rows[i] is how many rows line i takes; capacity is rows per page.
 function paginate(lines,rows,capacity){
  const cap=Math.max(1,Math.floor(capacity));
  const pages=[];let page=[],used=0;
  lines.forEach((line,i)=>{
   const r=Math.max(1,rows[i]);
   if(page.length&&used+r>cap){pages.push(page);page=[];used=0;}
   if(!page.length&&!String(line).trim()&&pages.length)return; // a new page does not start with an empty line
   page.push(line);used+=r;
  });
  if(page.length||!pages.length)pages.push(page);
  return pages;
 }

 // Space the date and the title take above the body, in px, at body size `size`.
 function headHeight({size,width,showDate,date,title,measureAt}){
  let h=0;
  if(showDate&&date)h+=size*DATE*LINE_HEIGHT+size*DATE_GAP;
  if(title&&String(title).trim()){const t=size*TITLE;h+=wrap(title,width,s=>measureAt(s,t))*t*LINE_HEIGHT+size*TITLE_GAP;}
  return h;
 }

 // Rows per page and the rows each line takes, at body size `size`.
 function measureAt(size,{lines,width,height,showDate,date,title,measureAt}){
  const head=headHeight({size,width,showDate,date,title,measureAt});
  const row=size*LINE_HEIGHT;
  const capacity=Math.floor((height-head+.5)/row);
  const rows=lines.map(line=>wrap(line,width,s=>measureAt(s,size)));
  return {capacity,rows,total:rows.reduce((a,b)=>a+b,0)};
 }

 // Auto fit (fontScale null): biggest size in [min, max] that fits on one page. Manual size: that size.
 // Returns {size, pages}. Sizes are whole pixels.
 function fit(input){
  const {min,max,manual}=input,lines=String(input.body??'').replace(/\r\n?/g,'\n').split('\n');
  // Trailing empty lines add nothing on a board.
  while(lines.length>1&&!lines.at(-1).trim())lines.pop();
  const at=size=>measureAt(size,{...input,lines});
  let size;
  if(Number.isFinite(manual)&&manual>0)size=Math.round(manual);
  else{
   let low=Math.floor(min),high=Math.max(Math.floor(min),Math.floor(max));
   const fits=s=>{const m=at(s);return m.capacity>=1&&m.total<=m.capacity;};
   if(fits(high))low=high;
   else if(fits(low)){while(high-low>1){const mid=Math.floor((low+high)/2);if(fits(mid))low=mid;else high=mid;}}
   size=low;
  }
  const m=at(size);
  return {size,lines,pages:paginate(lines,m.rows,Math.max(1,m.capacity))};
 }

 const api={LINE_HEIGHT,TITLE,DATE,DATE_GAP,TITLE_GAP,PREF_DEFAULT,SCALE_MIN,SCALE_MAX,preferences,validPreferences,wrap,paginate,headHeight,fit};
 if(typeof module!=='undefined')module.exports=api;else root.DiaryChalkCore=api;
})(globalThis);
