// Update-flow mock for the nationwide feeds (nationwide.yml frozen at 1.8.16, nationwide2.yml after it).
// Runs the app's bundled electron-updater (NsisUpdater, Windows channel naming) inside Electron.
// raw.githubusercontent.com, github.com and the Release asset host are answered by a local HTTPS server
// through Chromium host rules; every other host fails, so nothing reaches the real network.
// The feeds are produced by scripts/make-nationwide-feeds.cjs and checked with the app's own rules.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {createHash} = require('node:crypto');

const ROOT = path.resolve(__dirname, '../..');
const APP = path.join(ROOT, 'app');

if (!process.versions.electron) {
  // Runner: certificate, free port and a disposable HOME, then the Electron part below.
  const {execFileSync, spawnSync} = require('node:child_process');
  const net = require('node:net');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'update-feeds-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=update-feeds-mock',
    '-keyout', path.join(tmp, 'key.pem'), '-out', path.join(tmp, 'cert.pem')], {stdio: 'ignore'});
  const probe = net.createServer().listen(0, '127.0.0.1', () => {
    const port = probe.address().port;
    probe.close(() => {
      fs.mkdirSync(path.join(tmp, 'home'));
      const result = spawnSync(require('electron'), ['--no-sandbox', __filename], {stdio: 'inherit',
        // The updater's download cache follows HOME (macOS), LOCALAPPDATA (Windows) or XDG_CACHE_HOME (Linux).
        env: {...process.env, HOME: path.join(tmp, 'home'), LOCALAPPDATA: path.join(tmp, 'home'), XDG_CACHE_HOME: path.join(tmp, 'home'), UPDATE_FEEDS_TMP: tmp, UPDATE_FEEDS_PORT: String(port), ELECTRON_ENABLE_LOGGING: ''}});
      fs.rmSync(tmp, {recursive: true, force: true});
      process.exitCode = result.status ?? 1;
    });
  });
} else {
  const {app, session} = require('electron');
  const https = require('node:https');
  const assert = require('node:assert/strict');
  const tmp = process.env.UPDATE_FEEDS_TMP, port = Number(process.env.UPDATE_FEEDS_PORT);
  const hosts = ['raw.githubusercontent.com', 'github.com', 'release-assets.githubusercontent.com'];
  app.commandLine.appendSwitch('host-resolver-rules', [...hosts.map(h => `MAP ${h} 127.0.0.1:${port}`), 'MAP * ~NOTFOUND'].join(','));
  app.setPath('userData', path.join(tmp, 'userData'));

  const {makeFeeds} = require(path.join(ROOT, 'scripts/make-nationwide-feeds.cjs'));
  const {nationwideFeedOk, installerName, releaseAssetUrl} = require(path.join(APP, 'update-feed-check.cjs'));
  const config = require(path.join(APP, 'update-config.json'));
  const legacyConfig = {...config, channel: 'nationwide'}; // v1.8.8–v1.8.15
  const legacyCheck = info => { // copied from app/updates.cjs of v1.8.8–v1.8.15
    const expected = `classroom-dashboard-nationwide-setup-${info.version}-x64.exe`;
    const files = info.files;
    return !(!/^\d+\.\d+\.\d+$/.test(info.version) || files?.length !== 1 || files[0].url !== expected || (info.path && info.path !== expected) || info.packages);
  };
  const RAW = '/rlasksk030/class/refs/heads/downloads/nationwide/';
  const sha512 = bytes => createHash('sha512').update(bytes).digest('base64');
  const builderFeed = (version, bytes) => { // electron-builder's layout for one NSIS installer
    const name = installerName(version);
    return `version: ${version}\nfiles:\n  - url: ${name}\n    sha512: ${sha512(bytes)}\n    size: ${bytes.length}\npath: ${name}\nsha512: ${sha512(bytes)}\nreleaseDate: '2026-11-13T00:00:00.000Z'\n`;
  };

  // What the server holds: raw branch files, Release assets (redirected like GitHub does) and a request log.
  const state = {raw: {}, releases: {}, assets: {}, log: []};
  function publishRelease(version, bytes) {
    const id = `${Object.keys(state.assets).length + 1}`;
    state.releases[`nationwide-v${version}/${installerName(version)}`] = id;
    state.assets[id] = bytes;
  }
  const server = https.createServer({key: fs.readFileSync(path.join(tmp, 'key.pem')), cert: fs.readFileSync(path.join(tmp, 'cert.pem'))}, (req, res) => {
    const host = String(req.headers.host).replace(/:\d+$/, ''), url = new URL(req.url, 'https://' + host);
    state.log.push(host + url.pathname);
    const send = body => { res.writeHead(200, {'Content-Length': Buffer.byteLength(body)}); res.end(body); };
    if (host === 'raw.githubusercontent.com' && url.pathname.startsWith(RAW) && state.raw[url.pathname.slice(RAW.length)] != null) return send(state.raw[url.pathname.slice(RAW.length)]);
    const release = /^\/rlasksk030\/class\/releases\/download\/(.+)$/.exec(url.pathname);
    if (host === 'github.com' && release && state.releases[release[1]] && !url.search) {
      res.writeHead(302, {Location: `https://release-assets.githubusercontent.com/github-production-release-asset/${state.releases[release[1]]}?sp=r&sig=mock`});
      return res.end();
    }
    const asset = /^\/github-production-release-asset\/(\d+)$/.exec(url.pathname);
    if (host === 'release-assets.githubusercontent.com' && asset && state.assets[asset[1]] && url.searchParams.get('sig') === 'mock') return send(state.assets[asset[1]]);
    res.writeHead(404); res.end('not found');
  });

  function loadNsisUpdater() {
    const marker = 'var { autoUpdater } = require_main2();\nmodule.exports = autoUpdater;';
    const source = fs.readFileSync(path.join(APP, 'updater-bundle.cjs'), 'utf8');
    assert.ok(source.includes(marker), 'updater bundle entry point changed');
    const shim = path.join(tmp, 'updater-shim.cjs');
    fs.writeFileSync(shim, source.replace(marker, 'module.exports = {NsisUpdater: require_NsisUpdater().NsisUpdater};'));
    return require(shim).NsisUpdater;
  }
  const appUpdateYml = path.join(tmp, 'app-update.yml');
  fs.writeFileSync(appUpdateYml, 'updaterCacheDirName: classroom-update-feeds-mock\n');
  let NsisUpdater;
  function installedApp(version, feedConfig) { // the same policy as app/updates.cjs
    const u = new NsisUpdater();
    u.logger = {info() {}, warn() {}, debug() {}, error() {}};
    u._testOnlyOptions = {platform: 'win32'};
    u.currentVersion = new u.currentVersion.constructor(version);
    Object.assign(u, {autoDownload: false, autoInstallOnAppQuit: false, allowDowngrade: false, disableDifferentialDownload: true, forceDevUpdateConfig: true});
    u.updateConfigPath = appUpdateYml;
    u.setFeedURL(feedConfig);
    return u;
  }
  async function check(u) {
    const seen = [];
    u.on('update-available', info => seen.push(['available', info]));
    u.on('update-not-available', info => seen.push(['current', info]));
    u.on('error', error => seen.push(['error', error.message]));
    const from = state.log.length;
    await u.checkForUpdates().catch(error => seen.push(['error', error.message]));
    return {event: seen[0]?.[0], info: seen[0]?.[1], requests: state.log.slice(from)};
  }
  async function download(u) {
    const from = state.log.length;
    try { const files = await u.downloadUpdate(); return {file: files.find(f => f.endsWith('.exe')), requests: state.log.slice(from)}; }
    catch (error) { return {error: error.message, requests: state.log.slice(from)}; }
  }

  let passed = 0;
  const pass = label => { passed++; console.log('PASS ' + label); };
  async function run() {
    await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
    session.fromPartition('electron-updater', {cache: false}).setCertificateVerifyProc((_request, callback) => callback(0));
    NsisUpdater = loadNsisUpdater();

    // Bridge release 1.8.16: installer on the branch (last time) and on its Release; both feeds point at it.
    const v16 = Buffer.from('installer 1.8.16 '.repeat(4096));
    const feeds16 = makeFeeds(builderFeed('1.8.16', v16));
    state.raw['nationwide.yml'] = feeds16.legacy;
    state.raw['nationwide2.yml'] = feeds16.current;
    state.raw[installerName('1.8.16')] = v16;
    publishRelease('1.8.16', v16);

    // 1) A v1.8.15 app (channel nationwide) is offered 1.8.16 and downloads it from the branch by file name.
    const old = installedApp('1.8.15', legacyConfig);
    const c1 = await check(old);
    assert.equal(c1.event, 'available'); assert.equal(c1.info.version, '1.8.16');
    assert.deepEqual(c1.requests, ['raw.githubusercontent.com' + RAW + 'nationwide.yml']);
    assert.equal(legacyCheck(c1.info), true); assert.equal(nationwideFeedOk(c1.info), false);
    pass('v1.8.15 reads nationwide.yml, its own check accepts it and the new check rejects it');
    const d1 = await download(old);
    assert.equal(d1.error, undefined, d1.error);
    assert.deepEqual(d1.requests, ['raw.githubusercontent.com' + RAW + installerName('1.8.16')]);
    assert.equal(sha512(fs.readFileSync(d1.file)), sha512(v16));
    pass('v1.8.15 downloads the 1.8.16 installer from the branch file name and the sha512 matches');

    // 2) v1.8.16 (channel nationwide2) is current while nationwide2.yml is 1.8.16.
    const c2 = await check(installedApp('1.8.16', config));
    assert.equal(c2.event, 'current');
    assert.deepEqual(c2.requests, ['raw.githubusercontent.com' + RAW + 'nationwide2.yml']);
    pass('v1.8.16 reads only nationwide2.yml and reports the latest version');

    // 3) The v1.8.15 check refuses the nationwide2.yml form as electron-updater parsed it (old apps never request it).
    assert.equal(c2.info.files[0].url, releaseAssetUrl('1.8.16'));
    assert.equal(legacyCheck(c2.info), false); assert.equal(nationwideFeedOk(c2.info), true);
    pass('v1.8.15 check rejects the absolute-URL feed; the new check accepts it');

    // 4) 1.8.17 is published only as a Release asset; then nationwide2.yml is updated. nationwide.yml stays 1.8.16.
    const v17 = Buffer.from('installer 1.8.17 '.repeat(4096));
    publishRelease('1.8.17', v17);
    const feeds17 = makeFeeds(builderFeed('1.8.17', v17));
    state.raw['nationwide2.yml'] = feeds17.current;
    const bridge = installedApp('1.8.16', config);
    const c4 = await check(bridge);
    assert.equal(c4.event, 'available'); assert.equal(c4.info.version, '1.8.17');
    assert.equal(c4.info.files[0].url, releaseAssetUrl('1.8.17'));
    assert.equal(nationwideFeedOk(c4.info), true); assert.equal(legacyCheck(c4.info), false);
    pass('v1.8.16 is offered 1.8.17 and the new check accepts the Release asset URL');
    const d4 = await download(bridge);
    assert.equal(d4.error, undefined, d4.error);
    assert.deepEqual(d4.requests, ['github.com/rlasksk030/class/releases/download/nationwide-v1.8.17/' + installerName('1.8.17'), 'release-assets.githubusercontent.com/github-production-release-asset/2']);
    assert.equal(sha512(fs.readFileSync(d4.file)), sha512(v17));
    pass('v1.8.16 downloads 1.8.17 from the Release URL through the redirect and the sha512 matches');

    // 5) An older app is still bridged through the frozen nationwide.yml (1.8.15 -> 1.8.16 -> 1.8.17).
    const c5 = await check(installedApp('1.8.9', legacyConfig));
    assert.equal(c5.event, 'available'); assert.equal(c5.info.version, '1.8.16'); assert.equal(legacyCheck(c5.info), true);
    pass('v1.8.9 is still offered the 1.8.16 bridge after 1.8.17 is published');

    // 6) The new check refuses a nationwide2.yml written in the old file-name form.
    state.raw['nationwide2.yml'] = feeds17.legacy;
    const c6 = await check(installedApp('1.8.16', config));
    assert.equal(c6.event, 'available'); assert.equal(nationwideFeedOk(c6.info), false);
    pass('v1.8.16 rejects a nationwide2.yml in the file-name form (the app shows a check error and does not download)');

    // 7) A feed whose sha512 does not match the Release asset fails the download.
    state.raw['nationwide2.yml'] = makeFeeds(builderFeed('1.8.17', Buffer.from('different bytes'))).current;
    const tampered = installedApp('1.8.16', config);
    const c7 = await check(tampered);
    assert.equal(c7.event, 'available'); assert.equal(nationwideFeedOk(c7.info), true);
    const d7 = await download(tampered);
    assert.match(String(d7.error), /sha512|checksum|size/i);
    pass('a sha512 or size mismatch on the Release asset stops the update');

    // Nothing in the run went anywhere but the three mocked hosts.
    assert.ok(state.log.every(entry => hosts.some(h => entry.startsWith(h + '/'))));
    console.log(`update-feeds mock: ${passed}/${passed} PASS (local HTTPS server, not the real GitHub)`);
  }
  app.whenReady().then(run).then(() => app.exit(0), error => { console.error(error); app.exit(1); });
}
