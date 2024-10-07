/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const expect = require('chai').expect;
const path = require('path');
const express = require('express');

const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../core/test/config');
const { retry, delay } = require('../../../core/test/test_util');
const ProcessControls = require('../test_util/ProcessControls');
const portfinder = require('../test_util/portfinder');
const globalAgent = require('../globalAgent');

// NOTE: only run on the latest node version
// This case is already skipped.
const mochaSuiteFn = supportedVersion(process.versions.node) ? describe.skip : describe.skip;

// NOTE: Using @instana/collector and the OpenTelemetry SDK in the same process is not supported.
//       Thus, this test does not verify desirable behavior but simply checks what exactly happens when
//       this unsupported setup is used. Both variants (require Instana first/OTel second and vice versa)
//       fail, though they fail in different ways.
// TODO: fix me later
mochaSuiteFn('Opentelemetry usage', function () {
  this.timeout(config.getTestTimeout());
  let server;
  let otelSpans = [];
  let randomPort;

  before(async () => {
    randomPort = portfinder();

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

    let controls;

    before(async () => {
      controls = new ProcessControls({
        useGlobalAgent: true,
        appPath: path.join(__dirname, 'app'),
        env: {
          INSTANA_LOAD_FIRST: true,
          SPAN_RECEIVER_PORT: randomPort
        }
      });

      otelSpans = [];

      await controls.startAndWaitForAgentConnection();
    });

    beforeEach(async () => {
      await agentControls.clearReceivedTraceData();
    });

    after(async () => {
      await controls.stop();
    });

    it('should not trace Instana spans', () =>
      controls
        .sendRequest({
          method: 'GET',
          path: '/trace'
        })
        .then(() => delay(1000))
        .then(() =>
          retry(() =>
            agentControls.getSpans().then(spans => {
              // Instana does not work when instana was required first
              expect(spans, `Expected no Instana spans but got ${JSON.stringify(spans)}`).to.be.empty;
              // Proof that Otel spans still work.
              expect(
                otelSpans,
                `Expected one OTel span but got ${JSON.stringify(otelSpans)}`
              ).to.have.lengthOf.greaterThan(1);
            })
          )
        ));
  });

  mochaSuiteFn('otel first', function () {
    globalAgent.setUpCleanUpHooks();
    const agentControls = globalAgent.instance;

    let controls;

    before(async () => {
      controls = new ProcessControls({
        useGlobalAgent: true,
        appPath: path.join(__dirname, 'app'),
        env: {
          INSTANA_LOAD_FIRST: false,
          SPAN_RECEIVER_PORT: randomPort
        }
      });

      await controls.startAndWaitForAgentConnection();
      otelSpans = [];
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

    it('should trace duplicated data', () =>
      controls
        .sendRequest({
          method: 'GET',
          path: '/trace'
        })
        .then(() => delay(1000))
        .then(() =>
          retry(() =>
            agentControls.getSpans().then(spans => {
              // instana works when otel was required first
              expect(spans, `Expected two spans but got ${JSON.stringify(spans)}`).to.have.lengthOf.at.least(1);

              // inotel works too when otel was required first
              expect(otelSpans, `Expected at least two OTel spans but got ${otelSpans}`).to.have.lengthOf.at.least(1);
            })
          )
        ));
  });
});
