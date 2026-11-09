const test=require('node:test'),assert=require('node:assert/strict');
const {createLoginNavigation}=require('./schoolbell-login-navigation.cjs');
const services=require('./diary-services.cjs');
const login='https://v4.schoolbell-e.com/ko/gate/login?return_uri='+encodeURIComponent(services.HOME);
const back=login+'&provider=whalespace';
const authorize=callback=>'https://auth.whalespace.io/oauth2/v1.1/authorize?'+new URLSearchParams({response_type:'code',client_id:'synthetic-client',state:'synthetic-state',redirect_uri:callback});
test('official entry stays HTTPS; Whale is navigation-only and callback is bound to the initiating service',()=>{
 const n=createLoginNavigation();assert.equal(services.HOME,'https://schoolbell-e.com/ko/main');
 assert.ok(n.allow(login,'about:blank'));
 assert.ok(n.allow(authorize(back),login));
 assert.ok(n.allow('https://authn.whalespace.io/login',login));
 assert.ok(n.allow('https://auth.worksmobile.com/login',login));
 assert.ok(n.allow('https://auth.whalespace.io/complete','https://authn.whalespace.io/login'));
 assert.ok(n.allow('https://account.whalespace.io/login','https://auth.whalespace.io/oauth2/v1.1/authorize'));
 assert.ok(n.allow(back+'&code=synthetic-code&state=synthetic-state','https://auth.whalespace.io/complete'));
 assert.equal(n.allow(back+'&code=synthetic-code&state=synthetic-state','https://auth.whalespace.io/complete'),false);
 assert.throws(()=>services.safeURL(authorize(back),true));assert.throws(()=>services.safeURL(back+'&code=synthetic-code',true));
});
test('uninitiated or foreign auth routes, callback changes, credentials and HTTP stay blocked',()=>{
 for(const callback of ['https://evil.invalid/callback','http://v4.schoolbell-e.com/ko/gate/login',back+'&token=synthetic',login+'&provider=https%3A%2F%2Fevil.invalid'])
  assert.equal(createLoginNavigation().allow(authorize(callback),login),false);
 for(const from of ['https://evil.invalid/login','https://schoolbell-e.com/ko/main/group/1/boards/classnews'])
  assert.equal(createLoginNavigation().allow(authorize(back),from),false);
 const n=createLoginNavigation();
 assert.equal(n.allow('https://account.whalespace.io/login',login),false);
 assert.ok(n.allow(authorize(back),login));
 for(const dest of [back.replace('whalespace','different')+'&code=x',back+'&access_token=x',back+'&state=x&state=y',
  'http://auth.whalespace.io/login','https://auth.whalespace.io.evil.invalid/login','https://user:secret@auth.whalespace.io/login'])
  assert.equal(n.allow(dest,'https://auth.whalespace.io/complete'),false);
 n.reset();assert.equal(n.allow(back+'&code=x','https://auth.whalespace.io/complete'),false);
});
