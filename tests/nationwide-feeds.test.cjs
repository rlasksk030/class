const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {BRIDGE_VERSION, parseFeed, makeFeeds, main} = require('../scripts/make-nationwide-feeds.cjs');
const {nationwideFeedOk} = require('../app/update-feed-check.cjs');

// The exact layout electron-builder wrote for the published v1.8.15 feed, with another version and payload.
const builderFeed = (version, bytes) => {
  const sha512 = createHash('sha512').update(bytes).digest('base64');
  const name = `classroom-dashboard-nationwide-setup-${version}-x64.exe`;
  return `version: ${version}\nfiles:\n  - url: ${name}\n    sha512: ${sha512}\n    size: ${bytes.length}\npath: ${name}\nsha512: ${sha512}\nreleaseDate: '2026-11-13T01:02:03.456Z'\n`;
};
const ASSET = 'https://github.com/rlasksk030/class/releases/download/nationwide-v1.8.16/classroom-dashboard-nationwide-setup-1.8.16-x64.exe';
// The same parser the app's old (v1.8.8–v1.8.15) check reads: only the fields it inspects.
const fields = text => {
  const value = key => new RegExp(`^${key}: (.+)$`, 'm').exec(text)[1];
  const url = /^  - url: (.+)$/m.exec(text)[1];
  return {version: value('version'), files: [{url, sha512: /^    sha512: (.+)$/m.exec(text)[1], size: Number(/^    size: (.+)$/m.exec(text)[1])}], path: value('path'), sha512: value('sha512'), releaseDate: value('releaseDate')};
};
const legacyCheck = info => { // copied from app/updates.cjs of v1.8.8–v1.8.15
  const expected = `classroom-dashboard-nationwide-setup-${info.version}-x64.exe`;
  const files = info.files;
  return !(!/^\d+\.\d+\.\d+$/.test(info.version) || files?.length !== 1 || files[0].url !== expected || (info.path && info.path !== expected) || info.packages);
};

test('both feeds carry the same version, sha512, size and date; only url/path differ', () => {
  const {info, legacy, current} = makeFeeds(builderFeed('1.8.16', Buffer.from('installer')));
  const a = fields(legacy), b = fields(current);
  assert.equal(a.version, '1.8.16'); assert.equal(b.version, '1.8.16');
  assert.deepEqual([a.sha512, a.files[0].sha512, a.files[0].size, a.releaseDate], [b.sha512, b.files[0].sha512, b.files[0].size, b.releaseDate]);
  assert.equal(a.files[0].size, info.size);
  assert.equal(a.files[0].url, 'classroom-dashboard-nationwide-setup-1.8.16-x64.exe'); assert.equal(a.path, a.files[0].url);
  assert.equal(b.files[0].url, ASSET); assert.equal(b.path, ASSET);
  assert.equal(legacy.replaceAll('classroom-dashboard-nationwide-setup-1.8.16-x64.exe', 'X'), current.replace(/https:\/\/\S+/g, 'X'));
});

test('each app generation accepts only its own feed', () => {
  const {legacy, current} = makeFeeds(builderFeed('1.8.16', Buffer.from('installer')));
  assert.equal(legacyCheck(fields(legacy)), true, 'v1.8.15 accepts nationwide.yml');
  assert.equal(legacyCheck(fields(current)), false, 'v1.8.15 rejects nationwide2.yml');
  assert.equal(nationwideFeedOk(fields(current)), true, 'v1.8.16 accepts nationwide2.yml');
  assert.equal(nationwideFeedOk(fields(legacy)), false, 'v1.8.16 rejects nationwide.yml');
});

test('the parser refuses anything but the expected single-installer layout', () => {
  const good = builderFeed('1.8.16', Buffer.from('installer'));
  assert.doesNotThrow(() => parseFeed(good));
  assert.doesNotThrow(() => parseFeed(good.replace(/\n/g, '\r\n')), 'CRLF');
  assert.doesNotThrow(() => parseFeed(makeFeeds(good).current), 'own output is accepted again (idempotent)');
  const bad = {
    'second file': good.replace('path:', '  - url: other.exe\npath:'),
    'extra key': good + 'stagingPercentage: 50\n',
    'okgu name': good.replaceAll('classroom-dashboard-nationwide-setup-1.8.16-x64.exe', 'classroom-dashboard-setup-1.8.16.exe'),
    'path mismatch': good.replace(/^path: .*$/m, 'path: other.exe'),
    'sha512 mismatch': good.replace(/^sha512: .*$/m, 'sha512: ' + 'A'.repeat(86) + '=='),
    'other version in name': good.replace('version: 1.8.16', 'version: 1.8.17'),
    'foreign URL': good.replaceAll('classroom-dashboard-nationwide-setup-1.8.16-x64.exe', 'https://example.com/classroom-dashboard-nationwide-setup-1.8.16-x64.exe')
  };
  for (const [name, text] of Object.entries(bad)) assert.throws(() => parseFeed(text), undefined, name);
});

test('the build step checks the installer and freezes nationwide.yml at the bridge version', () => {
  assert.equal(BRIDGE_VERSION, '1.8.16');
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'nationwide-feeds-'));
  const log = console.log; console.log = () => {};
  try {
    const bytes = Buffer.from('fake installer 1.8.16');
    fs.writeFileSync(path.join(dist, 'classroom-dashboard-nationwide-setup-1.8.16-x64.exe'), bytes);
    fs.writeFileSync(path.join(dist, 'nationwide2.yml'), builderFeed('1.8.16', bytes));
    main(dist);
    assert.equal(fields(fs.readFileSync(path.join(dist, 'nationwide2.yml'), 'utf8')).files[0].url, ASSET);
    assert.equal(fields(fs.readFileSync(path.join(dist, 'nationwide.yml'), 'utf8')).files[0].url, 'classroom-dashboard-nationwide-setup-1.8.16-x64.exe');
    const once = fs.readFileSync(path.join(dist, 'nationwide2.yml'), 'utf8');
    main(dist); assert.equal(fs.readFileSync(path.join(dist, 'nationwide2.yml'), 'utf8'), once, 'running twice changes nothing');

    // 1.8.17: only nationwide2.yml; a stale nationwide.yml left in dist is removed so it cannot be uploaded.
    const next = Buffer.from('fake installer 1.8.17');
    fs.writeFileSync(path.join(dist, 'classroom-dashboard-nationwide-setup-1.8.17-x64.exe'), next);
    fs.writeFileSync(path.join(dist, 'nationwide2.yml'), builderFeed('1.8.17', next));
    main(dist);
    assert.equal(fs.existsSync(path.join(dist, 'nationwide.yml')), false);
    assert.equal(nationwideFeedOk(fields(fs.readFileSync(path.join(dist, 'nationwide2.yml'), 'utf8'))), true);

    // A feed that does not describe the installer on disk is refused before anything is written.
    fs.writeFileSync(path.join(dist, 'nationwide2.yml'), builderFeed('1.8.17', Buffer.from('other bytes')));
    assert.throws(() => main(dist), /does not match/);
  } finally { console.log = log; fs.rmSync(dist, {recursive: true, force: true}); }
});
