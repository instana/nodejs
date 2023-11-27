/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const chai = require('chai');
const proxyquire = require('proxyquire');
const semver = require('semver');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');

const normalizeConfig = require('../../src/util/normalizeConfig');
const kafkaJs = require('../../src/tracing/instrumentation/messaging/kafkaJs');
const rdKafka = require('../../src/tracing/instrumentation/messaging/rdkafka');
const grpcJs = require('../../src/tracing/instrumentation/protocols/grpcJs');
const awsSdkv2 = require('../../src/tracing/instrumentation/cloud/aws-sdk/v2/index');
const awsSdkv3 = require('../../src/tracing/instrumentation/cloud/aws-sdk/v3/index');
const testConfig = require('../config');

const expect = chai.expect;
chai.use(sinonChai);

const mochaSuiteFn = semver.satisfies(process.versions.node, '>=8.13.0') ? describe : describe.skip;

mochaSuiteFn('[UNIT] tracing/index', function () {
  this.timeout(testConfig.getTestTimeout());

  let tracing;

  let activateStubGrpcJs;
  let activateStubKafkaJs;
  let activateStubRdKafka;
  let activateAwsSdkv2;
  let activateAwsSdkv3;

  let initStubGrpcJs;
  let initStubKafkaJs;
  let initStubRdKafka;
  let initAwsSdkv2;
  let initAwsSdkv3;

  before(() => {
    activateStubGrpcJs = sinon.stub(grpcJs, 'activate');
    activateStubKafkaJs = sinon.stub(kafkaJs, 'activate');
    activateStubRdKafka = sinon.stub(rdKafka, 'activate');
    activateAwsSdkv2 = sinon.stub(awsSdkv2, 'activate');
    activateAwsSdkv3 = sinon.stub(awsSdkv3, 'activate');

    initStubGrpcJs = sinon.stub(grpcJs, 'init');
    initStubKafkaJs = sinon.stub(kafkaJs, 'init');
    initStubRdKafka = sinon.stub(rdKafka, 'init');
    initAwsSdkv2 = sinon.stub(awsSdkv2, 'init');
    initAwsSdkv3 = sinon.stub(awsSdkv3, 'init');
  });

  beforeEach(() => {
    // requiring tracing/index via proxyquire gives us a module in pristine state everytime, in particular with the
    // tracingActivated flag reset.
    tracing = proxyquire('../../src/tracing', {});
  });

  afterEach(() => {
    activateStubGrpcJs.reset();
    activateStubKafkaJs.reset();
    activateStubRdKafka.reset();
    activateAwsSdkv2.reset();
    activateAwsSdkv3.reset();

    initStubGrpcJs.reset();
    initStubKafkaJs.reset();
    initStubRdKafka.reset();
    initAwsSdkv2.reset();
    initAwsSdkv3.reset();

    delete process.env.INSTANA_DISABLED_TRACERS;
  });

  after(() => {
    sinon.restore();
  });

  it('deactivate instrumentation via config', () => {
    initAndActivate({ tracing: { disabledTracers: ['grpc', 'kafkajs', 'aws-sdk/v2'] } });

    // grpcJs instrumentation has not been disabled, make sure its init and activate are called
    expect(initStubGrpcJs).to.have.been.called;
    expect(activateStubGrpcJs).to.have.been.called;

    // kafkajs has been disabled...
    expect(initStubKafkaJs).to.not.have.been.called;
    expect(activateStubKafkaJs).to.not.have.been.called;

    // ...but rdkafka has not been disabled
    expect(initStubRdKafka).to.have.been.called;
    expect(activateStubRdKafka).to.have.been.called;

    // aws-sdk/v2 has been disabled (via aws-sdk/v2)
    expect(initAwsSdkv2).not.to.have.been.called;
    expect(activateAwsSdkv2).not.to.have.been.called;

    // aws-sdk/v3 has not been disabled
    expect(initAwsSdkv3).to.have.been.called;
    expect(activateAwsSdkv3).to.have.been.called;
  });

  it('deactivate instrumentation via env', () => {
    process.env.INSTANA_DISABLED_TRACERS = 'grpc';
    initAndActivate({});

    expect(activateStubGrpcJs).to.have.been.called;
    expect(activateStubKafkaJs).to.have.been.called;
    expect(activateStubRdKafka).to.have.been.called;
    expect(activateAwsSdkv2).to.have.been.called;
  });

  it('update Kafka tracing config', () => {
    const extraConfigFromAgent = {
      tracing: {
        kafka: {
          traceCorrelation: false,
          headerFormat: 'string'
        }
      }
    };
    initAndActivate({}, extraConfigFromAgent);
    expect(activateStubKafkaJs).to.have.been.calledWith(extraConfigFromAgent);
    expect(activateStubRdKafka).to.have.been.calledWith(extraConfigFromAgent);
  });

  it('[deprecated] aws-sdk/v2/index', () => {
    initAndActivate({ tracing: { disabledTracers: ['aws-sdk/v2/index'] } });

    // aws-sdk/v2 has been disabled (via aws-sdk/v2/index)
    expect(initAwsSdkv2).not.to.have.been.called;
    expect(activateAwsSdkv2).not.to.have.been.called;

    // aws-sdk/v3 has not been disabled
    expect(initAwsSdkv3).to.have.been.called;
    expect(activateAwsSdkv3).to.have.been.called;
  });

  function initAndActivate(initConfig, extraConfigForActivate) {
    normalizeConfig(initConfig);
    tracing.init(initConfig);
    tracing.activate(extraConfigForActivate);
  }
});
