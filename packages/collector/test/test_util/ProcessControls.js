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
const request = require('request-promise');

const config = require('../../../core/test/config');
const http2Promise = require('./http2Promise');
const testUtils = require('../../../core/test/test_util');
const globalAgent = require('../globalAgent');
const portFinder = require('./portfinder');
const sslDir = path.join(__dirname, '..', 'apps', 'ssl');
const cert = fs.readFileSync(path.join(sslDir, 'cert'));

class ProcessControls {
  /**
   * Shorthand for setUpSuiteHooks and setUpTestCaseCleanUpHooks.
   */
  static setUpHooks(...allControls) {
    ProcessControls.setUpHooksWithRetryTime(null, ...allControls);
  }

  /**
   * Shorthand for setUpSuiteHooks and setUpTestCaseCleanUpHooks.
   */
  static setUpHooksWithRetryTime(retryTime, ...allControls) {
    ProcessControls.setUpSuiteHooksWithRetryTime(retryTime, ...allControls);
    ProcessControls.setUpTestCaseCleanUpHooks(...allControls);
  }

  /**
   * Starts the corresponding child process for all given controls before starting the suite and stops them after the
   * suite has finished.
   */
  static setUpSuiteHooks(...allControls) {
    ProcessControls.setUpSuiteHooksWithRetryTime(null, ...allControls);
  }

  /**
   * Starts the corresponding child process for all given controls before starting the suite and stops them after the
   * suite has finished. Ensures that app and agent is booted before the test can start.
   */
  static setUpSuiteHooksWithRetryTime(retryTime, ...allControls) {
    before(() => Promise.all(allControls.map(control => control.startAndWaitForAgentConnection(retryTime))));
    after(() => {
      return Promise.all(allControls.map(control => control.stop()));
    });
  }

  /**
   * Cleans up per test-case data (IPC messages received from the child process) before and after each test case.
   */
  static setUpTestCaseCleanUpHooks(...allControls) {
    beforeEach(() => Promise.all(allControls.map(control => control.clearIpcMessages())));
    afterEach(() => Promise.all(allControls.map(control => control.clearIpcMessages())));
  }

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
      if (opts.dirname) {
        try {
          const files = fs.readdirSync(opts.dirname);
          const esmApp = files.find(f => f.indexOf('.mjs') !== -1);

          if (esmApp) {
            opts.execArgv = [`--experimental-loader=${path.join(__dirname, '..', '..', 'esm-loader.mjs')}`];
            opts.appPath = path.join(opts.dirname, 'app.mjs');
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.log('Unable to load the target app.mjs', err);
        }
      }
    }

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
        INSTANA_DEV_MIN_DELAY_BEFORE_SENDING_SPANS: opts.minimalDelay != null ? opts.minimalDelay : 0
      },
      opts.env
    );
    if (this.usePreInit) {
      this.env.INSTANA_EARLY_INSTRUMENTATION = 'true';
    }

    this.receivedIpcMessages = [];
  }

  /**
   * The _legacy_ convenience method used by tests that start and stop the app under test before/after each test case.
   * If possible, this should be avoided in new tests. Instead, use the static methods of this class named setUpHooks
   * and its to start the app under test once for a whole suite. This is crucial to keep the duration of the whole test
   * suite on CI under control.
   */
  registerTestHooks(retryTime) {
    if (this.agentControls) {
      beforeEach(() => this.startAndWaitForAgentConnection(retryTime));
    } else {
      beforeEach(() => this.start(retryTime));
    }

    afterEach(() => this.stop());

    return this;
  }

  getPort() {
    return this.port;
  }

  async start(retryTime, until) {
    const that = this;
    this.receivedIpcMessages = [];

    const forkConfig = {
      stdio: config.getAppStdio(),
      env: this.env
    };

    if (this.cwd) {
      forkConfig.cwd = this.cwd;
    }
    if (this.execArgv) {
      forkConfig.execArgv = this.execArgv;
    }

    this.process = this.args ? fork(this.appPath, this.args, forkConfig) : fork(this.appPath, forkConfig);

    this.process.on('message', message => {
      that.receivedIpcMessages.push(message);
    });

    await this.waitUntilServerIsUp(retryTime, until);
  }

  async stop() {
    await this.kill();
  }

  async waitUntilServerIsUp(retryTime, until) {
    await testUtils.retry(
      () =>
        this.sendRequest({
          method: 'GET',
          suppressTracing: true
        }),
      retryTime,
      until
    );
  }

  async startAndWaitForAgentConnection(retryTime, until) {
    await this.start(retryTime, until);
    await this.agentControls.waitUntilAppIsCompletelyInitialized(this.getPid());
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
  sendRequest(opts = {}) {
    const requestOptions = Object.assign({}, opts);
    const baseUrl = this.getBaseUrl(opts);
    requestOptions.baseUrl = baseUrl;

    if (this.http2) {
      return http2Promise.request(requestOptions);
    } else {
      if (opts.suppressTracing === true) {
        opts.headers = opts.headers || {};
        opts.headers['X-INSTANA-L'] = '0';
      }

      opts.url = baseUrl + (opts.path || '');
      opts.json = true;
      opts.ca = cert;

      return request(opts);
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

    let killPromiseHasBeenResolved = false;
    return new Promise(resolve => {
      this.process.once('exit', () => {
        this.process.pid = null;
        killPromiseHasBeenResolved = true;
        resolve();
      });

      // Sends SIGTERM to the child process to terminate it gracefully.
      this.process.kill();

      // The code above is usually good enough to terminate the child process gracefully and return a resolved promise.
      // However, Prisma and nyc (Istanbul's command line interface) both do fancy things with signal handling in
      // Node.js. Thus, when running packages/collector/test/tracing/database/prisma/test.js _via nyc_ (as we do in the
      // weekly test coverage job on CI), the Prisma app ignores the SIGTERM for some reason and just keeps running.
      //
      // This can be reproduced locally via
      //
      // cd packages/collector && WITH_STDOUT=true npm_package_name=@instana/collector ../../node_modules/.bin/nyc mocha --config=test/.mocharc.js --require test/hooks.js test/tracing/database/prisma/test.js
      //
      // This seems to be related to the hooks installed by Prisma in
      // packages/collector/test/tracing/database/prisma/node_modules/@prisma/client/runtime/index.js, line 26888:
      // (that is, the line `this.installHook("SIGTERM", true)` and friends). To resolve this conflict, we forcefully
      // kill the child process by sending SIGKILL after one second, when SIGTERM does not have the desired effect of
      // terminating the child process.
      //
      // All of this has been reported as an issue to the Prisma project: https://github.com/prisma/prisma/issues/18063.
      setTimeout(() => {
        if (!killPromiseHasBeenResolved) {
          // eslint-disable-next-line no-console
          console.log(
            `[ProcessControls] ${this} - Child process ${this.process.pid} appears to not have terminated after one second after sending SIGTERM, sending SIGKILL now.`
          );
          this.process.kill('SIGKILL');

          setTimeout(() => {
            if (!killPromiseHasBeenResolved) {
              // eslint-disable-next-line no-console
              console.log(
                `[ProcessControls] ${this} - The promise to kill process ${this.process.pid} has still not been resolved, even after sending SIGKILL. Resolving the promise now unconditionally to unblock the Mocha after hook.`
              );
              resolve();
            }
          }, 1000).unref();
        }
      }, 1000).unref();
    });
  }

  toString() {
    return `${this.process && this.process.pid ? this.process.pid : '-'} (${this.appPath})`;
  }
}

module.exports = ProcessControls;
