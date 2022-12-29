/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

const expect = require('chai').expect;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../core/test/config');
const delay = require('../../../../core/test/test_util/delay');
const { retry, stringifyItems } = require('../../../../core/test/test_util');
const ProcessControls = require('../../test_util/ProcessControls');
const globalAgent = require('../../globalAgent');

const extendedTimeout = Math.max(config.getTestTimeout(), 10000);

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn.only('tracing/common', function () {
  globalAgent.setUpCleanUpHooks();

  describe('delay', function () {
    describe('with minimal delay', function () {
      this.timeout(extendedTimeout);
      const controls = new ProcessControls({
        useGlobalAgent: true,
        dirname: __dirname,
        minimalDelay: 6000
      });
      ProcessControls.setUpHooks(controls);
      registerDelayTest.call(this, globalAgent.instance, controls, true);
    });

    describe('without minimal delay', function () {
      this.timeout(config.getTestTimeout());
      const controls = new ProcessControls({
        useGlobalAgent: true,
        dirname: __dirname
      });
      ProcessControls.setUpHooks(controls);
      registerDelayTest.call(this, globalAgent.instance, controls, false);
    });

    function registerDelayTest(agentControls, controls, withMinimalDelay) {
      it(`must respect delay (with minimal delay: ${withMinimalDelay})`, () =>
        controls
          .sendRequest({
            path: '/'
          })
          .then(
            withMinimalDelay ? () => verifyMinimalDelay(agentControls) : () => verifyNoMinimalDelay(agentControls)
          ));
    }

    function verifyMinimalDelay(agentControls) {
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
            retry(
              () =>
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
                  expect(span.data.http.host).to.equal('localhost:3215');
                }),
              Math.max(extendedTimeout / 2, 10000)
            )
          )
      );
    }

    function verifyNoMinimalDelay(agentControls) {
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
          expect(span.data.http.host).to.equal('localhost:3215');
        })
      );
    }
  });

  describe('service name', function () {
    this.timeout(config.getTestTimeout());

    describe('with env var', function () {
      const controls = new ProcessControls({
        useGlobalAgent: true,
        dirname: __dirname,
        env: {
          INSTANA_SERVICE_NAME: 'much-custom-very-wow service'
        }
      });
      ProcessControls.setUpHooks(controls);
      registerServiceNameTest.call(this, globalAgent.instance, controls, 'env var', true);
    });

    describe('with config', function () {
      const controls = new ProcessControls({
        useGlobalAgent: true,
        dirname: __dirname,
        env: {
          // this makes the app set the serviceName per config object
          SERVICE_CONFIG: 'much-custom-very-wow service'
        }
      });
      ProcessControls.setUpHooks(controls);
      registerServiceNameTest.call(this, globalAgent.instance, controls, 'config object', true);
    });

    describe('with header when agent is configured to capture the header', function () {
      const agentControls = setupCustomAgentControls(true);
      const controls = new ProcessControls({
        agentControls,
        dirname: __dirname
      }).registerTestHooks();
      registerServiceNameTest.call(this, agentControls, controls, 'X-Instana-Service header', true);
    });

    describe('with header when agent is _not_ configured to capture the header', function () {
      const agentControls = setupCustomAgentControls(false);
      const controls = new ProcessControls({
        agentControls,
        dirname: __dirname
      }).registerTestHooks();
      registerServiceNameTest.call(this, agentControls, controls, 'X-Instana-Service header', false);
    });

    function registerServiceNameTest(agentControls, controls, configMethod, expectServiceNameOnSpan) {
      it(`must${expectServiceNameOnSpan ? ' ' : ' _not_ '}respect service name configured via: ${configMethod}`, () => {
        const req = {
          path: '/'
        };
        if (configMethod === 'X-Instana-Service header') {
          req.headers = {
            'x-InsTana-sErvice': 'much-custom-very-wow service'
          };
        }
        return controls.sendRequest(req).then(() => verifyServiceName(agentControls, expectServiceNameOnSpan));
      });
    }

    function verifyServiceName(agentControls, expectServiceNameOnSpan) {
      return retry(() =>
        agentControls.getSpans().then(spans => {
          expect(spans.length).to.equal(1);
          const span = spans[0];
          expect(span.n).to.equal('node.http.server');
          if (expectServiceNameOnSpan == null) {
            throw new Error('Please explicitly pass true or false for expectServiceNameOnSpan');
          } else if (expectServiceNameOnSpan) {
            expect(span.data.service).to.equal('much-custom-very-wow service');
          } else {
            expect(span.data.service).to.not.exist;
          }
        })
      );
    }
  });

  describe('disable individual tracers', function () {
    this.timeout(config.getTestTimeout());

    describe('disable an individual tracer', () => {
      const controls = new ProcessControls({
        useGlobalAgent: true,
        dirname: __dirname,
        env: {
          INSTANA_DISABLED_TRACERS: 'pino'
        }
      });
      ProcessControls.setUpHooks(controls);

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
      const controls = new ProcessControls({
        useGlobalAgent: true,
        dirname: __dirname,
        env: {
          SCREW_AROUND_WITH_UP_ARRAY_FIND: 'sure why not?'
        }
      });
      ProcessControls.setUpHooks(controls);

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

  function setupCustomAgentControls(captureXInstanaServiceHeader) {
    const agentControls = require('../../apps/agentStubControls');
    const agentConfig = captureXInstanaServiceHeader ? { extraHeaders: ['x-iNsTanA-sErViCe'] } : {};
    agentControls.registerTestHooks(agentConfig);
    return agentControls;
  }
});
