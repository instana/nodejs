/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const spawn = require('child_process').spawn;
const fetch = require('node-fetch-v2');
const portFinder = require('../test_util/portfinder');
const path = require('path');
const _ = require('lodash');

const { retry, delay } = require('../../../core/test/test_util');
const config = require('../../../core/test/config');

class AgentStubControls {
  constructor(agentPort) {
    this.agentPort = agentPort || portFinder();
  }

  async startAgent(opts = {}) {
    const env = Object.create(process.env);
    env.AGENT_PORT = this.agentPort;
    env.EXTRA_HEADERS = (opts.extraHeaders || []).join(',');
    env.SECRETS_MATCHER = opts.secretsMatcher || 'contains-ignore-case';
    env.SECRETS_LIST = (opts.secretsList || []).join(',');
    env.SECRETS_LIST = (opts.secretsList || []).join(',');
    if (opts.rejectTraces) {
      env.REJECT_TRACES = 'true';
    }
    if (opts.doesntHandleProfiles) {
      env.DOESNT_HANDLE_PROFILES = 'true';
    }
    if (typeof opts.tracingMetrics === 'boolean') {
      env.TRACING_METRICS = opts.tracingMetrics.toString();
    }
    if (opts.enableSpanBatching) {
      env.ENABLE_SPANBATCHING = 'true';
    }
    if (opts.kafkaConfig) {
      if (opts.kafkaConfig.traceCorrelation != null) {
        env.KAFKA_TRACE_CORRELATION = opts.kafkaConfig.traceCorrelation.toString();
      }
    }
    // This is not the INSTANA_IGNORE_ENDPOINTS env. We  use this "IGNORE_ENDPOINTS" env for the fake agent to
    // serve the ignore endpoints config to our tracer.
    if (opts.ignoreEndpoints) {
      env.IGNORE_ENDPOINTS = JSON.stringify(opts.ignoreEndpoints);
    }

    if (opts.disable) {
      env.AGENT_DISABLE_TRACING = JSON.stringify(opts.disable);
    }

    this.agentStub = spawn('node', [path.join(__dirname, 'agentStub.js')], {
      stdio: config.getAppStdio(),
      env
    });

    await this.waitUntilAgentHasStarted();
  }

  stopAgent() {
    this.agentStub.kill();

    // eslint-disable-next-line no-console
    console.log(`[AgentStubControls] Stopped agent stub with pid ${this.agentStub.pid}`);
  }

  getPort() {
    return this.agentPort;
  }

  async waitUntilAgentHasStarted() {
    const url = `http://127.0.0.1:${this.agentPort}`;

    // eslint-disable-next-line no-console
    console.log(`[AgentStubControls] starting: ${url}`);

    try {
      await retry(() =>
        fetch(url, {
          method: 'GET',
          url
        })
      );

      // eslint-disable-next-line no-console
      console.log(`[AgentStubControls] started with pid ${this.agentStub.pid}`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log(`agentStubControls: error waiting until server (${url}) is up: ${err.message}`);
    }
  }

  async waitUntilAppIsCompletelyInitialized(originalPid, retryTime, until) {
    let pid;
    if (typeof originalPid === 'number') {
      pid = String(originalPid);
    } else if (typeof originalPid === 'string') {
      pid = originalPid;
    } else {
      throw new Error(`PID ${originalPid} has invalid type ${typeof originalPid}.`);
    }

    await retry(
      () =>
        this.getDiscoveries().then(discoveries => {
          const reportingPids = Object.keys(discoveries);
          if (reportingPids.includes(pid)) {
            return true;
          }
          throw new Error(`PID ${pid} never sent any data to the agent.`);
        }),
      retryTime,
      until
    );
  }

  getDiscoveries() {
    return fetch(`http://127.0.0.1:${this.agentPort}/discoveries`, {
      method: 'GET',
      json: true
    }).then(response => response.json());
  }

  rejectAnnounceAttempts(rejectedAttempts = 1) {
    return fetch(`http://127.0.0.1:${this.agentPort}/reject-announce-attempts?attempts=${rejectedAttempts}`, {
      method: 'POST'
    });
  }

  deleteDiscoveries() {
    return fetch(`http://127.0.0.1:${this.agentPort}/discoveries`, {
      method: 'DELETE'
    });
  }

  getReceivedData() {
    return fetch(`http://127.0.0.1:${this.agentPort}/received/data`, {
      method: 'GET'
    }).then(response => response.json());
  }

  getAggregatedMetrics(pid) {
    return fetch(`http://127.0.0.1:${this.agentPort}/received/aggregated/metrics/${pid}`, {
      method: 'GET'
    }).then(response => response.json());
  }

  getEvents() {
    return fetch(`http://127.0.0.1:${this.agentPort}/received/events`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    }).then(response => response.json());
  }

  getMonitoringEvents() {
    return fetch(`http://127.0.0.1:${this.agentPort}/received/monitoringEvents`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    }).then(response => response.json());
  }

  clearReceivedMonitoringEvents() {
    return fetch(`http://127.0.0.1:${this.agentPort}/received/monitoringEvents`, {
      method: 'DELETE'
    });
  }

  async reset() {
    // eslint-disable-next-line no-console
    console.log(`[AgentStubControls] reset ${this.agentPort}`);

    return retry(async () => {
      await fetch(`http://127.0.0.1:${this.agentPort}/`, {
        method: 'DELETE',
        json: true
      });
    });
  }

  clearReceivedData() {
    return fetch(`http://127.0.0.1:${this.agentPort}/received/data`, {
      method: 'DELETE'
    });
  }

  async clearReceivedTraceData() {
    // always wait 1000ms before we reset the data in case a retry happens
    // and we want to ensure that no more data is incoming from the app.
    await delay(1000);

    return retry(async () => {
      // eslint-disable-next-line no-console
      // console.log('[AgentStubControls] clearReceivedTraceData');
      await fetch(`http://127.0.0.1:${this.agentPort}/received/traces`, {
        method: 'DELETE'
      });

      // eslint-disable-next-line no-console
      // console.log('[AgentStubControls] clearReceivedTraceData done');
    });
  }

  clearReceivedProfilingData() {
    return fetch(`http://127.0.0.1:${this.agentPort}/received/profiles`, {
      method: 'DELETE'
    });
  }

  clearReceivedEvents() {
    return fetch(`http://127.0.0.1:${this.agentPort}/received/events`, {
      method: 'DELETE'
    });
  }

  async getSpans() {
    const data = await this.getReceivedData();
    return data.traces.reduce((result, traceMessage) => result.concat(traceMessage.data), []);
  }

  async getProfiles() {
    const data = await this.getReceivedData();
    return data.profiles.reduce((result, profile) => result.concat(profile.data), []);
  }

  async getResponses() {
    const data = await this.getReceivedData();
    return data.responses;
  }

  getTracingMetrics() {
    return fetch(`http://127.0.0.1:${this.agentPort}/received/tracingMetrics`, {
      method: 'GET',
      json: true
    }).then(response => response.json());
  }

  simulateDiscovery(pid) {
    return fetch(`http://127.0.0.1:${this.agentPort}/com.instana.plugin.nodejs.discovery`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        pid: pid
      })
    }).then(response => response.json());
  }

  async addEntityData(pid, data) {
    const response = await fetch(`http://127.0.0.1:${this.agentPort}/com.instana.plugin.nodejs.${pid}`, {
      method: 'POST',
      json: true,
      body: data
    });
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return response.json();
    } else {
      return response.text();
    }
  }

  async addRequestForPid(pid, r) {
    const response = await fetch(`http://127.0.0.1:${this.agentPort}/request/${pid}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(r)
    });
    return response.json();
  }

  async getLastMetricValue(pid, _path) {
    const data = await this.getReceivedData();
    return findLastMetricValueInResponse(pid, data, _path);
  }

  async getAllMetrics(pid) {
    const data = await this.getReceivedData();
    return filterByPid(pid, data);
  }
}

exports.AgentStubControls = AgentStubControls;

function findLastMetricValueInResponse(pid, data, _path) {
  for (let i = data.metrics.length - 1; i >= 0; i--) {
    const metricsMessage = data.metrics[i];
    if (metricsMessage.pid !== pid) {
      continue;
    }

    const value = _.get(metricsMessage.data, _path, undefined);
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function filterByPid(pid, data) {
  return data.metrics.filter(metricsMessage => metricsMessage.pid === pid);
}
