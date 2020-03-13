'use strict';

const expect = require('chai').expect;
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

function prelude(opts = {}) {
  this.timeout(config.getTestTimeout());
  this.slow(config.getTestTimeout() / 2);

  const controlOpts = {
    ...opts,
    containerAppPath,
    downstreamDummyPort,
    downstreamDummyUrl,
    instanaAgentKey
  };
  return new Control(controlOpts).registerTestHooks();
}

describe('AWS fargate integration test', function() {
  describe('when the back end is up', function() {
    const control = prelude.bind(this)({
      startBackend: true
    });

    it('should collect metrics and trace http requests', () =>
      control
        .sendRequest({
          method: 'GET',
          path: '/'
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
          path: '/'
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
          path: '/'
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

  function verify(control, response, expectMetricsAndSpans) {
    expect(response).to.equal('Hello Fargate!');
    if (expectMetricsAndSpans) {
      return retry(() => getAndVerifySnapshotDataAndMetrics(control).then(() => getAndVerifySpans(control)));
    } else {
      return verifyNoSpansAndMetrics(control);
    }
  }

  function getAndVerifySnapshotDataAndMetrics(control) {
    return control.getMetrics().then(metrics => verifySnapshotDataAndMetrics(metrics));
  }

  function verifySnapshotDataAndMetrics(allMetrics) {
    /* eslint-disable no-console */
    expect(allMetrics).to.exist;
    expect(allMetrics).to.be.an('array');
    expect(allMetrics).to.have.lengthOf.at.least(1);
    const allPlugins = allMetrics[0];
    expect(allPlugins.plugins).to.be.an('array');
    if (allPlugins.plugins.length < 5) {
      console.log('Error: Received less entities than expected.');
      console.log(JSON.stringify(allPlugins, null, 2));
    }
    expect(allPlugins.plugins).to.have.lengthOf.at.least(5);

    verifyEcsTask(allPlugins);
    verifyInstrumentedEcsContainer(allPlugins);
    verifyInstrumentedDockerPayload(allPlugins);
    const processData = verifyProcessPayload(allPlugins, allMetrics);
    verifyNodeJsPayload(allPlugins, allMetrics, processData);

    verifyHeaders(allPlugins);

    // Data for the secondary ECS container and secondary Docker entity might come later.
    verifySecondaryEcsContainerPayload(allMetrics);
    verifySecondaryDockerPayload(allMetrics);
  }

  function verifyEcsTask(allPlugins) {
    const ecsTaskPayload = allPlugins.plugins.find(
      pluginPayload => pluginPayload.name === 'com.instana.plugin.aws.ecs.task' && pluginPayload.entityId === taskArn
    );
    expect(ecsTaskPayload).to.exist;
    const ecsTaskData = ecsTaskPayload.data;
    expect(ecsTaskData).to.exist;
    expect(ecsTaskData.taskArn).to.equal(taskArn);
    expect(ecsTaskData.clusterArn).to.equal(clusterArn);
    expect(ecsTaskData.taskDefinition).to.equal(taskDefinition);
    expect(ecsTaskData.taskDefinitionVersion).to.equal(taskDefinitionVersion);
    expect(ecsTaskData.desiredStatus).to.equal('RUNNING');
    expect(ecsTaskData.knownStatus).to.equal('RUNNING');
    expect(ecsTaskData.limits.cpu).to.equal(0.25);
    expect(ecsTaskData.limits.memory).to.equal(512);
    expect(ecsTaskData.pullStartedAt).to.equal('2020-03-25T14:34:25.75886719Z');
    expect(ecsTaskData.pullStoppedAt).to.equal('2020-03-25T14:34:29.92587709Z');
  }

  function verifyInstrumentedEcsContainer(allPlugins) {
    const instrumentedEcsContainerPayload = allPlugins.plugins.find(
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

  function verifyInstrumentedDockerPayload(allPlugins) {
    const instrumentedDockerPayload = allPlugins.plugins.find(
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
    expect(instrumentedDockerData.Image).to.equal(
      '555123456789.dkr.ecr.us-east-2.amazonaws.com/nodejs-fargate-test-task-definition:latest'
    );
    expect(instrumentedDockerData.Labels).to.be.an('object');
    expect(instrumentedDockerData.Labels['com.amazonaws.ecs.cluster']).to.equal(
      'arn:aws:ecs:us-east-2:555123456789:cluster/nodejs-fargate-test-cluster'
    );
    expect(instrumentedDockerData.Labels['com.amazonaws.ecs.container-name']).to.equal('nodejs-fargate-test-container');
    expect(instrumentedDockerData.Labels['com.amazonaws.ecs.task-arn']).to.equal(
      'arn:aws:ecs:us-east-2:555123456789:task/55566677-c1e5-5780-9806-aabbccddeeff'
    );
    expect(instrumentedDockerData.Labels['com.amazonaws.ecs.task-definition-family']).to.equal(taskDefinition);
    expect(instrumentedDockerData.Labels['com.amazonaws.ecs.task-definition-version']).to.equal(taskDefinitionVersion);
    expect(instrumentedDockerData.NetworkMode).to.equal('awsvpc');
    expect(instrumentedDockerData.memory).to.deep.equal({ limit: 0 });
  }

  function verifyProcessPayload(allPlugins, allMetrics) {
    const processPayload = allPlugins.plugins.find(
      pluginPayload => pluginPayload.name === 'com.instana.plugin.process'
    );
    expect(Object.keys(processPayload)).to.have.lengthOf(3);
    const processData = processPayload.data;
    expect(processData).to.exist;
    expect(processData.pid).to.be.a('number');
    const pid = processData.pid;
    expect(processData.env).to.be.an('object');
    expect(processData.exec).to.contain('node');
    expect(processData.args).to.be.an('array');
    expect(processData.user).to.be.a('string');
    expect(processData.group).to.be.a('number');
    expect(processData.start).to.be.at.least(1589205531697);
    expect(processData.containerType).to.equal('docker');
    expect(processData['com.instana.plugin.host.pid']).to.equal(processData.pid);

    expectToArriveLater(
      allMetrics,
      pluginPayload => pluginPayload.name === 'com.instana.plugin.process' && pluginPayload.entityId === pid,
      data => data.container === dockerId && data['com.instana.plugin.host.name'] === taskArn
    );

    return processData;
  }

  function verifyNodeJsPayload(allPlugins, allMetrics, processData) {
    const isNode = pluginPayload => pluginPayload.name === 'com.instana.plugin.nodejs';
    const nodeJsPayload = allPlugins.plugins.find(isNode);
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

    expectToArriveLater(allMetrics, isNode, data => {
      return (
        data.name === '@instana/aws-fargate' &&
        data.description === 'Instana tracing and monitoring for Node.js based AWS Fargate tasks'
      );
    });

    expect(nodeJsData.activeHandles).to.exist;
    expect(nodeJsData.gc.minorGcs).to.exist;
    expect(nodeJsData.gc.majorGcs).to.exist;
    expect(nodeJsData.healthchecks).to.exist;
  }

  function verifySecondaryEcsContainerPayload(allMetrics) {
    expectToArriveLater(
      allMetrics,
      pluginPayload =>
        pluginPayload.name === 'com.instana.plugin.aws.ecs.container' &&
        pluginPayload.entityId === secondaryContainerId,
      secondaryEcsContainerData =>
        secondaryEcsContainerData.instrumented == null &&
        secondaryEcsContainerData.runtime == null &&
        secondaryEcsContainerData.dockerId === secondaryDockerId
    );
  }

  function verifySecondaryDockerPayload(allMetrics) {
    expectToArriveLater(
      allMetrics,
      pluginPayload =>
        pluginPayload.name === 'com.instana.plugin.docker' && pluginPayload.entityId === secondaryContainerId,
      secondaryDockerData => {
        return secondaryDockerData.Id === secondaryDockerId;
      }
    );
  }

  function expectToArriveLater(allMetrics, findPluginData, checkValues) {
    let found;
    for (let i = 0; i < allMetrics.length; i++) {
      const payload = allMetrics[i].plugins.find(findPluginData);
      if (payload) {
        if (checkValues(payload.data)) {
          found = true;
          break;
        }
      }
    }
    expect(found).to.be.true;
  }

  function getAndVerifySpans(control) {
    return control.getSpans().then(spans => verifySpans(spans));
  }

  function verifySpans(spans) {
    const entry = verifyHttpEntry(spans);
    verifyHttpExit(spans, entry);
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
      expect(span.ec).to.equal(0);
      verifyHeaders(span);
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
