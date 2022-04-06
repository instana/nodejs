/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const semver = require('semver');
const proxyquire = require('proxyquire');

const normalizeConfig = require('../../src/util/normalizeConfig');
const kafkaJs = require('../../src/tracing/instrumentation/messaging/kafkaJs');
const rdKafka = require('../../src/tracing/instrumentation/messaging/rdkafka');
const grpc = require('../../src/tracing/instrumentation/protocols/grpc');
const grpcJs = require('../../src/tracing/instrumentation/protocols/grpcJs');
const testConfig = require('../config');

const mochaSuiteFn = semver.satisfies(process.versions.node, '>=8.13.0') ? describe : describe.skip;

mochaSuiteFn('[UNIT] tracing/index', function () {
  this.timeout(testConfig.getTestTimeout());

  let tracing;

  let activateStubGrpc;
  let activateStubGrpcJs;
  let activateStubKafkaJs;
  let setKafkaTracingConfigStubKafkaJs;
  let setKafkaTracingConfigStubRdKafka;

  before(() => {
    activateStubGrpc = sinon.stub(grpc, 'activate');
    activateStubGrpcJs = sinon.stub(grpcJs, 'activate');
    activateStubKafkaJs = sinon.stub(kafkaJs, 'activate');
    setKafkaTracingConfigStubKafkaJs = sinon.stub(kafkaJs, 'setKafkaTracingConfig');
    setKafkaTracingConfigStubRdKafka = sinon.stub(rdKafka, 'setKafkaTracingConfig');
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
    setKafkaTracingConfigStubKafkaJs.reset();
    setKafkaTracingConfigStubRdKafka.reset();
    delete process.env.INSTANA_DISABLED_TRACERS;
  });

  it('deactivate instrumentation via config', () => {
    initAndActivate({ tracing: { disabledTracers: ['grpc', 'kafka'] } });
    expect(activateStubGrpc.called).to.be.false;
    expect(activateStubGrpcJs.called).to.be.true;
    expect(activateStubKafkaJs.called).to.be.true;
  });

  it('deactivate instrumentation via env', () => {
    process.env.INSTANA_DISABLED_TRACERS = 'grpc';
    initAndActivate({});
    expect(activateStubGrpc.called).to.be.false;
    expect(activateStubGrpcJs.called).to.be.true;
    expect(activateStubKafkaJs.called).to.be.true;
  });

  it('update Kafka tracing config', () => {
    initAndActivate({});
    const kafkaTracingConfig = {
      traceCorrelation: false,
      headerFormat: 'string'
    };
    tracing.setKafkaTracingConfig(kafkaTracingConfig);
    expect(setKafkaTracingConfigStubKafkaJs.calledWith(kafkaTracingConfig)).to.be.true;
    expect(setKafkaTracingConfigStubRdKafka.calledWith(kafkaTracingConfig)).to.be.true;
  });

  function initAndActivate(config) {
    normalizeConfig(config);
    tracing.init(config);
    tracing.activate();
  }
});
