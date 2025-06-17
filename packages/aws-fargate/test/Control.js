/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const { fork } = require('child_process');
const path = require('path');
const fetch = require('node-fetch-v2');

const config = require('@instana/core/test/config');
const AbstractServerlessControl = require('../../serverless/test/util/AbstractServerlessControl');
const portfinder = require('../../collector/test/test_util/portfinder');
const PATH_TO_INSTANA_FARGATE_PACKAGE = path.join(__dirname, '..');
const isLatestEsmSupportedVersion = require('@instana/core').util.esm.isLatestEsmSupportedVersion;
let execArg;

function Control(opts) {
  AbstractServerlessControl.call(this, opts);
  this.port = opts.port || portfinder();
  this.useHttps = 'backendHttps' in opts ? opts.backendHttps : false;

  const protocol = this.useHttps ? 'https' : 'http';

  // We execute requests from THIS process. If any url runs on https,
  // we need to disable the TLS certificate check, otherwise the request will fail.
  // Refer to the problem discussed in https://github.com/node-fetch/node-fetch/issues/1
  if (this.useHttps) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  }

  this.fargateUninitialized = opts.fargateUninitialized;
  this.baseUrl = `http://127.0.0.1:${this.port}`;
  this.backendPort = this.opts.backendPort || portfinder();
  this.backendBaseUrl = this.opts.backendBaseUrl || `${protocol}://localhost:${this.backendPort}/serverless`;
  this.downstreamDummyPort = this.opts.downstreamDummyPort || portfinder();
  this.downstreamDummyUrl = this.opts.downstreamDummyUrl || `http://localhost:${this.downstreamDummyPort}`;
  this.metadataMockPort = this.opts.metadataMockPort || portfinder();
  this.metadataMockUrl = this.opts.metadataMockUrl || `http://localhost:${this.metadataMockPort}`;
  this.proxyPort = this.opts.proxyPort;
  this.proxyUrl = this.opts.proxyUrl;
  this.platformVersion = this.opts.platformVersion || '1.3.0';
  this.instanaAgentKey = this.opts.instanaAgentKey || 'aws-fargate-dummy-key';
}

Control.prototype = Object.create(AbstractServerlessControl.prototype);

Control.prototype.reset = function reset() {
  AbstractServerlessControl.prototype.reset.call(this);
  this.messagesFromFargateTask = [];
  this.messagesFromMetadataMock = [];
  this.fargateContainerAppHasStarted = false;
  this.fargateContainerAppHasTerminated = false;
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
      INSTANA_DEV_SEND_UNENCRYPTED: this.opts.useHttps ? 'false' : 'true',
      INSTANA_TRACING_TRANSMISSION_DELAY: 500,
      INSTANA_ZONE: 'custom-zone',
      INSTANA_TAGS: ' tag_with_value = a value with spaces , tag_without_value ',
      INSTANA_LOG_LEVEL: 'debug'
    },
    process.env,
    this.opts.env
  );

  if (this.opts.unconfigured !== false) {
    env.INSTANA_ENDPOINT_URL = this.backendBaseUrl;
    env.INSTANA_AGENT_KEY = this.instanaAgentKey;
  }

  const loaderPath = isLatestEsmSupportedVersion(process.versions.node)
    ? ['--import', `${path.join(__dirname, '..', 'esm-register.mjs')}`]
    : [`--experimental-loader=${path.join(__dirname, '..', 'esm-loader.mjs')}`];

  if (this.opts.containerAppPath && this.opts.env && this.opts.env.ESM_TEST) {
    if (this.opts.containerAppPath.endsWith('.mjs')) {
      execArg = loaderPath;
    } else {
      execArg = ['--require', PATH_TO_INSTANA_FARGATE_PACKAGE];
    }
  } else {
    execArg = ['--require', PATH_TO_INSTANA_FARGATE_PACKAGE];
  }

  this.fargateContainerApp = fork(this.opts.containerAppPath, {
    stdio: config.getAppStdio(),
    execArgv: execArg,
    env
  });
  this.fargateContainerAppHasStarted = true;

  this.fargateContainerApp.on('exit', () => {
    this.fargateContainerAppHasTerminated = true;
  });

  this.fargateContainerApp.on('message', message => {
    this.messagesFromFargateTask.push(message);
  });
};

Control.prototype.hasMonitoredProcessStarted = function hasMonitoredProcessStarted() {
  if (this.fargateUninitialized) {
    return (
      this.messagesFromFargateTask.indexOf('fargate-task: listening') >= 0 &&
      this.messagesFromFargateTask.indexOf('instana.aws-fargate.initialized') === -1 &&
      !this.fargateContainerAppHasTerminated
    );
  } else {
    return (
      this.messagesFromFargateTask.indexOf('fargate-task: listening') >= 0 &&
      this.messagesFromFargateTask.indexOf('instana.aws-fargate.initialized') >= 0 &&
      !this.fargateContainerAppHasTerminated
    );
  }
};

Control.prototype.hasMonitoredProcessTerminated = function hasMonitoredProcessTerminated() {
  return !this.fargateContainerAppHasStarted || this.fargateContainerAppHasTerminated;
};

Control.prototype.killMonitoredProcess = function killMonitoredProcess() {
  return this.killChildProcess(this.fargateContainerApp);
};

Control.prototype.sendRequest = function (opts) {
  if (opts.suppressTracing === true) {
    opts.headers = opts.headers || {};
    opts.headers['X-INSTANA-L'] = '0';
  }

  opts.url = this.baseUrl + opts.path;
  opts.json = true;
  return fetch(opts.url, opts).then(response => {
    return response.json();
  });
};

Control.prototype.getPort = function () {
  return this.port;
};

module.exports = Control;
