const {test}=require('node:test'),assert=require('node:assert/strict');
const {popup,assertBackground}=require('./hiclass-window.cjs');
test('explicit authentication allows HTTPS popups with isolated persistent session',()=>{
 const p=popup('https://accounts.example.org/oauth/authorize',true);assert.equal(p.action,'allow');assert.equal(p.overrideBrowserWindowOptions.webPreferences.partition,'persist:hiclass-teacher');assert.equal(p.overrideBrowserWindowOptions.webPreferences.nodeIntegration,false);
});
test('background auth requests stop for explicit relogin',()=>{const p=popup('https://accounts.example.org/oauth/authorize',false);assert.equal(p.action,'deny');assert.match(p.message,/다시 로그인/);});
test('unknown background popup fails closed with explanation',()=>{const p=popup('https://www.hiclass.net/new-window',false);assert.equal(p.action,'deny');assert.match(p.message,/별도 창/);});
test('unsafe schemes never create windows',()=>{for(const url of ['javascript:alert(1)','file:///x','http://example.org','not a url'])for(const mode of [true,false])assert.equal(popup(url,mode).action,'deny');});
test('background interruption propagates before final publication',()=>{assertBackground({});assert.throws(()=>assertBackground({hiclassBackgroundError:'중단'}),/중단/);});
