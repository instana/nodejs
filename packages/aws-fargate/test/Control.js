'use strict';

const { fork } = require('child_process');
const path = require('path');
const request = require('request-promise');
const {
  assert: { fail }
} = require('chai');

const config = require('../../serverless/test/config');
const AbstractServerlessControl = require('../../serverless/test/util/AbstractServerlessControl');

const PATH_TO_INSTANA_FARGATE_PACKAGE = path.join(__dirname, '..');

function Control(opts) {
  AbstractServerlessControl.call(this, opts);
  this.port = opts.port || 4215;
  this.baseUrl = `http://127.0.0.1:${this.port}`;
  this.backendPort = this.opts.backendPort || 9443;
  this.backendBaseUrl = this.opts.backendBaseUrl || `https://localhost:${this.backendPort}/serverless`;
  this.downstreamDummyPort = this.opts.downstreamDummyPort || 4567;
  this.downstreamDummyUrl = this.opts.downstreamDummyUrl || `http://localhost:${this.downstreamDummyPort}`;
  this.metadataMockPort = this.opts.metadataMockPort || 1604;
  this.metadataMockUrl = this.opts.metadataMockUrl || `http://localhost:${this.metadataMockPort}`;
  this.platformVersion = this.opts.platformVersion || '1.3.0';
  this.instanaAgentKey = this.opts.instanaAgentKey || 'aws-fargate-dummy-key';
}

Control.prototype = Object.create(AbstractServerlessControl.prototype);

Control.prototype.reset = function reset() {
  AbstractServerlessControl.prototype.reset.call(this);
  this.messageFromFargateTask = [];
  this.messagesFromMetadataMock = [];

  this.fargateContainerAppHasStarted = false;
  this.fargateContainerAppHasTerminated = false;
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
        METADATA_MOCK_PORT: this.metadataMockPort,
        PLATFORM_VERSION: this.platformVersion
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
      ECS_CONTAINER_METADATA_URI: this.metadataMockUrl,
      TASK_HTTP_PORT: this.port,
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

  this.fargateContainerApp = fork(this.opts.containerAppPath, {
    stdio: config.getAppStdio(),
    execArgv: ['--require', PATH_TO_INSTANA_FARGATE_PACKAGE],
    env
  });
  this.fargateContainerAppHasStarted = true;

  this.fargateContainerApp.on('exit', () => {
    this.fargateContainerAppHasTerminated = true;
  });

  this.fargateContainerApp.on('message', message => {
    this.messageFromFargateTask.push(message);
  });
};

Control.prototype.hasMonitoredProcessStarted = function hasMonitoredProcessStarted() {
  return this.messageFromFargateTask.indexOf('fargate-task: listening') >= 0 && !this.fargateContainerAppHasTerminated;
};

Control.prototype.hasMonitoredProcessTerminated = function hasMonitoredProcessTerminated() {
  return !this.fargateContainerAppHasStarted || this.fargateContainerAppHasTerminated;
};

Control.prototype.killMonitoredProcess = function killMonitoredProcess() {
  if (!this.hasMonitoredProcessTerminated()) {
    return this.killChildProcess(this.fargateContainerApp);
  }
  return Promise.resolve();
};

Control.prototype.sendRequest = function(opts) {
  if (opts.suppressTracing === true) {
    opts.headers = opts.headers || {};
    opts.headers['X-INSTANA-L'] = '0';
  }

  opts.url = this.baseUrl + opts.path;
  opts.json = true;
  return request(opts);
};

module.exports = Control;
