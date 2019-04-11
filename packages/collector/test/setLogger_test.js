/* global Promise */

'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');
var supportedVersion = require('@instana/core').tracing.supportedVersion;

var config = require('./config');
var utils = require('./utils');

describe('setLogger', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  var agentStubControls = require('./apps/agentStubControls');
  var expressControls = require('./apps/expressControls');

  this.timeout(config.getTestTimeout());

  agentStubControls.registerTestHooks();
  expressControls.registerTestHooks();

  var dummyLogFile = path.join(os.tmpdir(), 'instana-nodejs-dummy-test.log');

  afterEach(function() {
    fs.unlinkSync(dummyLogFile);
  });

  it('must reinitialize all loggers on setLogger', function() {
    expressControls.setLogger(false, dummyLogFile);
    return utils.retry(function() {
      return new Promise(function(resolve, reject) {
        fs.readFile(dummyLogFile, 'utf-8', function(err, data) {
          if (err) {
            return reject(err);
          }
          // wait for arbitrary number of characters to be written
          if (data.length > 50) {
            resolve(data);
          } else {
            reject(new Error('Did not log enough: ' + data));
          }
        });
      });
    });
  });
});
