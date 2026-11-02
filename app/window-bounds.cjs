const defaults={dashboard:{width:400,height:260},random:{width:440,height:360},activity:{width:680,height:560},whiteboard:{width:720,height:540}};
function safeBounds(saved,areas,fallback,kind){
 const d=defaults[kind]||defaults.dashboard;
 const b={x:Number.isFinite(saved?.x)?Math.round(saved.x):fallback.x+40,y:Number.isFinite(saved?.y)?Math.round(saved.y):fallback.y+40,width:Number.isFinite(saved?.width)?Math.round(saved.width):d.width,height:Number.isFinite(saved?.height)?Math.round(saved.height):d.height};
 const intersect=a=>Math.max(0,Math.min(b.x+b.width,a.x+a.width)-Math.max(b.x,a.x))*Math.max(0,Math.min(b.y+b.height,a.y+a.height)-Math.max(b.y,a.y));
 const area=[...areas].sort((a,c)=>intersect(c)-intersect(a)).find(a=>intersect(a)>0)||fallback;
 b.width=Math.min(area.width,Math.max(320,b.width));b.height=Math.min(area.height,Math.max(220,b.height));
 b.x=Math.max(area.x,Math.min(b.x,area.x+area.width-b.width));b.y=Math.max(area.y,Math.min(b.y,area.y+area.height-b.height));return b;
}
module.exports={safeBounds,defaults};
