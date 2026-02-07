/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const { expect } = require('chai');
const chai = require('chai');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');
const { getTestTimeout } = require('@_local/core/test/config');
const { supportedVersion } = require('@_local/core').tracing;
const { delay, retry } = require('@_local/core/test/test_util');
const expectExactlyNMatching = require('@_local/core/test/test_util/expectExactlyNMatching');
const { spans: otelSpans } = require('./otel_spans');
const { InstanaExporter } = require('../src/index');
const { Control } = require('./Control');
const { environment: instanaEnvironment } = require('@_local/serverless');

chai.use(sinonChai);

let mochaSuiteFn;

if (!supportedVersion(process.versions.node)) {
  mochaSuiteFn = describe.skip;
} else {
  mochaSuiteFn = describe;
}

mochaSuiteFn('Instana OpenTelemetry Exporter', function () {
  this.timeout(getTestTimeout() * 3);

  /** @type {InstanaExporter} */
  let instanaExporter;

  after(() => {
    sinon.restore();
  });

  describe('OTel spans conversion to Instana spans', () => {
    it('converts OTel spans to Instana spans', done => {
      instanaExporter = new InstanaExporter({ agentKey: 'agent key', endpointUrl: 'https://some-endpoint' });

      const stub = sinon.stub(instanaExporter, '_sendSpans').callsFake(spans => {
        const httpSpans = spans.filter(span => span.data.kind === 'server');
        const intermediateSpans = spans.filter(span => span.data.kind === 'internal');
        const erroneousSpans = spans.filter(span => span.ec === 1);
        const lt = httpSpans[0].lt;
        const t = httpSpans[0].t;
        const wrongSpanIdSizeSpan = spans.filter(span => span.data.operation === 'wrong-span-id-span')[0];
        const wrongTraceIdSizeSpan = spans.filter(span => span.data.operation === 'wrong-trace-id-span')[0];

        expect(lt).to.exist;
        expect(lt.substr(16), 'span.t is the second half of span.lt').to.be.equal(t);
        expect(t.length, 'span.t is always 16 hex chars (64 bits)').to.be.equal(16);
        expect(lt.length, 'span.lt is always 32 hex chars (128 bits)').to.be.equal(32);
        expect(spans).to.exist;
        expect(spans.length).to.be.eq(9);
        expect(intermediateSpans.length).to.be.eq(5);
        expect(httpSpans.length).to.be.eq(4);
        expect(wrongSpanIdSizeSpan.s).to.be.equal('005bb611747144b7');
        expect(wrongTraceIdSizeSpan.lt).to.be.equal('00000f2d66a047ff7d91688e9960b690');
        expect(spans.every(span => span.n === 'otel')).to.be.true;
        expect(spans.every(span => span.f.e === process.pid)).to.be.true;
        expect(erroneousSpans.length).to.be.eq(1);
        expect(spans.filter(span => span.data.operation !== 'wrong-trace-id-span').every(span => span.lt === lt)).to.be
          .true;
        done();
      });

      instanaExporter.export(otelSpans, () => {});

      expect(stub).to.have.been.called;
    });

    it("doesn't export spans when agent key and/or endpoint URL are not provided", () => {
      const originalEndpointUrl = process.env.INSTANA_ENDPOINT_URL;
      const originalAgentKey = process.env.INSTANA_AGENT_KEY;

      instanaEnvironment._reset();
      delete process.env.INSTANA_ENDPOINT_URL;
      delete process.env.INSTANA_AGENT_KEY;

      instanaExporter = new InstanaExporter();

      const spy = sinon.spy(instanaExporter, '_sendSpans');

      instanaExporter.export(otelSpans, () => {});

      expect(spy).to.not.have.been.called;

      if (originalEndpointUrl) {
        process.env.INSTANA_ENDPOINT_URL = originalEndpointUrl;
      }
      if (originalAgentKey) {
        process.env.INSTANA_AGENT_KEY = originalAgentKey;
      }
    });
  });

  describe('Communication to the backend', () => {
    describe('When backend is started', () => {
      let appControls;

      before(async () => {
        appControls = new Control({
          startBackend: true,
          otelAppPath: './test/app',
          env: {
            INSTANA_DISABLE_CA_CHECK: 'true',
            INSTANA_AGENT_KEY: 'some key'
          }
        });

        await appControls.start();
      });

      beforeEach(async () => {
        await appControls.reset();
        await appControls.resetBackendSpans();
      });

      after(async () => {
        await appControls.stop();
      });

      it('sends spans to the backend', async () => {
        // We need some time so OTel tracing starts
        await delay(1000);

        await appControls.sendRequest({
          path: '/otel-test'
        });

        await retry(async () => {
          verifySpans(await appControls.getSpans(), appControls);
        });
      });
    });

    describe('When backend is not started', () => {
      let appControls;

      before(async () => {
        appControls = new Control({
          startBackend: false,
          otelAppPath: './test/app',
          env: {
            INSTANA_AGENT_KEY: 'some key'
          }
        });

        await appControls.start();
      });

      beforeEach(async () => {
        await appControls.reset();
        await appControls.resetBackendSpans();
      });

      after(async () => {
        await appControls.stop();
      });

      it('fails to send spans to the backend', async () => {
        // We need some time so OTel tracing starts
        await delay(1000);

        await appControls.sendRequest({
          path: '/otel-test'
        });

        await retry(async () => {
          const spans = await appControls.getSpans();
          expect(spans.length).to.be.eq(0);
        });
      });
    });

    describe('When environment variables are not properly set', () => {
      let appControls;

      before(async () => {
        appControls = new Control({
          INSTANA_DISABLE_CA_CHECK: 'true',
          startBackend: true,
          otelAppPath: './test/app',
          env: {
            INSTANA_ENDPOINT_URL: 'malformed URL',
            INSTANA_AGENT_KEY: 'some key'
          }
        });

        await appControls.start();
      });

      beforeEach(async () => {
        await appControls.reset();
        await appControls.resetBackendSpans();
      });

      after(async () => {
        await appControls.stop();
      });

      it('fails to send spans to the backend', async () => {
        // We need some time so OTel tracing starts
        await delay(1000);

        await appControls.sendRequest({
          path: '/otel-test'
        });

        await retry(async () => {
          const spans = await appControls.getSpans();
          expect(spans.length).to.be.eq(0);
        });
      });
    });
  });
});

function verifySpans(spans, appControls) {
  // 1 x tcp connect
  // 1 x request handler - /internal-endpoint
  // 1 x GET /internal-endpoint (server)
  // 1 x GET (client)
  // 1 x request handler - /otel-test
  // 1 x GET /otel-test (server)
  expectExactlyNMatching(spans, 6, [
    span => expect(span.ec).to.eq(0),
    span => expect(span.f.e).to.eq(appControls.getTestAppPid()),
    span => expect(span.n).to.eq('otel'),
    span => expect(span.s).to.exist,
    span => expect(span.s.length).to.eq(16),
    span => expect(span.t).to.exist,
    span => expect(span.t.length).to.eq(16),
    span => expect(span.lt).to.exist,
    span => expect(span.lt.length).to.eq(32),
    span => expect(span.lt.substr(16)).to.be.equal(span.t)
  ]);
}
