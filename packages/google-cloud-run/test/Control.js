/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const { fork } = require('child_process');
const path = require('path');
const request = require('request-promise');
const {
  assert: { fail }
} = require('chai');

const config = require('../../serverless/test/config');
const AbstractServerlessControl = require('../../serverless/test/util/AbstractServerlessControl');

const PATH_TO_INSTANA_GOOGLE_CLOUD_RUN_PACKAGE = path.join(__dirname, '..');

function Control(opts) {
  AbstractServerlessControl.call(this, opts);
  this.port = opts.port || 4216;
  this.baseUrl = `http://127.0.0.1:${this.port}`;
  this.backendPort = this.opts.backendPort || 9444;
  this.backendBaseUrl = this.opts.backendBaseUrl || `https://localhost:${this.backendPort}/serverless`;
  this.downstreamDummyPort = this.opts.downstreamDummyPort || 4568;
  this.downstreamDummyUrl = this.opts.downstreamDummyUrl || `http://localhost:${this.downstreamDummyPort}`;
  this.metadataMockPort = this.opts.metadataMockPort || 1605;
  this.metadataMockHost = this.opts.metadataMockHost || `http://localhost:${this.metadataMockPort}`;
  this.instanaAgentKey = this.opts.instanaAgentKey || 'google-cloud-run-dummy-key';
}

Control.prototype = Object.create(AbstractServerlessControl.prototype);

Control.prototype.reset = function reset() {
  AbstractServerlessControl.prototype.reset.call(this);
  this.messagesFromCloudRunContainer = [];
  this.messagesFromMetadataMock = [];
  this.googleCloudRunAppHasStarted = false;
  this.googleCloudRunAppHasTerminated = false;
};

Control.prototype.registerTestHooks = function registerTestHooks() {
  AbstractServerlessControl.prototype.registerTestHooks.call(this);
  beforeEach(() => {
    if (!this.opts.containerAppPath) {
      fail('opts.containerAppPath is unspecified.');
    }
  });
  return this;
};

Control.prototype.startAdditionalAuxiliaryProcesses = function startAdditionalAuxiliaryProcesses() {
  this.metadataMock = fork(path.join(__dirname, './metadata_mock'), {
    stdio: config.getAppStdio(),
    env: Object.assign(
      {
        METADATA_MOCK_PORT: this.metadataMockPort
      },
      process.env,
      this.opts.env
    )
  });
  this.metadataMock.on('message', message => {
    this.messagesFromMetadataMock.push(message);
  });
  return this.waitUntilProcessIsUp('metadata mock', this.messagesFromMetadataMock, 'metadata mock: started');
};

Control.prototype.killAdditionalAuxiliaryProcesses = function killDownstreamDummy() {
  return this.killChildProcess(this.metadataMock);
};

Control.prototype.startMonitoredProcess = function startMonitoredProcess() {
  const env = Object.assign(
    {
      CUSTOM_METADATA_HOST: this.metadataMockHost,
      PORT: this.port,
      K_SERVICE: 'nodejs-google-cloud-run-test',
      K_REVISION: 'nodejs-google-cloud-run-test-00042-heq',
      K_CONFIGURATION: 'nodejs-google-cloud-run-test',
      DOWNSTREAM_DUMMY_URL: this.downstreamDummyUrl,
      INSTANA_DISABLE_CA_CHECK: true,
      INSTANA_TRACING_TRANSMISSION_DELAY: 500,
      INSTANA_LOG_LEVEL: 'debug'
    },
    process.env,
    this.opts.env
  );

  if (this.opts.unconfigured !== false) {
    env.INSTANA_ENDPOINT_URL = this.backendBaseUrl;
    env.INSTANA_AGENT_KEY = this.instanaAgentKey;
  }

  this.cloudRunContainerApp = fork(this.opts.containerAppPath, {
    stdio: config.getAppStdio(),
    execArgv: ['--require', PATH_TO_INSTANA_GOOGLE_CLOUD_RUN_PACKAGE],
    env
  });
  this.googleCloudRunAppHasStarted = true;

  this.cloudRunContainerApp.on('exit', () => {
    this.googleCloudRunAppHasTerminated = true;
  });

  this.cloudRunContainerApp.on('message', message => {
    this.messagesFromCloudRunContainer.push(message);
  });
};

Control.prototype.hasMonitoredProcessStarted = function hasMonitoredProcessStarted() {
  return (
    this.messagesFromCloudRunContainer.indexOf('cloud-run-service: listening') >= 0 &&
    !this.googleCloudRunAppHasTerminated
  );
};

Control.prototype.hasMonitoredProcessTerminated = function hasMonitoredProcessTerminated() {
  return !this.googleCloudRunAppHasStarted || this.googleCloudRunAppHasTerminated;
};

Control.prototype.killMonitoredProcess = function killMonitoredProcess() {
  if (!this.hasMonitoredProcessTerminated()) {
    return this.killChildProcess(this.cloudRunContainerApp);
  }
  return Promise.resolve();
};

Control.prototype.sendRequest = function (opts) {
  if (opts.suppressTracing === true) {
    opts.headers = opts.headers || {};
    opts.headers['X-INSTANA-L'] = '0';
  }

  opts.url = this.baseUrl + opts.path;
  opts.json = true;
  return request(opts);
};

module.exports = Control;
