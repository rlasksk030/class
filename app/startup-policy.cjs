const path=require('node:path').win32;
const NAME='classroom-dashboard';
const same=(a,b)=>path.normalize(a||'').toLowerCase()===path.normalize(b||'').toLowerCase();
function command(value){const m=String(value||'').trim().match(/^(?:"([^"]+\.exe)"|([^"\s]+\.exe))(?:\s+(.*))?$/i);return m?{path:m[1]||m[2],args:m[3]||''}:null;}
function latest(candidates,current,programFiles){
 const parts=v=>String(v).split('.').map(Number);
 return [...candidates].sort((a,b)=>{const av=parts(a.version),bv=parts(b.version);for(let i=0;i<3;i++){const d=(bv[i]||0)-(av[i]||0);if(d)return d;}const rank=p=>same(p,programFiles)?2:same(p,current)?1:0;return rank(b.path)-rank(a.path);})[0]?.path||current;
}
function plan(entries,target,enabled,explicit=false){
 const owned=entries.filter(e=>e.owned),canonical=entries.find(e=>e.scope==='user'&&e.kind==='run'&&e.name===NAME);
 if(canonical&&!canonical.owned)throw Error('자동 실행 이름이 다른 프로그램에 사용되어 변경하지 않았습니다.');
 // Windows Settings/Task Manager OFF is a user choice too; do not undo it on launch.
 if(!explicit&&enabled&&((canonical&&canonical.enabled===false)||(!canonical&&owned.length&&owned.every(e=>e.enabled===false))))enabled=false;
 const machine=owned.filter(e=>e.scope==='machine'&&e.enabled!==false);
 if(machine.length){
  if(enabled&&machine.length===1&&same(machine[0].path,target)&&!machine[0].args)return {enabled,register:false,remove:owned.filter(e=>e.scope==='user'),warning:''};
  if(explicit&&!enabled)throw Error('전체 사용자 자동 실행 항목이 있어 관리자 확인이 필요합니다. 해당 항목은 변경하지 않았습니다.');
  return {enabled,register:false,remove:[],warning:'전체 사용자 자동 실행 항목이 있습니다. 관리자 확인이 필요하며 자동으로 변경하지 않았습니다.'};
 }
 const keep=enabled&&canonical&&canonical.enabled!==false&&same(canonical.path,target)&&!canonical.args;
 return {enabled,register:enabled&&!keep,remove:owned.filter(e=>e.scope==='user'&&!(keep&&e===canonical)),warning:''};
}
module.exports={NAME,same,command,latest,plan};
