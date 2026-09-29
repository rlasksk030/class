// Settings backup file: user-made data only. Caches, location and every login credential stay out.
(function(root){
 const FORMAT='classroom-dashboard-backup',SCHEMA_VERSION=1,MAX_BYTES=20*1024*1024;
 // Allowlist of localStorage keys written by the dashboard. Anything not listed is never exported or restored.
 const KEYS=['settings','classRosters','randomPicker','randomPickerSession','morningDefault','morningHistory','boardTitles','notes','ddayEvents','overrides','boardSizes','boardPreferences','dashboardLocked','dashboardPipOptions','periodSchedule','periodHighlightEnabled','classTimer','timerSound','whiteboardContents','activityCompletion','diaryDrafts'];
 const SETTINGS_FIELDS=['grade','classroom','locationMode','manual'];
 const isObject=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
 // Keys whose stored value must be a plain object (others may be strings, booleans or arrays).
 const OBJECT_KEYS=new Set(['settings','classRosters','randomPicker','randomPickerSession','morningHistory','boardTitles','notes','overrides','boardSizes','boardPreferences','dashboardPipOptions','classTimer','whiteboardContents','activityCompletion','diaryDrafts']);
 const INVALID='이 파일은 사용할 수 있는 학급 대시보드 백업 파일이 아닙니다.';

 function sanitize(key,value){
  if(key==='settings'){const s={};for(const f of SETTINGS_FIELDS)if(value[f]!==undefined)s[f]=value[f];return s;}
  // A running timer is restored as a stopped timer with the same length, so it never rings on restore.
  if(key==='classTimer'){const d=Number(value.duration);return Number.isFinite(d)&&d>0?{duration:d,remaining:d,deadline:null,state:'idle'}:undefined;}
  return value;
 }
 function valid(key,value){
  if(value===undefined)return false;
  if(OBJECT_KEYS.has(key))return isObject(value);
  if(key==='morningDefault')return typeof value==='string';
  if(key==='ddayEvents'||key==='periodSchedule')return Array.isArray(value);
  if(key==='dashboardLocked'||key==='periodHighlightEnabled'||key==='timerSound')return typeof value==='boolean';
  return false;
 }
 // Order-independent JSON so the checksum does not depend on how a file was re-saved.
 function canonical(value){
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(isObject(value))return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  return JSON.stringify(value);
 }
 async function checksum(data){
  const bytes=new TextEncoder().encode(canonical(data));
  const digest=await root.crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 }
 function collect(getItem){
  const data={};
  for(const key of KEYS){
   const raw=getItem(key);if(raw==null)continue;
   let value;try{value=JSON.parse(raw);}catch{continue;}
   if(value===null||!valid(key,value))continue;
   value=sanitize(key,value);if(valid(key,value))data[key]=value;
  }
  return data;
 }
 async function create(getItem,meta={}){
  const data=collect(getItem);
  return {format:FORMAT,schemaVersion:SCHEMA_VERSION,appVersion:String(meta.appVersion||''),createdAt:(meta.now||new Date()).toISOString(),school:meta.school||'',academicYear:meta.academicYear||'',grade:String(data.settings?.grade||''),classroom:String(data.settings?.classroom||''),keys:Object.keys(data),checksum:await checksum(data),data};
 }
 // Future schema versions add a step here; older files are upgraded one version at a time.
 const MIGRATIONS={};
 function migrate(backup){
  let b=backup;
  while(b.schemaVersion<SCHEMA_VERSION){const step=MIGRATIONS[b.schemaVersion];if(!step)throw Error(INVALID);b=step(b);}
  return b;
 }
 async function parse(text){
  if(typeof text!=='string'||!text.trim()||text.length>MAX_BYTES)throw Error(INVALID);
  let backup;try{backup=JSON.parse(text);}catch{throw Error(INVALID);}
  if(!isObject(backup)||backup.format!==FORMAT||!Number.isInteger(backup.schemaVersion)||backup.schemaVersion<1||!isObject(backup.data))throw Error(INVALID);
  if(backup.schemaVersion>SCHEMA_VERSION)throw Error('더 새로운 버전의 앱에서 만든 백업입니다. 앱을 업데이트한 뒤 복원해 주세요.');
  if(typeof backup.checksum!=='string'||backup.checksum!==await checksum(backup.data))throw Error('백업 파일이 손상되었거나 내용이 변경되었습니다. 복원하지 않았습니다.');
  backup=migrate(backup);
  const entries=[];
  for(const [key,value]of Object.entries(backup.data)){
   if(!KEYS.includes(key))continue;
   const clean=valid(key,value)?sanitize(key,value):undefined;
   if(!valid(key,clean))throw Error(INVALID);
   entries.push([key,JSON.stringify(clean)]);
  }
  if(!entries.length)throw Error(INVALID);
  return {backup,entries};
 }
 // All-or-nothing write: on any failure every touched key is put back exactly as it was.
 function apply(storage,entries){
  const previous=entries.map(([key])=>[key,storage.getItem(key)]);
  // Settings are merged: fields that are never backed up (e.g. an API key) stay as they are on this PC.
  const merged=entries.map(([key,value])=>{
   if(key!=='settings')return [key,value];
   let current={};try{current=JSON.parse(storage.getItem('settings'))||{};}catch{}
   return [key,JSON.stringify({...(isObject(current)?current:{}),...JSON.parse(value)})];
  });
  try{for(const [key,value]of merged)storage.setItem(key,value);}
  catch(error){for(const [key,value]of previous){try{if(value===null)storage.removeItem(key);else storage.setItem(key,value);}catch{}}throw error;}
  return previous;
 }
 function fileName(date=new Date(),school='옥구초'){
  const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(date);
  return `${school}_학급대시보드_백업_${day}.json`;
 }
 const api={FORMAT,SCHEMA_VERSION,KEYS,INVALID,collect,create,parse,apply,fileName,checksum};
 if(typeof module!=='undefined')module.exports=api;else root.BackupCore=api;
})(globalThis);
