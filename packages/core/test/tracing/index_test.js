/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const chai = require('chai');
const proxyquire = require('proxyquire');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');

const testUtils = require('@instana/core/test/test_util');
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const normalizeConfig = require('../../src/util/normalizeConfig');
const kafkaJs = require('../../src/tracing/instrumentation/messaging/kafkaJs');
const rdKafka = require('../../src/tracing/instrumentation/messaging/rdkafka');
const grpcJs = require('../../src/tracing/instrumentation/protocols/grpcJs');
const awsSdkv2 = require('../../src/tracing/instrumentation/cloud/aws-sdk/v2/index');
const awsSdkv3 = require('../../src/tracing/instrumentation/cloud/aws-sdk/v3/index');
const testConfig = require('../config');

const expect = chai.expect;
chai.use(sinonChai);

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

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

    delete process.env.INSTANA_TRACING_DISABLE;
    delete process.env.INSTANA_DISABLED_TRACERS;
  });

  after(() => {
    sinon.restore();
  });

  describe('preInit', function () {
    it('should trace on preinit', () => {
      const logger = testUtils.createFakeLogger();
      const config = normalizeConfig({}, logger);
      tracing.preInit(config);

      expect(initStubGrpcJs).to.have.been.called;
      expect(activateStubGrpcJs).to.not.have.been.called;

      expect(initStubKafkaJs).to.have.been.called;
      expect(activateStubKafkaJs).to.not.have.been.called;

      expect(initStubRdKafka).to.have.been.called;
      expect(activateStubRdKafka).to.not.have.been.called;

      expect(initAwsSdkv2).to.have.been.called;
      expect(activateAwsSdkv2).to.not.have.been.called;

      expect(initAwsSdkv3).to.have.been.called;
      expect(activateAwsSdkv3).to.not.have.been.called;
    });
  });

  describe('init', function () {
    describe('tracer deactivation', () => {
      describe('via disable config', () => {
        it('should deactivate specified tracers', () => {
          initAndActivate({ tracing: { disable: ['grpc', 'kafkajs', 'aws-sdk/v2'] } });

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

        it('should disable multiple tracers in INSTANA_TRACING_DISABLE env var', () => {
          process.env.INSTANA_TRACING_DISABLE = 'rdkafka,kafkajs,aws-sdk/v3';
          initAndActivate({});

          expect(initStubKafkaJs).to.not.have.been.called;
          expect(initStubRdKafka).to.not.have.been.called;
          expect(initAwsSdkv3).not.to.have.been.called;

          expect(initAwsSdkv2).to.have.been.called;
          expect(initStubGrpcJs).to.have.been.called;
        });

        it('should update Kafka tracing configuration', () => {
          const kafkaConfig = { tracing: { kafka: { traceCorrelation: false } } };
          initAndActivate({}, kafkaConfig);

          expect(activateStubKafkaJs).to.have.been.calledWith(kafkaConfig);
          expect(activateStubRdKafka).to.have.been.calledWith(kafkaConfig);
        });

        it('should disable aws-sdk/v3 via config', () => {
          initAndActivate({ tracing: { disable: ['aws-sdk/v3'] } });

          expect(initAwsSdkv3).not.to.have.been.called;
          expect(activateAwsSdkv3).not.to.have.been.called;

          expect(initAwsSdkv2).to.have.been.called;
          expect(activateAwsSdkv2).to.have.been.called;
        });

        it('should disable both aws-sdk versions via config', () => {
          initAndActivate({ tracing: { disable: ['aws-sdk/v3', 'aws-sdk/v2'] } });

          expect(initAwsSdkv2).not.to.have.been.called;
          expect(activateAwsSdkv2).not.to.have.been.called;

          expect(initAwsSdkv3).not.to.have.been.called;
          expect(activateAwsSdkv3).not.to.have.been.called;
        });

        it('should ignore empty disable array', () => {
          initAndActivate({ tracing: { disable: [] } });

          expect(initStubGrpcJs).to.have.been.called;
          expect(activateStubGrpcJs).to.have.been.called;

          expect(initStubKafkaJs).to.have.been.called;
          expect(activateStubKafkaJs).to.have.been.called;

          expect(initStubRdKafka).to.have.been.called;
          expect(activateStubRdKafka).to.have.been.called;
        });

        it('should prefer config.tracing.disable over env vars', () => {
          process.env.INSTANA_TRACING_DISABLE = 'grpc,kafkajs';
          initAndActivate({ tracing: { disable: ['aws-sdk/v2'] } });

          expect(initAwsSdkv2).not.to.have.been.called;
          expect(activateAwsSdkv2).not.to.have.been.called;

          expect(initStubGrpcJs).to.have.been.called;
          expect(activateStubGrpcJs).to.have.been.called;

          expect(initStubKafkaJs).to.have.been.called;
          expect(activateStubKafkaJs).to.have.been.called;
        });
      });

      describe('[deprecated] via disabledTracers config', () => {
        it('should deactivate tracers', () => {
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

        it('should handle INSTANA_DISABLED_TRACERS env var', () => {
          process.env.INSTANA_DISABLED_TRACERS = 'kafkajs';
          initAndActivate({});

          expect(initStubKafkaJs).not.to.have.been.called;
          expect(activateStubKafkaJs).not.to.have.been.called;
        });

        it('should handle empty disabledTracers array', () => {
          initAndActivate({ tracing: { disabledTracers: [] } });

          expect(initStubGrpcJs).to.have.been.called;
          expect(initStubKafkaJs).to.have.been.called;
          expect(initStubRdKafka).to.have.been.called;
        });

        it('should trim whitespace in INSTANA_DISABLED_TRACERS', () => {
          process.env.INSTANA_DISABLED_TRACERS = '  grpc  ,  kafkajs  ';
          initAndActivate({});

          expect(initStubGrpcJs).to.have.been.called;
          expect(activateStubGrpcJs).to.have.been.called;

          expect(initStubKafkaJs).not.to.have.been.called;
          expect(activateStubKafkaJs).not.to.have.been.called;
        });

        it('should prefer disable over disabledTracers when both exist', () => {
          initAndActivate({
            tracing: {
              disabledTracers: ['grpc', 'kafkajs'],
              disable: ['aws-sdk/v2']
            }
          });

          expect(initAwsSdkv2).not.to.have.been.called;
          expect(activateAwsSdkv2).not.to.have.been.called;

          expect(initStubGrpcJs).to.have.been.called;
          expect(activateStubGrpcJs).to.have.been.called;

          expect(initStubKafkaJs).to.have.been.called;
          expect(activateStubKafkaJs).to.have.been.called;
        });

        it('should prefer INSTANA_TRACING_DISABLE over INSTANA_DISABLED_TRACERS', () => {
          process.env.INSTANA_TRACING_DISABLE = 'aws-sdk/v2';
          process.env.INSTANA_DISABLED_TRACERS = 'kafkajs';
          initAndActivate({});

          expect(initAwsSdkv2).not.to.have.been.called;
          expect(activateAwsSdkv2).not.to.have.been.called;

          expect(initStubKafkaJs).to.have.been.called;
          expect(activateStubKafkaJs).to.have.been.called;
        });
      });
    });

    function initAndActivate(initConfig, extraConfigForActivate) {
      const logger = testUtils.createFakeLogger();
      const config = normalizeConfig(initConfig, logger);
      tracing.init(config);
      tracing.activate(extraConfigForActivate);
    }
  });
});
