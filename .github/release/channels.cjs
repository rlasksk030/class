// Release gate: preserve the original channel checks and also exercise the new Okgu installer.
// node tests/windows/update-channels.cjs <directory with previous.exe, nationwide.yml and its EXE>
// Runs the actual NSIS packages and their bundled updater in a disposable Windows account.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {createHash} = require('node:crypto');
const {execFileSync} = require('node:child_process');
const {_electron} = require('playwright-core');
assert.equal(process.platform, 'win32');
assert.equal(process.env.CLASSROOM_DISPOSABLE_VM, 'yes');

const fixtures = path.resolve(process.argv[2]);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'class-channels-'));
const install = path.join(root, 'app');
const exe = path.join(install, '우리 교실.exe');
const manifest = fs.readFileSync(path.join(fixtures, 'nationwide.yml'), 'utf8');
const version = /^version: (\d+\.\d+\.\d+)\s*$/m.exec(manifest)[1];
const nationalFile = v => `classroom-dashboard-nationwide-setup-${v}-x64.exe`;
const nationalBase = 'https://raw.githubusercontent.com/rlasksk030/class/refs/heads/downloads/nationwide/';
const okguBase = 'https://github.com/rlasksk030/class/releases';
const old = path.join(fixtures, 'previous.exe');

async function run(edition, setup, installedVersion) {
  execFileSync(setup, ['/S', '/currentuser', '/D=' + install], {timeout: 240000});
  const instance = await _electron.launch({executablePath: exe, args:['--no-sandbox','--disable-gpu'],
    env:{...process.env, CLASSROOM_TEST_PROFILE:path.join(root, edition)}, timeout:90000});
  try {
    assert.equal(await instance.evaluate(({app}) => app.getVersion()), installedVersion);
    const page = await instance.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    // Keep each installed provider, URL, release parser and installer selection unchanged.
    // Stub only the HTTP transport so two future versions can coexist without publishing either.
    await instance.evaluate(({app,dialog}, {nationalBase,okguBase}) => {
      const load = name => process.mainModule.require(process.mainModule.require('path').join(app.getAppPath(), name));
      const updater = load('updater-bundle.cjs');
      if(updater.autoDownload || updater.autoInstallOnAppQuit || updater.allowDowngrade) throw Error('Unexpected update policy');
      const f = globalThis.channelFixture = {okgu:'9.1.1', nationwide:'9.2.1', requests:[], downloads:[]};
      const hash = process.mainModule.require('crypto').createHash('sha512').update('simulated next installer').digest('base64');
      function data(v,file) {return JSON.stringify({version:v,files:[{url:file,sha512:hash}],path:file,sha512:hash,releaseNotes:'fixture'});}
      updater.httpExecutor.request = async options => {
        const u = new URL(options.path, options.protocol+'//'+options.hostname);
        u.search=''; const url=u.href; f.requests.push(url);
        if(url===nationalBase+'nationwide.yml'){
          if(f.offline)throw Error('offline fixture');
          const name=f.mixed?'classroom-dashboard-setup-'+f.nationwide+'.exe':'classroom-dashboard-nationwide-setup-'+f.nationwide+'-x64.exe';
          return data(f.nationwide,name);
        }
        if(url===okguBase+'.atom')return '<feed><entry><title>fixture</title><link href="'+okguBase+'/tag/v'+f.okgu+'"/></entry></feed>';
        if(url===okguBase+'/latest')return JSON.stringify({tag_name:'v'+f.okgu});
        if(url===okguBase+'/download/v'+f.okgu+'/latest.yml')return data(f.okgu,'classroom-dashboard-setup-'+f.okgu+'.exe');
        throw Error('Unexpected update request '+url);
      };
      dialog.showMessageBox=async()=>({response:0});
      updater.httpExecutor.download=async url=>{f.downloads.push(url.href);throw Error('Stop before installing fictional version');};
    }, {nationalBase,okguBase});
    const future = edition==='okgu'?'9.1.1':'9.2.1';
    const state = () => page.evaluate(() => desktop.checkUpdate());
    await instance.evaluate((_, {edition,installedVersion})=>{globalThis.channelFixture[edition]=installedVersion;}, {edition,installedVersion});
    assert.equal((await state()).phase,'current');
    console.log('PASS '+edition+' remains current while only the other edition has a newer version');
    await instance.evaluate((_, {edition,future})=>{globalThis.channelFixture[edition]=future;}, {edition,future});
    const offer=await state();assert.equal(offer.phase,'available');assert.equal(offer.version,future);
    assert.deepEqual(await instance.evaluate(()=>globalThis.channelFixture.downloads),[]);
    await page.evaluate(()=>desktop.startUpdate());
    const report=await instance.evaluate(()=>globalThis.channelFixture);
    const expected=edition==='okgu'?okguBase+'/download/v'+future+'/classroom-dashboard-setup-'+future+'.exe':nationalBase+nationalFile(future);
    assert.deepEqual(report.downloads,[expected]);
    if(edition==='okgu')assert.ok(report.requests.every(url=>url.startsWith(okguBase)));
    else assert.deepEqual([...new Set(report.requests)],[nationalBase+'nationwide.yml']);
    console.log('PASS '+edition+' offers its own version and requests only its own EXE after confirmation');
    if(edition==='nationwide'){
      for(const failure of ['mixed','offline']){
        await instance.evaluate((_,failure)=>{globalThis.channelFixture[failure]=true;},failure);
        const blocked=await state();assert.equal(blocked.phase,'check-error');assert.equal(blocked.version,null);
        assert.equal(await page.evaluate(()=>desktop.startUpdate()),false);
      }
      const final=await instance.evaluate(()=>globalThis.channelFixture);
      assert.deepEqual(final.downloads,[expected]);assert.deepEqual([...new Set(final.requests)],[nationalBase+'nationwide.yml']);
      console.log('PASS wrong-edition manifest and unavailable nationwide feed both block installation without fallback');
    }
  } finally {await instance.close();}
}
(async()=>{
  assert.equal(createHash('sha256').update(fs.readFileSync(old)).digest('hex'),'ffbcd03caf69a63f0b77f0dca164f34b05607dfa568a97ccd7ee33dfe1b81741');
  await run('okgu',old,'1.8.7');
  await run('nationwide',path.join(fixtures,nationalFile(version)),version);
  await run('okgu',path.join(fixtures,'classroom-dashboard-setup-'+version+'.exe'),version);
})().catch(error=>{console.error(error);process.exitCode=1;});
