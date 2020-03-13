'use strict';

const os = require('os');

const DataSource = require('../DataSource');

const pid = process.pid;
const env = process.env;
const exec = process.execPath;
const args = process.argv;
let user;
let group;
try {
  const userInfo = os.userInfo();
  user = userInfo.username;
  group = userInfo.gid;
} catch (ignored) {
  // ignore silently
}
const start = Math.floor(Date.now() - process.uptime() * 1000);

const snapshotData = {
  pid,
  env,
  exec,
  args,
  user,
  group,
  start,

  containerType: 'docker',
  'com.instana.plugin.host.pid': pid
};

/**
 * A source for snapshot data for the process entity.
 */
class ProcessSnapshotDataSource extends DataSource {
  constructor() {
    super(5 * 60 * 1000);
  }

  setExternalSnapshotData(dockerId, taskArn) {
    snapshotData.container = dockerId;
    snapshotData['com.instana.plugin.host.name'] = taskArn;
    this._refresh();
  }

  doRefresh(callback) {
    process.nextTick(() => callback(null, snapshotData));
  }
}

module.exports = exports = ProcessSnapshotDataSource;
