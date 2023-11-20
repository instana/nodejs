/*
 * (c) Copyright IBM Corp. 2023
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

const PATH_TO_INSTANA_AZURE_PACKAGE = path.join(__dirname, '..');
let execArg;
function Control(opts) {
  AbstractServerlessControl.call(this, opts);
  this.port = opts.port || 4215;
  this.baseUrl = `http://127.0.0.1:${this.port}`;
  this.backendPort = this.opts.backendPort || 9443;
  this.backendBaseUrl = this.opts.backendBaseUrl || `https://localhost:${this.backendPort}/serverless`;
  this.downstreamDummyPort = this.opts.downstreamDummyPort || 4569;
  this.downstreamDummyUrl = this.opts.downstreamDummyUrl || `http://localhost:${this.downstreamDummyPort}`;
  this.instanaAgentKey = this.opts.instanaAgentKey || 'azure-dummy-key';
}

Control.prototype = Object.create(AbstractServerlessControl.prototype);

Control.prototype.reset = function reset() {
  AbstractServerlessControl.prototype.reset.call(this);
  this.messagesFromAzureContainer = [];
  this.messagesFromMetadataMock = [];
  this.azureContainerAppHasStarted = false;
  this.azureContainerAppHasTerminated = false;
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

Control.prototype.killAdditionalAuxiliaryProcesses = function killDownstreamDummy() {
  return this.killChildProcess(this.metadataMock);
};

Control.prototype.startMonitoredProcess = function startMonitoredProcess() {
  const env = Object.assign(
    {
      PORT: this.port,
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
  if (this.opts.containerAppPath && this.opts.env && this.opts.env.ESM_TEST) {
    if (this.opts.containerAppPath.endsWith('.mjs')) {
      execArg = [`--experimental-loader=${path.join(__dirname, '..', 'esm-loader.mjs')}`];
    } else {
      execArg = ['--require', PATH_TO_INSTANA_AZURE_PACKAGE];
    }
  } else {
    execArg = ['--require', PATH_TO_INSTANA_AZURE_PACKAGE];
  }

  this.azureContainerApp = fork(this.opts.containerAppPath, {
    stdio: config.getAppStdio(),
    execArgv: execArg,
    env
  });
  this.azureContainerAppHasStarted = true;

  this.azureContainerApp.on('exit', () => {
    this.azureContainerAppHasTerminated = true;
  });

  this.azureContainerApp.on('message', message => {
    this.messagesFromAzureContainer.push(message);
  });
};

Control.prototype.hasMonitoredProcessStarted = function hasMonitoredProcessStarted() {
  return (
    this.messagesFromAzureContainer.indexOf('azure-app-service: listening') >= 0 && !this.azureContainerAppHasTerminated
  );
};

Control.prototype.hasMonitoredProcessTerminated = function hasMonitoredProcessTerminated() {
  return !this.azureContainerAppHasStarted || this.azureContainerAppHasTerminated;
};

Control.prototype.killMonitoredProcess = function killMonitoredProcess() {
  if (!this.hasMonitoredProcessTerminated()) {
    return this.killChildProcess(this.azureContainerApp);
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
