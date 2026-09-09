/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const expect = require('chai').expect;
const constants = require('@_local/core').tracing.constants;
const config = require('@_local/core/test/config');
const {
  retry,
  verifyHttpRootEntry,
  verifyExitSpan,
  verifyEntrySpan,
  delay,
  expectExactlyOneMatching
} = require('@_local/core/test/test_util');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');
const globalAgent = require('@_local/collector/test/globalAgent');

const agentControls = globalAgent.instance;

function checkTelemetryResourceAttrs(span) {
  expect(span.data.resource['service.name']).to.not.exist;
  expect(span.data.resource['telemetry.sdk.language']).to.eql('nodejs');
  expect(span.data.resource['telemetry.sdk.name']).to.eql('opentelemetry');
  expect(span.data.resource['telemetry.sdk.version']).to.match(/2\.\d+\.\d/);
}

function verifyHttpExit(spans, parentSpan) {
  return expectExactlyOneMatching(spans, [
    span => expect(span.n).to.equal('node.http.client'),
    span => expect(span.k).to.equal(constants.EXIT),
    span => expect(span.async).to.not.exist,
    span => expect(span.error).to.not.exist,
    span => expect(span.ec).to.equal(0),
    span => expect(span.t).to.be.a('string'),
    span => expect(span.s).to.be.a('string'),
    span => expect(span.p).to.equal(parentSpan.s),
    span => expect(span.data.http.method).to.equal('GET'),
    span => expect(span.data.http.status).to.equal(200),
    span => expect(span.fp).to.not.exist
  ]);
}

// node bin/start-test-containers.js --zookeeper --kafka --kafka-topics
// Note: @platformatic/kafka is ESM-only. Run tests with RUN_ESM=true.
module.exports = function (name, version, isLatest) {
  const suiteFn = process.env.RUN_ESM ? describe : describe.skip;

  suiteFn('tracing/@platformatic/kafka', function () {
    this.timeout(config.getTestTimeout() * 2.5);

    globalAgent.setUpCleanUpHooks();

    const libraryEnv = { LIBRARY_VERSION: version, LIBRARY_NAME: name, LIBRARY_LATEST: isLatest };
    const topic = 'platformatic-kafka-topic';

    let consumerControls;
    let producerControls;

    before(async () => {
      producerControls = new ProcessControls({
        dirname: __dirname,
        appName: 'platformatic-kafka-producer-app',
        useGlobalAgent: true,
        enableOtelIntegration: true,
        env: {
          ...libraryEnv,
          PLATFORMATIC_KAFKA_TOPIC: topic
        }
      });

      await producerControls.startAndWaitForAgentConnection();

      consumerControls = new ProcessControls({
        dirname: __dirname,
        appName: 'platformatic-kafka-consumer-app',
        useGlobalAgent: true,
        enableOtelIntegration: true,
        env: {
          ...libraryEnv,
          PLATFORMATIC_KAFKA_TOPIC: topic
        }
      });

      await consumerControls.startAndWaitForAgentConnection(1000, Date.now() + 1000 * 90);
    });

    beforeEach(async () => {
      await agentControls.clearReceivedTraceData();
    });

    after(async () => {
      await consumerControls.stop();
      await producerControls.stop();
    });

    afterEach(async () => {
      await consumerControls.clearIpcMessages();
      await producerControls.clearIpcMessages();
    });

    const apiPath = '/produce';

    it('produces and consumes a message', async () => {
      const response = await producerControls.sendRequest({
        method: 'GET',
        path: apiPath
      });

      console.log('[test] response received:', JSON.stringify(response, null, 2));

      expect(response.produced).to.equal(true);

      return retry(() => {
        return agentControls.getSpans().then(spans => {
          // eslint-disable-next-line no-console
          console.log('[test] spans received:', JSON.stringify(spans, null, 2));
          expect(spans.length).to.equal(4);

          const httpEntry = verifyHttpRootEntry({
            spans,
            apiPath: '/produce',
            pid: String(producerControls.getPid())
          });

          const producerExit = verifyExitSpan({
            spanName: 'otel',
            spans,
            parent: httpEntry,
            withError: false,
            pid: String(producerControls.getPid()),
            dataProperty: 'tags',
            extraTests: span => {
              expect(span.t).to.equal(httpEntry.t);
              expect(span.data.tags.name).to.match(/send to /);
              expect(span.data.tags['messaging.system']).to.equal('kafka');
              expect(span.data.tags['messaging.operation.type']).to.equal('send');
              expect(span.d).to.be.greaterThan(2);
              checkTelemetryResourceAttrs(span);
            }
          });

          const consumerEntry = verifyEntrySpan({
            spanName: 'otel',
            spans,
            withError: false,
            pid: String(consumerControls.getPid()),
            dataProperty: 'tags',
            extraTests: span => {
              expect(span.t).to.equal(httpEntry.t);
              expect(span.p).to.equal(producerExit.s);
              expect(span.data.tags.name).to.match(/process message from /);
              expect(span.data.tags['messaging.system']).to.equal('kafka');
              expect(span.data.tags['messaging.operation.type']).to.equal('process');
              expect(span.d).to.be.greaterThan(2);
              checkTelemetryResourceAttrs(span);
            }
          });

          verifyHttpExit(spans, consumerEntry);
        });
      });
    });

    it('[suppressed] must not trace', async () => {
      const response = await producerControls.sendRequest({
        method: 'GET',
        path: apiPath,
        suppressTracing: true
      });

      expect(response.produced).to.equal(true);

      await delay(1000 * 5);

      return retry(async () => {
        const spans = await agentControls.getSpans();
        expect(spans).to.have.lengthOf(0);
      });
    });
  });
};
