'use strict';

const { expect, assert } = require('chai');
const { fail } = assert;
const path = require('path');
const constants = require('@instana/core').tracing.constants;

const Control = require('../Control');
const { delay, expectExactlyOneMatching } = require('../../../core/test/test_util');
const config = require('../../../serverless/test/config');
const retry = require('../../../serverless/test/util/retry');

const downstreamDummyPort = 4567;
const downstreamDummyUrl = `http://localhost:${downstreamDummyPort}/`;

const region = 'us-east-2';
const account = '555123456789';
const instrumentedContainerName = 'nodejs-fargate-test-container';
const taskDefinition = 'nodejs-fargate-test-task-definition';
const taskDefinitionVersion = '42';
const taskArn = `arn:aws:ecs:${region}:${account}:task/55566677-c1e5-5780-9806-aabbccddeeff`;
const dockerId = '01234567890abcdef01234567890abcdef01234567890abcdef01234567890ab';
const image = `${account}.dkr.ecr.us-east-2.amazonaws.com/${taskDefinition}:latest`;
const imageId = 'sha256:fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
const clusterName = 'nodejs-fargate-test-cluster';
const clusterArn = `arn:aws:ecs:us-east-2:${account}:cluster/${clusterName}`;
const instrumentedContainerId = `${taskArn}::${instrumentedContainerName}`;

const secondaryContainerName = '~internal~ecs~pause';
const secondaryContainerId = `${taskArn}::${secondaryContainerName}`;
const secondaryDockerId = '1f11d3be4668926ba50c5a6049bf75103f9c708cb70ad967d96e27fd914067ec';

const containerAppPath = path.join(__dirname, './app');
const instanaAgentKey = 'aws-fargate-dummy-key';

const requestHeaders = {
  'X-Entry-Request-Header-1': 'entry request header value 1',
  'X-Entry-Request-Header-2': ['entry', 'request', 'header', 'value 2'],
  'X-Entry-Request-Header-3': 'not configured to capture this',
  'X-Entry-Request-Header-4': ['not', 'configured', 'to', 'be', 'captured']
};

function prelude(opts = {}) {
  this.timeout(config.getTestTimeout());
  this.slow(config.getTestTimeout() / 2);

  opts.platformVersion = opts.platformVersion || '1.3.0';
  if (opts.startBackend == null) {
    opts.startBackend = true;
  }

  let env = {
    INSTANA_EXTRA_HTTP_HEADERS:
      'x-entry-request-header-1; X-ENTRY-REQUEST-HEADER-2 ; x-entry-response-header-1;X-ENTRY-RESPONSE-HEADER-2 , ' +
      'x-eXit-Request-Header-1; X-EXIT-REQUEST-HEADER-2 '
  };
  if (opts.env) {
    env = {
      ...env,
      ...opts.env
    };
  }

  const controlOpts = {
    ...opts,
    env,
    containerAppPath,
    downstreamDummyPort,
    downstreamDummyUrl,
    instanaAgentKey
  };
  if (opts.proxy) {
    controlOpts.env.INSTANA_ENDPOINT_PROXY = opts.proxy;
  }
  return new Control(controlOpts).registerTestHooks();
}

describe('AWS fargate integration test', function() {
  describe('when the back end is up (platform version 1.3.0)', function() {
    const control = prelude.bind(this)({
      platformVersion: '1.3.0'
    });

    it('should collect metrics and trace http requests', () =>
      control
        .sendRequest({
          method: 'GET',
          path: '/',
          headers: requestHeaders
        })
        .then(response => verify(control, response, true)));
  });

  describe('when the back end is up (platform version 1.4.0)', function() {
    const control = prelude.bind(this)({
      platformVersion: '1.4.0'
    });

    it('should collect metrics and trace http requests', () =>
      control
        .sendRequest({
          method: 'GET',
          path: '/',
          headers: requestHeaders
        })
        .then(response => verify(control, response, true)));
  });

  describe('when the back end is down', function() {
    const control = prelude.bind(this)({
      startBackend: false
    });

    it('should ignore connection failures gracefully', () =>
      control
        .sendRequest({
          method: 'GET',
          path: '/',
          headers: requestHeaders
        })
        .then(response => verify(control, response, false)));
  });

  describe('when the back end becomes available after being down initially', function() {
    const control = prelude.bind(this)({
      startBackend: false
    });

    it('should buffer snapshot data, metrics and spans for a limited time until the back end becomes available', () => {
      // 1. send http request
      let response;
      return control
        .sendRequest({
          method: 'GET',
          path: '/',
          headers: requestHeaders
        })
        .then(_response => {
          response = _response;
          // 2. wait a bit
          return delay(750);
        })
        .then(() =>
          // 3. now start the back end
          control.startBackendAndWaitForIt()
        )
        .then(() => {
          // 4. fargate collector should send uncompressed snapshot data and the spans as soon as the back end comes up
          return verify(control, response, true);
        });
    });
  });

  describe('when using a proxy without authentication', function() {
    const control = prelude.bind(this)({
      startProxy: true,
      proxy: 'http://localhost:4128'
    });

    it('should collect metrics and trace http requests', () =>
      control
        .sendRequest({
          method: 'GET',
          path: '/',
          headers: requestHeaders
        })
        .then(response => verify(control, response, true)));
  });

  describe('when using a proxy with authentication', function() {
    const control = prelude.bind(this)({
      startProxy: true,
      proxy: 'http://user:password@localhost:4128',
      proxyRequiresAuthorization: true
    });

    it('should collect metrics and trace http requests', () =>
      control
        .sendRequest({
          method: 'GET',
          path: '/',
          headers: requestHeaders
        })
        .then(response => verify(control, response, true)));
  });

  describe('when proxy authentication fails due to the wrong password', function() {
    const control = prelude.bind(this)({
      startProxy: true,
      proxy: 'http://user:wrong-password@localhost:4128',
      proxyRequiresAuthorization: true
    });

    it('the fargate container must not be impacted', () =>
      control
        .sendRequest({
          method: 'GET',
          path: '/',
          headers: requestHeaders
        })
        .then(response => verify(control, response, false)));
  });

  describe('when the proxy is not up', function() {
    const control = prelude.bind(this)({
      proxy: 'http://localhost:4128'
    });

    it('the fargate container must not be impacted', () =>
      control
        .sendRequest({
          method: 'GET',
          path: '/',
          headers: requestHeaders
        })
        .then(response => verify(control, response, false)));
  });

  describe('with custom secrets configuration', function() {
    const control = prelude.bind(this)({
      env: {
        INSTANA_SECRETS: 'equals:confidential'
      }
    });

    it('must filter secrets from query params', () =>
      control
        .sendRequest({
          method: 'GET',
          path: '/?q1=some&confidential=topsecret&q2=value',
          headers: requestHeaders
        })
        .then(response =>
          verify(control, response, true).then(([entry]) => {
            expect(entry.data.http.params).to.equal('q1=some&confidential=<redacted>&q2=value');
          })
        ));
  });

  function verify(control, response, expectMetricsAndSpans) {
    expect(response).to.equal('Hello Fargate!');
    if (expectMetricsAndSpans) {
      return retry(() => getAndVerifySnapshotDataAndMetrics(control).then(() => getAndVerifySpans(control)));
    } else {
      return verifyNoSpansAndMetrics(control);
    }
  }

  function getAndVerifySnapshotDataAndMetrics(control) {
    return Promise.all([control.getAggregatedMetrics(), control.getMetrics()]).then(verifySnapshotDataAndMetrics);
  }

  function verifySnapshotDataAndMetrics([allEntities, allSnapshotUpdates]) {
    expect(allEntities).to.be.an('array');
    const expectedNumberOfPlugins = 7;
    if (allEntities.length < expectedNumberOfPlugins) {
      fail(
        'Error: Received less entities than expected: ' +
          `Wanted: ${expectedNumberOfPlugins}, got: ${allEntities.length}. ` +
          'Here are the entities that have been received: ' +
          JSON.stringify(allEntities.map(({ name, entityId }) => ({ name, entityId })), null, 2)
      );
    }
    expect(allEntities).to.have.lengthOf.at.least(expectedNumberOfPlugins);

    verifyEcsTask(allEntities);
    verifyInstrumentedEcsContainer(allEntities);
    verifyInstrumentedDockerPayload(allEntities);

    const processData = verifyProcessPayload(allEntities);
    verifyNodeJsPayload(allEntities, processData);

    verifySecondaryEcsContainerPayload(allEntities);
    verifySecondaryDockerPayload(allEntities);

    verifyHeadersForSnapshotUpdates(allSnapshotUpdates);
  }

  function verifyEcsTask(allEntities) {
    const ecsTaskPayload = allEntities.find(
      pluginPayload => pluginPayload.name === 'com.instana.plugin.aws.ecs.task' && pluginPayload.entityId === taskArn
    );
    expect(ecsTaskPayload).to.exist;
    const ecsTaskData = ecsTaskPayload.data;
    expect(ecsTaskData).to.exist;
    expect(ecsTaskData.taskArn).to.equal(taskArn);
    expect(ecsTaskData.clusterArn).to.equal(clusterArn);
    expect(ecsTaskData.taskDefinition).to.equal(taskDefinition);
    expect(ecsTaskData.taskDefinitionVersion).to.equal(taskDefinitionVersion);
    expect(ecsTaskData.availabilityZone).to.equal('us-east-2b');
    expect(ecsTaskData.instanaZone).to.equal('custom-zone');
    expect(ecsTaskData.desiredStatus).to.equal('RUNNING');
    expect(ecsTaskData.knownStatus).to.equal('RUNNING');
    expect(ecsTaskData.limits.cpu).to.equal(0.25);
    expect(ecsTaskData.limits.memory).to.equal(512);
    expect(ecsTaskData.pullStartedAt).to.equal('2020-03-25T14:34:25.75886719Z');
    expect(ecsTaskData.pullStoppedAt).to.equal('2020-03-25T14:34:29.92587709Z');
    expect(ecsTaskData.tags).to.deep.equal({
      tag_with_value: ' a value with spaces ',
      tag_without_value: null
    });
  }

  function verifyInstrumentedEcsContainer(allEntities) {
    const instrumentedEcsContainerPayload = allEntities.find(
      pluginPayload =>
        pluginPayload.name === 'com.instana.plugin.aws.ecs.container' &&
        pluginPayload.entityId === instrumentedContainerId
    );
    expect(instrumentedEcsContainerPayload).to.exist;
    const instrumentedEcsContainerData = instrumentedEcsContainerPayload.data;
    expect(instrumentedEcsContainerData).to.exist;
    expect(Object.keys(instrumentedEcsContainerPayload)).to.have.lengthOf(3);
    expect(instrumentedEcsContainerData.containerName).to.equal(instrumentedContainerName);
    expect(instrumentedEcsContainerData.image).to.equal(image);
    expect(instrumentedEcsContainerData.imageId).to.equal(imageId);
    expect(instrumentedEcsContainerData.taskArn).to.equal(taskArn);
    expect(instrumentedEcsContainerData.taskDefinition).to.equal(taskDefinition);
    expect(instrumentedEcsContainerData.taskDefinitionVersion).to.equal(taskDefinitionVersion);
    expect(instrumentedEcsContainerData.clusterArn).to.equal(clusterArn);
    expect(instrumentedEcsContainerData.limits.cpu).to.equal(0);
    expect(instrumentedEcsContainerData.limits.memory).to.equal(0);
    expect(instrumentedEcsContainerData.createdAt).to.equal('2020-03-25T14:34:29.936120727Z');
    expect(instrumentedEcsContainerData.startedAt).to.equal('2020-03-25T14:34:31.56264157Z');
  }

  function verifyInstrumentedDockerPayload(allEntities) {
    const instrumentedDockerPayload = allEntities.find(
      pluginPayload =>
        pluginPayload.name === 'com.instana.plugin.docker' && pluginPayload.entityId === instrumentedContainerId
    );
    expect(instrumentedDockerPayload).to.exist;
    expect(Object.keys(instrumentedDockerPayload)).to.have.lengthOf(3);
    const instrumentedDockerData = instrumentedDockerPayload.data;
    expect(instrumentedDockerData).to.exist;
    expect(instrumentedDockerData.Id).to.equal(dockerId);
    expect(instrumentedDockerData.Created).to.equal('2020-03-25T14:34:29.936120727Z');
    expect(instrumentedDockerData.Started).to.equal('2020-03-25T14:34:31.56264157Z');
    expect(instrumentedDockerData.Image).to.equal(image);
    expect(instrumentedDockerData.Labels).to.be.an('object');
    expect(instrumentedDockerData.Labels['com.amazonaws.ecs.cluster']).to.equal(clusterArn);
    expect(instrumentedDockerData.Labels['com.amazonaws.ecs.container-name']).to.equal(instrumentedContainerName);
    expect(instrumentedDockerData.Labels['com.amazonaws.ecs.task-arn']).to.equal(taskArn);
    expect(instrumentedDockerData.Labels['com.amazonaws.ecs.task-definition-family']).to.equal(taskDefinition);
    expect(instrumentedDockerData.Labels['com.amazonaws.ecs.task-definition-version']).to.equal(taskDefinitionVersion);

    verifyDockerMetrics(instrumentedDockerData);
  }

  function verifyProcessPayload(allEntities) {
    const processPayload = allEntities.find(pluginPayload => pluginPayload.name === 'com.instana.plugin.process');
    expect(Object.keys(processPayload)).to.have.lengthOf(3);
    const processData = processPayload.data;
    expect(processData).to.exist;
    expect(processData.pid).to.be.a('number');
    expect(processData.env).to.be.an('object');
    expect(processData.exec).to.contain('node');
    expect(processData.args).to.be.an('array');
    expect(processData.user).to.be.a('string');
    expect(processData.group).to.be.a('number');
    expect(processData.start).to.be.at.least(1589205531697);
    expect(processData.containerType).to.equal('docker');
    expect(processData['com.instana.plugin.host.pid']).to.equal(processData.pid);
    expect(processData.container).to.equal(dockerId);
    expect(processData['com.instana.plugin.host.name']).to.equal(taskArn);
    return processData;
  }

  function verifyNodeJsPayload(allEntities, processData) {
    const isNode = pluginPayload => pluginPayload.name === 'com.instana.plugin.nodejs';
    const nodeJsPayload = allEntities.find(isNode);
    expect(nodeJsPayload).to.exist;
    expect(Object.keys(nodeJsPayload)).to.have.lengthOf(3);
    const nodeJsData = nodeJsPayload.data;
    expect(nodeJsData.pid).to.equal(processData.pid);
    expect(nodeJsData.sensorVersion).to.match(/1\.\d\d+\.\d+/);
    expect(nodeJsData.startTime).to.be.at.most(Date.now());
    expect(nodeJsData.versions).to.be.an('object');
    expect(nodeJsData.versions.node).to.match(/\d+\.\d+\.\d+/);
    expect(`v${nodeJsData.versions.node}`).to.equal(process.version);
    expect(nodeJsData.versions.v8).to.match(/\d+\.\d+\.\d+/);
    expect(nodeJsData.versions.uv).to.match(/\d+\.\d+\.\d+/);
    expect(nodeJsData.versions.zlib).to.match(/\d+\.\d+\.\d+/);

    expect(nodeJsData.name).to.equal('@instana/aws-fargate');
    expect(nodeJsData.description).to.equal('Instana tracing and monitoring for Node.js based AWS Fargate tasks');

    expect(nodeJsData.activeHandles).to.exist;
    expect(nodeJsData.gc.minorGcs).to.exist;
    expect(nodeJsData.gc.majorGcs).to.exist;
    expect(nodeJsData.healthchecks).to.exist;
  }

  function verifySecondaryEcsContainerPayload(allEntities) {
    const secondaryEcsContainerPayload = allEntities.find(
      pluginPayload =>
        pluginPayload.name === 'com.instana.plugin.aws.ecs.container' && pluginPayload.entityId === secondaryContainerId
    );
    expect(secondaryEcsContainerPayload).to.exist;
    const secondaryEcsContainerData = secondaryEcsContainerPayload.data;
    expect(secondaryEcsContainerData).to.exist;
    expect(Object.keys(secondaryEcsContainerPayload)).to.have.lengthOf(3);
    expect(secondaryEcsContainerData.containerName).to.equal(secondaryContainerName);

    expect(secondaryEcsContainerData.instrumented).to.be.not.exist;
    expect(secondaryEcsContainerData.runtime).to.not.exist;
    expect(secondaryEcsContainerData.dockerId).to.equal(secondaryDockerId);

    expect(secondaryEcsContainerData.image).to.equal('fg-proxy:tinyproxy');
    expect(secondaryEcsContainerData.imageId).to.equal(
      'sha256:2ffe52a8f590e72b96dd5c586252afac8de923673c5b2fd0b04e081684c47f6b'
    );
    expect(secondaryEcsContainerData.taskArn).to.equal(taskArn);
    expect(secondaryEcsContainerData.taskDefinition).to.equal(taskDefinition);
    expect(secondaryEcsContainerData.taskDefinitionVersion).to.equal(taskDefinitionVersion);
    expect(secondaryEcsContainerData.clusterArn).to.equal(clusterArn);
    expect(secondaryEcsContainerData.limits.cpu).to.equal(0);
    expect(secondaryEcsContainerData.limits.memory).to.equal(0);
    expect(secondaryEcsContainerData.createdAt).to.equal('2020-03-25T14:34:24.398289614Z');
    expect(secondaryEcsContainerData.startedAt).to.equal('2020-03-25T14:34:25.640268364Z');
  }

  function verifySecondaryDockerPayload(allEntities) {
    const secondaryDockerPayload = allEntities.find(
      pluginPayload =>
        pluginPayload.name === 'com.instana.plugin.docker' && pluginPayload.entityId === secondaryContainerId
    );
    expect(secondaryDockerPayload).to.exist;
    expect(Object.keys(secondaryDockerPayload)).to.have.lengthOf(3);
    const secondaryDockerData = secondaryDockerPayload.data;
    expect(secondaryDockerData).to.exist;
    expect(secondaryDockerData.Id).to.equal(secondaryDockerId);
    expect(secondaryDockerData.Created).to.equal('2020-03-25T14:34:24.398289614Z');
    expect(secondaryDockerData.Started).to.equal('2020-03-25T14:34:25.640268364Z');
    expect(secondaryDockerData.Image).to.equal('fg-proxy:tinyproxy');
    expect(secondaryDockerData.Labels).to.be.an('object');
    expect(secondaryDockerData.Labels['com.amazonaws.ecs.cluster']).to.equal(clusterArn);
    expect(secondaryDockerData.Labels['com.amazonaws.ecs.container-name']).to.equal(secondaryContainerName);
    expect(secondaryDockerData.Labels['com.amazonaws.ecs.task-arn']).to.equal(taskArn);
    expect(secondaryDockerData.Labels['com.amazonaws.ecs.task-definition-family']).to.equal(taskDefinition);
    expect(secondaryDockerData.Labels['com.amazonaws.ecs.task-definition-version']).to.equal(taskDefinitionVersion);

    verifyDockerMetrics(secondaryDockerData);
  }

  function verifyDockerMetrics(dockerData) {
    expect(dockerData.network).to.be.an('object');
    expect(dockerData.network.rx).to.be.an('object');
    expect(dockerData.network.tx).to.be.an('object');
    expect(dockerData.network.tx.bytes).to.be.a('number');
    expect(dockerData.network.tx.dropped).to.be.a('number');
    expect(dockerData.network.tx.errors).to.be.a('number');
    expect(dockerData.network.tx.packets).to.be.a('number');
    expect(dockerData.network.rx.bytes).to.be.a('number');
    expect(dockerData.network.rx.dropped).to.be.a('number');
    expect(dockerData.network.rx.errors).to.be.a('number');
    expect(dockerData.network.rx.packets).to.be.a('number');

    expect(dockerData.cpu).to.be.an('object');
    expect(dockerData.cpu.throttling_count).to.be.a('number');
    expect(dockerData.cpu.throttling_time).to.be.a('number');
    expect(dockerData.cpu.total_usage).to.be.a('number');
    expect(dockerData.cpu.user_usage).to.be.a('number');
    expect(dockerData.cpu.system_usage).to.be.a('number');

    expect(dockerData.memory).to.be.an('object');
    expect(dockerData.memory.active_anon).to.be.a('number');
    expect(dockerData.memory.active_file).to.be.a('number');
    expect(dockerData.memory.inactive_anon).to.be.a('number');
    expect(dockerData.memory.inactive_file).to.be.a('number');
    expect(dockerData.memory.total_cache).to.be.a('number');
    expect(dockerData.memory.total_rss).to.be.a('number');
    expect(dockerData.memory.usage).to.be.a('number');
    expect(dockerData.memory.max_usage).to.be.a('number');
    expect(dockerData.memory.limit).to.be.a('number');

    expect(dockerData.blkio).to.be.an('object');
    expect(dockerData.blkio.blk_read).to.be.a('number');
    expect(dockerData.blkio.blk_write).to.be.a('number');
  }

  function getAndVerifySpans(control) {
    return control.getSpans().then(spans => verifySpans(spans));
  }

  function verifySpans(spans) {
    const entry = verifyHttpEntry(spans);
    const exit = verifyHttpExit(spans, entry);
    return [entry, exit];
  }

  function verifyHttpEntry(spans) {
    return expectExactlyOneMatching(spans, span => {
      expect(span.t).to.exist;
      expect(span.p).to.not.exist;
      expect(span.s).to.exist;
      expect(span.n).to.equal('node.http.server');
      expect(span.k).to.equal(constants.ENTRY);
      expect(span.f).to.be.an('object');
      expect(span.f.h).to.not.exist;
      expect(span.f.hl).to.be.true;
      expect(span.f.cp).to.equal('aws');
      expect(span.f.e).to.equal(instrumentedContainerId);
      expect(span.data.http.method).to.equal('GET');
      expect(span.data.http.url).to.equal('/');
      expect(span.data.http.host).to.equal('127.0.0.1:4215');
      expect(span.data.http.status).to.equal(200);
      expect(span.data.http.header).to.deep.equal({
        'x-entry-request-header-1': 'entry request header value 1',
        'x-entry-request-header-2': 'entry, request, header, value 2',
        'x-entry-response-header-1': 'entry response header value 1',
        'x-entry-response-header-2': 'entry, response, header, value 2'
      });
      expect(span.ec).to.equal(0);
      verifyHeaders(span);
    });
  }

  function verifyHttpExit(spans, entry) {
    return expectExactlyOneMatching(spans, span => {
      expect(span.t).to.equal(entry.t);
      expect(span.p).to.equal(entry.s);
      expect(span.s).to.exist;
      expect(span.n).to.equal('node.http.client');
      expect(span.k).to.equal(constants.EXIT);
      expect(span.f).to.be.an('object');
      expect(span.f.h).to.not.exist;
      expect(span.f.hl).to.be.true;
      expect(span.f.cp).to.equal('aws');
      expect(span.f.e).to.equal(instrumentedContainerId);
      expect(span.data.http).to.be.an('object');
      expect(span.data.http.method).to.equal('GET');
      expect(span.data.http.url).to.equal(downstreamDummyUrl);
      expect(span.data.http.header).to.deep.equal({
        'x-exit-request-header-1': 'exit request header value 1',
        // This should be
        // 'x-exit-request-header-2': 'exit, request, header, value 2'
        // but node-fetch handles this case inconsistently, so it is actually
        'x-exit-request-header-2': 'exit,request,header,value 2'
      });
      expect(span.ec).to.equal(0);
      verifyHeaders(span);
    });
  }

  function verifyHeadersForSnapshotUpdates(allSnapshotUpdates) {
    allSnapshotUpdates.forEach(update => {
      expect(update.plugins).to.be.an('array');
      verifyHeaders(update);
    });
  }

  function verifyHeaders(payload) {
    const headers = payload._receivedHeaders;
    expect(headers).to.exist;
    expect(headers['x-instana-host']).to.equal(taskArn);
    expect(headers['x-instana-key']).to.equal(instanaAgentKey);
    expect(headers['x-instana-time']).to.be.a('string');
  }

  function verifyNoSpansAndMetrics(control) {
    return delay(1000)
      .then(() => verifyNoSpans(control))
      .then(() => verifyNoMetrics(control));
  }

  function verifyNoSpans(control) {
    return control.getSpans().then(spans => {
      expect(spans).to.be.empty;
    });
  }

  function verifyNoMetrics(control) {
    return control.getMetrics().then(metrics => {
      expect(metrics).to.be.empty;
    });
  }
});
