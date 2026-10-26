// Manual local preview with synthetic data. Never uses the installed app's profile or a real HiClass session.
const path=require('node:path'),{_electron}=require('playwright-core');
const root=path.resolve(__dirname,'..'),profile=process.env.CLASSROOM_PHOTO_PREVIEW_PROFILE||path.join(root,'tests/e2e/.out/profile-photo-preview');
(async()=>{
 const app=await _electron.launch({executablePath:require('electron'),args:[path.join(root,'app')],env:{...process.env,CLASSROOM_TEST_PROFILE:profile}});
 const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
 const refs=await app.evaluate(async({ipcMain,nativeImage,BrowserWindow},root)=>{
  const message='로컬 확인 화면입니다. 실제 하이클래스 연결·발송은 하지 않습니다.';
  for(const name of ['fetch','diary:status','diary:session','diary:connect','diary:link','diary:publish'])ipcMain.removeHandler(name);
  ipcMain.handle('fetch',()=>{throw Error('offline preview');});ipcMain.handle('diary:status',()=>({linked:false}));ipcMain.handle('diary:session',()=>({status:'none'}));
  for(const name of ['diary:connect','diary:link','diary:publish'])ipcMain.handle(name,()=>({status:'error',message}));
  BrowserWindow.getAllWindows()[0].setTitle('우리 교실 · 사진·글씨 확인 (격리 데이터 / 실제 발송 없음)');
  const store=process.mainModule.require(root+'/app/media.cjs').current(),refs=[];
  for(const value of [90,190]){const b=Buffer.alloc(600*400*4);for(let i=0;i<b.length;i+=4){b[i]=value;b[i+1]=155;b[i+2]=230-value;b[i+3]=255;}refs.push(await store.add(nativeImage.createFromBitmap(b,{width:600,height:400}).toPNG(),'예시-'+value+'.png'));}return refs;
 },root);
 await page.evaluate(refs=>{if(localStorage.getItem('photoPreviewInitialized'))return;localStorage.setItem('settings',JSON.stringify({grade:'6',classroom:'1'}));localStorage.setItem('dashboardLocked','false');const date=Core.dateKey();localStorage.setItem('diaryDrafts',JSON.stringify({[academicYear()+':6:1:'+date]:{title:'사진 붙여넣기와 글씨 크기 확인',body:'이 화면은 가상 자료를 사용한 로컬 확인 화면입니다.\n사진을 붙여넣고 위의 글씨 크기 버튼을 눌러 보세요.\n실제 하이클래스에 게시되지 않습니다.',photos:refs,parents:true,students:true}}));localStorage.setItem('whiteboardContents',JSON.stringify({fontSize:36,strokes:[],blocks:refs.map((photo,i)=>({id:'preview-photo-'+i,type:'image',photo,x:.08+i*.34,y:.15+i*.18,width:.3,text:'',fontSize:36}))}));localStorage.setItem('photoPreviewInitialized','true');},refs);
 await page.reload();await page.click('#diaryTab');console.log('Preview ready; isolated data: '+profile);console.log('Close the app window to finish.');await new Promise(resolve=>app.on('close',resolve));
})().catch(e=>{console.error(e);process.exitCode=1;});
