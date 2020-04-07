'use strict';

const expect = require('chai').expect;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const testUtils = require('../../../../../core/test/test_util');

describe('tracing/elasticsearch', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  const expressElasticsearchControls = require('./controls');
  const agentStubControls = require('../../../apps/agentStubControls');

  this.timeout(config.getTestTimeout());

  agentStubControls.registerTestHooks();
  expressElasticsearchControls.registerTestHooks();

  beforeEach(() => agentStubControls.waitUntilAppIsCompletelyInitialized(expressElasticsearchControls.getPid()));

  it('must report errors caused by missing indices', () =>
    expressElasticsearchControls
      .get({
        id: 'thisDocumentWillNotExist',
        index: 'thisIndexDoesNotExist'
      })
      .then(() =>
        testUtils.retry(() =>
          agentStubControls.getSpans().then(spans => {
            expect(spans).to.have.lengthOf(
              2,
              `Should not generate an exit span when there is already one. Spans: ${JSON.stringify(spans, 0, 2)}`
            );

            const entrySpan = testUtils.expectAtLeastOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.f.e).to.equal(String(expressElasticsearchControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(1);
            });

            testUtils.expectAtLeastOneMatching(spans, span => {
              expect(span.t).to.equal(entrySpan.t);
              expect(span.p).to.equal(entrySpan.s);
              expect(span.n).to.equal('elasticsearch');
              expect(span.f.e).to.equal(String(expressElasticsearchControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(1);
              expect(span.data.elasticsearch.cluster).to.be.a('string');
              expect(span.data.elasticsearch.action).to.equal('get');
              expect(span.data.elasticsearch.type).to.equal('mytype');
              expect(span.data.elasticsearch.index).to.equal('thisIndexDoesNotExist');
              expect(span.data.elasticsearch.id).to.equal('thisDocumentWillNotExist');
              expect(span.data.elasticsearch.error).to.match(/no such index|missing/gi);
            });
          })
        )
      ));

  it('must report successful indexing requests', () =>
    expressElasticsearchControls
      .index({
        body: {
          title: 'A'
        }
      })
      .then(() =>
        testUtils.retry(() =>
          agentStubControls.getSpans().then(spans => {
            const entrySpan = testUtils.expectAtLeastOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.f.e).to.equal(String(expressElasticsearchControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(0);
            });

            testUtils.expectAtLeastOneMatching(spans, span => {
              expect(span.t).to.equal(entrySpan.t);
              expect(span.p).to.equal(entrySpan.s);
              expect(span.n).to.equal('elasticsearch');
              expect(span.f.e).to.equal(String(expressElasticsearchControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(0);
              expect(span.data.elasticsearch.cluster).to.be.a('string');
              expect(span.data.elasticsearch.action).to.equal('index');
              expect(span.data.elasticsearch.type).to.equal('mytype');
              expect(span.data.elasticsearch.index).to.equal('myindex');
            });
          })
        )
      ));

  it('must write to ES and retrieve the same document, tracing everything', () => {
    const titleA = `a${Date.now()}`;
    return expressElasticsearchControls
      .index({
        body: {
          title: titleA
        },
        rejectWrongStatusCodes: true
      })
      .then(response =>
        testUtils.retry(() =>
          expressElasticsearchControls
            .get({
              id: response._id,
              rejectWrongStatusCodes: true
            })
            .then(() => response._id)
        )
      )
      .then(documentId =>
        testUtils.retry(() =>
          agentStubControls.getSpans().then(spans => {
            const indexEntrySpan = testUtils.expectAtLeastOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.f.e).to.equal(String(expressElasticsearchControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(0);
              expect(span.data.http.url).to.equal('/index');
            });

            testUtils.expectAtLeastOneMatching(spans, span => {
              expect(span.t).to.equal(indexEntrySpan.t);
              expect(span.p).to.equal(indexEntrySpan.s);
              expect(span.n).to.equal('elasticsearch');
              expect(span.f.e).to.equal(String(expressElasticsearchControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(0);
              expect(span.data.elasticsearch.cluster).to.be.a('string');
              expect(span.data.elasticsearch.action).to.equal('index');
              expect(span.data.elasticsearch.type).to.equal('mytype');
              expect(span.data.elasticsearch.index).to.equal('myindex');
            });

            const getEntrySpan = testUtils.expectAtLeastOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.f.e).to.equal(String(expressElasticsearchControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(0);
              expect(span.data.http.url).to.equal('/get');
            });

            testUtils.expectAtLeastOneMatching(spans, span => {
              expect(span.t).to.equal(getEntrySpan.t);
              expect(span.p).to.equal(getEntrySpan.s);
              expect(span.n).to.equal('elasticsearch');
              expect(span.f.e).to.equal(String(expressElasticsearchControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(0);
              expect(span.data.elasticsearch.cluster).to.be.a('string');
              expect(span.data.elasticsearch.action).to.equal('get');
              expect(span.data.elasticsearch.type).to.equal('mytype');
              expect(span.data.elasticsearch.index).to.equal('myindex');
              expect(span.data.elasticsearch.id).to.equal(documentId);
            });

            expect(spans).to.have.lengthOf(4, `Spans: ${JSON.stringify(spans, 0, 2)}`);
          })
        )
      );
  });

  it('must write to ES and search for matching documents, tracing everything', () => {
    const titleA = `a${Date.now()}`;
    const titleB = `b${Date.now()}`;

    return expressElasticsearchControls
      .index({
        body: {
          title: titleA
        },
        rejectWrongStatusCodes: true,
        parentSpanId: '42',
        traceId: '42'
      })
      .then(() =>
        expressElasticsearchControls.index({
          body: {
            title: titleB
          },
          rejectWrongStatusCodes: true,
          parentSpanId: '43',
          traceId: '43'
        })
      )
      .then(() =>
        testUtils.retry(() =>
          expressElasticsearchControls.search({
            q: `title:${titleA}`,
            rejectWrongStatusCodes: true
          })
        )
      )
      .then(() =>
        testUtils.retry(() =>
          agentStubControls.getSpans().then(spans => {
            testUtils.expectAtLeastOneMatching(spans, span => {
              expect(span.t).to.equal('42');
              expect(span.n).to.equal('elasticsearch');
              expect(span.f.e).to.equal(String(expressElasticsearchControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(0);
              expect(span.data.elasticsearch.cluster).to.be.a('string');
              expect(span.data.elasticsearch.action).to.equal('index');
              expect(span.data.elasticsearch.type).to.equal('mytype');
              expect(span.data.elasticsearch.index).to.equal('myindex');
            });

            testUtils.expectAtLeastOneMatching(spans, span => {
              expect(span.t).to.equal('43');
              expect(span.n).to.equal('elasticsearch');
              expect(span.f.e).to.equal(String(expressElasticsearchControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(0);
              expect(span.data.elasticsearch.cluster).to.be.a('string');
              expect(span.data.elasticsearch.action).to.equal('index');
              expect(span.data.elasticsearch.type).to.equal('mytype');
              expect(span.data.elasticsearch.index).to.equal('myindex');
            });

            const getEntrySpan = testUtils.expectAtLeastOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.f.e).to.equal(String(expressElasticsearchControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(0);
              expect(span.data.http.url).to.equal('/search');
            });

            testUtils.expectAtLeastOneMatching(spans, span => {
              expect(span.t).to.equal(getEntrySpan.t);
              expect(span.p).to.equal(getEntrySpan.s);
              expect(span.n).to.equal('elasticsearch');
              expect(span.f.e).to.equal(String(expressElasticsearchControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(0);
              expect(span.data.elasticsearch.cluster).to.be.a('string');
              expect(span.data.elasticsearch.action).to.equal('search');
              expect(span.data.elasticsearch.type).to.equal('mytype');
              expect(span.data.elasticsearch.index).to.equal('myindex');
              expect(span.data.elasticsearch.hits).to.equal(1);
            });
          })
        )
      );
  });

  it('must trace mget', () => {
    const titleA = `a${Date.now()}`;
    const titleB = `b${Date.now()}`;
    const titleC = `c${Date.now()}`;
    let idA;
    let idB;
    let idC;
    let response1;
    let response2;

    return expressElasticsearchControls
      .index({
        body: {
          title: titleA
        },
        rejectWrongStatusCodes: true,
        parentSpanId: '42',
        traceId: '42'
      })
      .then(response => {
        idA = response._id;
        return expressElasticsearchControls.index({
          body: {
            title: titleB
          },
          rejectWrongStatusCodes: true,
          parentSpanId: '43',
          traceId: '43'
        });
      })
      .then(response => {
        idB = response._id;
        return expressElasticsearchControls.index({
          body: {
            title: titleC
          },
          rejectWrongStatusCodes: true,
          parentSpanId: '44',
          traceId: '44'
        });
      })
      .then(response => {
        idC = response._id;
        return testUtils.retry(() =>
          expressElasticsearchControls.mget1({
            id: [idA, idB],
            rejectWrongStatusCodes: true
          })
        );
      })
      .then(response => {
        response1 = response;
        return testUtils.retry(() =>
          expressElasticsearchControls.mget2({
            id: [idB, idC],
            rejectWrongStatusCodes: true
          })
        );
      })
      .then(response => {
        response2 = response;
        expect(response1.docs[0]._source.title).to.deep.equal(titleA);
        expect(response1.docs[1]._source.title).to.deep.equal(titleB);
        expect(response2.docs[0]._source.title).to.deep.equal(titleB);
        expect(response2.docs[1]._source.title).to.deep.equal(titleC);
        return testUtils.retry(() =>
          agentStubControls.getSpans().then(spans => {
            testUtils.expectAtLeastOneMatching(spans, span => {
              expect(span.t).to.equal('42');
              expect(span.n).to.equal('elasticsearch');
              expect(span.f.e).to.equal(String(expressElasticsearchControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(0);
              expect(span.data.elasticsearch.cluster).to.be.a('string');
              expect(span.data.elasticsearch.action).to.equal('index');
              expect(span.data.elasticsearch.type).to.equal('mytype');
              expect(span.data.elasticsearch.index).to.equal('myindex');
            });
            testUtils.expectAtLeastOneMatching(spans, span => {
              expect(span.t).to.equal('43');
              expect(span.n).to.equal('elasticsearch');
              expect(span.f.e).to.equal(String(expressElasticsearchControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(0);
              expect(span.data.elasticsearch.cluster).to.be.a('string');
              expect(span.data.elasticsearch.action).to.equal('index');
              expect(span.data.elasticsearch.type).to.equal('mytype');
              expect(span.data.elasticsearch.index).to.equal('myindex');
            });
            const mget1HttpEntry = testUtils.expectAtLeastOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.f.e).to.equal(String(expressElasticsearchControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(0);
              expect(span.data.http.url).to.equal('/mget1');
            });
            testUtils.expectAtLeastOneMatching(spans, span => {
              expect(span.t).to.equal(mget1HttpEntry.t);
              expect(span.p).to.equal(mget1HttpEntry.s);
              expect(span.n).to.equal('elasticsearch');
              expect(span.f.e).to.equal(String(expressElasticsearchControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(0);
              expect(span.data.elasticsearch.cluster).to.be.a('string');
              expect(span.data.elasticsearch.action).to.equal('mget');
              expect(span.data.elasticsearch.type).to.equal('mytype');
              expect(span.data.elasticsearch.index).to.equal('myindex');
              expect(span.data.elasticsearch.id).to.equal(`${idA},${idB}`);
            });
            const mget2HttpEntry = testUtils.expectAtLeastOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.f.e).to.equal(String(expressElasticsearchControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(0);
              expect(span.data.http.url).to.equal('/mget2');
            });
            testUtils.expectAtLeastOneMatching(spans, span => {
              expect(span.t).to.equal(mget2HttpEntry.t);
              expect(span.p).to.equal(mget2HttpEntry.s);
              expect(span.n).to.equal('elasticsearch');
              expect(span.f.e).to.equal(String(expressElasticsearchControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(0);
              expect(span.data.elasticsearch.cluster).to.be.a('string');
              expect(span.data.elasticsearch.action).to.equal('mget');
              expect(span.data.elasticsearch.type).to.equal('mytype');
              expect(span.data.elasticsearch.index).to.equal('myindex');
              expect(span.data.elasticsearch.id).to.equal(`${idB},${idC}`);
            });
          })
        );
      });
  });

  it('must trace msearch', () => {
    const titleA = `a${Date.now()}`;
    const titleB = `b${Date.now()}`;
    const titleC = `c${Date.now()}`;

    return expressElasticsearchControls
      .index({
        body: {
          title: titleA
        },
        rejectWrongStatusCodes: true,
        parentSpanId: '42',
        traceId: '42'
      })
      .then(() =>
        expressElasticsearchControls.index({
          body: {
            title: titleB
          },
          rejectWrongStatusCodes: true,
          parentSpanId: '43',
          traceId: '43'
        })
      )
      .then(() =>
        expressElasticsearchControls.index({
          body: {
            title: titleC
          },
          rejectWrongStatusCodes: true,
          parentSpanId: '44',
          traceId: '44'
        })
      )
      .then(() =>
        testUtils.retry(() =>
          expressElasticsearchControls.msearch({
            q: [`title:${titleA}`, `title:${titleB}`],
            rejectWrongStatusCodes: true
          })
        )
      )
      .then(response => {
        expect(response.responses).to.exist;
        expect(response.responses[0].hits.total).to.equal(1);
        expect(response.responses[1].hits.total).to.equal(1);
        return testUtils.retry(() =>
          agentStubControls.getSpans().then(spans => {
            testUtils.expectAtLeastOneMatching(spans, span => {
              expect(span.t).to.equal('42');
              expect(span.n).to.equal('elasticsearch');
              expect(span.f.e).to.equal(String(expressElasticsearchControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(0);
              expect(span.data.elasticsearch.cluster).to.be.a('string');
              expect(span.data.elasticsearch.action).to.equal('index');
              expect(span.data.elasticsearch.type).to.equal('mytype');
              expect(span.data.elasticsearch.index).to.equal('myindex');
            });
            testUtils.expectAtLeastOneMatching(spans, span => {
              expect(span.t).to.equal('43');
              expect(span.n).to.equal('elasticsearch');
              expect(span.f.e).to.equal(String(expressElasticsearchControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(0);
              expect(span.data.elasticsearch.cluster).to.be.a('string');
              expect(span.data.elasticsearch.action).to.equal('index');
              expect(span.data.elasticsearch.type).to.equal('mytype');
              expect(span.data.elasticsearch.index).to.equal('myindex');
            });
            const getEntrySpan = testUtils.expectAtLeastOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.f.e).to.equal(String(expressElasticsearchControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(0);
              expect(span.data.http.url).to.equal('/msearch');
            });
            testUtils.expectAtLeastOneMatching(spans, span => {
              expect(span.t).to.equal(getEntrySpan.t);
              expect(span.p).to.equal(getEntrySpan.s);
              expect(span.n).to.equal('elasticsearch');
              expect(span.f.e).to.equal(String(expressElasticsearchControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(0);
              expect(span.data.elasticsearch.cluster).to.be.a('string');
              expect(span.data.elasticsearch.action).to.equal('msearch');
              expect(span.data.elasticsearch.type).to.equal('mytype');
              expect(span.data.elasticsearch.index).to.equal('myindex');
              expect(span.data.elasticsearch.hits).to.equal(2);
            });
          })
        );
      });
  });

  it('must not consider queries as failed when there are no hits', () =>
    expressElasticsearchControls
      .index({
        body: {
          title: 'A'
        },
        rejectWrongStatusCodes: true,
        parentSpanId: 42,
        traceSpanId: 42
      })
      .then(() =>
        testUtils.retry(() =>
          expressElasticsearchControls.search({
            q: 'title:Z',
            rejectWrongStatusCodes: true
          })
        )
      )
      .then(() =>
        testUtils.retry(() =>
          agentStubControls.getSpans().then(spans => {
            testUtils.expectAtLeastOneMatching(spans, span => {
              expect(span.n).to.equal('elasticsearch');
              expect(span.f.e).to.equal(String(expressElasticsearchControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(0);
              expect(span.data.elasticsearch.cluster).to.be.a('string');
              expect(span.data.elasticsearch.action).to.equal('search');
              expect(span.data.elasticsearch.type).to.equal('mytype');
              expect(span.data.elasticsearch.index).to.equal('myindex');
              expect(span.data.elasticsearch.hits).to.equal(0);
            });
          })
        )
      ));

  it('must trace across native promise boundaries', () =>
    expressElasticsearchControls
      .searchAndGet({
        q: 'name:foo'
      })
      .then(() =>
        testUtils.retry(() =>
          agentStubControls.getSpans().then(spans => {
            const httpEntrySpan = testUtils.expectAtLeastOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.k).to.equal(constants.ENTRY);
            });

            testUtils.expectAtLeastOneMatching(spans, span => {
              expect(span.t).to.equal(httpEntrySpan.t);
              expect(span.p).to.equal(httpEntrySpan.s);
              expect(span.n).to.equal('elasticsearch');
              expect(span.k).to.equal(constants.EXIT);
            });

            testUtils.expectAtLeastOneMatching(spans, span => {
              expect(span.t).to.equal(httpEntrySpan.t);
              expect(span.p).to.equal(httpEntrySpan.s);
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
            });
          })
        )
      ));
});
