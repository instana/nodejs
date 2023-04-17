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
const { retry } = require('../../../core/test/test_util');
const ProcessControls = require('../test_util/ProcessControls');
const portfinder = require('../test_util/portfinder');
const globalAgent = require('../globalAgent');

// NOTE: only run on the latest node version
const mochaSuiteFn =
  supportedVersion(process.versions.node) && semver.gte(process.versions.node, '18.0.0') ? describe : describe.skip;

mochaSuiteFn('Opentelemetry usage', function () {
  this.timeout(config.getTestTimeout());
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
      useGlobalAgent: true,
      appPath: path.join(__dirname, 'app'),
      env: {
        INSTANA_LOAD_FIRST: true,
        SPAN_RECEIVER_PORT: randomPort
      }
    });

    ProcessControls.setUpHooks(controls);

    before(() => {
      otelSpans = [];
    });

    it('should not trace Instana spans', () =>
      controls
        .sendRequest({
          method: 'GET',
          path: '/trace'
        })
        .then(() =>
          retry(() =>
            agentControls.getSpans().then(spans => {
              // Instana does not work when instana was required first
              expect(spans.length).to.equal(0);

              // 1 means -> one instrumentation traced spans
              // here it is: request handler / middlewares
              expect(otelSpans.length).to.equal(1);
              expect(otelSpans[0].scopeSpans[0].spans.length).to.equal(3);
            })
          )
        ));
  });

  describe('otel first', function () {
    globalAgent.setUpCleanUpHooks();
    const agentControls = globalAgent.instance;

    const controls = new ProcessControls({
      useGlobalAgent: true,
      appPath: path.join(__dirname, 'app'),
      env: {
        INSTANA_LOAD_FIRST: false,
        SPAN_RECEIVER_PORT: randomPort
      }
    });

    ProcessControls.setUpHooks(controls);

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
          retry(() =>
            agentControls.getSpans().then(spans => {
              // instana works when otel was required first
              // 1 entry instana span http server
              // 1 exit internal otel request to transmit the spans (OTLPTraceExporter)
              expect(spans.length).to.equal(2);
              expect(spans[0].data.http.url).to.eql('/trace');
              expect(spans[1].data.http.url).to.contain('/v1/traces');

              // request handler + middleware spans
              // internal otel request to transmit the spans (OTLPTraceExporter)
              expect(otelSpans.length).to.be.gte(2);
            })
          )
        ));
  });
});
