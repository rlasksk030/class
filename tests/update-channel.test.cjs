const assert = require('node:assert/strict');
const test = require('node:test');
const build = require('../electron-builder.json');
const feed = require('../app/update-config.json');

test('nationwide builds and installed clients use the same dedicated Windows channel', () => {
  assert.deepEqual(feed, {
    provider: 'generic',
    url: 'https://raw.githubusercontent.com/rlasksk030/class/refs/heads/downloads/nationwide/',
    channel: 'nationwide'
  });
  assert.deepEqual(build.publish, [feed]);
  assert.equal(build.nsis.artifactName, 'classroom-dashboard-nationwide-setup-${version}-x64.exe');
  assert.notEqual(build.generateUpdatesFilesForAllChannels, true);
  assert.notEqual(build.win.generateUpdatesFilesForAllChannels, true);
});
