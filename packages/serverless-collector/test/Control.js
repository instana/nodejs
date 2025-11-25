/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const { fork } = require('child_process');
const path = require('path');
const fetch = require('node-fetch-v2');
const portfinder = require('@instana/collector/test/test_util/portfinder');
const config = require('@instana/core/test/config');
const AbstractServerlessControl = require('../../serverless/test/util/AbstractServerlessControl');

const SERVERLESS_COLLECTOR_PATH = path.join(__dirname, '..');
let execArg;

class Control extends AbstractServerlessControl {
  constructor(opts) {
    super(opts);
    this.port = opts.port || portfinder();
    this.backendUsesHttps = 'backendUsesHttps' in opts ? opts.backendUsesHttps : true;

    if (this.backendUsesHttps) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }

    this.backendPort = opts.backendPort || portfinder();
    this.serverlessUninitialized = opts.serverlessUninitialized;
    this.baseUrl = `http://127.0.0.1:${this.port}`;
    this.backendPort = this.opts.backendPort || portfinder();
    const backendProtocol = this.backendUsesHttps ? 'https' : 'http';
    this.backendBaseUrl = this.opts.backendBaseUrl || `${backendProtocol}://localhost:${this.backendPort}/serverless`;
    this.downstreamDummyPort = this.opts.downstreamDummyPort || portfinder();
    this.downstreamDummyUrl = this.opts.downstreamDummyUrl || `http://localhost:${this.downstreamDummyPort}`;
    this.instanaAgentKey = this.opts.instanaAgentKey || 'serverless-collector-dummy-key';
  }

  reset() {
    super.reset();
    this.messagesFromServerlessCollector = [];
    this.serverlessAppHasStarted = false;
    this.serverlessAppHasTerminated = false;
  }

  startMonitoredProcess() {
    const env = {
      APP_PORT: this.port,
      DOWNSTREAM_DUMMY_URL: this.downstreamDummyUrl,
      INSTANA_DISABLE_CA_CHECK: this.backendUsesHttps ? 'true' : 'false',
      INSTANA_DEV_SEND_UNENCRYPTED: this.backendUsesHttps ? 'false' : 'true',
      INSTANA_TRACING_TRANSMISSION_DELAY: 500,
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
      execArg = this.opts.containerAppPath.endsWith('.mjs') ? loaderPath : ['--require', SERVERLESS_COLLECTOR_PATH];
    } else {
      execArg = ['--require', SERVERLESS_COLLECTOR_PATH];
    }

    this.serverlessApp = fork(this.opts.containerAppPath, {
      stdio: config.getAppStdio(),
      execArgv: execArg,
      env
    });

    this.serverlessAppHasStarted = true;

    this.serverlessApp.on('exit', () => {
      this.serverlessAppHasTerminated = true;
    });

    this.serverlessApp.on('message', message => {
      this.messagesFromServerlessCollector.push(message);
    });
  }

  hasMonitoredProcessStarted() {
    if (this.serverlessUninitialized) {
      return (
        this.messagesFromServerlessCollector.indexOf('serverless-collector-app: listening') >= 0 &&
        this.messagesFromServerlessCollector.indexOf('instana.serverless-collector.initialized') === -1 &&
        !this.serverlessAppHasTerminated
      );
    } else {
      return (
        this.messagesFromServerlessCollector.indexOf('serverless-collector-app: listening') >= 0 &&
        this.messagesFromServerlessCollector.indexOf('instana.serverless-collector.initialized') >= 0 &&
        !this.serverlessAppHasTerminated
      );
    }
  }

  killMonitoredProcess() {
    return this.killChildProcess(this.serverlessApp);
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
