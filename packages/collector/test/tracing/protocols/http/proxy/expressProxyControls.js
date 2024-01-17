/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const errors = require('request-promise/errors');
const path = require('path');
const request = require('request-promise');
const spawn = require('child_process').spawn;

const portfinder = require('../../../../test_util/portfinder');
const testUtils = require('../../../../../../core/test/test_util');
const config = require('../../../../../../core/test/config');
const agentPort = require('../../../../globalAgent').instance.agentPort;
const upstreamPort = require('../../../../apps/expressControls').appPort;
const appPort = (exports.appPort = portfinder());

let expressProxyApp;

exports.registerTestHooks = (opts = {}) => {
  beforeEach(() => {
    const env = Object.create(process.env);
    env.AGENT_PORT = opts.useGlobalAgent ? agentPort : opts.agentControls.agentPort;
    env.APP_PORT = appPort;
    env.UPSTREAM_PORT = upstreamPort;
    env.STACK_TRACE_LENGTH = opts.stackTraceLength || 0;

    expressProxyApp = spawn('node', [path.join(__dirname, 'expressProxy.js')], {
      stdio: config.getAppStdio(),
      env
    });

    return waitUntilServerIsUp();
  });

  afterEach(() => expressProxyApp.kill());
};

function waitUntilServerIsUp() {
  return testUtils.retry(() =>
    request({
      method: 'GET',
      url: `http://localhost:${appPort}`,
      headers: {
        'X-INSTANA-L': '0'
      }
    })
  );
}

exports.getPid = () => expressProxyApp.pid;

exports.sendRequest = opts => {
  opts.responseStatus = opts.responseStatus || 200;
  opts.delay = opts.delay || 0;

  const headers = {};
  if (opts.suppressTracing === true) {
    headers['X-INSTANA-L'] = '0';
  }

  return request({
    method: opts.method,
    url: `http://localhost:${appPort}${opts.path}`,
    qs: {
      responseStatus: opts.responseStatus,
      delay: opts.delay,
      url: opts.target,
      httpLib: opts.httpLib
    },
    headers
  }).catch(
    errors.StatusCodeError,
    (
      reason // treat all status code errors as likely // allowed
    ) => reason
  );
};
