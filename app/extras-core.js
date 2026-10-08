(function(root){
 const dateNumber=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)?Date.parse(s+'T00:00:00Z'):NaN;
 const previousDay=s=>new Date(dateNumber(s)-86400000).toISOString().slice(0,10);
 const daysUntil=(target,today)=>Math.round((dateNumber(target)-dateNumber(today))/86400000);
 const nearestEvents=(events,today)=>events.filter(e=>e.title&&Number.isFinite(daysUntil(e.date,today))&&daysUntil(e.date,today)>=0).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,2);
 const minute=s=>/^([01]\d|2[0-3]):[0-5]\d$/.test(s)?Number(s.slice(0,2))*60+Number(s.slice(3)):NaN;
 function validSchedule(rows){let end=-1;const seen=new Set();return Array.isArray(rows)&&rows.length>0&&rows.every(r=>{const start=minute(r.start),finish=minute(r.end),p=Number(r.period);const ok=Number.isInteger(p)&&p>0&&p<=20&&!seen.has(p)&&Number.isFinite(start)&&finish>start&&start>=end;seen.add(p);end=finish;return ok;});}
 function currentPeriod(rows,periods,now){
  const available=rows.filter(r=>periods.includes(String(r.period)));
  const current=available.find(r=>minute(r.start)<=now&&now<minute(r.end));
  if(current)return {period:String(current.period),state:'current'};
  const next=available.find(r=>minute(r.start)>now);
  return next?{period:String(next.period),state:'next'}:null;
 }
 function timerRemaining(timer,now){return timer.state==='running'?Math.max(0,timer.deadline-now):Math.max(0,timer.remaining);}
 function timerAction(timer,action,now,duration){
  const t={...timer};
  if(action==='preset')return {duration,remaining:duration,deadline:null,state:'idle'};
  if(action==='start'&&t.state!=='running'){t.remaining=t.state==='finished'?t.duration:t.remaining;t.deadline=now+t.remaining;t.state='running';}
  if(action==='pause'&&t.state==='running'){t.remaining=timerRemaining(t,now);t.deadline=null;t.state=t.remaining?'paused':'finished';}
  if(action==='restart'){t.remaining=t.duration;t.deadline=now+t.duration;t.state='running';}
  if(action==='dismiss'&&t.state==='finished'){t.remaining=t.duration;t.deadline=null;t.state='idle';}
  if(action==='reset'){t.remaining=t.duration;t.deadline=null;t.state='idle';}
  if(action==='tick'&&t.state==='running'&&timerRemaining(t,now)===0){t.remaining=0;t.deadline=null;t.state='finished';}
  return t;
 }
 const api={previousDay,daysUntil,nearestEvents,minute,validSchedule,currentPeriod,timerRemaining,timerAction};
 if(typeof module!=='undefined')module.exports=api;else root.ExtrasCore=api;
})(globalThis);
