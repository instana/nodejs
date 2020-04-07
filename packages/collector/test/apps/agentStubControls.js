'use strict';

const spawn = require('child_process').spawn;
const request = require('request-promise');
const path = require('path');
const _ = require('lodash');

const testUtils = require('../../../core/test/test_util');
const config = require('../../../core/test/config');

const agentPort = (exports.agentPort = 3210);

let agentStub;

exports.registerTestHooks = opts => {
  opts = opts || {};

  beforeEach(() => {
    const env = Object.create(process.env);
    env.AGENT_PORT = agentPort;
    env.EXTRA_HEADERS = (opts.extraHeaders || []).join(',');
    env.SECRETS_MATCHER = opts.secretsMatcher || 'contains-ignore-case';
    env.SECRETS_LIST = (opts.secretsList || []).join(',');
    env.SECRETS_LIST = (opts.secretsList || []).join(',');
    if (opts.rejectTraces) {
      env.REJECT_TRACES = 'true';
    }
    if (typeof opts.tracingMetrics === 'boolean') {
      env.TRACING_METRICS = opts.tracingMetrics.toString();
    }

    agentStub = spawn('node', [path.join(__dirname, 'agentStub.js')], {
      stdio: config.getAppStdio(),
      env
    });

    return waitUntilServerIsUp();
  });

  afterEach(() => {
    agentStub.kill();
  });
};

function waitUntilServerIsUp() {
  return testUtils.retry(() =>
    request({
      method: 'GET',
      url: `http://127.0.0.1:${agentPort}`
    })
  );
}

exports.getDiscoveries = () =>
  request({
    method: 'GET',
    url: `http://127.0.0.1:${agentPort}/discoveries`,
    json: true
  });

exports.deleteDiscoveries = () =>
  request({
    method: 'DELETE',
    url: `http://127.0.0.1:${agentPort}/discoveries`,
    json: true
  });

exports.getRetrievedData = () =>
  request({
    method: 'GET',
    url: `http://127.0.0.1:${agentPort}/retrievedData`,
    json: true
  });

exports.getEvents = () =>
  request({
    method: 'GET',
    url: `http://127.0.0.1:${agentPort}/retrievedEvents`,
    json: true
  });

exports.clearRetrievedData = () =>
  request({
    method: 'DELETE',
    url: `http://127.0.0.1:${agentPort}/retrievedData`,
    json: true
  });

exports.getSpans = () =>
  exports
    .getRetrievedData()
    .then(data => data.traces.reduce((result, traceMessage) => result.concat(traceMessage.data), []));

exports.getResponses = () => exports.getRetrievedData().then(data => data.responses);

exports.getLastMetricValue = (pid, _path) =>
  exports.getRetrievedData().then(data => getLastMetricValue(pid, data, _path));

function getLastMetricValue(pid, data, _path) {
  for (let i = data.runtime.length - 1; i >= 0; i--) {
    const runtimeMessage = data.runtime[i];
    if (runtimeMessage.pid !== pid) {
      // eslint-disable-next-line no-continue
      continue;
    }

    const value = _.get(runtimeMessage.data, _path, undefined);
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

exports.getAllMetrics = pid => exports.getRetrievedData().then(data => getAllMetrics(pid, data));

function getAllMetrics(pid, data) {
  return data.runtime.filter(runtimeMessage => runtimeMessage.pid === pid);
}

exports.getTracingMetrics = () =>
  request({
    method: 'GET',
    url: `http://127.0.0.1:${agentPort}/retrievedTracingMetrics`,
    json: true
  });

exports.waitUntilAppIsCompletelyInitialized = pid =>
  testUtils.retry(() =>
    exports.getRetrievedData().then(data => {
      for (let i = 0, len = data.runtime.length; i < len; i++) {
        const d = data.runtime[i];
        if (d.pid === pid) {
          return true;
        }
      }

      throw new Error(`PID ${pid} never sent any data to the agent.`);
    })
  );

exports.simulateDiscovery = pid =>
  request({
    method: 'PUT',
    url: `http://127.0.0.1:${agentPort}/com.instana.plugin.nodejs.discovery`,
    json: true,
    body: {
      pid
    }
  });

exports.addEntityData = (pid, data) =>
  request({
    method: 'POST',
    url: `http://127.0.0.1:${agentPort}/com.instana.plugin.nodejs.${pid}`,
    json: true,
    body: data
  });

exports.addRequestForPid = (pid, r) =>
  request({
    method: 'POST',
    url: `http://127.0.0.1:${agentPort}/request/${pid}`,
    json: true,
    body: r
  });
