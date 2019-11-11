'use strict';

const expect = require('chai').expect;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../config');
const delay = require('../../test_util/delay');
const utils = require('../../utils');

let agentControls;
let Controls;
const extendedTimeout = Math.max(config.getTestTimeout(), 10000);

describe('tracing/common', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  agentControls = require('../../apps/agentStubControls');
  Controls = require('./controls');

  agentControls.registerTestHooks();

  describe('delay', function() {
    describe('with minimal delay', function() {
      this.timeout(extendedTimeout);
      const controls = new Controls({
        agentControls,
        minimalDelay: 6000
      });
      registerDelayTest.call(this, controls, true);
    });

    describe('without minimal delay', function() {
      this.timeout(config.getTestTimeout());
      const controls = new Controls({
        agentControls
      });
      registerDelayTest.call(this, controls, false);
    });

    function registerDelayTest(controls, withMinimalDelay) {
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

    function verifyMinimalDelay() {
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
                  expect(span.async).to.equal(false);
                  expect(span.error).to.equal(false);
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

    function verifyNoMinimalDelay() {
      return utils.retry(() =>
        agentControls.getSpans().then(spans => {
          expect(spans.length).to.equal(1);

          const span = spans[0];
          expect(span.n).to.equal('node.http.server');
          expect(span.k).to.equal(constants.ENTRY);
          expect(span.async).to.equal(false);
          expect(span.error).to.equal(false);
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
      const controls = new Controls({
        agentControls,
        env: {
          INSTANA_SERVICE_NAME: 'much-custom-very-wow service'
        }
      });
      registerServiceNameTest.call(this, controls, 'env var');
    });

    describe('with config', function() {
      const controls = new Controls({
        agentControls,
        env: {
          // this makes the app set the serviceName per config object
          SERVICE_CONFIG: 'much-custom-very-wow service'
        }
      });
      registerServiceNameTest.call(this, controls, 'config object');
    });

    describe('with header', function() {
      const controls = new Controls({
        agentControls
      });
      registerServiceNameTest.call(this, controls, 'X-Instana-Service header');
    });

    function registerServiceNameTest(controls, configMethod) {
      controls.registerTestHooks();

      it(`must respect service name configured via: ${configMethod})`, () => {
        const req = {
          path: '/'
        };
        if (configMethod === 'X-Instana-Service header') {
          req.headers = {
            'x-InsTana-sErvice': 'much-custom-very-wow service'
          };
        }
        return controls.sendRequest(req).then(() => verifyServiceName(agentControls));
      });
    }

    function verifyServiceName() {
      return utils.retry(() =>
        agentControls.getSpans().then(spans => {
          expect(spans.length).to.equal(1);
          const span = spans[0];
          expect(span.n).to.equal('node.http.server');
          expect(span.data.service).to.equal('much-custom-very-wow service');
        })
      );
    }
  });
});
