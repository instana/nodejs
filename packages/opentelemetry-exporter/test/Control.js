/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const AbstractServerlessControl = require('@instana/serverless/test/util/AbstractServerlessControl');
const portfinder = require('@instana/collector/test/test_util/portfinder');
const { fork } = require('child_process');
const fetch = require('node-fetch-v2');

class Control extends AbstractServerlessControl {
  constructor(opts) {
    opts.startDownstreamDummy = false;
    super(opts);

    this.otelApp = null;
    this.messagesFromTestApp = [];
    this.backendPort = this.opts.backendPort || portfinder();
    this.port = this.opts.port || portfinder();
    this.useHttps = 'backendHttps' in this.opts ? this.opts.backendHttps : false;
    const protocol = this.useHttps ? 'https' : 'http';
    this.backendBaseUrl = this.opts.backendBaseUrl || `${protocol}://localhost:${this.backendPort}/serverless`;
    this.instanaEndpoint = `${protocol}://localhost:${this.backendPort}/`;
  }

  startMonitoredProcess() {
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
    const response = await fetch(`http://localhost:${this.port}${opts.path}`);
    return response.json();
  }

  getPort() {
    return this.port;
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
}

exports.Control = Control;
