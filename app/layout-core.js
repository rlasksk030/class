// Dashboard layout model: the four boards on a 12-column x 6-row grid. Pure functions only.
// Positions are 1-based grid cells: {x, y, w, h, visible}. Hidden boards keep their last
// rectangle (so they can return to it) but take no space; only visible boards may not overlap.
(function(root){
 const IDS=['timetable','morning','notices','meal'];
 const COLUMNS=12,ROWS=6,MIN={w:2,h:2},VERSION=1;
 // Closest to the previous fixed board: columns 21:61:18, rows 1.45:.65.
 const DEFAULT={timetable:{x:1,y:1,w:3,h:6},morning:{x:4,y:1,w:7,h:4},notices:{x:4,y:5,w:7,h:2},meal:{x:11,y:1,w:2,h:6}};
 const isObject=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
 const clamp=(n,min,max)=>Math.min(Math.max(n,min),max);
 const rect=r=>({x:r.x,y:r.y,w:r.w,h:r.h});

 function defaults(){return {version:VERSION,columns:COLUMNS,rows:ROWS,items:Object.fromEntries(IDS.map(id=>[id,{...DEFAULT[id],visible:true}]))};}
 function clone(layout){return {version:VERSION,columns:COLUMNS,rows:ROWS,items:Object.fromEntries(IDS.map(id=>[id,{...rect(layout.items[id]),visible:layout.items[id].visible}]))};}
 function inBounds(r){return [r.x,r.y,r.w,r.h].every(Number.isInteger)&&r.x>=1&&r.y>=1&&r.w>=MIN.w&&r.h>=MIN.h&&r.x+r.w-1<=COLUMNS&&r.y+r.h-1<=ROWS;}
 const overlaps=(a,b)=>a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h;
 const visibleIds=layout=>IDS.filter(id=>layout.items[id].visible);
 // Visible boards (other than `except`) that a rectangle would cover.
 const collisions=(layout,r,except)=>visibleIds(layout).filter(id=>id!==except&&overlaps(r,layout.items[id]));
 const free=(layout,r,except)=>inBounds(r)&&collisions(layout,r,except).length===0;

 function validate(value){
  const errors=[];
  if(!isObject(value))return ['not-object'];
  if(value.version!==VERSION)errors.push('version');
  if(value.columns!==COLUMNS||value.rows!==ROWS)errors.push('grid');
  if(!isObject(value.items))return [...errors,'items'];
  for(const id of IDS){
   const r=value.items[id];
   if(!isObject(r)||typeof r.visible!=='boolean'||!inBounds(r))errors.push('item:'+id);
  }
  if(errors.length)return errors;
  const shown=visibleIds(value);
  shown.forEach((a,i)=>shown.slice(i+1).forEach(b=>{if(overlaps(value.items[a],value.items[b]))errors.push('overlap:'+a+':'+b);}));
  return errors;
 }
 const isValid=value=>validate(value).length===0;

 // Earlier versions stored three column fractions, one top-row fraction ('boardSizes')
 // and a visible flag per board ('boardPreferences'). Map them to the nearest grid.
 function migrate({sizes,preferences}={}){
  const layout=defaults(),items=layout.items;
  const cols=isObject(sizes)&&Array.isArray(sizes.columns)?sizes.columns:null;
  if(cols&&cols.length===3&&cols.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>0)){
   const sum=cols[0]+cols[1]+cols[2];
   if(Number.isFinite(sum)&&sum>0){
    let left=clamp(Math.round(cols[0]/sum*COLUMNS),MIN.w,COLUMNS-2*MIN.w),right=clamp(Math.round(cols[2]/sum*COLUMNS),MIN.w,COLUMNS-2*MIN.w);
    while(COLUMNS-left-right<MIN.w){if(left>=right)left--;else right--;}
    const middle=COLUMNS-left-right;
    Object.assign(items.timetable,{x:1,w:left});
    Object.assign(items.morning,{x:left+1,w:middle});
    Object.assign(items.notices,{x:left+1,w:middle});
    Object.assign(items.meal,{x:left+middle+1,w:right});
   }
  }
  const row=isObject(sizes)?sizes.row:undefined;
  if(typeof row==='number'&&Number.isFinite(row)){
   const top=clamp(Math.round(row*ROWS),MIN.h,ROWS-MIN.h);
   Object.assign(items.morning,{y:1,h:top});
   Object.assign(items.notices,{y:top+1,h:ROWS-top});
  }
  if(isObject(preferences))for(const id of IDS)if(isObject(preferences[id])&&preferences[id].visible===false)items[id].visible=false;
  return layout;
 }

 // Saved value first; with nothing saved, carry the old settings over; anything broken
 // falls back to the default board so the dashboard always renders.
 function resolve(saved,legacy){
  if(saved===undefined||saved===null)return {layout:migrate(legacy),source:'migrated'};
  if(isValid(saved))return {layout:clone(saved),source:'saved'};
  return {layout:defaults(),source:'invalid'};
 }

 const result=(ok,layout,extra={})=>({ok,layout,...extra});
 const boardAt=(layout,x,y,except)=>visibleIds(layout).find(id=>id!==except&&overlaps({x,y,w:1,h:1},layout.items[id]));

 // Two visible boards trade rectangles (position and size), so a swap always fits.
 function swap(layout,a,b){
  const A=layout.items[a],B=layout.items[b];
  if(!A||!B||!A.visible||!B.visible||a===b)return result(false,layout,{reason:'hidden'});
  const next=clone(layout);
  Object.assign(next.items[a],rect(B));Object.assign(next.items[b],rect(A));
  if(!isValid(next))return result(false,layout,{reason:'swap',target:rect(B)});
  return result(true,next,{target:rect(B),swap:b});
 }

 // Move a visible board so its top-left is (x, y). Onto empty cells: it moves. Covering
 // exactly one other board: the two trade places. Anything else is refused.
 function move(layout,id,x,y){
  const item=layout.items[id];
  if(!item||!item.visible)return result(false,layout,{reason:'hidden'});
  const target={x,y,w:item.w,h:item.h};
  if(!inBounds(target))return result(false,layout,{reason:'bounds',target});
  const hit=collisions(layout,target,id);
  if(!hit.length){const next=clone(layout);Object.assign(next.items[id],target);return result(true,next,{target});}
  if(hit.length>1)return result(false,layout,{reason:'occupied',target});
  return swap(layout,id,hit[0]);
 }

 // Dragging: released over another board (the cell under the pointer) swaps with it;
 // otherwise the board moves so its top-left is (x, y).
 function drop(layout,id,x,y,cell){
  const other=cell&&boardAt(layout,cell.x,cell.y,id);
  return other?swap(layout,id,other):move(layout,id,x,y);
 }

 // Keyboard: one cell in a direction. When that cell row/column belongs to other boards,
 // swap with the board right next to this board's first row/column on that side.
 function nudge(layout,id,dx,dy){
  const item=layout.items[id];
  if(!item||!item.visible)return result(false,layout,{reason:'hidden'});
  const target={x:item.x+dx,y:item.y+dy,w:item.w,h:item.h};
  if(!inBounds(target))return result(false,layout,{reason:'bounds',target});
  if(!collisions(layout,target,id).length)return move(layout,id,target.x,target.y);
  const x=dx>0?item.x+item.w:dx<0?item.x-1:item.x,y=dy>0?item.y+item.h:dy<0?item.y-1:item.y;
  const other=boardAt(layout,x,y,id)||collisions(layout,target,id)[0];
  return swap(layout,id,other);
 }

 // Grow or shrink from the right/bottom edges; the top-left corner stays.
 function resize(layout,id,w,h){
  const item=layout.items[id];
  if(!item||!item.visible)return result(false,layout,{reason:'hidden'});
  const target={x:item.x,y:item.y,w,h};
  if(!inBounds(target))return result(false,layout,{reason:w<MIN.w||h<MIN.h?'minimum':'bounds',target});
  if(collisions(layout,target,id).length)return result(false,layout,{reason:'occupied',target});
  const next=clone(layout);Object.assign(next.items[id],target);
  return result(true,next,{target});
 }

 function hide(layout,id){
  if(!layout.items[id])return result(false,layout,{reason:'unknown'});
  const next=clone(layout);next.items[id].visible=false;
  return result(true,next);
 }

 // Every rectangle from the largest (up to `size`) to the minimum, scanning row by row.
 function candidates(size){
  const list=[];
  for(let w=Math.min(size.w,COLUMNS);w>=MIN.w;w--)for(let h=Math.min(size.h,ROWS);h>=MIN.h;h--)list.push({w,h});
  return list.sort((a,b)=>b.w*b.h-a.w*a.h||Math.abs(size.w-a.w)+Math.abs(size.h-a.h)-(Math.abs(size.w-b.w)+Math.abs(size.h-b.h)));
 }

 // Show a hidden board: in its old place if that is still empty, otherwise in the largest
 // empty space up to its old size. Refused when no 2x2 space is left.
 function show(layout,id){
  const item=layout.items[id];
  if(!item)return result(false,layout,{reason:'unknown'});
  if(item.visible)return result(true,layout);
  let target=free(layout,item,id)?rect(item):null;
  for(const size of target?[]:candidates(item)){
   for(let y=1;y<=ROWS-size.h+1&&!target;y++)for(let x=1;x<=COLUMNS-size.w+1&&!target;x++){
    const r={x,y,...size};if(free(layout,r,id))target=r;
   }
   if(target)break;
  }
  if(!target)return result(false,layout,{reason:'no-space'});
  const next=clone(layout);Object.assign(next.items[id],target,{visible:true});
  return result(true,next,{target});
 }

 // Drop a hidden board on cell (x, y): the largest empty rectangle (up to its old size)
 // that covers that cell, preferring one that starts at the cell.
 function placeAt(layout,id,x,y){
  const item=layout.items[id];
  if(!item)return result(false,layout,{reason:'unknown'});
  let best=null;
  for(const size of candidates(item)){
   for(let top=y-size.h+1;top<=y;top++)for(let left=x-size.w+1;left<=x;left++){
    const r={x:left,y:top,...size};
    if(!free(layout,r,id))continue;
    const distance=(x-left)+(y-top);
    if(!best||size.w*size.h>best.w*best.h||(size.w*size.h===best.w*best.h&&distance<best.distance))best={...r,distance};
   }
  }
  if(!best)return result(false,layout,{reason:'no-space'});
  const next=clone(layout);Object.assign(next.items[id],rect(best),{visible:true});
  return result(true,next,{target:rect(best)});
 }

 // Let neighbouring boards grow into empty space, one row or column at a time, until no
 // board can grow without covering another.
 function fill(layout){
  const next=clone(layout);let changed=false,grown=true;
  while(grown){
   grown=false;
   for(const id of visibleIds(next)){
    const r=next.items[id];
    for(const step of [{w:1},{x:-1,w:1},{h:1},{y:-1,h:1}]){
     const t={x:r.x+(step.x||0),y:r.y+(step.y||0),w:r.w+(step.w||0),h:r.h+(step.h||0)};
     if(free(next,t,id)){Object.assign(r,t);grown=changed=true;}
    }
   }
  }
  return result(true,next,{changed});
 }

 // Empty cells grouped into rectangles (row by row, widest first), for the "빈 칸" marks.
 function emptyRegions(layout){
  const used=Array.from({length:ROWS+1},()=>Array(COLUMNS+1).fill(false));
  for(const id of visibleIds(layout)){const r=layout.items[id];for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++)used[y][x]=true;}
  const regions=[];
  for(let y=1;y<=ROWS;y++)for(let x=1;x<=COLUMNS;x++){
   if(used[y][x])continue;
   let w=1;while(x+w<=COLUMNS&&!used[y][x+w])w++;
   let h=1;while(y+h<=ROWS&&Array.from({length:w},(_,i)=>used[y+h][x+i]).every(v=>!v))h++;
   for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)used[j][i]=true;
   regions.push({x,y,w,h});
  }
  return regions;
 }

 const equal=(a,b)=>IDS.every(id=>['x','y','w','h','visible'].every(k=>a.items[id][k]===b.items[id][k]));

 const api={IDS,COLUMNS,ROWS,MIN,VERSION,DEFAULT,defaults,clone,inBounds,overlaps,validate,isValid,migrate,resolve,swap,move,drop,nudge,resize,hide,show,placeAt,fill,emptyRegions,equal};
 if(typeof module!=='undefined')module.exports=api;else root.LayoutCore=api;
})(globalThis);
