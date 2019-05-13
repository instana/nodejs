/* eslint-env mocha */

'use strict';

const fork = require('child_process').fork;
const fail = require('chai').assert.fail;
const path = require('path');
const request = require('request-promise');

const retry = require('./retry');
const config = require('../config');

function Control(opts = {}) {
  this.opts = opts;
  this.reset();
}

Control.prototype.reset = function reset() {
  this.messagesFromAcceptor = [];
  this.messagesFromDownstreamDummy = [];
  this.messagesFromFaasRuntime = [];
  this.lambdaErrors = [];
  this.lambdaResults = [];
};

Control.prototype.registerTestHooks = function registerTestHooks() {
  beforeEach(() => {
    if (!this.opts.faasRuntimePath) {
      fail('opts.faasRuntimePath is unspecified.');
    } else if (!this.opts.handlerDefinitionPath) {
      fail('opts.handlerDefinitionPath is unspecified.');
    }

    this.messagesFromAcceptor = [];
    this.messagesFromDownstreamDummy = [];
    this.messagesFromFaasRuntime = [];

    let acceptorPromise;
    if (this.opts.startAcceptor) {
      this.acceptor = fork(path.join(__dirname, '../acceptor_stub'), {
        stdio: config.getAppStdio(),
        env: Object.assign(
          {
            ACCEPTOR_PORT: config.acceptorPort,
            ACCEPTOR_UNRESPONSIVE: this.opts.startAcceptor === 'unresponsive'
          },
          process.env,
          this.opts.env
        )
      });
      this.acceptor.on('message', message => {
        this.messagesFromAcceptor.push(message);
      });
      acceptorPromise = this.waitUntilAcceptorIsUp();
    } else {
      acceptorPromise = Promise.resolve();
    }

    this.downstreamDummy = fork(path.join(__dirname, '../downstream_dummy'), {
      stdio: config.getAppStdio(),
      env: Object.assign(
        {
          DOWNSTREAM_DUMMY_PORT: config.downstreamDummyPort
        },
        process.env,
        this.opts.env
      )
    });
    this.downstreamDummy.on('message', message => {
      this.messagesFromDownstreamDummy.push(message);
    });
    const downstreamDummyPromise = this.waitUntilDownstreamDummyIsUp();

    return Promise.all([acceptorPromise, downstreamDummyPromise])
      .then(() => {
        this.faasRuntime = fork(this.opts.faasRuntimePath, {
          stdio: config.getAppStdio(),
          env: Object.assign(
            {
              HANDLER_DEFINITION_PATH: this.opts.handlerDefinitionPath,
              INSTANA_DEV_ACCEPT_SELF_SIGNED_CERT: true
            },
            process.env,
            this.opts.env
          )
        });

        this.faasRuntime.on('message', message => {
          if (message.type === 'lambda-result') {
            if (message.error) {
              this.lambdaErrors.push(message.payload);
            } else {
              this.lambdaResults.push(message.payload);
            }
          } else {
            this.messagesFromFaasRuntime.push(message);
          }
        });

        return this.waitUntilRuntimeHasTerminated();
      })
      .catch(e => {
        fail('A child process did not start properly: ' + e);
      });
  });

  afterEach(() => {
    this.reset();
    this.kill();
  });
};

Control.prototype.waitUntilAcceptorIsUp = function waitUntilAcceptorIsUp() {
  return retry(() => this.isAcceptorUpPromise());
};

Control.prototype.isAcceptorUpPromise = function isAcceptorUpPromise() {
  if (this.isAcceptorUp()) {
    return Promise.resolve();
  } else {
    return Promise.reject(new Error('The acceptor mock is still not up.'));
  }
};

Control.prototype.isAcceptorUp = function isAcceptorUp() {
  return this.messagesFromAcceptor.indexOf('acceptor: started') >= 0;
};

Control.prototype.waitUntilDownstreamDummyIsUp = function waitUntilDownstreamDummyIsUp() {
  return retry(() => this.isDownstreamDummyUpPromise());
};

Control.prototype.isDownstreamDummyUpPromise = function isDownstreamDummyUpPromise() {
  if (this.isDownstreamDummyUp()) {
    return Promise.resolve();
  } else {
    return Promise.reject(new Error('The downstream dummy app is still not up.'));
  }
};

Control.prototype.isDownstreamDummyUp = function isDownstreamDummyUp() {
  return this.messagesFromDownstreamDummy.indexOf('downstream dummy: started') >= 0;
};

Control.prototype.waitUntilRuntimeHasTerminated = function waitUntilRuntimeHasTerminated() {
  return retry(() => this.hasRuntimeTerminatedPromise());
};

Control.prototype.hasRuntimeTerminatedPromise = function hasRuntimeTerminatedPromise() {
  if (this.hasRuntimeTerminated()) {
    return Promise.resolve();
  } else {
    return Promise.reject(new Error('The FaaS runtime has still not terminated.'));
  }
};

Control.prototype.hasRuntimeTerminated = function hasRuntimeTerminated() {
  return this.messagesFromFaasRuntime.indexOf('runtime: terminating') >= 0;
};

Control.prototype.kill = function kill() {
  return Promise.all([this.killAcceptor(), this.killDownstreamDummy(), this.killFaasRuntime()]);
};

Control.prototype.killAcceptor = function killAcceptor() {
  return killChildProcess(this.acceptor);
};

Control.prototype.killDownstreamDummy = function killDownstreamDummy() {
  return killChildProcess(this.downstreamDummy);
};

Control.prototype.killFaasRuntime = function killFaasRuntime() {
  if (!this.hasRuntimeTerminated()) {
    return killChildProcess(this.faasRuntime);
  }
};

function killChildProcess(childProcess) {
  return new Promise(resolve => {
    if (childProcess) {
      childProcess.once('exit', resolve);
      childProcess.kill();
    } else {
      resolve();
    }
  });
}

Control.prototype.getLambdaResults = function getLambdaResults() {
  return this.lambdaResults;
};

Control.prototype.getLambdaErrors = function getLambdaErrors() {
  return this.lambdaErrors;
};

Control.prototype.getSpans = function getSpans() {
  if (this.opts.startAcceptor) {
    return request({
      method: 'GET',
      url: config.acceptorBaseUrl + '/received/spans',
      json: true,
      strictSSL: false
    });
  } else {
    return Promise.resolve([]);
  }
};

Control.prototype.getMetrics = function getMetrics() {
  if (this.opts.startAcceptor) {
    return request({
      method: 'GET',
      url: config.acceptorBaseUrl + '/received/metrics',
      json: true,
      strictSSL: false
    });
  } else {
    return Promise.resolve([]);
  }
};

module.exports = Control;
