/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const { fork } = require('child_process');
const path = require('path');

const portfinder = require('@instana/collector/test/test_util/portfinder');
const config = require('@instana/core/test/config');
const AbstractServerlessControl = require('../../serverless/test/util/AbstractServerlessControl');

const PATH_TO_INSTANA_AZURE_PACKAGE = path.join(__dirname, '..');
let execArg;

class Control extends AbstractServerlessControl {
  constructor(opts) {
    super(opts);
    this.port = opts.port || portfinder();
    this.azureContainerUninitialized = opts.azureContainerUninitialized;

    this.backendUsesHttps = 'backendUsesHttps' in opts ? opts.backendUsesHttps : false;
    if (this.backendUsesHttps) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }
    this.baseUrl = `http://127.0.0.1:${this.port}`;
    this.backendPort = this.opts.backendPort || portfinder();

    const backendProtocol = this.backendUsesHttps ? 'https' : 'http';
    this.backendBaseUrl = this.opts.backendBaseUrl || `${backendProtocol}://localhost:${this.backendPort}/serverless`;
    this.downstreamDummyPort = this.opts.downstreamDummyPort || portfinder();
    this.downstreamDummyUrl = this.opts.downstreamDummyUrl || `http://localhost:${this.downstreamDummyPort}`;
    this.instanaAgentKey = this.opts.instanaAgentKey || 'azure-dummy-key';
  }

  reset() {
    super.reset();
    this.messagesFromAzureContainer = [];
    this.azureContainerAppHasStarted = false;
    this.azureContainerAppHasTerminated = false;
  }

  startMonitoredProcess() {
    const env = {
      APP_PORT: this.port,
      DOWNSTREAM_DUMMY_URL: this.downstreamDummyUrl,
      INSTANA_DISABLE_CA_CHECK: this.backendUsesHttps ? 'true' : 'false',
      INSTANA_TRACING_TRANSMISSION_DELAY: 500,
      INSTANA_DEV_SEND_UNENCRYPTED: !this.backendUsesHttps,
      INSTANA_LOG_LEVEL: 'debug',
      ...process.env,
      ...this.opts.env
    };

    if (this.opts.unconfigured !== false) {
      env.INSTANA_ENDPOINT_URL = this.backendBaseUrl;
      env.INSTANA_AGENT_KEY = this.instanaAgentKey;
    }

    const loaderPath = ['--import', `${path.join(__dirname, '..', 'esm-register.mjs')}`];

    if (this.opts.containerAppPath && this.opts.env && this.opts.env.ESM_TEST) {
      execArg = this.opts.containerAppPath.endsWith('.mjs') ? loaderPath : ['--require', PATH_TO_INSTANA_AZURE_PACKAGE];
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
  }

  hasMonitoredProcessStarted() {
    if (this.azureContainerUninitialized) {
      return (
        this.messagesFromAzureContainer.indexOf('azure-app-service: listening') >= 0 &&
        this.messagesFromAzureContainer.indexOf('instana.azure-app-service.initialized') === -1 &&
        !this.azureContainerAppHasTerminated
      );
    } else {
      return (
        this.messagesFromAzureContainer.indexOf('azure-app-service: listening') >= 0 &&
        this.messagesFromAzureContainer.indexOf('instana.azure-app-service.initialized') >= 0 &&
        !this.azureContainerAppHasTerminated
      );
    }
  }

  killMonitoredProcess() {
    return this.killChildProcess(this.azureContainerApp);
  }

  sendRequest(opts) {
    if (opts.suppressTracing) {
      opts.headers = { ...(opts.headers || {}), 'X-INSTANA-L': '0' };
    }

    opts.url = `${this.baseUrl}${opts.path}`;
    opts.json = true;
    return fetch(opts.url, opts).then(response => {
      return response.json();
    });
  }

  getPort() {
    return this.port;
  }
}

module.exports = Control;
