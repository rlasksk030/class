const assert = require('node:assert/strict');
const test = require('node:test');
const {installerName, releaseAssetUrl, nationwideFeedOk} = require('./update-feed-check.cjs');

const URL_1816 = 'https://github.com/rlasksk030/class/releases/download/nationwide-v1.8.16/classroom-dashboard-nationwide-setup-1.8.16-x64.exe';
const sha512 = 'x'.repeat(88);
const feed = (url, extra = {}) => ({version: '1.8.16', files: [{url, sha512, size: 99}], path: url, sha512, ...extra});

test('the release asset URL is built from the version only', () => {
  assert.equal(installerName('1.8.16'), 'classroom-dashboard-nationwide-setup-1.8.16-x64.exe');
  assert.equal(releaseAssetUrl('1.8.16'), URL_1816);
});

test('accepts exactly the Release asset URL of the offered version', () => {
  assert.equal(nationwideFeedOk(feed(URL_1816)), true);
  const {path, ...noPath} = feed(URL_1816);
  assert.equal(nationwideFeedOk(noPath), true, 'path is optional');
});

test('rejects every other address form', () => {
  const rejected = {
    'old file-name-only form': installerName('1.8.16'),
    http: URL_1816.replace('https://', 'http://'),
    'another host': URL_1816.replace('github.com', 'objects.githubusercontent.com'),
    'look-alike host': URL_1816.replace('github.com', 'github.com.example.net'),
    'another owner': URL_1816.replace('/rlasksk030/', '/someone/'),
    'another repository': URL_1816.replace('/class/', '/class2/'),
    'okgu tag': URL_1816.replace('/nationwide-v1.8.16/', '/v1.8.16/'),
    'older tag': URL_1816.replace('/nationwide-v1.8.16/', '/nationwide-v1.8.15/'),
    'other file version': URL_1816.replace('setup-1.8.16', 'setup-1.8.15'),
    'okgu file name': URL_1816.replace('classroom-dashboard-nationwide-setup-1.8.16-x64.exe', 'classroom-dashboard-setup-1.8.16.exe'),
    'query string': URL_1816 + '?download=1',
    fragment: URL_1816 + '#x',
    'trailing space': URL_1816 + ' ',
    'upper-case host': URL_1816.replace('github.com', 'GitHub.com'),
    'encoded path': URL_1816.replace('nationwide-v1.8.16', 'nationwide%2Dv1.8.16'),
    'raw branch URL': 'https://raw.githubusercontent.com/rlasksk030/class/refs/heads/downloads/nationwide/' + installerName('1.8.16')
  };
  for (const [name, url] of Object.entries(rejected)) assert.equal(nationwideFeedOk(feed(url)), false, name);
});

test('rejects a feed whose version, files, path or packages do not match', () => {
  assert.equal(nationwideFeedOk({...feed(URL_1816), version: '1.8.17'}), false, 'version mismatch');
  for (const version of ['1.8', '1.8.16-beta', 'v1.8.16', ' 1.8.16', 1816, undefined]) {
    assert.equal(nationwideFeedOk({...feed(URL_1816), version}), false, 'version ' + version);
  }
  assert.equal(nationwideFeedOk(feed(URL_1816, {files: [{url: URL_1816, sha512}, {url: URL_1816, sha512}]})), false, 'two files');
  assert.equal(nationwideFeedOk(feed(URL_1816, {files: []})), false, 'no files');
  assert.equal(nationwideFeedOk(feed(URL_1816, {files: undefined})), false, 'files missing');
  assert.equal(nationwideFeedOk(feed(URL_1816, {files: [null]})), false, 'null file');
  assert.equal(nationwideFeedOk(feed(URL_1816, {path: installerName('1.8.16')})), false, 'path in the old form');
  assert.equal(nationwideFeedOk(feed(URL_1816, {path: URL_1816 + '?x'})), false, 'path mismatch');
  assert.equal(nationwideFeedOk(feed(URL_1816, {packages: {x64: {path: URL_1816}}})), false, 'packages');
  assert.equal(nationwideFeedOk(null), false);
  assert.equal(nationwideFeedOk(undefined), false);
});
