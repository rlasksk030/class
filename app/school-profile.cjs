const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const schools=require('./school.js');
const legacyId=schools.id(schools.legacy);
let current;
function atomic(file,data){
 const tmp=file+'.'+crypto.randomUUID()+'.tmp';
 fs.writeFileSync(tmp,data,{mode:0o600,flag:'wx'});
 try{fs.renameSync(tmp,file);}finally{fs.rmSync(tmp,{force:true});}
}
// Snapshot before Chromium opens LevelDB or HiClass opens the old session.
// A complete directory is committed with one rename. Interrupted copies are never used.
function preserve(root){
 const dest=path.join(root,'migration-v187');
 if(fs.existsSync(path.join(dest,'complete.json')))return;
 const tmp=fs.mkdtempSync(path.join(root,'.migration-v187-'));
 const entries=['Local State','Local Storage','IndexedDB','Session Storage','Network','Cookies','Cookies-journal','Preferences','Partitions/hiclass-teacher','media','hiclass-links.json','desktop-settings.json','backups'];
 try{
  const copied=[];
  for(const name of entries){
   const src=path.join(root,name);
   if(!fs.existsSync(src))continue;
   const target=path.join(tmp,name);fs.mkdirSync(path.dirname(target),{recursive:true});
   fs.cpSync(src,target,{recursive:true,filter:p=>!['LOCK','SingletonLock','Cache','Code Cache','GPUCache'].includes(path.basename(p))});
   copied.push(name);
  }
  fs.writeFileSync(path.join(tmp,'complete.json'),JSON.stringify({school:legacyId,copied}),{mode:0o600});
  fs.renameSync(tmp,dest);
 }catch(error){fs.rmSync(tmp,{recursive:true,force:true});throw error;}
}
function initialize(root){
 fs.mkdirSync(root,{recursive:true});
 preserve(root);
 const file=path.join(root,'school-profile.json');
 let config={schools:[],active:null};
 if(fs.existsSync(file)){
  config=JSON.parse(fs.readFileSync(file,'utf8'));
  if(!Array.isArray(config.schools)||!config.active||!config.schools.some(s=>schools.id(s)===schools.id(config.active.school)))throw Error('학교 설정 파일을 확인해 주세요.');
 }
 const id=config.active?schools.id(config.active.school):legacyId;
 const dir=id===legacyId?root:path.join(root,'schools',id);
 fs.mkdirSync(dir,{recursive:true});
 current={root,dir,file,id,config,partition:id===legacyId?undefined:'persist:class-'+id.toLowerCase(),hiclassPartition:id===legacyId?'persist:hiclass-teacher':'persist:hiclass-'+id.toLowerCase()};
 return current;
}
function select(row,grade,classroom){
 const school=schools.normalize(row),id=schools.id(school);
 if(!/^[1-6]$/.test(grade)||typeof classroom!=='string'||!/^([가-힣a-zA-Z0-9][가-힣a-zA-Z0-9 -]{0,23})$/.test(classroom)||classroom.trim()!==classroom)throw Error('학년과 반을 확인해 주세요.');
 const seen=new Map(current.config.schools.map(s=>[schools.id(s),s]));
 if(current.id===legacyId&&current.hasLegacy)seen.set(legacyId,schools.legacy);
 seen.set(id,school);
 const config={active:{school,grade,classroom,revision:crypto.randomUUID()},schools:[...seen.values()]};
 atomic(current.file,JSON.stringify(config));current.config=config;
 return id!==current.id;
}
module.exports={initialize,select,get:()=>current,preserve,atomic};
