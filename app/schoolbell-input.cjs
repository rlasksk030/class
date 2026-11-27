'use strict';
// Trusted input for the background Schoolbell window, sent through the DevTools protocol of the
// app's own webContents. The service ignores a scripted button.click() on 보내기; a protocol mouse
// event is a real (isTrusted) click and needs neither window focus nor a visible window.
// Only this app's page is touched: no cookies, tokens, network interception or private API.
async function attach(wc){
 const dbg=wc.debugger,state={nativeDialog:null};
 if(!dbg.isAttached())dbg.attach('1.3');
 // The window has dialogs disabled, so a native confirm()/alert() returns at once without a box.
 // We only remember that one was attempted; the caller then stops instead of guessing.
 const onMessage=(_event,method,params)=>{if(method==='Page.javascriptDialogOpening')state.nativeDialog={type:String(params?.type||'')};};
 dbg.on('message',onMessage);
 await dbg.sendCommand('Page.enable');
 // The page behaves as focused (focus events, caret) although the window never takes OS focus.
 await dbg.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
 return {
  async click(x,y){
   const at={x:Math.round(x),y:Math.round(y)},button={...at,button:'left',clickCount:1};
   await dbg.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',...at});
   // A failure after the button went down may still have clicked: tell the caller.
   try{
    await dbg.sendCommand('Input.dispatchMouseEvent',{type:'mousePressed',...button});
    await dbg.sendCommand('Input.dispatchMouseEvent',{type:'mouseReleased',...button});
   }catch(error){error.pressed=true;throw error;}
  },
  nativeDialog:()=>state.nativeDialog,
  detach(){dbg.removeListener('message',onMessage);try{if(dbg.isAttached())dbg.detach();}catch{}}
 };
}
module.exports={attach};
