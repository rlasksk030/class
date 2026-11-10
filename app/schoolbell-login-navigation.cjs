'use strict';
// Only the service's own browser OAuth flow. No token exchange, API client,
// cookie access or authentication query storage. Board URL rules stay strict.
const {safeURL}=require('./diary-services.cjs');
// authn is the actual 2026-11-09 redirect from the authorization endpoint.
const AUTH=new Set(['https://auth.whalespace.io','https://authn.whalespace.io','https://account.whalespace.io','https://auth.worksmobile.com']);
const SCHOOL=new Set(['https://schoolbell-e.com','https://www.schoolbell-e.com','https://v4.schoolbell-e.com']);
function parse(value){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port)throw Error('Unsafe login navigation');return u;}
function createLoginNavigation(){
 let callback=null;
 return {allow(value,from){
  try{
   const u=parse(value);
   try{safeURL(value);if(!/^\/(?:ko|en)\/gate\/(?:home|login)$/.test(u.pathname))callback=null;return true;}catch{}
   const source=parse(from);
   // Official Schoolbell login initiates Whale authorization. Bind only the
   // public callback origin/path, never the state/code/client query values.
   if(u.origin==='https://auth.whalespace.io'&&u.pathname==='/oauth2/v1.1/authorize'&&
      SCHOOL.has(source.origin)&&/^\/(?:ko|en)\/gate\/login$/.test(source.pathname)){
    for(const key of ['redirect_uri','response_type','client_id','state'])if(u.searchParams.getAll(key).length!==1)return false;
    if(u.searchParams.get('response_type')!=='code')return false;
    const back=parse(u.searchParams.get('redirect_uri'));
    if(!SCHOOL.has(back.origin)||back.hash||back.pathname==='/')return false;
    // Observed Schoolbell callback adds a provider selector alongside the
    // already-known public return_uri. Keep both exact values for the return.
    const publicBack=new URL(back.href),provider=publicBack.searchParams.get('provider');
    if(provider!==null){
     if(publicBack.searchParams.getAll('provider').length!==1||!/^[a-z_-]{1,32}$/i.test(provider))return false;
     publicBack.searchParams.delete('provider');
    }
    safeURL(publicBack.href);
    callback={route:back.origin+back.pathname,publicQuery:[...back.searchParams],initiator:source.origin+source.pathname};return true;
   }
   // During an HTTP redirect Electron still reports the last committed page.
   // Permit only the bound initiating login page or these exact auth origins.
   if(callback&&(AUTH.has(source.origin)||source.origin+source.pathname===callback.initiator)){
    if(AUTH.has(u.origin))return true;
    if(u.origin+u.pathname===callback.route&&!u.hash){
     const keys=new Set([...callback.publicQuery.map(([k])=>k),'code','state','error','error_description']);
     if([...u.searchParams.keys()].some(k=>!keys.has(k)||u.searchParams.getAll(k).length!==1))return false;
     if(callback.publicQuery.some(([k,v])=>u.searchParams.get(k)!==v))return false;
     callback=null;return true;
    }
   }
   return false;
  }catch{return false;}
 },reset(){callback=null;}};
}
module.exports={createLoginNavigation,isLoginOrigin(value){try{return AUTH.has(parse(value).origin);}catch{return false;}}};
