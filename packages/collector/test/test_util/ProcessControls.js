/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

/* eslint-disable max-len */

'use strict';

const _ = require('lodash');
const fork = require('child_process').fork;
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch-v2');

const config = require('../../../core/test/config');
const http2Promise = require('./http2Promise');
const testUtils = require('../../../core/test/test_util');
const globalAgent = require('../globalAgent');
const portFinder = require('./portfinder');
const sslDir = path.join(__dirname, '..', 'apps', 'ssl');
const cert = fs.readFileSync(path.join(sslDir, 'cert'));
const isLatestEsmSupportedVersion = require('@instana/core').util.esm.isLatestEsmSupportedVersion;

class ProcessControls {
  /**
   * @typedef {Object} ProcessControlsOptions
   * @property {string} [appPath]
   * @property {string} [cwd]
   * @property {number} [port]
   * @property {string} [dirname]
   * @property {boolean} [dontKillInAfterHook]
   * @property {boolean} [http2]
   * @property {Array.<string>} [args]
   * @property {Array.<string>} [execArgv]
   * @property {number} [minimalDelay]
   * @property {boolean} [usePreInit]
   * @property {boolean} [useGlobalAgent]
   * @property {boolean} [tracingEnabled]
   * @property {*} [agentControls]
   * @property {Object.<string, *} [env]
   */

  /**
   * @param {ProcessControlsOptions} opts
   */
  constructor(opts = {}) {
    if (!opts.appPath && !opts.dirname) {
      throw new Error('Missing mandatory config option, either appPath or dirname needs to be provided.');
    }
    if (opts.appPath && opts.dirname) {
      throw new Error('Invalid config, appPath and dirname are mutually exclusive.');
    }

    if (!opts.appPath && opts.dirname) {
      opts.appPath = path.join(opts.dirname, 'app.js');
    }

    if (process.env.RUN_ESM && !opts.execArgv) {
      const resolveEsmLoader = () =>
        isLatestEsmSupportedVersion(process.versions.node)
          ? [`--import=${path.join(__dirname, '..', '..', 'esm-register.mjs')}`]
          : [`--experimental-loader=${path.join(__dirname, '..', '..', 'esm-loader.mjs')}`];

      try {
        // Custom appPath is provided, use that. here we check the exact file name for esm app
        if (opts?.appPath) {
          const updatedPath = opts.appPath.endsWith('.js')
            ? opts.appPath.replace(/\.js$/, '.mjs')
            : `${opts.appPath}.mjs`;

          const esmApp = testUtils.checkESMApp({ appPath: updatedPath });

          if (esmApp) {
            opts.execArgv = resolveEsmLoader();
            opts.appPath = updatedPath;
          }
        } else if (opts?.dirname) {
          const esmApp = testUtils.checkESMApp({ appPath: path.join(opts.dirname, 'app.mjs') });
          if (esmApp) {
            opts.execArgv = resolveEsmLoader();
            opts.appPath = path.join(opts.dirname, 'app.mjs');
          }
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.log('Unable to load the target app.mjs', err);
      }
    }

    this.collectorUninitialized = opts.collectorUninitialized;

    this.processLogs = [];

    // absolute path to .js file that should be executed
    this.appPath = opts.appPath;
    // optional working directory for the child process
    this.cwd = opts.cwd;
    // for scenarios where the app under tests terminates on its own
    this.dontKillInAfterHook = opts.dontKillInAfterHook;
    // arguments for the app under test
    this.args = opts.args;
    // command line flags for the Node.js executable
    this.execArgv = opts.execArgv;
    // server http2
    this.http2 = opts.http2;
    // whether or not to use TLS
    this.useHttps = opts.env && !!opts.env.USE_HTTPS;

    // http/https/http2 port
    this.port = opts.port || process.env.APP_PORT || portFinder();

    this.tracingEnabled = opts.tracingEnabled !== false;
    this.usePreInit = opts.usePreInit === true;

    // Signals that this process intends to connect to the test suite's global agent stub on port 3211. Setting this to
    // true will result in a before/beforeEach call which ensures that the collector is successfully connected to that
    // agent.
    this.useGlobalAgent = opts.useGlobalAgent;

    // As an alternative to connecting to the global agent, process control instances can use an individual instance of
    // AgentStubControls (and consequently their own agent stub process). Passing an agent control instance will result
    // in a before/beforeEach call which ensures that the collector is successfully connected to that agent.
    this.useGlobalAgent = opts.useGlobalAgent;
    this.agentControls = opts.agentControls;
    if (!this.agentControls && this.useGlobalAgent) {
      this.agentControls = globalAgent.instance;
    }

    const agentPort = this.agentControls ? this.agentControls.agentPort : undefined;

    this.env = _.assign(
      {},
      process.env,
      {
        APP_PORT: this.port,
        INSTANA_AGENT_PORT: agentPort,
        INSTANA_LOG_LEVEL: 'warn',
        INSTANA_DISABLE_TRACING: !this.tracingEnabled,
        INSTANA_FORCE_TRANSMISSION_STARTING_AT: '1',
        INSTANA_DEV_MIN_DELAY_BEFORE_SENDING_SPANS: opts.minimalDelay != null ? opts.minimalDelay : 0,
        INSTANA_FULL_METRICS_INTERNAL_IN_S: 1,
        INSTANA_FIRE_MONITORING_EVENT_DURATION_IN_MS: 500,
        INSTANA_RETRY_AGENT_CONNECTION_IN_MS: 500
      },
      opts.env
    );

    if (this.usePreInit) {
      this.env.INSTANA_EARLY_INSTRUMENTATION = 'true';
    }

    this.receivedIpcMessages = [];
  }

  getPort() {
    return this.port;
  }

  async start(retryTime, until, skipWaitUntilServerIsUp = false) {
    const that = this;
    this.receivedIpcMessages = [];

    const stdio = this.env.WITH_FULL_STDIO ? ['pipe', 'pipe', 'pipe', 'ipc'] : config.getAppStdio();

    const forkConfig = {
      stdio,
      env: this.env
    };

    if (this.cwd) {
      forkConfig.cwd = this.cwd;
    }
    if (this.execArgv) {
      forkConfig.execArgv = this.execArgv;
    }

    this.process = this.args ? fork(this.appPath, this.args || [], forkConfig) : fork(this.appPath, forkConfig);

    this.process.on('message', message => {
      if (message === 'instana.collector.initialized') {
        this.process.collectorInitialized = true;
      } else {
        that.receivedIpcMessages.push(message);
      }
    });

    this.process.stdout && this.process.stdout.on('data', data => this.processLogs.push(data.toString()));
    this.process.stderr && this.process.stderr.on('data', data => this.processLogs.push(data.toString()));

    if (skipWaitUntilServerIsUp) return;
    await this.waitUntilServerIsUp(retryTime, until);
  }

  async stop() {
    await this.kill();
  }

  async waitUntilServerIsUp(retryTime, until) {
    try {
      await testUtils.retry(
        async () => {
          await this.sendRequest({
            method: 'GET',
            suppressTracing: true,
            checkStatusCode: true
          });

          if (this.collectorUninitialized) return;
          if (!this.process.collectorInitialized) throw new Error('Collector not fullly initialized.');
        },
        retryTime,
        until
      );

      // eslint-disable-next-line no-console
      console.log('[ProcessControls] server is up.');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log(`[ProcessControls] error: ${err}`);
      throw err;
    }
  }

  getProcessLogs() {
    return this.processLogs;
  }

  async startAndWaitForAgentConnection(retryTime, until) {
    // eslint-disable-next-line no-console
    console.log(
      `[ProcessControls] start with port: ${this.getPort()}, agentPort: ${this.agentControls.getPort()}, appPath: ${
        this.appPath
      }`
    );

    await this.clearIpcMessages();
    await this.start(retryTime, until);
    await this.agentControls.waitUntilAppIsCompletelyInitialized(this.getPid(), retryTime, until);

    // eslint-disable-next-line no-console
    console.log(
      `[ProcessControls] started with port: ${this.getPort()}, agentPort: ${this.agentControls.getPort()}, appPath: ${
        this.appPath
      }, pid: ${this.process.pid}`
    );
  }

  async waitForAgentConnection() {
    await this.agentControls.waitUntilAppIsCompletelyInitialized(this.getPid());
  }

  clearIpcMessages() {
    this.receivedIpcMessages = [];
  }

  getPid() {
    if (!this.process) {
      return false;
    }
    return this.process.pid;
  }

  /**
   * @param opts {{
   *   suppressTracing: boolean,
   *   url: string,
   *   json: boolean,
   *   ca: Buffer,
   *   headers: {
   *     'X-INSTANA-L': '0' | '1',
   *     [key:string]: any
   *   }
   * }} The request options
   */
  async sendRequest(opts = {}) {
    const requestOpts = Object.assign({}, opts);
    const resolveWithFullResponse = requestOpts.resolveWithFullResponse;
    const checkStatusCode = requestOpts.checkStatusCode;

    // NOTE: http2Promise.request has an inbuild property called "resolveWithFullResponse"
    //       fetch does not have, manual implementation.
    delete requestOpts.resolveWithFullResponse;
    delete requestOpts.checkStatusCode;

    const baseUrl = this.getBaseUrl(opts);

    if (this.http2) {
      requestOpts.baseUrl = baseUrl;
      requestOpts.resolveWithFullResponse = resolveWithFullResponse;
      return http2Promise.request(requestOpts);
    } else {
      if (requestOpts.suppressTracing === true) {
        requestOpts.headers = requestOpts.headers || {};
        requestOpts.headers['X-INSTANA-L'] = '0';
      }

      requestOpts.url = baseUrl + (requestOpts.path || '');

      if (requestOpts.qs) {
        const queryParams = Object.entries(requestOpts.qs)
          .map(([key, value]) => {
            if (Array.isArray(value)) {
              return value.map(v => `${encodeURIComponent(key)}=${encodeURIComponent(v)}`).join('&');
            } else {
              return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
            }
          })
          .join('&');

        requestOpts.url = requestOpts.url.includes('?')
          ? `${requestOpts.url}&${queryParams}`
          : `${requestOpts.url}?${queryParams}`;
      }

      requestOpts.json = true;
      requestOpts.ca = cert;

      let response;
      const result = await fetch(requestOpts.url, requestOpts);
      const contentType = result.headers.get('content-type');

      if (contentType && contentType.includes('application/json')) {
        response = await result.json();
      } else if (contentType && (contentType.includes('text/html') || contentType.includes('text/plain'))) {
        response = await result.text();
      } else {
        // CASE: Some tests do not use express and then the header is missing
        //       Some tests use `res.send`, which is not a JSON response.
        response = await result.text();
      }

      if (checkStatusCode) {
        if (result.status < 200 || result.status >= 300) {
          throw new Error(response);
        }
      }

      if (resolveWithFullResponse) {
        return {
          headers: result.headers,
          body: response
        };
      }

      return response;
    }
  }

  getBaseUrl({ embedCredentialsInUrl }) {
    return `${this.useHttps || this.http2 ? 'https' : 'http'}://${
      // eslint-disable-next-line no-unneeded-ternary
      embedCredentialsInUrl ? embedCredentialsInUrl : ''
    }localhost:${this.port}`;
  }

  sendViaIpc(message) {
    this.process.send(message);
  }

  getIpcMessages() {
    return this.receivedIpcMessages;
  }

  kill() {
    if (!this.process) {
      return Promise.resolve();
    }
    if (this.process.killed || this.dontKillInAfterHook) {
      return Promise.resolve();
    }

    // eslint-disable-next-line no-console
    console.log(
      `[ProcessControls] stopping with port: ${this.getPort()}, agentPort: ${
        this.agentControls && this.agentControls.getPort && this.agentControls.getPort()
      }, appPath: ${this.appPath}, pid: ${this.process.pid}`
    );

    return new Promise(resolve => {
      this.process.once('exit', () => {
        this.process.pid = null;

        // eslint-disable-next-line no-console
        console.log(
          `[ProcessControls] stopped with port: ${this.getPort()}, agentPort: ${
            this.agentControls && this.agentControls.getPort && this.agentControls.getPort()
          }, appPath: ${this.appPath}, pid: ${this.process.pid}`
        );

        resolve();
      });

      // Sends SIGTERM to the child process to terminate it gracefully.
      this.process.kill();
    });
  }

  toString() {
    return `${this.process && this.process.pid ? this.process.pid : '-'} (${this.appPath})`;
  }
}

module.exports = ProcessControls;
