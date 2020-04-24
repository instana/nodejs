'use strict';

const {
  expect,
  assert: { fail }
} = require('chai');
const semver = require('semver');

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const testUtils = require('../../../../../core/test/test_util');

let agentControls;
let Controls;

describe('tracing/too late', function() {
  if (!supportedVersion(process.versions.node) || semver.lt(process.versions.node, '8.0.0')) {
    return;
  }

  agentControls = require('../../../apps/agentStubControls');
  Controls = require('./controls');

  this.timeout(config.getTestTimeout());

  agentControls.registerTestHooks();

  [
    '@elastic/elasticsearch',
    '@hapi/call',
    'amqplib',
    'aws-sdk',
    'bluebird',
    'elasticsearch',
    'express',
    'fastify',
    'graphql',
    'graphql-subscriptions',
    'grpc',
    'ioredis',
    'kafka-node',
    'kafkajs',
    'koa-router',
    'log4js',
    'mongodb',
    'mssql',
    'mysql',
    'mysql2',
    'mysql2',
    'nats',
    'node-nats-streaming',
    'pg',
    'pg-native',
    'pino',
    'redis',
    'request',
    'winston'
  ].forEach(moduleName => registerTooLateTest.bind(this)(moduleName));

  function registerTooLateTest(moduleName) {
    describe(`@instana/collector is initialized too late (${moduleName})`, function() {
      const controls = new Controls({
        agentControls,
        env: {
          REQUIRE_BEFORE_COLLECTOR: moduleName
        }
      });
      controls.registerTestHooks();

      it(`should warn when module ${moduleName} has been require before @instana/collector`, () =>
        controls
          .sendRequest({
            path: '/'
          })
          .then(() =>
            testUtils.retry(() =>
              Promise.all([agentControls.getSpans(), agentControls.getAllMetrics(controls.getPid())]).then(
                ([spans, metrics]) => {
                  // expect HTTP entry to be captured
                  testUtils.expectAtLeastOneMatching(spans, span => {
                    expect(span.n).to.equal('node.http.server');
                    expect(span.k).to.equal(constants.ENTRY);
                    expect(span.async).to.not.exist;
                    expect(span.error).to.not.exist;
                    expect(span.ec).to.equal(0);
                    expect(span.p).to.not.exist;
                    expect(span.data.http.method).to.equal('GET');
                    expect(span.data.http.url).to.equal('/');
                  });

                  // expect HTTP exit to not be captured
                  const httpExits = testUtils.getSpansByName(spans, 'node.http.client');
                  expect(httpExits).to.have.lengthOf(0);

                  // expect initTooLate to have been recorded
                  let initTooLateFound = false;
                  metrics.forEach(m => {
                    if (m && m.data) {
                      if (m.data.initTooLate === true) {
                        initTooLateFound = true;
                      } else if (m.data.initTooLate !== undefined) {
                        fail(
                          `Found invalid value (${m.data.initTooLate}, type: ${typeof m.data
                            .initTooLate}) for initTooLate metric, should be either undefined or true.`
                        );
                      }
                    }
                  });
                  expect(initTooLateFound).to.be.true;
                }
              )
            )
          ));
    });
  }

  describe('@instana/collector is initialized properly', function() {
    const controls = new Controls({
      agentControls
    });
    controls.registerTestHooks();

    it('should not warn about being initialized too late', () =>
      controls
        .sendRequest({
          path: '/'
        })
        .then(() =>
          testUtils.retry(() =>
            Promise.all([agentControls.getSpans(), agentControls.getAllMetrics(controls.getPid())]).then(
              ([spans, metrics]) => {
                const httpEntry = testUtils.expectAtLeastOneMatching(spans, span => {
                  expect(span.n).to.equal('node.http.server');
                  expect(span.k).to.equal(constants.ENTRY);
                  expect(span.p).to.not.exist;
                  expect(span.data.http.method).to.equal('GET');
                  expect(span.data.http.url).to.equal('/');
                });

                // expect HTTP exit to have been captured
                testUtils.expectAtLeastOneMatching(spans, span => {
                  expect(span.n).to.equal('node.http.client');
                  expect(span.k).to.equal(constants.EXIT);
                  expect(span.p).to.equal(httpEntry.s);
                  expect(span.data.http.method).to.equal('GET');
                  expect(span.data.http.url).to.match(/http:\/\/127\.0\.0\.1:[0-9]+/);
                });

                // expect initTooLate to NOT have been recorded
                let initTooLateFound = false;
                metrics.forEach(m => {
                  if (m && m.data) {
                    if (m.data.initTooLate === true) {
                      initTooLateFound = true;
                    } else if (m.data.initTooLate !== undefined) {
                      fail(
                        `Found invalid value (${m.data.initTooLate}, type: ${typeof m.data
                          .initTooLate}) for initTooLate metric, should be either undefined or true.`
                      );
                    }
                  }
                });
                expect(initTooLateFound).to.be.false;
              }
            )
          )
        ));
  });
});
