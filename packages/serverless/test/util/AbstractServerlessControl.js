'use strict';

const { fork } = require('child_process');
const {
  assert: { fail }
} = require('chai');
const path = require('path');
const request = require('request-promise');

const retry = require('./retry');
const config = require('../config');

function AbstractServerlessControl(opts = {}) {
  this.opts = opts;
  this.opts.timeout = this.opts.timeout || config.getTestTimeout();
  this.reset();
}

AbstractServerlessControl.prototype.reset = function reset() {
  this.messagesFromBackend = [];
  this.messagesFromDownstreamDummy = [];
};

AbstractServerlessControl.prototype.registerTestHooks = function registerTestHooks() {
  if (typeof this.startMonitoredProcess !== 'function') {
    fail('Control does not implement startMonitoredProcess.');
  }
  if (
    typeof this.hasMonitoredProcessStartedPromise !== 'function' &&
    typeof this.hasMonitoredProcessStarted !== 'function'
  ) {
    fail('Control neither implements hasMonitoredProcessStartedPromise nor hasMonitoredProcessStarted.');
  }
  if (typeof this.hasMonitoredProcessTerminated !== 'function') {
    fail('Control does not implement hasMonitoredProcessTerminated.');
  }
  if (typeof this.killMonitoredProcess !== 'function') {
    fail('Control does not implement killMonitoredProcess.');
  }

  beforeEach(() => {
    this.reset();

    let backendPromise;
    if (this.opts.startBackend) {
      backendPromise = this.startBackendAndWaitForIt();
    } else {
      backendPromise = Promise.resolve();
    }

    let downstreamDummyPromise;
    if (this.opts.startDownstreamDummy !== false) {
      this.downstreamDummy = fork(path.join(__dirname, '../downstream_dummy'), {
        stdio: config.getAppStdio(),
        env: Object.assign(
          {
            DOWNSTREAM_DUMMY_PORT: this.downstreamDummyPort
          },
          process.env,
          this.opts.env
        )
      });
      this.downstreamDummy.on('message', message => {
        this.messagesFromDownstreamDummy.push(message);
      });
      downstreamDummyPromise = this.waitUntilDownstreamDummyIsUp();
    } else {
      downstreamDummyPromise = Promise.resolve();
    }

    const allAuxiliaryProcesses = [backendPromise, downstreamDummyPromise].concat(
      this.startAdditionalAuxiliaryProcesses()
    );
    return Promise.all(allAuxiliaryProcesses)
      .then(() => {
        this.startMonitoredProcess();
        return this.waitUntilMonitoredProcessHasStarted();
      })
      .catch(e => {
        fail(`A child process did not start properly: ${e}`);
      });
  });

  afterEach(() =>
    this.kill()
      .then(() => this.reset())
      .catch(e => {
        fail(`A child process did not terminate properly: ${e}`);
      })
  );
};

AbstractServerlessControl.prototype.startBackendAndWaitForIt = function startBackendAndWaitForIt() {
  this.backendHasBeenStarted = true;
  this.backend = fork(path.join(__dirname, '../backend_stub'), {
    stdio: config.getAppStdio(),
    env: Object.assign(
      {
        BACKEND_PORT: this.backendPort,
        BACKEND_UNRESPONSIVE: this.opts.startBackend === 'unresponsive'
      },
      process.env,
      this.opts.env
    )
  });
  this.backend.on('message', message => {
    this.messagesFromBackend.push(message);
  });
  return this.waitUntilBackendIsUp();
};

AbstractServerlessControl.prototype.waitUntilBackendIsUp = function waitUntilBackendIsUp() {
  return this.waitUntilProcessIsUp('backend mock', this.messagesFromBackend, 'backend: started');
};

AbstractServerlessControl.prototype.waitUntilDownstreamDummyIsUp = function waitUntilDownstreamDummyIsUp() {
  return this.waitUntilProcessIsUp(
    'downstream dummy app',
    this.messagesFromDownstreamDummy,
    'downstream dummy: started'
  );
};

// prettier-ignore
AbstractServerlessControl.prototype.waitUntilMonitoredProcessHasStarted =
function waitUntilMonitoredProcessHasStarted() {
  return retry(() => this.hasMonitoredProcessStartedPromise(), this.opts.timeout / 2);
};

AbstractServerlessControl.prototype.hasMonitoredProcessStartedPromise = function hasMonitoredProcessStartedPromise() {
  // Subclasses can either override hasMonitoredProcessStartedPromise directly (then hasMonitoredProcessStarted does not
  // need to be implemented) or, if they do not need an asynchronous operation to determine if the monitored process has
  // started, they can also override hasMonitoredProcessStarted.
  if (this.hasMonitoredProcessStarted()) {
    return Promise.resolve();
  } else {
    return Promise.reject(new Error('The monitored process has still not started.'));
  }
};

AbstractServerlessControl.prototype.waitUntilProcessIsUp = function waitUntilProcessIsUp(
  label,
  allMessagesFromProcess,
  processStartMessage
) {
  return retry(() => this.isProcessUpPromise(label, allMessagesFromProcess, processStartMessage));
};

AbstractServerlessControl.prototype.isProcessUpPromise = function isProcessUpPromise(
  label,
  allMessagesFromProcess,
  processStartMessage
) {
  if (this.isProcessUp(allMessagesFromProcess, processStartMessage)) {
    return Promise.resolve();
  } else {
    return Promise.reject(new Error(`The process ${label} is still not up.`));
  }
};

AbstractServerlessControl.prototype.isProcessUp = function isProcessUp(allMessagesFromProcess, processStartMessage) {
  return allMessagesFromProcess.indexOf(processStartMessage) >= 0;
};

// prettier-ignore
AbstractServerlessControl.prototype.waitUntilMonitoredProcessHasTerminated =
function waitUntilMonitoredProcessHasTerminated() {
  return retry(() => this.hasMonitoredProcessTerminatedPromise(), this.opts.timeout / 2);
};

// prettier-ignore
AbstractServerlessControl.prototype.hasMonitoredProcessTerminatedPromise =
function hasMonitoredProcessTerminatedPromise() {
  if (this.hasMonitoredProcessTerminated()) {
    return Promise.resolve();
  } else {
    return Promise.reject(new Error('The monitored process has still not terminated.'));
  }
};

AbstractServerlessControl.prototype.kill = function kill() {
  return Promise.all(
    [
      //
      this.killBackend(),
      this.killDownstreamDummy(),
      this.killMonitoredProcess()
    ].concat(this.killAdditionalAuxiliaryProcesses())
  );
};

AbstractServerlessControl.prototype.killBackend = function killBackend() {
  return this.killChildProcess(this.backend);
};

AbstractServerlessControl.prototype.killDownstreamDummy = function killDownstreamDummy() {
  return this.killChildProcess(this.downstreamDummy);
};

AbstractServerlessControl.prototype.startAdditionalAuxiliaryProcesses = function startAdditionalAuxiliaryProcesses() {
  // Subclasses may override this and fork additional processes there. Return a promise that waits for the process or an
  // array of promises.
};

AbstractServerlessControl.prototype.killAdditionalAuxiliaryProcesses = function killAdditionalAuxiliaryProcesses() {
  // Subclasses may override this. Everything started in startAdditionalAuxiliaryProcesses needs to be terminated here.
};

AbstractServerlessControl.prototype.killChildProcess = function killChildProcess(childProcess) {
  return new Promise(resolve => {
    if (childProcess) {
      childProcess.once('exit', resolve);
      childProcess.kill();
    } else {
      resolve();
    }
  });
};

AbstractServerlessControl.prototype.getSpans = function getSpans() {
  return this._getFromBackend('/received/spans');
};

AbstractServerlessControl.prototype.getMetrics = function getMetrics() {
  return this._getFromBackend('/received/metrics');
};

AbstractServerlessControl.prototype.getRawBundles = function getRawBundles() {
  return this._getFromBackend('/received/raw/bundles');
};

AbstractServerlessControl.prototype.getRawMetrics = function getRawMetrics() {
  return this._getFromBackend('/received/raw/metrics');
};

AbstractServerlessControl.prototype.getRawSpanArrays = function getRawSpanArrays() {
  return this._getFromBackend('/received/raw/spanArrays');
};

AbstractServerlessControl.prototype.getMetrics = function getMetrics() {
  return this._getFromBackend('/received/metrics');
};

AbstractServerlessControl.prototype._getFromBackend = function _getFromBackend(url) {
  if (this.backendHasBeenStarted) {
    return request({
      method: 'GET',
      url: `${this.backendBaseUrl}${url}`,
      json: true,
      strictSSL: false
    });
  } else {
    return Promise.resolve([]);
  }
};

AbstractServerlessControl.prototype.resetBackend = function resetBackend() {
  if (this.backendHasBeenStarted) {
    return request({
      method: 'DELETE',
      url: `${this.backendBaseUrl}/received`,
      strictSSL: false
    });
  } else {
    return Promise.resolve([]);
  }
};

AbstractServerlessControl.prototype.setResponsive = function setResponsive(responsive) {
  if (responsive == null) {
    responsive = true;
  }
  if (this.backendHasBeenStarted) {
    return request({
      method: 'POST',
      url: `${this.backendBaseUrl}/responsive?responsive=${responsive}`,
      strictSSL: false
    });
  } else {
    return Promise.resolve([]);
  }
};

module.exports = AbstractServerlessControl;
