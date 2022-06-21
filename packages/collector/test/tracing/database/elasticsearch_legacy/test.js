/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const expect = require('chai').expect;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const {
  stringifyItems,
  expectExactlyOneMatching,
  getSpansByName,
  retry,
  delay
} = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');

const ES_API_VERSION = '7.6';

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('tracing/elasticsearch (legacy client)', function () {
  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  const controls = new ProcessControls({
    dirname: __dirname,
    useGlobalAgent: true,
    env: {
      ES_API_VERSION
    }
  });
  ProcessControls.setUpHooks(controls);

  it('must report errors caused by missing indices', () =>
    get({
      id: 'thisDocumentWillNotExist',
      index: 'thisIndexDoesNotExist'
    }).then(res => {
      expect(res.error).to.exist;
      expect(res.error.msg).to.contain('index_not_found_exception');
      return retry(() =>
        agentControls.getSpans().then(spans => {
          const entrySpan = verifyHttpEntry(spans, '/get');

          const expectations = [
            span => expect(span.t).to.equal(entrySpan.t),
            span => expect(span.p).to.equal(entrySpan.s),
            span => expect(span.n).to.equal('elasticsearch'),
            span => expect(span.f.e).to.equal(String(controls.getPid())),
            span => expect(span.f.h).to.equal('agent-stub-uuid'),
            span => expect(span.async).to.not.exist,
            span => expect(span.error).to.not.exist,
            span => expect(span.ec).to.equal(1),
            span => expect(span.data.elasticsearch.cluster).to.be.a('string'),
            span => expect(span.data.elasticsearch.action).to.equal('get'),
            span => expect(span.data.elasticsearch.index).to.equal('thisIndexDoesNotExist'),
            span => expect(span.data.elasticsearch.id).to.equal('thisDocumentWillNotExist'),
            span => expect(span.data.elasticsearch.error).to.match(/no such index|missing/gi)
          ];

          if (needsType()) {
            expectations.push(span => expect(span.data.elasticsearch.type).to.equal('legacy_type'));
          }

          expectExactlyOneMatching(spans, expectations);

          verifyHttpExit(spans, entrySpan);

          verifyNoHttpExitsToElasticsearch(spans);

          expect(spans).to.have.lengthOf(
            3,
            `Should not generate any superfluous spans Spans: ${stringifyItems(spans)}`
          );
        })
      );
    }));

  it('must report successful indexing requests', () =>
    index({
      body: {
        title: 'A'
      }
    }).then(res => {
      expect(res.error).to.not.exist;
      expect(res.response).to.exist;
      expect(res.response._index).to.equal('legacy_index');
      expect(res.response._shards.successful).to.equal(1);
      return retry(() =>
        agentControls.getSpans().then(spans => {
          const entrySpan = verifyHttpEntry(spans, '/index');
          verifyElasticsearchExit(spans, entrySpan, 'index');
          verifyElasticsearchExit(spans, entrySpan, 'indices.refresh', null, '_all');
          verifyNoHttpExitsToElasticsearch(spans);
        })
      );
    }));

  it('must write to ES and retrieve the same document, tracing everything', () => {
    const titleA = `a${Date.now()}`;
    return index({
      body: {
        title: titleA
      }
    })
      .then(res1 => {
        expect(res1.error).to.not.exist;
        expect(res1.response).to.exist;
        expect(res1.response._index).to.equal('legacy_index');
        expect(res1.response._shards.successful).to.equal(1);
        return retry(() =>
          get({
            id: res1.response._id
          }).then(res2 => {
            expect(res2.error).to.not.exist;
            expect(res2.response).to.exist;
            expect(res2.response._source.title).to.equal(titleA);
            return res2.response._id;
          })
        );
      })
      .then(documentId =>
        retry(() =>
          agentControls.getSpans().then(spans => {
            const indexEntrySpan = verifyHttpEntry(spans, '/index');
            verifyElasticsearchExit(spans, indexEntrySpan, 'index');
            verifyElasticsearchExit(spans, indexEntrySpan, 'indices.refresh', null, '_all');

            const getEntrySpan = verifyHttpEntry(spans, '/get');
            const getExitSpan = verifyElasticsearchExit(spans, getEntrySpan, 'get');
            expect(getExitSpan.data.elasticsearch.id).to.equal(documentId);
            verifyHttpExit(spans, getEntrySpan);

            verifyNoHttpExitsToElasticsearch(spans);
            expect(spans).to.have.lengthOf(6, `Spans: ${stringifyItems(spans)}`);
          })
        )
      );
  });

  it('must write to ES and search for matching documents, tracing everything', () => {
    const titleA = `a${Date.now()}`;
    const titleB = `b${Date.now()}`;

    return index({
      body: {
        title: titleA
      },
      parentSpanId: '42',
      traceId: '42'
    })
      .then(() =>
        index({
          body: {
            title: titleB
          },
          parentSpanId: '43',
          traceId: '43'
        })
      )
      .then(() =>
        retry(() =>
          search({
            q: `title:${titleA}`
          })
        )
      )
      .then(res => {
        expect(res.error).to.not.exist;
        expect(res.response).to.exist;
        expect(res.response).to.be.an('object');
        expect(res.response.timed_out).to.be.false;
        expect(res.response.hits).to.be.an('object');
        if (hasTotalValue()) {
          expect(res.response.hits.total.value).to.equal(1);
        } else {
          expect(res.response.hits.total).to.equal(1);
        }
        expect(res.response.hits.hits).to.be.an('array');
        expect(res.response.hits.hits[0]._source.title).to.equal(titleA);

        return retry(() =>
          agentControls.getSpans().then(spans => {
            const index1Entry = verifyHttpEntry(spans, '/index', '42');
            verifyElasticsearchExit(spans, index1Entry, 'index');
            verifyElasticsearchExit(spans, index1Entry, 'indices.refresh', null, '_all');
            const index2Entry = verifyHttpEntry(spans, '/index', '43');
            verifyElasticsearchExit(spans, index2Entry, 'index');
            verifyElasticsearchExit(spans, index2Entry, 'indices.refresh', null, '_all');

            const searchEntrySpan = verifyHttpEntry(spans, '/search');
            const searchExitSpan = verifyElasticsearchExit(spans, searchEntrySpan, 'search');
            expect(searchExitSpan.data.elasticsearch.query).to.contain(`"q":"title:${titleA}"`);
            expect(searchExitSpan.data.elasticsearch.hits).to.equal(1);
            verifyHttpExit(spans, searchEntrySpan);

            verifyNoHttpExitsToElasticsearch(spans);

            expect(spans).to.have.lengthOf(9, `Spans: ${stringifyItems(spans)}`);
          })
        );
      });
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

    return index({
      body: {
        title: titleA
      },
      parentSpanId: '42',
      traceId: '42'
    })
      .then(res => {
        expect(res.error).to.not.exist;
        expect(res.response).to.exist;
        idA = res.response._id;
        return index({
          body: {
            title: titleB
          },
          parentSpanId: '43',
          traceId: '43'
        });
      })
      .then(res => {
        expect(res.error).to.not.exist;
        expect(res.response).to.exist;
        idB = res.response._id;
        return index({
          body: {
            title: titleC
          },
          parentSpanId: '44',
          traceId: '44'
        });
      })
      .then(res => {
        expect(res.error).to.not.exist;
        expect(res.response).to.exist;
        idC = res.response._id;
        return retry(() =>
          mget1({
            id: [idA, idB]
          })
        );
      })
      .then(res => {
        expect(res.error).to.not.exist;
        expect(res.response).to.exist;
        response1 = res.response;
        return retry(() =>
          mget2({
            id: [idB, idC]
          })
        );
      })
      .then(res => {
        expect(res.error).to.not.exist;
        expect(res.response).to.exist;
        response2 = res.response;
        expect(response1.docs[0]._source.title).to.deep.equal(titleA);
        expect(response1.docs[1]._source.title).to.deep.equal(titleB);
        expect(response2.docs[0]._source.title).to.deep.equal(titleB);
        expect(response2.docs[1]._source.title).to.deep.equal(titleC);
        return retry(() =>
          agentControls.getSpans().then(spans => {
            verifyElasticsearchExit(spans, null, 'index', '42');
            verifyElasticsearchExit(spans, null, 'indices.refresh', '42', '_all');
            verifyElasticsearchExit(spans, null, 'index', '43');
            verifyElasticsearchExit(spans, null, 'indices.refresh', '43', '_all');
            verifyElasticsearchExit(spans, null, 'index', '44');
            verifyElasticsearchExit(spans, null, 'indices.refresh', '44', '_all');

            const mget1HttpEntry = verifyHttpEntry(spans, '/mget1');
            const mget1Exit = verifyElasticsearchExit(spans, mget1HttpEntry, 'mget');
            expect(mget1Exit.data.elasticsearch.id).to.equal(`${idA},${idB}`);

            const mget2HttpEntry = verifyHttpEntry(spans, '/mget2');
            const mget2Exit = verifyElasticsearchExit(spans, mget2HttpEntry, 'mget');
            expect(mget2Exit.data.elasticsearch.id).to.equal(`${idB},${idC}`);

            verifyNoHttpExitsToElasticsearch(spans);
          })
        );
      });
  });

  it('must trace msearch', () => {
    const titleA = `a${Date.now()}`;
    const titleB = `b${Date.now()}`;
    const titleC = `c${Date.now()}`;

    return index({
      body: {
        title: titleA
      },
      parentSpanId: '42',
      traceId: '42'
    })
      .then(() =>
        index({
          body: {
            title: titleB
          },
          parentSpanId: '43',
          traceId: '43'
        })
      )
      .then(() =>
        index({
          body: {
            title: titleC
          },
          parentSpanId: '44',
          traceId: '44'
        })
      )
      .then(() =>
        retry(() =>
          msearch({
            q: [`title:${titleA}`, `title:${titleB}`]
          })
        )
      )
      .then(res => {
        expect(res.error).to.not.exist;
        expect(res.response).to.exist;
        expect(res.response).to.be.an('object');
        expect(res.response.responses).to.exist;
        expect(res.response.responses).to.have.lengthOf(2);
        if (hasTotalValue()) {
          expect(res.response.responses[0].hits.total.value).to.equal(1);
          expect(res.response.responses[1].hits.total.value).to.equal(1);
        } else {
          expect(res.response.responses[0].hits.total).to.equal(1);
          expect(res.response.responses[1].hits.total).to.equal(1);
        }
        expect(res.response.responses[0].hits.hits[0]._source.title).to.be.oneOf([titleA, titleB]);
        expect(res.response.responses[1].hits.hits[0]._source.title).to.be.oneOf([titleA, titleB]);
        return retry(() =>
          agentControls.getSpans().then(spans => {
            verifyElasticsearchExit(spans, null, 'index', '42');
            verifyElasticsearchExit(spans, null, 'indices.refresh', '42', '_all');
            verifyElasticsearchExit(spans, null, 'index', '43');
            verifyElasticsearchExit(spans, null, 'indices.refresh', '43', '_all');
            verifyElasticsearchExit(spans, null, 'index', '44');
            verifyElasticsearchExit(spans, null, 'indices.refresh', '44', '_all');

            const msearchEntrySpan = verifyHttpEntry(spans, '/msearch');
            const msearchExitSpan = verifyElasticsearchExit(spans, msearchEntrySpan, 'msearch');
            expect(msearchExitSpan.data.elasticsearch.query).to.contain(`title:${titleA}`);
            expect(msearchExitSpan.data.elasticsearch.query).to.contain(`title:${titleB}`);
            expect(msearchExitSpan.data.elasticsearch.hits).to.equal(2);

            verifyNoHttpExitsToElasticsearch(spans);
          })
        );
      });
  });

  it('must not consider queries as failed when there are no hits', () =>
    index({
      body: {
        title: 'A'
      }
    })
      .then(() =>
        retry(() =>
          search({
            q: 'title:Z'
          })
        )
      )
      .then(res => {
        expect(res.error).to.not.exist;
        expect(res.response).to.exist;
        if (hasTotalValue()) {
          expect(res.response.hits.total.value).to.equal(0);
        } else {
          expect(res.response.hits.total).to.equal(0);
        }
        expect(res.response.hits.hits).to.have.lengthOf(0);
        return retry(() =>
          agentControls.getSpans().then(spans => {
            const entrySpan = verifyHttpEntry(spans, '/index');
            verifyElasticsearchExit(spans, entrySpan, 'index');
            verifyElasticsearchExit(spans, entrySpan, 'indices.refresh', null, '_all');

            const searchExit = verifyElasticsearchExit(spans, null, 'search');
            expect(searchExit.data.elasticsearch.hits).to.equal(0);

            verifyNoHttpExitsToElasticsearch(spans);
          })
        );
      }));

  it('must trace across native promise boundaries', () =>
    searchAndGet({
      q: 'name:foo'
    }).then(res => {
      expect(res.error).to.not.exist;
      expect(res.response).to.exist;
      if (hasTotalValue()) {
        expect(res.response.hits.total.value).to.equal(0);
      } else {
        expect(res.response.hits.total).to.equal(0);
      }
      expect(res.response.hits.hits).to.have.lengthOf(0);
      return retry(() =>
        agentControls.getSpans().then(spans => {
          const httpEntrySpan = expectExactlyOneMatching(spans, [
            span => expect(span.n).to.equal('node.http.server'),
            span => expect(span.k).to.equal(constants.ENTRY)
          ]);

          expectExactlyOneMatching(spans, [
            span => expect(span.t).to.equal(httpEntrySpan.t),
            span => expect(span.p).to.equal(httpEntrySpan.s),
            span => expect(span.n).to.equal('elasticsearch'),
            span => expect(span.k).to.equal(constants.EXIT)
          ]);

          expectExactlyOneMatching(spans, [
            span => expect(span.t).to.equal(httpEntrySpan.t),
            span => expect(span.p).to.equal(httpEntrySpan.s),
            span => expect(span.n).to.equal('node.http.client'),
            span => expect(span.k).to.equal(constants.EXIT)
          ]);
        })
      );
    }));

  it('[suppressed] should not trace', async function () {
    await controls.sendRequest({
      method: 'GET',
      path: '/search?q=nope',
      suppressTracing: true
    });

    return retry(() => delay(config.getTestTimeout() / 4))
      .then(() => agentControls.getSpans())
      .then(spans => {
        if (spans.length > 0) {
          expect.fail(`Unexpected spans ${stringifyItems(spans)}.`);
        }
      });
  });

  function get(opts) {
    return sendRequest('GET', '/get', opts);
  }

  function search(opts) {
    return sendRequest('GET', '/search', opts);
  }

  function mget1(opts) {
    return sendRequest('GET', '/mget1', opts);
  }

  function mget2(opts) {
    return sendRequest('GET', '/mget2', opts);
  }

  function msearch(opts) {
    return sendRequest('GET', '/msearch', opts);
  }

  function searchAndGet(opts) {
    return sendRequest('GET', '/searchAndGet', opts);
  }

  function index(opts) {
    return sendRequest('POST', '/index', opts);
  }

  function sendRequest(method, path, opts) {
    opts.method = method;
    opts.path = path;
    opts.qs = {
      id: opts.id,
      q: opts.q,
      index: opts.index
    };
    if (opts.traceId || opts.parentSpanId) {
      const headers = {};
      if (opts.traceId) {
        headers['X-INSTANA-T'] = opts.traceId;
      }
      if (opts.parentSpanId) {
        headers['X-INSTANA-S'] = opts.parentSpanId;
      }
      opts.headers = headers;
    }
    return controls.sendRequest(opts);
  }

  function verifyHttpEntry(spans, url, traceId) {
    return expectExactlyOneMatching(spans, span => {
      expect(span.n).to.equal('node.http.server');
      if (traceId) {
        expect(span.t).to.equal(traceId);
        expect(span.p).to.equal(traceId);
      } else {
        expect(span.t).to.exist;
        expect(span.p).to.not.exist;
      }
      expect(span.f.e).to.equal(String(controls.getPid()));
      expect(span.f.h).to.equal('agent-stub-uuid');
      expect(span.async).to.not.exist;
      expect(span.error).to.not.exist;
      expect(span.ec).to.equal(0);
      expect(span.data.http.url).to.equal(url);
    });
  }

  function verifyElasticsearchExit(spans, parent, action, traceId, indexName) {
    return expectExactlyOneMatching(spans, span => {
      if (parent) {
        expect(span.t).to.equal(parent.t);
        expect(span.p).to.equal(parent.s);
      } else if (traceId) {
        expect(span.t).to.equal(traceId);
      }
      expect(span.n).to.equal('elasticsearch');
      expect(span.f.e).to.equal(String(controls.getPid()));
      expect(span.f.h).to.equal('agent-stub-uuid');
      expect(span.async).to.not.exist;
      expect(span.error).to.not.exist;
      expect(span.ec).to.equal(0);
      expect(span.data.elasticsearch.cluster).to.be.a('string');
      expect(span.data.elasticsearch.action).to.equal(action);
      expect(span.data.elasticsearch.index).to.equal(indexName || 'legacy_index');
      if (needsType() && indexName !== '_all') {
        expect(span.data.elasticsearch.type).to.equal('legacy_type');
      }
    });
  }

  function verifyHttpExit(spans, parent) {
    expectExactlyOneMatching(spans, [
      span => expect(span.t).to.equal(parent.t),
      span => expect(span.p).to.equal(parent.s),
      span => expect(span.n).to.equal('node.http.client'),
      span => expect(span.k).to.equal(constants.EXIT),
      span => expect(span.f.e).to.equal(String(controls.getPid())),
      span => expect(span.f.h).to.equal('agent-stub-uuid'),
      span => expect(span.async).to.not.exist,
      span => expect(span.error).to.not.exist,
      span => expect(span.ec).to.equal(0),
      span => expect(span.data.http.method).to.equal('GET'),
      span => expect(span.data.http.url).to.match(/http:\/\/127\.0\.0\.1:/),
      span => expect(span.data.http.status).to.equal(200)
    ]);
  }

  function verifyNoHttpExitsToElasticsearch(spans) {
    const allHttpExits = getSpansByName(spans, 'node.http.client');
    allHttpExits.forEach(span => {
      expect(span.data.http.url).to.not.match(/9200/);
    });
  }
});

function hasTotalValue() {
  return ES_API_VERSION.indexOf('2') !== 0 && ES_API_VERSION.indexOf('5') !== 0 && ES_API_VERSION.indexOf('6') !== 0;
}

function needsType() {
  return ES_API_VERSION.indexOf('5') === 0 || ES_API_VERSION.indexOf('6') === 0;
}
