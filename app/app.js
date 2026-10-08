const $=id=>document.getElementById(id);
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const put=(key,value)=>{if(window.dashboardRestoring)return false;try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{$('globalStatus').textContent='저장 공간을 확인해 주세요. 이번 변경은 재실행 후 유지되지 않을 수 있습니다.';return false;}};
let settings=read('settings',{}),cache=read('cache',{}),overrides=read('overrides',{}),notes=read('notes',{}),day=Core.dateKey(),generation=0,schools=[],chosenSchool=null,editing=null;
settings.school=OKGU_SCHOOL;
let morningText=Core.morningDefault(read('morningDefault',null),notes,day);
put('morningDefault',morningText);
const errors={};
const request=url=>window.desktop?window.desktop.fetch(url):fetch(url,{signal:AbortSignal.timeout(15000)}).then(r=>{if(!r.ok)throw Error('연결 실패');return r.json();});
async function neis(endpoint,params,s=settings){
 const get=async extra=>{const url=new URL('https://open.neis.go.kr/hub/'+endpoint);url.search=new URLSearchParams({...(s.apiKey?{KEY:s.apiKey}:{}),Type:'json',pIndex:'1',pSize:'1000',...params,...extra,ATPT_OFCDC_SC_CODE:OKGU_SCHOOL.ATPT_OFCDC_SC_CODE,SD_SCHUL_CODE:OKGU_SCHOOL.SD_SCHUL_CODE});const json=await request(url.href);return {data:Core.rows(json,endpoint),total:json[endpoint]?.find(x=>x.head)?.head?.find(x=>x.list_total_count!==undefined)?.list_total_count||0};};
 const first=await get({});
 if(endpoint==='classInfo'&&first.total>first.data.length)throw Error('학급 목록 일부만 조회되었습니다');
 // The public response is capped at five rows. Query missing periods explicitly;
 // never replace a complete cache with a truncated or partially failed response.
 if(endpoint==='elsTimetable'&&first.total>first.data.length){
  const map=new Map(first.data.map(r=>[r.PERIO,r]));
  for(let p=1;p<=12&&map.size<first.total;p++){if(map.has(String(p)))continue;const next=await get({PERIO:String(p)});for(const r of next.data)map.set(r.PERIO,r);}
  if(map.size<first.total)throw Error('시간표 일부 정보를 확인하지 못했습니다');return [...map.values()];
 }
 return first.data;
}
function textLine(parent,text,cls){const el=document.createElement('div');el.textContent=text;if(cls)el.className=cls;parent.append(el);return el;}
let fitFrame;
function fitContents(){
 cancelAnimationFrame(fitFrame);
 fitFrame=requestAnimationFrame(()=>{
  for(const id of ['morning','notices','meal','timetable']){
   const el=$(id),max=(Number(getComputedStyle(el).getPropertyValue('--max-font'))||32)*(window.boardFontScales?.[id]||1);
   // Measure real wrapping and available height after headers/status labels.
   let low=1,high=max;
   for(let i=0;i<12;i++){
    const size=(low+high)/2;el.style.fontSize=size+'px';
    if(el.scrollHeight<=el.clientHeight+1&&el.scrollWidth<=el.clientWidth+1)low=size;else high=size;
   }
   el.style.fontSize=Math.floor(low*10)/10+'px';
  }
 });
}
new ResizeObserver(fitContents).observe(document.querySelector('main'));
document.fonts.ready.then(fitContents);
function render(){
 fitContents();
 $('classTitle').textContent=settings.school?`${settings.school.SCHUL_NM} ${settings.grade}학년 ${settings.classroom}반`:'우리 교실';
 $('morning').textContent=morningText||'아침활동을 저장하면 매일 자동으로 표시됩니다.';
 $('notices').textContent=notes[day]?.notices||'';
 for(const kind of ['timetable','meal']){const el=$(kind);el.replaceChildren();if(!settings.school){textLine(el,'설정에서 학교를 선택해 주세요.','empty');continue;}const key=Core.dataKey(settings,day,kind),entry=cache[key],value=Core.display(overrides[key],entry);
 if(value===undefined)textLine(el,errors[kind]||'오늘 정보를 불러오고 있습니다.','empty');else if(!value.length)textLine(el,kind==='meal'?'오늘은 급식이 없습니다.':'오늘은 등록된 수업이 없습니다.','empty');else if(kind==='meal')el.textContent=value.join('\n');else value.forEach((v,i)=>{const row=textLine(el,'','lesson');const n=document.createElement('b');n.textContent=v.period||i+1;row.append(n);const sub=document.createElement('span');sub.textContent=v.subject;row.append(sub);});
 $(kind+'Status').textContent=overrides[key]!==undefined?'직접 수정한 오늘의 정보':entry?`${errors[kind]?'연결 실패 · 저장된 정보':'자동 조회'} · ${new Date(entry.time).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}`:'';
 }
}
async function refreshSchool(){if(!settings.grade||!settings.classroom)return;const s=structuredClone(settings),d=day,g=generation;
 const endpoints={'초등학교':'elsTimetable','중학교':'misTimetable','고등학교':'hisTimetable','특수학교':'spsTimetable'};
 await Promise.allSettled(['timetable','meal'].map(async kind=>{try{const ep=kind==='meal'?'mealServiceDietInfo':endpoints[s.school.SCHUL_KND_SC_NM];if(!ep)throw Error('지원하지 않는 학교 종류입니다');const params={ATPT_OFCDC_SC_CODE:s.school.ATPT_OFCDC_SC_CODE,SD_SCHUL_CODE:s.school.SD_SCHUL_CODE,...(kind==='meal'?{MLSV_YMD:d.replaceAll('-',''),MMEAL_SC_CODE:'2'}:{ALL_TI_YMD:d.replaceAll('-',''),GRADE:s.grade,CLASS_NM:s.classroom})};const rows=await neis(ep,params,s);const data=kind==='meal'?rows.flatMap(r=>String(r.DDISH_NM??'').split(/<br\s*\/?\s*>/i).map(x=>x.replace(/<[^>]*>/g,'').trim()).filter(Boolean)):rows.sort((a,b)=>Number(a.PERIO)-Number(b.PERIO)).filter(r=>r.PERIO!=null).map(r=>({period:String(r.PERIO),subject:String(r.ITRT_CNTNT??'').trim()}));cache[Core.dataKey(s,d,kind)]={data,time:Date.now()};pruneCache();put('cache',cache);if(g===generation){delete errors[kind];render();}}catch(e){if(g===generation){errors[kind]=`${kind==='meal'?'급식':'시간표'} 정보를 불러오지 못했습니다. 연결되면 자동으로 다시 확인합니다.`;render();}}}));
}
function pruneCache(){const cutoff=Date.now()-35*86400000;for(const k of Object.keys(cache))if(cache[k].time<cutoff)delete cache[k];}
function validPoint(p){return p&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Math.abs(p.lat)<=90&&Math.abs(p.lon)<=180;}
async function locationFor(s){if(s.locationMode==='manual')return {...s.manual,source:'설정한 위치'};
 let p=null;try{if(window.desktop)p=await window.desktop.location();else if(navigator.geolocation){const permission=await navigator.permissions.query({name:'geolocation'});if(permission.state==='granted'||(permission.state==='prompt'&&!read('locationAsked',false))){put('locationAsked',true);p=await new Promise(resolve=>navigator.geolocation.getCurrentPosition(x=>resolve({lat:x.coords.latitude,lon:x.coords.longitude}),()=>resolve(null),{timeout:8000,maximumAge:1800000}));}}}catch{}
 if(validPoint(p)){put('lastLocation',p);return {...p,source:'기기 위치'};}p=read('lastLocation',null);if(validPoint(p))return {...p,source:'저장된 기기 위치'};
 if(!s.school)throw Error('학교 또는 위치 설정이 필요합니다');const key='schoolLocation:'+s.school.SD_SCHUL_CODE;p=read(key,null);if(validPoint(p))return {...p,source:'학교 소재지'};
 for(const query of [s.school.ORG_RDNMA,s.school.SCHUL_NM].filter(Boolean)){const u=new URL('https://nominatim.openstreetmap.org/search');u.search=new URLSearchParams({q:query,format:'json',countrycodes:'kr',limit:'1'});const rows=await request(u.href);if(rows[0]){p={lat:Number(rows[0].lat),lon:Number(rows[0].lon)};if(validPoint(p)){put(key,p);return {...p,source:'학교 소재지'};}}await new Promise(r=>setTimeout(r,1100));}throw Error('학교 위치를 확인하지 못했습니다');
}
const weatherLabel=c=>c===0?'맑음':c<=3?'구름 조금':c<=48?'안개':c<=67?'비':c<=77?'눈':c<=82?'소나기':c<=86?'눈':c>=95?'뇌우':'날씨';
const weatherKey=s=>s.locationMode==='manual'?`manual:${s.manual.lat}:${s.manual.lon}`:`auto:${s.school?.SD_SCHUL_CODE||'none'}`;
function showWeather(entry,failed=false){const el=$('weather');el.replaceChildren();if(!entry){textLine(el,failed?'날씨 정보를 불러오지 못했습니다':'날씨를 확인하고 있습니다','status');return;}const w=entry.data;const strong=document.createElement('strong');strong.textContent=`${weatherLabel(w.current.weather_code)} ${Math.round(w.current.temperature_2m)}°`;el.append(strong);textLine(el,`최고 ${Math.round(w.daily.temperature_2m_max[0])}° / 최저 ${Math.round(w.daily.temperature_2m_min[0])}°`);const rain=w.daily.precipitation_probability_max[0];textLine(el,`강수확률 ${rain==null?'—':rain+'%'}`);const pm=entry.pm;textLine(el,pm==null?'미세먼지 정보 없음':`미세먼지(PM10) 예측 ${Math.round(pm)} μg/m³`);textLine(el,`${entry.source} · ${new Date(entry.time).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}${failed?' · 저장된 날씨':''}`,'status');}
let weatherRun=0;
async function refreshWeather(){const run=++weatherRun,s=structuredClone(settings),key=weatherKey(s),old=read('weather:'+key,null);showWeather(old);try{const p=await locationFor(s);if(!validPoint(p))throw Error('위치 없음');const params={latitude:p.lat,longitude:p.lon,timezone:'Asia/Seoul'};const u=new URL('https://api.open-meteo.com/v1/forecast');u.search=new URLSearchParams({...params,current:'temperature_2m,weather_code',daily:'temperature_2m_max,temperature_2m_min,precipitation_probability_max',forecast_days:'1'});const data=await request(u.href);if(!data.current||!data.daily)throw Error('날씨 응답 오류');const entry={data,time:Date.now(),source:p.source,pm:null};put('weather:'+key,entry);if(run===weatherRun)showWeather(entry);try{const air=new URL('https://air-quality-api.open-meteo.com/v1/air-quality');air.search=new URLSearchParams({...params,current:'pm10'});entry.pm=(await request(air.href)).current?.pm10??null;put('weather:'+key,entry);if(run===weatherRun)showWeather(entry);}catch{}}catch{if(run===weatherRun)showWeather(old,true);}}
function tick(){const now=new Date();$('date').textContent=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',weekday:'long'}).format(now);$('clock').textContent=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}).format(now);const next=Core.dateKey(now);if(next!==day){day=next;generation++;if($('editDialog').open)$('editDialog').close();render();refreshSchool();refreshWeather();}}
let classOptionsGeneration=0,validClasses=null;
function academicYear(){const now=new Date();return String(now.getFullYear()-(now.getMonth()<2?1:0));}
function validateClassSelection(){
 const field=$('classroom');field.setCustomValidity(validClasses&&!validClasses.includes(field.value)?'해당 학년의 실제 반 목록에서 선택해 주세요.':'');return field.reportValidity();
}
async function loadClassOptions(){
 const token=++classOptionsGeneration,grade=$('grade').value,year=academicYear();validClasses=null;$('classOptions').replaceChildren();$('classroom').setCustomValidity('');
 if(!grade){$('classInfoStatus').textContent='학년을 먼저 선택해 주세요.';return;}
 const key=year+':'+grade,stored=read('schoolClasses',{});
 const show=values=>{validClasses=values; $('classOptions').replaceChildren(...values.map(value=>{const option=document.createElement('option');option.value=value;option.label=value+'반';return option;}));};
 if(stored[key]?.length)show(stored[key]);
 $('classInfoStatus').textContent='학급 목록을 확인하고 있습니다…';
 try{const rows=await neis('classInfo',{AY:year,GRADE:grade});if(token!==classOptionsGeneration)return;
 const values=[...new Set(rows.filter(r=>String(r.GRADE)===grade&&String(r.AY)===year).map(r=>String(r.CLASS_NM)))].sort((a,b)=>a.localeCompare(b,'ko',{numeric:true}));
 if(!values.length)throw Error('학급정보 없음');show(values);stored[key]=values;put('schoolClasses',stored);$('classInfoStatus').textContent=year+'학년도 '+grade+'학년: '+values.map(v=>v+'반').join(', ');
 }catch{if(token!==classOptionsGeneration)return;$('classInfoStatus').textContent=validClasses?'저장된 학급 목록을 표시합니다.':'학급 목록을 불러오지 못했습니다. 반을 직접 입력해 주세요.';}
}
$('grade').onchange=()=>{$('classroom').value='';loadClassOptions();};
$('classroom').oninput=()=>$('classroom').setCustomValidity('');
function openSettings(){if(window.dashboardLocked)return;$('grade').value=settings.grade||'';$('classroom').value=settings.classroom||'';$('settingsDialog').showModal();loadClassOptions();}
$('settings').onclick=openSettings;
$('settingsForm').onsubmit=e=>{e.preventDefault();if(window.dashboardLocked)return;if(!validateClassSelection())return;settings={...settings,school:OKGU_SCHOOL,grade:$('grade').value,classroom:$('classroom').value};put('settings',settings);generation++;delete errors.meal;delete errors.timetable;$('settingsDialog').close();render();refreshSchool();refreshWeather();};
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{if(window.dashboardLocked)return;const kind=b.dataset.edit,automatic=['meal','timetable'].includes(kind);if(automatic&&!settings.school){openSettings();return;}editing={kind,date:day,key:automatic?Core.dataKey(settings,day,kind):null};const value=automatic?Core.display(overrides[editing.key],cache[editing.key]):kind==='morning'?morningText:notes[day]?.[kind];$('editTitle').textContent=({meal:'오늘의 급식 수정',timetable:'오늘 시간표 수정',morning:'아침활동 수정',notices:'안내사항 작성'})[kind];$('editHelp').textContent=automatic?'오늘 이 교실에만 적용됩니다. 한 줄에 하나씩 입력해 주세요. 외부 원본은 변경하지 않습니다.':kind==='morning'?'저장한 내용은 매일 자동으로 표시됩니다. 수정하면 다음 날에도 변경된 내용이 표시됩니다.':'오늘의 내용을 적어 주세요.';$('editText').value=automatic?(value||[]).map(v=>kind==='timetable'?`${v.period} | ${v.subject}`:v).join('\n'):value||'';$('restore').hidden=!automatic;$('restore').textContent=kind==='meal'?'원래 급식으로 되돌리기':'원래 시간표로 되돌리기';$('editDialog').showModal();});
$('editForm').onsubmit=e=>{e.preventDefault();if(window.dashboardLocked)return;if(!editing)return;const {kind,key,date}=editing;if(key){overrides[key]=$('editText').value.split('\n').map(x=>x.trim()).filter(Boolean).map((x,i)=>{if(kind!=='timetable')return x;const m=x.match(/^(\d+)\s*\|\s*(.*)$/);return {period:m?m[1]:String(i+1),subject:m?m[2]:x};});put('overrides',overrides);}else if(kind==='morning'){morningText=$('editText').value;put('morningDefault',morningText);document.dispatchEvent(new CustomEvent('morning-saved',{detail:{date,value:morningText}}));}else{notes[date]={...notes[date],[kind]:$('editText').value};put('notes',notes);}$('editDialog').close();render();};
$('restore').onclick=()=>{if(window.dashboardLocked)return;delete overrides[editing.key];put('overrides',overrides);$('editDialog').close();render();};
$('refresh').onclick=async()=>{$('refresh').disabled=true;await Promise.allSettled([refreshSchool(),refreshWeather()]);$('refresh').disabled=false;};
$('fullscreen').onclick=()=>{if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen();};
document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick();});
tick();render();refreshSchool();refreshWeather();setInterval(tick,1000);
// A failed NEIS lookup (not an empty holiday) is retried quietly; saved data stays on screen meanwhile.
setInterval(()=>{if(errors.meal||errors.timetable)refreshSchool();},10*60*1000);window.addEventListener('online',()=>{if(errors.meal||errors.timetable)refreshSchool();});setInterval(refreshWeather,45*60*1000);if(!settings.grade||!settings.classroom)openSettings();

