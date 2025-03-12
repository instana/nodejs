/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

const path = require('path');
const { expect } = require('chai');

const { tracing } = require('@instana/core');
const config = require('@instana/core/test/config');
const { delay, retry } = require('@instana/core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');

const mochaSuiteFn = tracing.supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('tracing/sdk/ignoringEndpoints', function () {
  this.timeout(config.getTestTimeout() * 2);

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  describe('when Kafka consume is configured to ignore', function () {
    let producerControls;
    let consumerControls;

    before(async () => {
      consumerControls = new ProcessControls({
        appPath: path.join(__dirname, 'consumer'),
        useGlobalAgent: true,
        env: {
          INSTANA_IGNORE_ENDPOINTS: 'kafka:consume' // basic ignoring config for consume
        }
      });

      producerControls = new ProcessControls({
        appPath: path.join(__dirname, 'producer'),
        useGlobalAgent: true
      });

      await consumerControls.startAndWaitForAgentConnection();
      await producerControls.startAndWaitForAgentConnection();
    });

    beforeEach(async () => {
      await agentControls.clearReceivedTraceData();
    });

    after(async () => {
      await producerControls.stop();
      await consumerControls.stop();
    });

    it('should ignore consumer span (kafka:consume)', async () => {
      const message = {
        key: 'someKey',
        value: 'someMessage'
      };
      await producerControls.sendRequest({
        method: 'POST',
        path: '/send-messages',
        simple: true,
        body: JSON.stringify(message),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      await delay(500);

      // Fetch the current span from the consumer
      const currentSpan = await consumerControls.sendRequest({
        method: 'GET',
        path: '/current-span',
        simple: true
      });

      await retry(async () => {
        // The currentSpan contains an InstanaIgnoredSpan, which represents a span that has been ignored
        // due to the configured `INSTANA_IGNORE_ENDPOINTS` setting (`kafka:consume` in this case).
        // Even though the consumer processes the message, its span is not recorded in the agent’s collected spans.
        // However, it can still be accessed via `instana.currentSpan()`, which returns an `InstanaIgnoredSpan`.
        expect(currentSpan).to.have.property('spanConstructorName', 'InstanaIgnoredSpan');
        expect(currentSpan.span).to.exist;
        expect(currentSpan.span).to.include({
          n: 'kafka',
          k: 1
        });
        expect(currentSpan.span.data.kafka).to.include({
          endpoints: 'test-topic-1',
          operation: 'consume'
        });

        const spans = await agentControls.getSpans();

        // 1 x HTTP entry span for /send-messages (producer)
        // 1 x Kafka send span (producer)
        // 1 x HTTP entry span for /current-span (consumer fetching ignored span)
        expect(spans).to.have.lengthOf(3);

        const kafkaSpan = spans.find(span => span.n === 'kafka' && span.k === 2);
        const producerHttpSpan = spans.find(span => span.n === 'node.http.server' && span.k === 1);
        const consumerHttpSpan = spans.find(
          span => span.n === 'node.http.server' && span.k === 1 && span.data.http.url === '/current-span'
        );

        expect(kafkaSpan).to.exist;
        expect(kafkaSpan.data.kafka).to.include({
          service: 'test-topic-1',
          access: 'send'
        });

        expect(producerHttpSpan).to.exist;
        expect(producerHttpSpan.data.http).to.include({
          method: 'POST',
          url: '/send-messages',
          status: 200
        });

        expect(consumerHttpSpan).to.exist;
      });
    });
  });
});
