/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const { fork } = require('child_process');
const portfinder = require('@_local/collector/test/test_util/portfinder');
const retry = require('@_local/core/test/test_util/retry');
const config = require('@_local/core/test/config');
const AbstractServerlessControl = require('@_local/serverless/test/util/AbstractServerlessControl');

function Control(opts) {
  AbstractServerlessControl.call(this, opts);

  // With `startExtension` you can start the extension stub on a different port.
  // parallel to the backend stub.
  if (this.opts.startExtension) {
    this.extensionPort = portfinder();
  }

  this.backendPort = this.opts.backendPort || portfinder();
  this.backendUsesHttps = 'backendUsesHttps' in this.opts ? this.opts.backendUsesHttps : false;

  if (this.backendUsesHttps) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  }

  const backendProtocol = this.backendUsesHttps ? 'https' : 'http';
  this.backendBaseUrl = this.opts.backendBaseUrl || `${backendProtocol}://localhost:${this.backendPort}/serverless`;

  this.extensionBaseUrl = `http://localhost:${this.extensionPort}`;
  this.downstreamDummyPort = this.opts.downstreamDummyPort || portfinder();
  this.downstreamDummyUrl = this.opts.downstreamDummyUrl || `http://localhost:${this.downstreamDummyPort}`;

  this.disableInstanaDebug = this.opts.disableInstanaDebug === true;
  this.longHandlerRun = this.opts.longHandlerRun || false;
  this.proxyPort = this.opts.proxyPort;
}

Control.prototype = Object.create(AbstractServerlessControl.prototype);

Control.prototype.reset = function reset() {
  AbstractServerlessControl.prototype.reset.call(this);
  this.clientContext = {};
  this.messagesFromFaasRuntime = [];
  this.lambdaErrors = [];
  this.lambdaResults = [];
  this.expectedHandlerRuns = 0;
  this.startedAt = 0;
};

Control.prototype.startMonitoredProcess = function startMonitoredProcess() {
  const self = this;
  const envs = {
    HANDLER_DEFINITION_PATH: this.opts.handlerDefinitionPath,
    DOWNSTREAM_DUMMY_URL: this.downstreamDummyUrl,
    INSTANA_DISABLE_CA_CHECK: this.backendUsesHttps,
    INSTANA_DEV_SEND_UNENCRYPTED: !this.backendUsesHttps,
    WAIT_FOR_MESSAGE: true,
    INSTANA_ENDPOINT_URL: this.backendBaseUrl,
    INSTANA_LAYER_EXTENSION_PORT: this.extensionPort,
    INSTANA_LAMBDA_SSM_TIMEOUT_IN_MS: 1000,
    INSTANA_AWS_SSM_TIMEOUT_IN_MS: 1000 * 10
  };

  // If the test does not make use of `startExtension`, we assume its not using the extension.
  if (!('startExtension' in this.opts)) {
    envs.INSTANA_DISABLE_LAMBDA_EXTENSION = true;
  }

  this.faasRuntime = fork(this.opts.faasRuntimePath, {
    stdio: config.getAppStdio(),
    // eslint-disable-next-line prefer-object-spread
    env: Object.assign(envs, process.env, this.opts.env)
  });

  this.faasRuntime.on('message', message => {
    // eslint-disable-next-line no-console
    console.log('[Control] received message from faasRuntime', message.type || message);

    if (message.type === 'lambda-result') {
      if (message.error) {
        this.lambdaErrors.push(message.payload);
      } else {
        this.lambdaResults.push(message.payload);
      }
    } else if (message.type === 'lambda-context') {
      this.clientContext = message.context.clientContext;
    } else if (message.type === 'lambda-timeout') {
      self.faasRuntime.kill();
    } else {
      this.messagesFromFaasRuntime.push(message);
    }
  });
};

Control.prototype.hasMonitoredProcessStarted = function hasMonitoredProcessStarted() {
  return this.messagesFromFaasRuntime.indexOf('runtime: started') >= 0;
};

Control.prototype.runHandler = function runHandler({ context, event, eventOpts } = {}) {
  // eslint-disable-next-line no-console
  console.log('[Control] runHandler');
  this.startedAt = Date.now();
  this.faasRuntime.send({ cmd: 'run-handler', context, event, eventOpts });
  this.expectedHandlerRuns++;
  return this.waitUntilHandlerHasRun();
};

Control.prototype.waitUntilHandlerHasRun = function waitUntilHandlerHasRun() {
  if (!this.opts.longHandlerRun) return retry(() => this.hasHandlerRunPromise());

  return retry(
    () => this.hasHandlerRunPromise(),
    1000,
    Date.now() + this.opts.env.DELAY * this.opts.env.ITERATIONS + 5000
  );
};

Control.prototype.hasHandlerRunPromise = function hasHandlerRunPromise() {
  if (this.hasHandlerRun()) {
    // eslint-disable-next-line no-console
    console.log('[Control] handler finished');
    return Promise.resolve();
  } else {
    return Promise.reject(
      new Error(
        `Expected the handler to have been running ${this.expectedHandlerRuns} time(s), ` +
          `but it ran only ${this.countHandlerRuns()} time(s).`
      )
    );
  }
};

Control.prototype.hasHandlerRun = function hasHandlerRun() {
  return this.countHandlerRuns() >= this.expectedHandlerRuns;
};

Control.prototype.countHandlerRuns = function countHandlerRuns() {
  return this.lambdaErrors.length + this.lambdaResults.length;
};

Control.prototype.hasMonitoredProcessTerminated = function hasMonitoredProcessTerminated() {
  return this.messagesFromFaasRuntime.indexOf('runtime: terminating') >= 0;
};

Control.prototype.killMonitoredProcess = function killMonitoredProcess() {
  if (!this.hasMonitoredProcessTerminated()) {
    return this.killChildProcess(this.faasRuntime);
  }
  return Promise.resolve();
};

Control.prototype.getLambdaResults = function getLambdaResults() {
  return this.lambdaResults;
};

Control.prototype.getLambdaErrors = function getLambdaErrors() {
  return this.lambdaErrors;
};

Control.prototype.getClientContext = function getClientContext() {
  return this.clientContext;
};

module.exports = Control;
