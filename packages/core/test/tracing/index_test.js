/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const semver = require('semver');
const tracing = require('../../src/tracing');
const normalizeConfig = require('../../src/util/normalizeConfig');
const kafkaJs = require('../../src/tracing/instrumentation/messaging/kafkaJs');
const grpc = require('../../src/tracing/instrumentation/protocols/grpc');
const grpcJs = require('../../src/tracing/instrumentation/protocols/grpcJs');

const mochaSuiteFn = semver.satisfies(process.versions.node, '>=8.13.0') ? describe.only : describe.skip;

mochaSuiteFn('[UNIT] tracing/index', function () {
  let activateStubGrpc;
  let activateStubGrpcJs;
  let activateStubKafkaJs;

  before(() => {
    activateStubGrpc = sinon.stub(grpc, 'activate');
    activateStubGrpcJs = sinon.stub(grpcJs, 'activate');
    activateStubKafkaJs = sinon.stub(kafkaJs, 'activate');
  });

  it('deactivate instrumentation via config', () => {
    const config = { tracing: { disabledTracers: ['grpc', 'kafka'] } };
    normalizeConfig(config);

    tracing.init(config);

    tracing.activate();
    expect(activateStubGrpc.called).to.be.false;
    expect(activateStubGrpcJs.called).to.be.true;
    expect(activateStubKafkaJs.called).to.be.true;
  });

  it('deactivate instrumentation via env', () => {
    process.env.INSTANA_DISABLED_TRACERS = 'grpc';

    const config = {};
    normalizeConfig(config);

    tracing.init(config);

    tracing.activate();
    expect(activateStubGrpc.called).to.be.false;
    expect(activateStubGrpcJs.called).to.be.true;

    delete process.env.INSTANA_DISABLED_TRACERS;
  });
});
