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
const grpc = require('../../src/tracing/instrumentation/protocols/grpc');
const grpcJs = require('../../src/tracing/instrumentation/protocols/grpcJs');
const testConfig = require('../config');

const expect = chai.expect;
chai.use(sinonChai);

const mochaSuiteFn = semver.satisfies(process.versions.node, '>=8.13.0') ? describe : describe.skip;

mochaSuiteFn('[UNIT] tracing/index', function () {
  this.timeout(testConfig.getTestTimeout());

  let tracing;

  let activateStubGrpc;
  let activateStubGrpcJs;
  let activateStubKafkaJs;
  let activateStubRdKafka;
  let initStubGrpc;
  let initStubGrpcJs;
  let initStubKafkaJs;

  before(() => {
    activateStubGrpc = sinon.stub(grpc, 'activate');
    activateStubGrpcJs = sinon.stub(grpcJs, 'activate');
    activateStubKafkaJs = sinon.stub(kafkaJs, 'activate');
    activateStubRdKafka = sinon.stub(rdKafka, 'activate');
    initStubGrpc = sinon.stub(grpc, 'init');
    initStubGrpcJs = sinon.stub(grpcJs, 'init');
    initStubKafkaJs = sinon.stub(kafkaJs, 'init');
  });

  beforeEach(() => {
    // requiring tracing/index via proxyquire gives us a module in pristine state everytime, in particular with the
    // tracingActivated flag reset.
    tracing = proxyquire('../../src/tracing', {});
  });

  afterEach(() => {
    activateStubGrpc.reset();
    activateStubGrpcJs.reset();
    activateStubKafkaJs.reset();
    activateStubRdKafka.reset();
    initStubGrpc.reset();
    initStubGrpcJs.reset();
    initStubKafkaJs.reset();
    delete process.env.INSTANA_DISABLED_TRACERS;
  });

  after(() => {
    sinon.restore();
  });

  it('deactivate instrumentation via config', () => {
    initAndActivate({ tracing: { disabledTracers: ['grpc', 'kafkajs'] } });
    expect(activateStubGrpc).to.not.have.been.called;
    expect(activateStubGrpcJs).to.have.been.called;
    expect(activateStubKafkaJs).to.not.have.been.called;
    expect(activateStubRdKafka).to.have.been.called;
    expect(initStubGrpc).not.to.have.been.called;
  });

  it('deactivate instrumentation via env', () => {
    process.env.INSTANA_DISABLED_TRACERS = 'grpc';
    initAndActivate({});
    expect(activateStubGrpc).to.not.have.been.called;
    expect(activateStubGrpcJs).to.have.been.called;
    expect(activateStubKafkaJs).to.have.been.called;
    expect(activateStubRdKafka).to.have.been.called;
    expect(initStubGrpc).not.to.have.been.called;
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

  it('skip init step when instrumentation disabled', () => {
    initAndActivate({ tracing: { disabledTracers: ['grpcjs', 'kafkajs'] } });
    expect(initStubKafkaJs).not.to.have.been.called;
    expect(initStubGrpcJs).not.to.have.been.called;
    expect(initStubGrpc).to.have.been.called;
  });

  function initAndActivate(initConfig, extraConfigForActivate) {
    normalizeConfig(initConfig);
    tracing.init(initConfig);
    tracing.activate(extraConfigForActivate);
  }
});
