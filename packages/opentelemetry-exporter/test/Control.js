/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const AbstractServerlessControl = require('@instana/serverless/test/util/AbstractServerlessControl');
const { fork } = require('child_process');
const fetch = require('node-fetch');

const {
  assert: { fail }
} = require('chai');

class Control extends AbstractServerlessControl {
  constructor(opts) {
    opts.startDownstreamDummy = false;
    super(opts);

    this.otelApp = null;
    this.messagesFromTestApp = [];
    this.backendPort = this.opts.backendPort || 10443;
    this.useHttps = true;
    const protocol = this.useHttps ? 'https' : 'http';
    this.backendBaseUrl = this.opts.backendBaseUrl || `${protocol}://localhost:${this.backendPort}/serverless`;
  }

  startMonitoredProcess() {
    this.otelApp = fork(this.opts.otelAppPath, {
      env: { ...(this.opts.env || {}) }
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
    const response = await fetch(`http://localhost:${this.opts.env.PORT}${opts.path}`);
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

  registerTestHooks() {
    super.registerTestHooks();

    beforeEach(() => {
      if (!this.opts.otelAppPath) {
        fail('opts.otelAppPath is unspecified.');
      }
    });

    return this;
  }
}

exports.Control = Control;
