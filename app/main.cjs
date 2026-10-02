const {app,BrowserWindow,ipcMain}=require('electron');
const path=require('node:path');
const {execFile}=require('node:child_process');
// Pin the existing profile name across application and installer versions.
app.setPath('userData',process.env.CLASSROOM_TEST_PROFILE||path.join(app.getPath('appData'),'classroom-dashboard'));
const primary=app.requestSingleInstanceLock();
let mainWindow,desktopFeatures;
if(!primary){app.quit();}else{
app.on('second-instance',()=>desktopFeatures?.focusMain());
const allowed=new Set(['open.neis.go.kr','api.open-meteo.com','air-quality-api.open-meteo.com','nominatim.openstreetmap.org']);
ipcMain.handle('fetch',async(_,url)=>{const u=new URL(url);if(u.protocol!=='https:'||!allowed.has(u.hostname))throw Error('허용되지 않은 주소');const r=await fetch(u,{signal:AbortSignal.timeout(15000),headers:{'User-Agent':'ClassroomDashboard/1.0'},redirect:'error'});if(!r.ok)throw Error('서버 응답 오류');return r.json();});
ipcMain.handle('location',()=>new Promise(resolve=>{
 if(process.platform!=='win32')return resolve(null);
 const script="Add-Type -AssemblyName System.Device; $w=New-Object System.Device.Location.GeoCoordinateWatcher; $w.TryStart($true,[TimeSpan]::FromSeconds(8)) | Out-Null; $p=$w.Position.Location; if(!$p.IsUnknown){ @{lat=$p.Latitude;lon=$p.Longitude}|ConvertTo-Json -Compress }; $w.Stop()";
 execFile('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{timeout:12000,windowsHide:true},(e,out)=>{try{resolve(e?null:JSON.parse(out));}catch{resolve(null);}});
}));
app.whenReady().then(()=>{const w=mainWindow=new BrowserWindow({width:1440,height:960,minWidth:900,minHeight:650,show:!process.env.CLASSROOM_TEST_HIDDEN,backgroundColor:'#ffffff',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});desktopFeatures=require('./desktop-features.cjs')(()=>mainWindow);w.removeMenu();w.webContents.setWindowOpenHandler(()=>({action:'deny'}));w.webContents.on('will-navigate',e=>e.preventDefault());w.on('closed',()=>{desktopFeatures.close();mainWindow=null;app.quit();});require('./updates.cjs')(()=>mainWindow);require('./hiclass.cjs')(()=>mainWindow);require('./backup.cjs')(()=>mainWindow);require('./recovery.cjs')(()=>mainWindow);require('./install-check.cjs')(()=>mainWindow);w.webContents.once('did-finish-load',async()=>{if(process.env.CLASSROOM_UPDATE_HEALTH_FILE&&process.env.CLASSROOM_UPDATE_EXPECTED_VERSION===app.getVersion()){try{const healthy=await w.webContents.executeJavaScript('Boolean(window.classroomTools && window.desktop && document.getElementById("activityTab"))');if(healthy)require('node:fs').writeFileSync(process.env.CLASSROOM_UPDATE_HEALTH_FILE,app.getVersion());}catch{}}});w.loadFile(path.join(__dirname,'index.html'));});
app.on('window-all-closed',()=>app.quit());
}

