const {app,BrowserWindow,ipcMain}=require('electron');
const path=require('node:path');
const {execFile}=require('node:child_process');
// Pin the existing profile name across application and installer versions.
app.setPath('userData',require('./build-identity.cjs').userData(app.getPath('appData'),process.env.CLASSROOM_TEST_PROFILE));
const primary=app.requestSingleInstanceLock();
let mainWindow,desktopFeatures,neis;
const profiles=require('./school-profile.cjs');
if(!primary){app.quit();}else{
try{profiles.initialize(app.getPath('userData'));}catch(error){
 require('electron').dialog.showErrorBox('학교 데이터 준비 실패','기존 데이터를 열기 전에 중단했습니다. 저장 공간과 폴더 접근 권한을 확인해 주세요.\n'+error.message);
 app.exit(1);throw error;
}
app.on('second-instance',()=>desktopFeatures?.focusMain());
const allowed=new Set(['open.neis.go.kr','api.open-meteo.com','air-quality-api.open-meteo.com','nominatim.openstreetmap.org']);
ipcMain.handle('fetch',async(e,url)=>{if(e.sender!==mainWindow?.webContents||e.senderFrame!==e.sender.mainFrame)throw Error('접근 불가');const u=new URL(url);if(u.origin==='https://open.neis.go.kr')return neis.get(url);if(u.protocol!=='https:'||!allowed.has(u.hostname))throw Error('허용되지 않은 주소');const r=await fetch(u,{signal:AbortSignal.timeout(15000),headers:{'User-Agent':'ClassroomDashboard/1.0'},redirect:'error'});if(!r.ok)throw Error('서버 응답 오류');return r.json();});
ipcMain.handle('location',()=>new Promise(resolve=>{
 if(process.platform!=='win32')return resolve(null);
 const script="Add-Type -AssemblyName System.Device; $w=New-Object System.Device.Location.GeoCoordinateWatcher; $w.TryStart($true,[TimeSpan]::FromSeconds(8)) | Out-Null; $p=$w.Position.Location; if(!$p.IsUnknown){ @{lat=$p.Latitude;lon=$p.Longitude}|ConvertTo-Json -Compress }; $w.Stop()";
 execFile('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{timeout:12000,windowsHide:true},(e,out)=>{try{resolve(e?null:JSON.parse(out));}catch{resolve(null);}});
}));
app.whenReady().then(()=>{const w=mainWindow=new BrowserWindow({width:1440,height:960,minWidth:900,minHeight:650,show:!process.env.CLASSROOM_TEST_HIDDEN,backgroundColor:'#ffffff',webPreferences:{partition:profiles.get().partition,preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});desktopFeatures=require('./desktop-features.cjs')(()=>mainWindow);w.removeMenu();if(require('./build-identity.cjs').validation){w.on('page-title-updated',event=>{event.preventDefault();w.setTitle('우리 교실 검증용 · 정식 배포 아님');});}w.webContents.setWindowOpenHandler(()=>({action:'deny'}));w.webContents.on('will-navigate',e=>e.preventDefault());w.on('closed',()=>{desktopFeatures.close();mainWindow=null;app.quit();});const updateIdle=require('./updates.cjs')(()=>mainWindow);const hiclassIdle=require('./hiclass.cjs')(()=>mainWindow);const schoolbellIdle=require('./schoolbell.cjs')(()=>mainWindow);neis=require('./neis-service.cjs').setup(()=>mainWindow,()=>hiclassIdle()&&schoolbellIdle()&&(!updateIdle||updateIdle()));require('./media.cjs').setup(()=>mainWindow);require('./backup.cjs')(()=>mainWindow);require('./recovery.cjs')(()=>mainWindow);require('./install-check.cjs')(()=>mainWindow);w.webContents.once('did-finish-load',async()=>{if(process.env.CLASSROOM_UPDATE_HEALTH_FILE&&process.env.CLASSROOM_UPDATE_EXPECTED_VERSION===app.getVersion()){try{const healthy=await w.webContents.executeJavaScript('Boolean(window.classroomTools && window.desktop && document.getElementById("activityTab"))');if(healthy)require('node:fs').writeFileSync(process.env.CLASSROOM_UPDATE_HEALTH_FILE,app.getVersion());}catch{}}});w.loadFile(path.join(__dirname,'index.html'));});
app.on('window-all-closed',()=>app.quit());
}

