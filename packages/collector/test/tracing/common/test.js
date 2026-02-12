/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const expect = require('chai').expect;

const constants = require('@_local/core').tracing.constants;
const supportedVersion = require('@_local/core').tracing.supportedVersion;
const config = require('@_local/core/test/config');
const delay = require('@_local/core/test/test_util/delay');
const { getSpansByName, retry, stringifyItems } = require('@_local/core/test/test_util');
const ProcessControls = require('../../test_util/ProcessControls');
const globalAgent = require('../../globalAgent');
const { AgentStubControls } = require('../../apps/agentStubControls');
const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('tracing/common', function () {
  globalAgent.setUpCleanUpHooks();

  describe('delay', function () {
    describe('with minimal delay', function () {
      this.timeout(config.getTestTimeout());

      registerDelayTest.call(this, globalAgent.instance, true);
    });

    describe('without minimal delay', function () {
      this.timeout(config.getTestTimeout());

      registerDelayTest.call(this, globalAgent.instance, false);
    });

    function registerDelayTest(agentControls, withMinimalDelay) {
      let controls;

      before(async () => {
        if (withMinimalDelay) {
          controls = new ProcessControls({
            useGlobalAgent: true,
            dirname: __dirname,
            env: {
              INSTANA_TRACING_TRANSMISSION_DELAY: '6000'
            }
          });
        } else {
          controls = new ProcessControls({
            useGlobalAgent: true,
            dirname: __dirname
          });
        }

        await controls.startAndWaitForAgentConnection();
      });

      beforeEach(async () => {
        await agentControls.clearReceivedTraceData();
      });

      after(async () => {
        await controls.stop();
      });

      it(`must respect delay (with minimal delay: ${withMinimalDelay})`, () =>
        controls
          .sendRequest({
            path: '/'
          })
          .then(
            withMinimalDelay
              ? () => verifyMinimalDelay(agentControls, controls)
              : () => verifyNoMinimalDelay(agentControls, controls)
          ));
    }

    function verifyMinimalDelay(agentControls, controls) {
      return (
        delay(3000)
          .then(() => agentControls.getSpans())
          // verify there are no spans yet
          .then(spans => {
            if (spans.length > 0) {
              // eslint-disable-next-line no-console
              console.log(JSON.stringify(spans, null, 2));
            }
            return expect(spans).to.be.empty;
          })
          // verify that spans arrive after the minimum delay
          .then(() =>
            retry(() =>
              agentControls.getSpans().then(spans => {
                expect(spans).to.have.lengthOf(1);
                const span = spans[0];
                expect(span.n).to.equal('node.http.server');
                expect(span.k).to.equal(constants.ENTRY);
                expect(span.async).to.not.exist;
                expect(span.error).to.not.exist;
                expect(span.ec).to.equal(0);
                expect(span.t).to.be.a('string');
                expect(span.s).to.be.a('string');
                expect(span.p).to.not.exist;
                expect(span.data.http.method).to.equal('GET');
                expect(span.data.http.url).to.equal('/');
                expect(span.data.http.status).to.equal(200);
                expect(span.data.http.host).to.equal(`localhost:${controls.getPort()}`);
              })
            )
          )
      );
    }

    function verifyNoMinimalDelay(agentControls, controls) {
      return retry(() =>
        agentControls.getSpans().then(spans => {
          if (spans.length !== 1) {
            // eslint-disable-next-line no-console
            console.log(`Unexpected number of spans (${spans.length}): ${stringifyItems(spans)}`);
          }
          expect(spans).to.have.lengthOf(1);

          const span = spans[0];
          expect(span.n).to.equal('node.http.server');
          expect(span.k).to.equal(constants.ENTRY);
          expect(span.async).to.not.exist;
          expect(span.error).to.not.exist;
          expect(span.ec).to.equal(0);
          expect(span.t).to.be.a('string');
          expect(span.s).to.be.a('string');
          expect(span.p).to.not.exist;
          expect(span.data.http.method).to.equal('GET');
          expect(span.data.http.url).to.equal('/');
          expect(span.data.http.status).to.equal(200);
          expect(span.data.http.host).to.equal(`localhost:${controls.getPort()}`);
        })
      );
    }
  });

  describe('service name', function () {
    this.timeout(config.getTestTimeout());

    describe('with env var', function () {
      registerServiceNameTest.call(
        this,
        globalAgent.instance,
        {
          configMethod: 'env var',
          expectServiceNameOnSpans: 'on-all-spans'
        },
        {
          INSTANA_SERVICE_NAME: 'much-custom-very-wow service'
        }
      );
    });

    describe('with config', function () {
      registerServiceNameTest.call(
        this,
        globalAgent.instance,
        {
          configMethod: 'config object',
          expectServiceNameOnSpans: 'on-all-spans'
        },
        {
          // this makes the app set the serviceName per config object
          SERVICE_CONFIG: 'much-custom-very-wow service'
        }
      );
    });

    describe('with header when agent is _not_ configured to capture the header', function () {
      const agentControls = new AgentStubControls();

      before(async () => {
        await agentControls.startAgent();
      });
      after(async () => {
        await agentControls.stopAgent();
      });

      registerServiceNameTest.call(this, agentControls, {
        expectServiceNameOnSpans: 'no'
      });
    });

    function registerServiceNameTest(agentControls, { configMethod, expectServiceNameOnSpans }, env = {}) {
      if (expectServiceNameOnSpans == null || typeof expectServiceNameOnSpans !== 'string') {
        throw new Error('Please explicitly pass a string value for expectServiceNameOnSpans.');
      }

      let controls;

      before(async () => {
        controls = new ProcessControls({
          agentControls,
          dirname: __dirname,
          env
        });

        await controls.start();
      });

      beforeEach(async () => {
        await agentControls.clearReceivedTraceData();
      });

      after(async () => {
        await controls.stop();
      });

      afterEach(async () => {
        await controls.clearIpcMessages();
      });

      it(`must${
        expectServiceNameOnSpans === 'no' ? ' _not_ ' : ' '
      }respect service name configured via: ${configMethod}`, () => {
        const req = {
          path: '/with-intermediate-and-exit-spans'
        };
        return controls.sendRequest(req).then(() => verifyServiceName(agentControls, expectServiceNameOnSpans));
      });
    }

    async function verifyServiceName(agentControls, expectServiceNameOnSpans) {
      const spans = await retry(async () => {
        const _spans = await agentControls.getSpans();
        expect(_spans.length).to.equal(3);
        return _spans;
      });

      const [entrySpan] = getSpansByName(spans, 'node.http.server');

      if (expectServiceNameOnSpans === 'on-all-spans') {
        spans.forEach(span => {
          expect(span.data.service, `Missing span.data.service annotation on span ${span.n}`).to.equal(
            'much-custom-very-wow service'
          );
        });
      } else if (expectServiceNameOnSpans === 'on-entry-span') {
        spans.forEach(span => {
          if (span === entrySpan) {
            expect(span.data.service, `Missing span.data.service annotation on span ${span.n}`).to.equal(
              'much-custom-very-wow service'
            );
          } else {
            expect(span.data.service, `Unexpected span.data.service annotation on span ${span.n}`).to.not.exist;
          }
        });
      } else if (expectServiceNameOnSpans === 'no') {
        spans.forEach(span => {
          expect(span.data.service, `Unexpected span.data.service annotation on span ${span.n}`).to.not.exist;
        });
      } else {
        throw new Error(`Unknown value for parameter expectServiceNameOnSpans: ${expectServiceNameOnSpans}`);
      }
    }
  });

  describe('disable individual tracers', function () {
    this.timeout(config.getTestTimeout());

    describe('disable an individual tracer', () => {
      let controls;

      before(async () => {
        controls = new ProcessControls({
          useGlobalAgent: true,
          dirname: __dirname,
          env: {
            INSTANA_TRACING_DISABLE: 'pino'
          }
        });

        await controls.startAndWaitForAgentConnection();
      });

      beforeEach(async () => {
        await globalAgent.instance.clearReceivedTraceData();
      });

      after(async () => {
        await controls.stop();
      });

      afterEach(async () => {
        await controls.clearIpcMessages();
      });

      it('can disable a single instrumentation', () =>
        controls
          .sendRequest({
            path: '/with-log'
          })
          .then(() =>
            retry(() =>
              globalAgent.instance.getSpans().then(spans => {
                expect(spans.length).to.equal(1);
                expect(spans[0].n).to.equal('node.http.server');
              })
            )
          ));
    });

    describe('robustness against overriding Array.find', () => {
      let controls;

      before(async () => {
        controls = new ProcessControls({
          useGlobalAgent: true,
          dirname: __dirname,
          env: {
            SCREW_AROUND_WITH_UP_ARRAY_FIND: 'sure why not?'
          }
        });

        await controls.startAndWaitForAgentConnection();
      });

      beforeEach(async () => {
        await globalAgent.instance.clearReceivedTraceData();
      });

      after(async () => {
        await controls.stop();
      });

      afterEach(async () => {
        await controls.clearIpcMessages();
      });

      // Story time: There is a package out there that overrides Array.find with different behaviour that, once upon a
      // time, as a random side effect, disabled our auto tracing. This is a regression test to make sure we are now
      // robust against that particular breakage.
      //
      // It is precisely this issue that broke the activation of individual instrumentations:
      // https://github.com/montagejs/collections/issues/178
      //
      // In particular, the monkey patched version of Array.find returns -1 if nothing is found, while the standard
      // Array.find returns undefined. When checking if an array contains something with find, this reverses the logic
      // of the check because -1 is truthy and undefined is falsy.

      it('messing up Array.find must not break tracing', () =>
        controls
          .sendRequest({
            path: '/'
          })
          .then(() =>
            retry(() =>
              globalAgent.instance.getSpans().then(spans => {
                expect(spans.length).to.equal(1);
                expect(spans[0].n).to.equal('node.http.server');
              })
            )
          ));
    });
  });
});
