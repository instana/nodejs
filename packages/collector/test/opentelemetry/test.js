/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const expect = require('chai').expect;
const path = require('path');
const semver = require('semver');
const express = require('express');

const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../core/test/config');
const { retry, delay, isCI } = require('../../../core/test/test_util');
const ProcessControls = require('../test_util/ProcessControls');
const portfinder = require('../test_util/portfinder');
const globalAgent = require('../globalAgent');
const RETRY_TIME = 10 * 1000;

// NOTE: only run on the latest node version
const mochaSuiteFn =
  supportedVersion(process.versions.node) && semver.gte(process.versions.node, '18.0.0') ? describe : describe.skip;

// NOTE: Using @instana/collector and the OpenTelemetry SDK in the same process is not supported.
//       Thus, this test does not verify desirable behavior but simply checks what exactly happens when
//       this unsupported setup is used. Both variants (require Instana first/OTel second and vice versa)
//       fail, though they fail in different ways.
mochaSuiteFn('Opentelemetry usage', function () {
  const timeout = config.getTestTimeout() * 2;
  const retryTimeout = timeout / 2;
  this.timeout(timeout);
  const randomPort = portfinder();
  let server;
  let otelSpans = [];

  before(async () => {
    const app = express();
    app.use(express.json({ limit: '50mb' }));
    app.post('/v1/traces', function (req, res) {
      otelSpans = otelSpans.concat(req.body.resourceSpans);
      res.sendStatus(200);
    });

    server = await app.listen(randomPort);
  });

  after(async () => {
    await server.close();
  });

  describe('instana first', function () {
    globalAgent.setUpCleanUpHooks();
    const agentControls = globalAgent.instance;

    const controls = new ProcessControls({
      appPath: path.join(__dirname, 'app'),
      env: {
        INSTANA_LOAD_FIRST: true,
        SPAN_RECEIVER_PORT: randomPort
      }
    });

    ProcessControls.setUpHooksWithRetryTime(RETRY_TIME, controls);

    before(() => {
      otelSpans = [];
    });

    it('should not trace Instana spans', () =>
      controls
        .sendRequest({
          method: 'GET',
          path: '/trace'
        })
        .then(() => delay(500))
        .then(() =>
          retry(
            () =>
              agentControls.getSpans().then(spans => {
                // Instana does not work when instana was required first
                expect(spans, `Expected no Instana spans but got ${JSON.stringify(spans)}`).to.be.empty;

                // 1 means -> one instrumentation traced spans
                // here it is: request handler / middlewares
                expect(otelSpans, `Expected one OTel span but got ${JSON.stringify(otelSpans)}`).to.have.lengthOf(1);
                expect(
                  otelSpans[0].scopeSpans[0].spans,
                  `Expected three scope spans but got ${JSON.stringify(otelSpans[0].scopeSpans[0].spans)}`
                ).to.have.lengthOf(3);
              }),
            retryTimeout
          )
        ));
  });

  // This test is flaky on CI. It basically serves to demonstrate that with this unsupported setup (combining OTel and
  // Instana, initializing OTel first), we might receive duplicated spans, one from OTel, one from Instana. However,
  // sometimes the OTel span is missing. That might be due to a timing issue. Anyways, since this test mostly exist to
  // document an unsupported setup, we skip it on CI.
  const mochaSuiteFnOTelFirst = isCI ? describe.skip : describe;

  mochaSuiteFnOTelFirst('otel first', function () {
    globalAgent.setUpCleanUpHooks();
    const agentControls = globalAgent.instance;

    const controls = new ProcessControls({
      appPath: path.join(__dirname, 'app'),
      env: {
        INSTANA_LOAD_FIRST: false,
        SPAN_RECEIVER_PORT: randomPort
      }
    });

    ProcessControls.setUpHooksWithRetryTime(RETRY_TIME, controls);

    before(() => {
      otelSpans = [];
    });

    it('should trace duplicated data', () =>
      controls
        .sendRequest({
          method: 'GET',
          path: '/trace'
        })
        .then(() =>
          retry(
            () =>
              agentControls.getSpans().then(spans => {
                // instana works when otel was required first
                // 1 entry instana span http server
                // 1 exit internal otel request to transmit the spans (OTLPTraceExporter)
                expect(spans, `Expected two spans but got ${JSON.stringify(spans)}`).to.have.lengthOf(2);
                expect(spans[0].data.http.url).to.eql('/trace');
                expect(spans[1].data.http.url).to.contain('/v1/traces');

                // request handler + middleware spans
                // internal otel request to transmit the spans (OTLPTraceExporter)
                expect(otelSpans, `Expected at least two OTel spans but got ${otelSpans}`).to.have.lengthOf.at.least(2);
              }),
            retryTimeout
          )
        ));
  });
});
