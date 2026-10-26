const {app,ipcMain,nativeImage}=require('electron');
const {createStore,MAX_FILE}=require('./media-store.cjs');
const decode=b=>{const image=nativeImage.createFromBuffer(b);return image.isEmpty()?null:image.getSize();};
let store;
const current=()=>store||(store=createStore(app.getPath('userData'),decode));
function setup(getMain){
 const trusted=e=>e.sender===getMain()?.webContents;
 ipcMain.handle('media:add',async(e,{bytes,name}={})=>{if(!trusted(e)||!(bytes instanceof Uint8Array)||bytes.byteLength>MAX_FILE)throw Error('사진 요청을 확인해 주세요.');return current().add(bytes,name);});
 ipcMain.handle('media:read',async(e,ref)=>{if(!trusted(e))throw Error('접근 불가');return new Uint8Array(await current().read(ref));});
 ipcMain.handle('media:restore',async(e,p)=>{if(!trusted(e))throw Error('접근 불가');return current().restore(p?.data,p?.media);});
}
module.exports={setup,current,decode,fromFolder:root=>createStore(root,decode)};
