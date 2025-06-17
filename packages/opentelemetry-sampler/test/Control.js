/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const { fork } = require('child_process');
const fetch = require('node-fetch-v2');
const AbstractServerlessControl = require('../../serverless/test/util/AbstractServerlessControl');
const portfinder = require('../../collector/test/test_util/portfinder');

class Control extends AbstractServerlessControl {
  constructor(opts) {
    opts.startDownstreamDummy = false;
    super(opts);

    this.otelApp = null;
    this.messagesFromTestApp = [];

    this.backendPort = this.opts.backendPort || portfinder();
    this.port = this.opts.port || portfinder();

    this.backendUsesHttps = 'backendUsesHttps' in this.opts ? this.opts.backendUsesHttps : false;

    if (this.backendUsesHttps) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }

    const backendProtocol = this.backendUsesHttps ? 'https' : 'http';
    this.backendBaseUrl = this.opts.backendBaseUrl || `${backendProtocol}://localhost:${this.backendPort}/serverless`;
    this.instanaEndpoint = `${backendProtocol}://localhost:${this.backendPort}/serverless`;
  }

  startMonitoredProcess() {
    // eslint-disable-next-line no-console
    console.log('[Control] startMonitoredProcess');

    this.otelApp = fork(this.opts.otelAppPath, {
      env: Object.assign(
        {
          INSTANA_ENDPOINT_URL: this.instanaEndpoint,
          APP_PORT: this.port
        },
        this.opts.env
      )
    });

    this.otelApp.on('message', message => {
      // eslint-disable-next-line no-console
      console.log('[Control] message', message);
      this.messagesFromTestApp.push(message);
    });
  }

  getTestAppPid() {
    return this.otelApp.pid;
  }

  /**
   * @typedef {Object} ControlRequestOptions
   * @property {string} [path]
   */

  /**
   * @param {fetch.Request & ControlRequestOptions} [opts]
   */
  async sendRequest(opts = {}) {
    if (!opts.path) {
      throw new Error('The option path must be provided');
    }

    const headers = Object.assign(
      {
        'X-INSTANA-L': opts.suppressTracing ? '0' : '1'
      },
      opts.extraHeaders || {}
    );

    const response = await fetch(`http://localhost:${this.port}${opts.path}`, {
      headers
    });

    return response.json();
  }

  hasMonitoredProcessTerminated() {
    return this.messagesFromTestApp.indexOf('runtime: terminating') >= 0;
  }

  hasMonitoredProcessStartedPromise() {
    return new Promise((resolve, reject) => {
      if (this.messagesFromTestApp.includes('runtime: started')) {
        resolve();
      } else {
        reject();
      }
    });
  }

  killMonitoredProcess() {
    return this.killChildProcess(this.otelApp);
  }

  getPort() {
    return this.port;
  }
}

exports.Control = Control;
