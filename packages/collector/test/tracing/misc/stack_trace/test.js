/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const expect = require('chai').expect;

const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const testUtils = require('../../../../../core/test/test_util');
const globalAgent = require('../../../globalAgent');
const constants = require('@instana/core').tracing.constants;

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

['latest', 'v4'].forEach(version => {
  mochaSuiteFn(`tracing/express@${version} tracing/stackTraces`, function () {
    this.timeout(config.getTestTimeout());

    globalAgent.setUpCleanUpHooks();
    const agentControls = globalAgent.instance;

    const expressProxyControls = require('../../protocols/http/proxy/expressProxyControls');
    const expressControls = require('../../../apps/expressControls');

    describe('with stack trace lenght of 0', () => {
      before(async () => {
        await expressControls.start({ useGlobalAgent: true });
        await expressProxyControls.start({
          useGlobalAgent: true,
          expressControls,
          stackTraceLength: 0,
          EXPRESS_VERSION: version
        });
      });

      after(async () => {
        await expressControls.stop();
        await expressProxyControls.stop();
      });

      beforeEach(async () => {
        await agentControls.clearReceivedTraceData();
      });

      beforeEach(() => agentControls.waitUntilAppIsCompletelyInitialized(expressControls.getPid()));
      beforeEach(() => agentControls.waitUntilAppIsCompletelyInitialized(expressProxyControls.getPid()));

      it('must not add stack traces to the spans', () =>
        expressProxyControls
          .sendRequest({
            method: 'POST',
            path: '/checkout',
            responseStatus: 201
          })
          .then(() =>
            testUtils.retry(() =>
              agentControls.getSpans().then(spans => {
                expect(spans.length).to.equal(3);
                testUtils.expectAtLeastOneMatching(spans, [
                  span => expect(span.n).to.equal('node.http.server'),
                  span => expect(span.stack).to.have.lengthOf(0)
                ]);

                testUtils.expectAtLeastOneMatching(spans, [
                  span => expect(span.n).to.equal('node.http.client'),
                  span => expect(span.stack).to.have.lengthOf(0)
                ]);
              })
            )
          ));
    });

    describe('with enabled stack traces', () => {
      before(async () => {
        await expressControls.start({ useGlobalAgent: true });
        await expressProxyControls.start({
          useGlobalAgent: true,
          expressControls,
          stackTraceLength: 10,
          EXPRESS_VERSION: version
        });
      });

      after(async () => {
        await expressControls.stop();
        await expressProxyControls.stop();
      });

      beforeEach(async () => {
        await agentControls.waitUntilAppIsCompletelyInitialized(expressControls.getPid());
      });

      beforeEach(async () => {
        await agentControls.waitUntilAppIsCompletelyInitialized(expressProxyControls.getPid());
      });

      it('must not add stack traces to entry spans', () =>
        expressProxyControls
          .sendRequest({
            method: 'POST',
            path: '/checkout',
            responseStatus: 201
          })
          .then(() =>
            testUtils.retry(() =>
              agentControls.getSpans().then(spans => {
                expect(spans.length).to.equal(6);
                testUtils.expectAtLeastOneMatching(spans, [
                  span => expect(span.n).to.equal('node.http.server'),
                  span => expect(span.stack).to.have.lengthOf(0)
                ]);
              })
            )
          ));

      it('must add stack traces to exit spans', () =>
        expressProxyControls
          .sendRequest({
            method: 'POST',
            path: '/checkout',
            responseStatus: 201
          })
          .then(() =>
            testUtils.retry(() =>
              agentControls.getSpans().then(spans => {
                expect(spans.length).to.equal(9);
                testUtils.expectAtLeastOneMatching(spans, [
                  span => expect(span.n).to.equal('node.http.client'),
                  span => expect(span.k).to.equal(constants.EXIT),
                  span => expect(span.data.http.status).to.equal(201),
                  span => expect(span.stack[2].m).to.equal('fetch'),
                  span => expect(span.stack[2].c).to.contains('node-fetch')
                ]);
              })
            )
          ));

      it('must replace error.stack with span.stack when error occurs', () =>
        expressProxyControls
          .sendRequest({
            method: 'GET',
            path: '/trigger-error'
          })
          .then(() =>
            testUtils.retry(() =>
              agentControls.getSpans().then(spans => {
                testUtils.expectAtLeastOneMatching(spans, [
                  span => expect(span.n).to.equal('node.http.client'),
                  span => expect(span.k).to.equal(constants.EXIT),
                  span => expect(span.ec).to.equal(1),
                  span => expect(span.data.http.error).to.exist,
                  span => {
                    expect(span.stack).to.be.an('array');
                    expect(span.stack.length).to.be.greaterThan(0);
                    expect(span.stack[0]).to.have.property('m');
                    expect(span.stack[0]).to.have.property('c');
                    expect(span.stack[0]).to.have.property('n');
                  }
                ]);
              })
            )
          ));
    });

    describe('agent config precedence', () => {
      const { AgentStubControls } = require('../../../apps/agentStubControls');
      const agentStubControls = new AgentStubControls();

      describe('when only agent config is provided', () => {
        before(async () => {
          await agentStubControls.startAgent({
            stackTraceConfig: {
              'stack-trace': 'all',
              'stack-trace-length': 3
            }
          });
        });

        after(async () => {
          await agentStubControls.stopAgent();
        });

        before(async () => {
          await expressControls.start({
            agentControls: agentStubControls,
            EXPRESS_VERSION: version
          });
          await expressProxyControls.start({
            agentControls: agentStubControls,
            expressControls,
            EXPRESS_VERSION: version
            // Don't set stackTraceLength - let it use default so agent config can override
          });
        });

        after(async () => {
          await expressControls.stop();
          await expressProxyControls.stop();
        });

        beforeEach(async () => {
          await agentStubControls.clearReceivedTraceData();
        });

        beforeEach(() => agentStubControls.waitUntilAppIsCompletelyInitialized(expressControls.getPid()));
        beforeEach(() => agentStubControls.waitUntilAppIsCompletelyInitialized(expressProxyControls.getPid()));

        it('should apply agent config stackTraceLength to exit spans', () =>
          expressProxyControls
            .sendRequest({
              method: 'POST',
              path: '/checkout',
              responseStatus: 201
            })
            .then(() =>
              testUtils.retry(() =>
                agentStubControls.getSpans().then(spans => {
                  expect(spans.length).to.be.at.least(2);

                  const httpClientSpan = testUtils.expectAtLeastOneMatching(spans, [
                    span => expect(span.n).to.equal('node.http.client'),
                    span => expect(span.k).to.equal(constants.EXIT)
                  ]);

                  expect(httpClientSpan.stack).to.be.an('array');
                  expect(httpClientSpan.stack.length).to.equal(3);
                })
              )
            ));
      });

      describe('when both agent and in-code config is provided', () => {
        before(async () => {
          await agentStubControls.startAgent({
            stackTraceConfig: {
              'stack-trace-length': 3
            }
          });
          await expressControls.start({
            agentControls: agentStubControls,
            EXPRESS_VERSION: version
          });
          await expressProxyControls.start({
            agentControls: agentStubControls,
            expressControls,
            stackTraceLength: 4,
            EXPRESS_VERSION: version
          });
        });

        after(async () => {
          await expressControls.stop();
          await expressProxyControls.stop();
          await agentStubControls.stopAgent();
        });

        beforeEach(async () => {
          await agentStubControls.clearReceivedTraceData();
        });

        beforeEach(() => agentStubControls.waitUntilAppIsCompletelyInitialized(expressControls.getPid()));
        beforeEach(() => agentStubControls.waitUntilAppIsCompletelyInitialized(expressProxyControls.getPid()));

        it('should use agent config stackTraceLength over in-code config', () =>
          expressProxyControls
            .sendRequest({
              method: 'POST',
              path: '/checkout',
              responseStatus: 201
            })
            .then(() =>
              testUtils.retry(() =>
                agentStubControls.getSpans().then(spans => {
                  expect(spans.length).to.be.at.least(2);

                  const httpClientSpan = testUtils.expectAtLeastOneMatching(spans, [
                    span => expect(span.n).to.equal('node.http.client'),
                    span => expect(span.k).to.equal(constants.EXIT)
                  ]);

                  // currently agent has precedence over other configs
                  expect(httpClientSpan.stack).to.be.an('array');
                  expect(httpClientSpan.stack.length).to.equal(3);
                })
              )
            ));
      });

      describe('when both agent and in-code config is provided and agent is 0', () => {
        before(async () => {
          await agentStubControls.startAgent({
            stackTraceConfig: {
              'stack-trace-length': 0
            }
          });
          await expressControls.start({
            agentControls: agentStubControls,
            EXPRESS_VERSION: version
          });
          await expressProxyControls.start({
            agentControls: agentStubControls,
            expressControls,
            stackTraceLength: 4,
            EXPRESS_VERSION: version
          });
        });

        after(async () => {
          await expressControls.stop();
          await expressProxyControls.stop();
          await agentStubControls.stopAgent();
        });

        beforeEach(async () => {
          await agentStubControls.clearReceivedTraceData();
        });

        beforeEach(() => agentStubControls.waitUntilAppIsCompletelyInitialized(expressControls.getPid()));
        beforeEach(() => agentStubControls.waitUntilAppIsCompletelyInitialized(expressProxyControls.getPid()));

        it('should use agent config stackTraceLength over in-code config', () =>
          expressProxyControls
            .sendRequest({
              method: 'POST',
              path: '/checkout',
              responseStatus: 201
            })
            .then(() =>
              testUtils.retry(() =>
                agentStubControls.getSpans().then(spans => {
                  expect(spans.length).to.be.at.least(2);

                  const httpClientSpan = testUtils.expectAtLeastOneMatching(spans, [
                    span => expect(span.n).to.equal('node.http.client'),
                    span => expect(span.k).to.equal(constants.EXIT)
                  ]);

                  // currently agent has precedence over other configs
                  expect(httpClientSpan.stack).to.be.an('array');
                  expect(httpClientSpan.stack.length).to.equal(0);
                })
              )
            ));
      });
    });
  });
});
