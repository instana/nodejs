/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const spawn = require('child_process').spawn;
const path = require('path');
const portfinder = require('../../../test_util/portfinder');

const testUtils = require('../../../../../core/test/test_util');
const config = require('../../../../../core/test/config');

const expressControls = require('../../../apps/expressControls');
const agentControls = require('../../../globalAgent').instance;

class AppControls {
  constructor(opts = {}) {
    this.appPort = portfinder();
    this.processLogs = [];
    this.pipeSubprocessLogs = false;
    this.appName = 'app.js';

    if (opts.instanaLoggingMode) {
      switch (opts.instanaLoggingMode) {
        case 'uses-default-logger':
          this.appName = 'app-uses-default-logger.js';
          break;
        case 'receives-pino-logger':
          this.appName = 'app-receives-pino-logger.js';
          break;
        case 'receives-custom-dummy-logger':
          this.appName = 'app-receives-custom-dummy-logger.js';
          break;
        case 'receives-bunyan-logger':
          this.appName = 'app-receives-bunyan-logger.js';
          break;
        case 'receives-winston-logger':
          this.appName = 'app-receives-winston-logger.js';
          break;
        case 'receives-log4js-logger':
          this.appName = 'app-receives-log4js-logger.js';
          break;
        default:
          throw new Error(`Unknown app: ${opts.instanaLoggingMode}`);
      }

      if (opts.env) {
        this.customEnv = opts.env;
      }

      if (opts.pipeSubprocessLogs) {
        this.pipeSubprocessLogs = true;
      }
    }
  }

  getProcessLogs() {
    return this.processLogs;
  }

  async start(opts = {}) {
    let env = Object.create(process.env);

    env.AGENT_PORT = agentControls.getPort();
    env.APP_PORT = this.appPort;
    env.UPSTREAM_PORT = expressControls.getPort();
    env.STACK_TRACE_LENGTH = opts.stackTraceLength || 0;
    env.TRACING_ENABLED = opts.enableTracing !== false;
    env.INSTANA_RETRY_AGENT_CONNECTION_IN_MS = 100;
    env.PINO_VERSION = opts.PINO_VERSION;

    if (this.customEnv) {
      env = Object.assign(env, this.customEnv);
    }

    let stdio = config.getAppStdio();
    if (this.pipeSubprocessLogs) {
      stdio = ['pipe', 'pipe', 'pipe', 'ipc'];
    }

    this.appProcess = spawn('node', [path.join(__dirname, this.appName)], {
      stdio,
      env
    });

    this.appProcess.on('message', msg => {
      if (msg === 'instana.collector.initialized') {
        this.appProcess.collectorInitialized = true;
      }
    });

    if (this.pipeSubprocessLogs) {
      this.appProcess.stdout &&
        this.appProcess.stdout.on('data', data => {
          // eslint-disable-next-line no-console
          console.log('Child Stdout:', data.toString());
          this.processLogs.push(data.toString());
        });

      this.appProcess.stderr &&
        this.appProcess.stderr.on('data', data => {
          // eslint-disable-next-line no-console
          console.log('Child Stderr:', data.toString());
          this.processLogs.push(data.toString());
        });
    }

    await this.waitUntilServerIsUp();
  }

  stop() {
    this.appProcess.kill();
  }

  async waitUntilServerIsUp() {
    return testUtils.retry(async () => {
      await fetch(`http://127.0.0.1:${this.appPort}`, {
        method: 'GET',
        headers: {
          'X-INSTANA-L': '0'
        }
      });

      if (!this.appProcess.collectorInitialized) throw new Error('Collector not fullly initialized.');
    });
  }

  getPid() {
    return this.appProcess.pid;
  }

  trigger(level, headers = {}) {
    return fetch(`http://127.0.0.1:${this.appPort}/${level}`, { headers });
  }
}

module.exports = AppControls;
