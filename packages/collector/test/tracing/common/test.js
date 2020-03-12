'use strict';

const expect = require('chai').expect;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../core/test/config');
const delay = require('../../../../core/test/test_util/delay');
const utils = require('../../../../core/test/utils');

let Controls;
const extendedTimeout = Math.max(config.getTestTimeout(), 10000);

describe('tracing/common', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  Controls = require('./controls');
  describe('delay', function() {
    describe('with minimal delay', function() {
      this.timeout(extendedTimeout);
      const agentControls = setupAgentControls();
      const controls = new Controls({
        agentControls,
        minimalDelay: 6000
      });
      registerDelayTest.call(this, agentControls, controls, true);
    });

    describe('without minimal delay', function() {
      this.timeout(config.getTestTimeout());
      const agentControls = setupAgentControls();
      const controls = new Controls({ agentControls });
      registerDelayTest.call(this, agentControls, controls, false);
    });

    function registerDelayTest(agentControls, controls, withMinimalDelay) {
      controls.registerTestHooks();

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
            // eslint-disable-next-line no-console
            console.log(JSON.stringify(spans, null, 2));
            return expect(spans).to.be.empty;
          })
          // verify that spans arrive after the minimum delay
          .then(() =>
            utils.retry(
              () =>
                agentControls.getSpans().then(spans => {
                  expect(spans.length).to.equal(1);
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
                  expect(span.data.http.host).to.equal('127.0.0.1:3215');
                }),
              Math.max(extendedTimeout / 2, 10000)
            )
          )
      );
    }

    function verifyNoMinimalDelay(agentControls) {
      return utils.retry(() =>
        agentControls.getSpans().then(spans => {
          expect(spans.length).to.equal(1);

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
          expect(span.data.http.host).to.equal('127.0.0.1:3215');
        })
      );
    }
  });

  describe('service name', function() {
    describe('with env var', function() {
      const agentControls = setupAgentControls();
      const controls = new Controls({
        agentControls,
        env: {
          INSTANA_SERVICE_NAME: 'much-custom-very-wow service'
        }
      });
      registerServiceNameTest.call(this, agentControls, controls, 'env var', true);
    });

    describe('with config', function() {
      const agentControls = setupAgentControls();
      const controls = new Controls({
        agentControls,
        env: {
          // this makes the app set the serviceName per config object
          SERVICE_CONFIG: 'much-custom-very-wow service'
        }
      });
      registerServiceNameTest.call(this, agentControls, controls, 'config object', true);
    });

    describe('with header when agent is configured to capture the header', function() {
      const agentControls = setupAgentControls(true);
      const controls = new Controls({ agentControls });
      registerServiceNameTest.call(this, agentControls, controls, 'X-Instana-Service header', true);
    });

    describe('with header when agent is _not_ configured to capture the header', function() {
      const agentControls = setupAgentControls(false);
      const controls = new Controls({ agentControls });
      registerServiceNameTest.call(this, agentControls, controls, 'X-Instana-Service header', false);
    });

    function registerServiceNameTest(agentControls, controls, configMethod, expectServiceNameOnSpan) {
      controls.registerTestHooks();

      it(`must ${expectServiceNameOnSpan ? '' : '_not_'} respect service name configured via: ${configMethod})`, () => {
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
      return utils.retry(() =>
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

  function setupAgentControls(captureXInstanaServiceHeader) {
    const agentControls = require('../../apps/agentStubControls');
    const agentConfig = captureXInstanaServiceHeader ? { extraHeaders: ['x-iNsTanA-sErViCe'] } : {};
    agentControls.registerTestHooks(agentConfig);
    return agentControls;
  }
});
