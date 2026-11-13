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
// Small DOM helpers for the refreshed design (no HTML style attributes: CSP style-src 'self').
function ucIcon(name){const el=document.createElement('span');el.className='uc-ico uc-ico--'+name;el.setAttribute('aria-hidden','true');return el;}
const EMPTY={morning:{icon:'morning-sun',message:'오늘 아침활동이 아직 없어요',sub:'한 번 저장하면 매일 자동으로 표시됩니다',button:'아침활동 작성'},notices:{icon:'notice-star',message:'오늘 안내사항이 없어요',sub:'작성하면 학생 화면에 크게 표시됩니다',button:'안내사항 작성'}};
// Empty morning/notices board: a dashed box with one write button that opens the same editor as [수정]/[작성].
function emptyState(kind){
 const e=EMPTY[kind],box=document.createElement('div');box.className='uc-empty board-empty';
 const msg=document.createElement('p');msg.className='uc-empty__msg';msg.textContent=e.message;
 const sub=document.createElement('p');sub.className='uc-empty__sub';sub.textContent=e.sub;
 const write=document.createElement('button');write.type='button';write.className='board-empty-write';write.dataset.emptyEdit=kind;
 write.append(ucIcon("plus"),document.createTextNode(e.button));
 write.onclick=()=>document.querySelector(`[data-edit="${kind}"]`)?.click();
 box.append(ucIcon(e.icon),msg,sub,write);return box;
}
// "쇠고기미역국 (5.6.13.16.)" is shown as the name with "5·6·13·16" beside it; the saved text is unchanged.
function mealItem(text){
 const m=String(text).match(/^(.*?)\s*\(\s*([0-9][0-9.,\s]*)\)\s*$/),row=document.createElement('div');row.className='meal-item';
 const name=document.createElement('span');name.className='meal-name';name.textContent=m?m[1]:text;row.append(name);
 if(m){const numbers=m[2].split(/[.,\s]+/).filter(Boolean);if(numbers.length){row.append(document.createTextNode(' '));const a=document.createElement('span');a.className='meal-allergy';a.textContent=numbers.join('·');row.append(a);}}
 return row;
}
let fitFrame;
function fitContents(){
 cancelAnimationFrame(fitFrame);
 fitFrame=requestAnimationFrame(()=>{
  for(const id of ['morning','notices']){ // timetable and meal: design.js sets their sizes
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
 // "학교 ○학년 ○반" only when all three are set (the 옥구초 app always has a school, even before
 // the class is chosen on first run); a school alone shows its name, nothing shows '우리 교실'.
 $('classTitle').textContent=!settings.school?'우리 교실':settings.grade&&settings.classroom?`${settings.school.SCHUL_NM} ${settings.grade}학년 ${settings.classroom}반`:settings.school.SCHUL_NM;
 for(const [kind,text] of [['morning',morningText],['notices',notes[day]?.notices||'']]){
  const el=$(kind),empty=!String(text||'').trim();
  el.closest('.card').classList.toggle('is-empty',empty);
  if(empty)el.replaceChildren(emptyState(kind));else el.textContent=text;
 }
 for(const kind of ['timetable','meal']){const el=$(kind);el.replaceChildren();if(!settings.school){textLine(el,'설정에서 학교를 선택해 주세요.','empty');continue;}const key=Core.dataKey(settings,day,kind),entry=cache[key],value=Core.display(overrides[key],entry);
 if(value===undefined)textLine(el,errors[kind]||'오늘 정보를 불러오고 있습니다.','empty');else if(!value.length)textLine(el,kind==='meal'?'오늘은 급식이 없습니다.':'오늘은 등록된 수업이 없습니다.','empty');else if(kind==='meal')el.replaceChildren(...value.map(mealItem));else value.forEach((v,i)=>{const row=textLine(el,'','lesson');const n=document.createElement('b');n.textContent=v.period||i+1;row.append(n);const sub=document.createElement('span');sub.textContent=v.subject;row.append(sub);});
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
// PM10 grades used in Korea: 좋음 0–30, 보통 31–80, 나쁨 81–150, 매우 나쁨 151 이상.
const dustGrade=pm=>pm<=30?['good','좋음']:pm<=80?['normal','보통']:pm<=150?['bad','나쁨']:['verybad','매우 나쁨'];
// Cloud with the sun: the sun stays yellow (--uc-sun), the cloud follows the text color.
function weatherIcon(){
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('class','weather-icon');svg.setAttribute('aria-hidden','true');
 for(const [cls,d] of [['weather-icon__sun','M9 2.5v1.5 M3.3 4.8l1.1 1.1 M1.5 10.5H3 M14.7 4.8l-1.1 1.1 M5.4 12.6a4 4 0 1 1 7.2-3.6'],['weather-icon__cloud','M17.5 20.5H8.5a4 4 0 1 1 1-7.9A5.5 5.5 0 0 1 20 14.2a3.3 3.3 0 0 1-2.5 6.3z']]){const path=document.createElementNS(ns,'path');path.setAttribute('d',d);path.setAttribute('class',cls);svg.append(path);}
 return svg;
}
function showWeather(entry,failed=false){const el=$('weather');el.replaceChildren();$('weatherSource').textContent='';if(!entry){textLine(el,failed?'날씨 정보를 불러오지 못했습니다':'날씨를 확인하고 있습니다','status');return;}const w=entry.data;
el.append(weatherIcon());
const strong=document.createElement('strong');strong.className='weather-temp';strong.textContent=`${Math.round(w.current.temperature_2m)}°`;el.append(strong);
const info=document.createElement('div');info.className='weather-info';el.append(info);
textLine(info,weatherLabel(w.current.weather_code),'weather-label');
const rain=w.daily.precipitation_probability_max[0];textLine(info,`최고 ${Math.round(w.daily.temperature_2m_max[0])}° · 최저 ${Math.round(w.daily.temperature_2m_min[0])}° · 강수 ${rain==null?'—':rain+'%'}`,'weather-range');
const pm=entry.pm,dust=document.createElement('span');
if(pm==null){dust.className='uc-dust weather-dust weather-dust--none';dust.textContent='미세먼지 정보 없음';}else{const [grade,label]=dustGrade(pm);dust.className='uc-dust weather-dust uc-dust--'+grade;dust.textContent=`미세먼지 ${label} ${Math.round(pm)}㎍/㎥`;}
info.append(dust);
const when=new Date(entry.time),at=when.toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
textLine(el,`${entry.source} · ${at}${failed?' · 저장된 날씨':''}`,'status');
$('weatherSource').textContent=`날씨 · ${entry.source} ${when.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false})} 기준${failed?'(저장된 날씨)':''} / `;}
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

