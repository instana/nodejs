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

/**
 * A source for snapshot data for the process entity.
 */
class ProcessSnapshotDataSource extends DataSource {
  constructor(containerType, hostName) {
    super(5 * 60 * 1000);

    this.snapshotData = {
      pid,
      env,
      exec,
      args,
      user,
      group,
      start,

      containerType: containerType || 'docker',
      'com.instana.plugin.host.pid': pid
    };

    if (hostName) {
      this.snapshotData['com.instana.plugin.host.name'] = hostName;
    }
  }

  setExternalSnapshotData(containerInstanceId, hostName) {
    this.snapshotData.container = containerInstanceId;
    if (hostName) {
      this.snapshotData['com.instana.plugin.host.name'] = hostName;
    }
    this._refresh();
  }

  doRefresh(callback) {
    process.nextTick(() => callback(null, this.snapshotData));
  }
}

module.exports = exports = ProcessSnapshotDataSource;
