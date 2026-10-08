const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('pip',{focusInput:()=>ipcRenderer.send('input:focus'),get:()=>ipcRenderer.invoke('pip:get'),command:value=>ipcRenderer.send('pip:command',value),onState:callback=>{const listener=(_,value)=>callback(value);ipcRenderer.on('pip:state',listener);return()=>ipcRenderer.removeListener('pip:state',listener);}});
