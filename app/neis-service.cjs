const {app,ipcMain,safeStorage,shell}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const profile=require('./school-profile.cjs'),schools=require('./school.js');
const portal='https://open.neis.go.kr', application=portal+'/portal/guide/actKeyPage.do';
function setup(main,canSwitch){
 const state=profile.get(),file=path.join(state.root,'neis-key.bin');
 const allowed=e=>e.sender===main()?.webContents&&e.senderFrame===e.sender.mainFrame;
 const secure=()=>safeStorage.isEncryptionAvailable()&&!(process.platform==='linux'&&safeStorage.getSelectedStorageBackend()==='basic_text');
 const key=()=>fs.existsSync(file)?safeStorage.decryptString(fs.readFileSync(file)):'';
 function store(value){
  if(typeof value!=='string'||!value.trim()||value.length>256)throw Error('인증키를 확인해 주세요.');
  if(!secure())throw Error('이 PC의 암호화 저장소를 사용할 수 없습니다.');
  profile.atomic(file,safeStorage.encryptString(value.trim()));
 }
 async function get(url,candidate){
  const u=new URL(url);
  if(u.origin!==portal||!/^\/hub\/(schoolInfo|classInfo|elsTimetable|mealServiceDietInfo)$/.test(u.pathname))throw Error('NEIS 주소 오류');
  u.searchParams.delete('KEY');
  const secret=candidate??key();if(secret)u.searchParams.set('KEY',secret);
  try{const r=await fetch(u,{signal:AbortSignal.timeout(15000),redirect:'error'});if(!r.ok)throw Error();return await r.json();}catch{throw Error('NEIS에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.');}
 }
 function handle(name,fn){ipcMain.handle(name,(e,...args)=>{if(!allowed(e))throw Error('접근 불가');return fn(...args);});}
 ipcMain.on('school:context',e=>{e.returnValue=allowed(e)?{active:state.config.active,schools:state.config.schools,hasKey:fs.existsSync(file)}:null;});
 handle('school:portal',type=>shell.openExternal(type==='apply'?application:portal));
 handle('school:migrate-key',value=>{if(!fs.existsSync(file))store(value);return true;});
 handle('school:test-key',async value=>{
  if(typeof value!=='string'||!value.trim()||value.trim().toLowerCase()==='sample'||value.length>256)throw Error('발급받은 개인 인증키를 입력해 주세요.');
  const data=await get(portal+'/hub/schoolInfo?Type=json&pSize=1&SD_SCHUL_CODE='+schools.legacy.SD_SCHUL_CODE,value.trim());
  if(!data.schoolInfo?.some(p=>p.row?.some(r=>r.SD_SCHUL_CODE===schools.legacy.SD_SCHUL_CODE)))throw Error('인증키가 승인되지 않았습니다. 발급 내역과 입력값을 확인해 주세요.');
  store(value);return true;
 });
 let switching=false;
 handle('school:select',async({school,grade,classroom,legacy})=>{
  if(switching||!canSwitch())throw Error('진행 중인 작업이 끝난 뒤 학교를 변경해 주세요.');
  state.hasLegacy=!!legacy;
  const changed=profile.select(school,grade,classroom);
  if(changed){
   switching=true;main().webContents.session.flushStorageData();
   // Start with the target partition only after the previous process and all its windows close.
   app.relaunch();setImmediate(()=>app.quit());
  }
  return {changed,active:state.config.active};
 });
 return {get};
}
module.exports={setup};
