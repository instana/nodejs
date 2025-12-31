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

    describe('verify precedence order env > in-code > agent', () => {
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
              'stack-trace-length': 2
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

        it('should use in-code config over agent config', () =>
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
                  expect(httpClientSpan.stack.length).to.equal(4);
                })
              )
            ));
      });

      describe('when env var, in-code config, and agent config are all provided', () => {
        before(async () => {
          await agentStubControls.startAgent({
            stackTraceConfig: {
              'stack-trace-length': 2
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
            EXPRESS_VERSION: version,
            env: {
              INSTANA_STACK_TRACE_LENGTH: '6'
            }
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

        it('should use env var over in-code config and agent config (env has highest priority)', () =>
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
                  expect(httpClientSpan.stack.length).to.equal(6);
                })
              )
            ));
      });

      describe('when only env var is provided', () => {
        before(async () => {
          await agentStubControls.startAgent({
            stackTraceConfig: {}
          });
          await expressControls.start({
            agentControls: agentStubControls,
            EXPRESS_VERSION: version
          });
          await expressProxyControls.start({
            agentControls: agentStubControls,
            expressControls,
            EXPRESS_VERSION: version,
            env: {
              INSTANA_STACK_TRACE_LENGTH: '5'
            }
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

        it('should apply env var stackTraceLength to exit spans', () =>
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
                  expect(httpClientSpan.stack.length).to.equal(5);
                })
              )
            ));
      });
    });

    describe('stackTraceMode configuration', () => {
      const { AgentStubControls } = require('../../../apps/agentStubControls');
      const agentStubControls = new AgentStubControls();

      describe('with stackTraceMode = "none"', () => {
        before(async () => {
          await agentStubControls.startAgent({
            stackTraceConfig: {
              'stack-trace': 'none',
              'stack-trace-length': 10
            }
          });
          await expressControls.start({
            agentControls: agentStubControls,
            EXPRESS_VERSION: version
          });
          await expressProxyControls.start({
            agentControls: agentStubControls,
            expressControls,
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

        it('should not generate stack traces for exit spans when mode is "none"', () =>
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
                  expect(httpClientSpan.stack.length).to.equal(0);
                })
              )
            ));

        it('should not generate stack traces even when error occurs with mode "none"', () =>
          expressProxyControls
            .sendRequest({
              method: 'GET',
              path: '/trigger-error'
            })
            .then(() =>
              testUtils.retry(() =>
                agentStubControls.getSpans().then(spans => {
                  const httpClientSpan = testUtils.expectAtLeastOneMatching(spans, [
                    span => expect(span.n).to.equal('node.http.client'),
                    span => expect(span.k).to.equal(constants.EXIT),
                    span => expect(span.ec).to.equal(1)
                  ]);

                  expect(httpClientSpan.data.http.error).to.exist;
                  expect(httpClientSpan.stack).to.be.an('array');
                  expect(httpClientSpan.stack.length).to.equal(0);
                })
              )
            ));
      });

      describe('with stackTraceMode = "error"', () => {
        before(async () => {
          await agentStubControls.startAgent({
            stackTraceConfig: {
              'stack-trace': 'error',
              'stack-trace-length': 10
            }
          });
          await expressControls.start({
            agentControls: agentStubControls,
            EXPRESS_VERSION: version
          });
          await expressProxyControls.start({
            agentControls: agentStubControls,
            expressControls,
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

        it('should not generate stack traces for successful exit spans when mode is "error"', () =>
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
                    span => expect(span.k).to.equal(constants.EXIT),
                    span => expect(span.data.http.status).to.equal(201)
                  ]);

                  expect(httpClientSpan.stack).to.be.an('array');
                  expect(httpClientSpan.stack.length).to.equal(0);
                })
              )
            ));

        it('should generate stack traces only when error occurs with mode "error"', () =>
          expressProxyControls
            .sendRequest({
              method: 'GET',
              path: '/trigger-error'
            })
            .then(() =>
              testUtils.retry(() =>
                agentStubControls.getSpans().then(spans => {
                  const httpClientSpan = testUtils.expectAtLeastOneMatching(spans, [
                    span => expect(span.n).to.equal('node.http.client'),
                    span => expect(span.k).to.equal(constants.EXIT),
                    span => expect(span.ec).to.equal(1)
                  ]);

                  expect(httpClientSpan.data.http.error).to.exist;
                  expect(httpClientSpan.stack).to.be.an('array');
                  expect(httpClientSpan.stack.length).to.be.greaterThan(0);
                  expect(httpClientSpan.stack[0]).to.have.property('m');
                  expect(httpClientSpan.stack[0]).to.have.property('c');
                  expect(httpClientSpan.stack[0]).to.have.property('n');
                })
              )
            ));
      });

      describe('with stackTraceMode = "all"', () => {
        before(async () => {
          await agentStubControls.startAgent({
            stackTraceConfig: {
              'stack-trace': 'all',
              'stack-trace-length': 10
            }
          });
          await expressControls.start({
            agentControls: agentStubControls,
            EXPRESS_VERSION: version
          });
          await expressProxyControls.start({
            agentControls: agentStubControls,
            expressControls,
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

        it('should generate stack traces for all exit spans when mode is "all"', () =>
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
                    span => expect(span.k).to.equal(constants.EXIT),
                    span => expect(span.data.http.status).to.equal(201)
                  ]);

                  expect(httpClientSpan.stack).to.be.an('array');
                  expect(httpClientSpan.stack.length).to.be.greaterThan(0);
                  expect(httpClientSpan.stack[0]).to.have.property('m');
                  expect(httpClientSpan.stack[0]).to.have.property('c');
                  expect(httpClientSpan.stack[0]).to.have.property('n');
                })
              )
            ));

        it('should generate stack traces when error occurs with mode "all"', () =>
          expressProxyControls
            .sendRequest({
              method: 'GET',
              path: '/trigger-error'
            })
            .then(() =>
              testUtils.retry(() =>
                agentStubControls.getSpans().then(spans => {
                  const httpClientSpan = testUtils.expectAtLeastOneMatching(spans, [
                    span => expect(span.n).to.equal('node.http.client'),
                    span => expect(span.k).to.equal(constants.EXIT),
                    span => expect(span.ec).to.equal(1)
                  ]);

                  expect(httpClientSpan.data.http.error).to.exist;
                  expect(httpClientSpan.stack).to.be.an('array');
                  expect(httpClientSpan.stack.length).to.be.greaterThan(0);
                  expect(httpClientSpan.stack[0]).to.have.property('m');
                  expect(httpClientSpan.stack[0]).to.have.property('c');
                  expect(httpClientSpan.stack[0]).to.have.property('n');
                })
              )
            ));
      });
    });
  });
});
