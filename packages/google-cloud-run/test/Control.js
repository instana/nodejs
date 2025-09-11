/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const { fork } = require('child_process');
const path = require('path');
const fetch = require('node-fetch-v2');

const portfinder = require('@instana/collector/test/test_util/portfinder');
const config = require('@instana/core/test/config');
const AbstractServerlessControl = require('../../serverless/test/util/AbstractServerlessControl');
const isLatestEsmSupportedVersion = require('@instana/core').coreUtils.esm.isLatestEsmSupportedVersion;
const PATH_TO_INSTANA_GOOGLE_CLOUD_RUN_PACKAGE = path.join(__dirname, '..');

function Control(opts) {
  AbstractServerlessControl.call(this, opts);
  this.port = opts.port || portfinder();
  this.googleCloudRunUninitialized = opts.googleCloudRunUninitialized;
  this.baseUrl = `http://127.0.0.1:${this.port}`;

  this.backendUsesHttps = 'backendUsesHttps' in opts ? opts.backendUsesHttps : false;
  if (this.backendUsesHttps) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  }
  this.backendPort = this.opts.backendPort || portfinder();

  const backendProtocol = this.backendUsesHttps ? 'https' : 'http';
  this.backendBaseUrl = this.opts.backendBaseUrl || `${backendProtocol}://localhost:${this.backendPort}/serverless`;
  this.downstreamDummyPort = this.opts.downstreamDummyPort || portfinder();
  this.downstreamDummyUrl = this.opts.downstreamDummyUrl || `http://localhost:${this.downstreamDummyPort}`;
  this.metadataMockPort = this.opts.metadataMockPort || portfinder();
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
      APP_PORT: this.port,
      K_SERVICE: 'nodejs-google-cloud-run-test',
      K_REVISION: 'nodejs-google-cloud-run-test-00042-heq',
      K_CONFIGURATION: 'nodejs-google-cloud-run-test',
      DOWNSTREAM_DUMMY_URL: this.downstreamDummyUrl,
      INSTANA_DISABLE_CA_CHECK: this.backendUsesHttps ? 'true' : 'false',
      INSTANA_TRACING_TRANSMISSION_DELAY: 500,
      INSTANA_DEV_SEND_UNENCRYPTED: !this.backendUsesHttps,
      INSTANA_LOG_LEVEL: 'debug'
    },
    process.env,
    this.opts.env
  );
  let execArg;
  if (this.opts.unconfigured !== false) {
    env.INSTANA_ENDPOINT_URL = this.backendBaseUrl;
    env.INSTANA_AGENT_KEY = this.instanaAgentKey;
  }

  const loaderPath = isLatestEsmSupportedVersion(process.versions.node)
    ? ['--import', `${path.join(__dirname, '..', 'esm-register.mjs')}`]
    : [`--experimental-loader=${path.join(__dirname, '..', 'esm-loader.mjs')}`];

  if (!this.opts.containerAppPath && this.opts.env && this.opts.env.ESM_TEST) {
    if (this.opts.containerAppPath.endsWith('.mjs')) {
      execArg = loaderPath;
    } else {
      execArg = ['--require', PATH_TO_INSTANA_GOOGLE_CLOUD_RUN_PACKAGE];
    }
  } else {
    execArg = ['--require', PATH_TO_INSTANA_GOOGLE_CLOUD_RUN_PACKAGE];
  }
  this.cloudRunContainerApp = fork(this.opts.containerAppPath, {
    stdio: config.getAppStdio(),
    execArgv: execArg,
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
  if (this.googleCloudRunUninitialized) {
    return (
      this.messagesFromCloudRunContainer.indexOf('cloud-run-service: listening') >= 0 &&
      this.messagesFromCloudRunContainer.indexOf('instana.google-cloud-run.initialized') === -1 &&
      !this.googleCloudRunAppHasTerminated
    );
  } else {
    return (
      this.messagesFromCloudRunContainer.indexOf('cloud-run-service: listening') >= 0 &&
      this.messagesFromCloudRunContainer.indexOf('instana.google-cloud-run.initialized') >= 0 &&
      !this.googleCloudRunAppHasTerminated
    );
  }
};

Control.prototype.hasMonitoredProcessTerminated = function hasMonitoredProcessTerminated() {
  return !this.googleCloudRunAppHasStarted || this.googleCloudRunAppHasTerminated;
};

Control.prototype.killMonitoredProcess = function killMonitoredProcess() {
  return this.killChildProcess(this.cloudRunContainerApp);
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
