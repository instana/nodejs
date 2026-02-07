/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const expect = require('chai').expect;

const supportedVersion = require('@_local/core').tracing.supportedVersion;
const config = require('../../../../core/test/config');
const testUtils = require('../../../../core/test/test_util');
const globalAgent = require('../../globalAgent');

describe('tracing/opentracing/integration', function () {
  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;
  const expressOpentracingControls = require('./controls');

  beforeEach(async () => {
    await agentControls.clearReceivedTraceData();
  });

  describe('with automatic tracing', () => {
    expressOpentracingControls.registerTestHooks();

    beforeEach(async () => {
      await agentControls.waitUntilAppIsCompletelyInitialized(expressOpentracingControls.getPid());
    });

    it('must not generate opentracing traces when OT is not used', async () => {
      await expressOpentracingControls.sendRequest({ path: '/' });

      await testUtils.retry(async () => {
        const spans = await agentControls.getSpans();

        if (supportedVersion(process.versions.node)) {
          expect(spans).to.have.lengthOf(1);
          expect(spans[0].n).to.equal('node.http.server');
        } else {
          expect(spans).to.have.lengthOf(0);
        }
      });
    });

    it('must generate opentracing traces', async () => {
      await expressOpentracingControls.sendRequest({ path: '/withOpentracing' });

      await testUtils.retry(async () => {
        const spans = await agentControls.getSpans();

        const serviceSpan = testUtils.expectAtLeastOneMatching(spans, [
          span => expect(span.t).to.be.a('string'),
          span => expect(span.s).to.be.a('string'),
          span => expect(span.s).to.equal(span.t),
          span => expect(span.p).to.equal(undefined),
          span => expect(span.n).to.equal('sdk'),
          span => expect(span.f.e).to.equal(String(expressOpentracingControls.getPid())),
          span => expect(span.f.h).to.equal('agent-stub-uuid'),
          span => expect(span.data.service).to.equal('theFancyServiceYouWouldntBelieveActuallyExists'),
          span => expect(span.data.sdk.name).to.equal('service'),
          span => expect(span.data.sdk.type).to.equal('entry')
        ]);

        testUtils.expectAtLeastOneMatching(spans, [
          span => expect(span.t).to.equal(serviceSpan.t),
          span => expect(span.p).to.equal(serviceSpan.s),
          span => expect(span.s).to.be.a('string'),
          span => expect(span.s).not.to.equal(span.t),
          span => expect(span.s).not.to.equal(span.p),
          span => expect(span.n).to.equal('sdk'),
          span => expect(span.f.e).to.equal(String(expressOpentracingControls.getPid())),
          span => expect(span.f.h).to.equal('agent-stub-uuid'),
          span => expect(span.data.service).to.equal('theFancyServiceYouWouldntBelieveActuallyExists'),
          span => expect(span.data.sdk.name).to.equal('auth'),
          span => expect(span.data.sdk.type).to.equal('local')
        ]);

        if (supportedVersion(process.versions.node)) {
          expect(spans).to.have.lengthOf(3);
        } else {
          expect(spans).to.have.lengthOf(2);
        }
      });
    });

    if (supportedVersion(process.versions.node)) {
      it('must connect instana trace to opentracing spans', async () => {
        await expressOpentracingControls.sendRequest({ path: '/withOpentracingConnectedToInstanaTrace' });
        await testUtils.retry(async () => {
          const spans = await agentControls.getSpans();
          expect(spans).to.have.lengthOf(2);

          const httpSpan = testUtils.expectAtLeastOneMatching(spans, [
            span => expect(span.n).to.equal('node.http.server'),
            span => expect(span.f.e).to.equal(String(expressOpentracingControls.getPid())),
            span => expect(span.f.h).to.equal('agent-stub-uuid')
          ]);

          testUtils.expectAtLeastOneMatching(spans, [
            span => expect(span.t).to.equal(httpSpan.t),
            span => expect(span.p).to.equal(httpSpan.s),
            span => expect(span.s).to.be.a('string'),
            span => expect(span.s).not.to.equal(span.t),
            span => expect(span.s).not.to.equal(span.p),
            span => expect(span.n).to.equal('sdk'),
            span => expect(span.f.e).to.equal(String(expressOpentracingControls.getPid())),
            span => expect(span.f.h).to.equal('agent-stub-uuid'),
            span => expect(span.data.service).to.equal('theFancyServiceYouWouldntBelieveActuallyExists'),
            span => expect(span.data.sdk.name).to.equal('service')
          ]);

          // OpenTracing lazy loads cls.js, which creates a span via the OTel fs plug-in.
          // currently otel instrumentations are disabled in our tests by deafult, so we do not see this span here.
        });
      });

      it('must contain baggage in instana span context', async () => {
        return testUtils.retry(async () => {
          const body = await expressOpentracingControls.sendRequest({ path: '/getCurrentlyActiveInstanaSpanContext' });
          expect(JSON.parse(body).baggage).to.deep.equal({});
        });
      });
    }
  });

  describe('without automatic tracing', () => {
    expressOpentracingControls.registerTestHooks({ automaticTracingEnabled: false });

    beforeEach(async () => {
      await agentControls.waitUntilAppIsCompletelyInitialized(expressOpentracingControls.getPid());
    });

    it('must only generate opentracing traces', async () => {
      await expressOpentracingControls.sendRequest({ path: '/withOpentracing' });
      await testUtils.retry(async () => {
        const spans = await agentControls.getSpans();
        const serviceSpan = testUtils.expectAtLeastOneMatching(spans, [
          span => expect(span.t).to.be.a('string'),
          span => expect(span.s).to.be.a('string'),
          span => expect(span.s).to.equal(span.t),
          span => expect(span.p).to.equal(undefined),
          span => expect(span.n).to.equal('sdk'),
          span => expect(span.f.e).to.equal(String(expressOpentracingControls.getPid())),
          span => expect(span.f.h).to.equal('agent-stub-uuid'),
          span => expect(span.data.service).to.equal('theFancyServiceYouWouldntBelieveActuallyExists'),
          span => expect(span.data.sdk.name).to.equal('service'),
          span => expect(span.data.sdk.type).to.equal('entry')
        ]);

        testUtils.expectAtLeastOneMatching(spans, [
          span => expect(span.t).to.equal(serviceSpan.t),
          span => expect(span.p).to.equal(serviceSpan.s),
          span => expect(span.s).to.be.a('string'),
          span => expect(span.s).not.to.equal(span.t),
          span => expect(span.s).not.to.equal(span.p),
          span => expect(span.n).to.equal('sdk'),
          span => expect(span.f.e).to.equal(String(expressOpentracingControls.getPid())),
          span => expect(span.f.h).to.equal('agent-stub-uuid'),
          span => expect(span.data.service).to.equal('theFancyServiceYouWouldntBelieveActuallyExists'),
          span => expect(span.data.sdk.name).to.equal('auth'),
          span => expect(span.data.sdk.type).to.equal('local')
        ]);

        expect(spans).to.have.lengthOf(2);
      });
    });
  });
});
