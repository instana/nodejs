'use strict';

const expect = require('chai').expect;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const { expectExactlyOneMatching, retry } = require('../../../../../core/test/test_util');
const ProcessControls = require('../../ProcessControls');

describe('tracing/elasticsearch (legacy client)', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  const agentControls = require('../../../apps/agentStubControls');

  this.timeout(config.getTestTimeout());

  agentControls.registerTestHooks();
  const controls = new ProcessControls({
    dirname: __dirname,
    agentControls
  }).registerTestHooks();

  it('must report errors caused by missing indices', () =>
    get({
      id: 'thisDocumentWillNotExist',
      index: 'thisIndexDoesNotExist'
    }).then(res => {
      expect(res.error.msg).to.contain('index_not_found_exception');
      return retry(() =>
        agentControls.getSpans().then(spans => {
          expect(spans).to.have.lengthOf(
            2,
            `Should not generate an exit span when there is already one. Spans: ${JSON.stringify(spans, 0, 2)}`
          );

          const entrySpan = verifyHttpEntry(spans, '/get');

          expectExactlyOneMatching(spans, span => {
            expect(span.t).to.equal(entrySpan.t);
            expect(span.p).to.equal(entrySpan.s);
            expect(span.n).to.equal('elasticsearch');
            expect(span.f.e).to.equal(String(controls.getPid()));
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
      );
    }));

  it('must report successful indexing requests', () =>
    index({
      body: {
        title: 'A'
      }
    }).then(res => {
      expect(res.response._index).to.equal('myindex');
      expect(res.response._shards.successful).to.equal(1);
      return retry(() =>
        agentControls.getSpans().then(spans => {
          const entrySpan = verifyHttpEntry(spans, '/index');
          verifyElasticSearchExit(spans, entrySpan, 'index');
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
        expect(res1.response._index).to.equal('myindex');
        expect(res1.response._shards.successful).to.equal(1);
        return retry(() =>
          get({
            id: res1.response._id
          }).then(res2 => {
            expect(res2.response._source.title).to.equal(titleA);
            return res2.response._id;
          })
        );
      })
      .then(documentId =>
        retry(() =>
          agentControls.getSpans().then(spans => {
            const indexEntrySpan = verifyHttpEntry(spans, '/index');
            verifyElasticSearchExit(spans, indexEntrySpan, 'index');

            const getEntrySpan = verifyHttpEntry(spans, '/get');
            const getExitSpan = verifyElasticSearchExit(spans, getEntrySpan, 'get');
            expect(getExitSpan.data.elasticsearch.id).to.equal(documentId);

            expect(spans).to.have.lengthOf(4, `Spans: ${JSON.stringify(spans, 0, 2)}`);
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
        expect(res.response).to.be.an('object');
        expect(res.response.timed_out).to.be.false;
        expect(res.response.hits).to.be.an('object');
        expect(res.response.hits.total.value).to.equal(1);
        expect(res.response.hits.hits).to.be.an('array');
        expect(res.response.hits.hits[0]._source.title).to.equal(titleA);

        return retry(() =>
          agentControls.getSpans().then(spans => {
            verifyElasticSearchExit(spans, null, 'index', '42');
            verifyElasticSearchExit(spans, null, 'index', '43');

            const searchEntrySpan = verifyHttpEntry(spans, '/search');
            const searchExitSpan = verifyElasticSearchExit(spans, searchEntrySpan, 'search');
            expect(searchExitSpan.data.elasticsearch.hits).to.equal(1);
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
        idC = res.response._id;
        return retry(() =>
          mget1({
            id: [idA, idB]
          })
        );
      })
      .then(res => {
        response1 = res.response;
        return retry(() =>
          mget2({
            id: [idB, idC]
          })
        );
      })
      .then(res => {
        response2 = res.response;
        expect(response1.docs[0]._source.title).to.deep.equal(titleA);
        expect(response1.docs[1]._source.title).to.deep.equal(titleB);
        expect(response2.docs[0]._source.title).to.deep.equal(titleB);
        expect(response2.docs[1]._source.title).to.deep.equal(titleC);
        return retry(() =>
          agentControls.getSpans().then(spans => {
            verifyElasticSearchExit(spans, null, 'index', '42');
            verifyElasticSearchExit(spans, null, 'index', '43');

            const mget1HttpEntry = verifyHttpEntry(spans, '/mget1');
            const mget1Exit = verifyElasticSearchExit(spans, mget1HttpEntry, 'mget');
            expect(mget1Exit.data.elasticsearch.id).to.equal(`${idA},${idB}`);

            const mget2HttpEntry = verifyHttpEntry(spans, '/mget2');
            const mget2Exit = verifyElasticSearchExit(spans, mget2HttpEntry, 'mget');
            expect(mget2Exit.data.elasticsearch.id).to.equal(`${idB},${idC}`);
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
        expect(res.response).to.be.an('object');
        expect(res.response.responses).to.exist;
        expect(res.response.responses).to.have.lengthOf(2);
        expect(res.response.responses[0].hits.total.value).to.equal(1);
        expect(res.response.responses[1].hits.total.value).to.equal(1);
        expect(res.response.responses[0].hits.hits[0]._source.title).to.be.oneOf([titleA, titleB]);
        expect(res.response.responses[1].hits.hits[0]._source.title).to.be.oneOf([titleA, titleB]);
        return retry(() =>
          agentControls.getSpans().then(spans => {
            verifyElasticSearchExit(spans, null, 'index', '42');
            verifyElasticSearchExit(spans, null, 'index', '43');

            const msearchEntrySpan = verifyHttpEntry(spans, '/msearch');
            const msearchExitSpan = verifyElasticSearchExit(spans, msearchEntrySpan, 'msearch');
            expect(msearchExitSpan.data.elasticsearch.hits).to.equal(2);
          })
        );
      });
  });

  it('must not consider queries as failed when there are no hits', () =>
    index({
      body: {
        title: 'A'
      },
      parentSpanId: 42,
      traceSpanId: 42
    })
      .then(() =>
        retry(() =>
          search({
            q: 'title:Z'
          })
        )
      )
      .then(res => {
        expect(res.response.hits.total.value).to.equal(0);
        expect(res.response.hits.hits).to.have.lengthOf(0);
        return retry(() =>
          agentControls.getSpans().then(spans => {
            const searchExit = verifyElasticSearchExit(spans, null, 'search');
            expect(searchExit.data.elasticsearch.hits).to.equal(0);
          })
        );
      }));

  it('must trace across native promise boundaries', () =>
    searchAndGet({
      q: 'name:foo'
    }).then(res => {
      expect(res.response.hits.total.value).to.equal(0);
      expect(res.response.hits.hits).to.have.lengthOf(0);
      return retry(() =>
        agentControls.getSpans().then(spans => {
          const httpEntrySpan = expectExactlyOneMatching(spans, span => {
            expect(span.n).to.equal('node.http.server');
            expect(span.k).to.equal(constants.ENTRY);
          });

          expectExactlyOneMatching(spans, span => {
            expect(span.t).to.equal(httpEntrySpan.t);
            expect(span.p).to.equal(httpEntrySpan.s);
            expect(span.n).to.equal('elasticsearch');
            expect(span.k).to.equal(constants.EXIT);
          });

          expectExactlyOneMatching(spans, span => {
            expect(span.t).to.equal(httpEntrySpan.t);
            expect(span.p).to.equal(httpEntrySpan.s);
            expect(span.n).to.equal('node.http.client');
            expect(span.k).to.equal(constants.EXIT);
          });
        })
      );
    }));

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

  function verifyHttpEntry(spans, url) {
    return expectExactlyOneMatching(spans, span => {
      expect(span.n).to.equal('node.http.server');
      expect(span.f.e).to.equal(String(controls.getPid()));
      expect(span.f.h).to.equal('agent-stub-uuid');
      expect(span.async).to.not.exist;
      expect(span.error).to.not.exist;
      expect(span.ec).to.equal(0);
      expect(span.data.http.url).to.equal(url);
    });
  }

  function verifyElasticSearchExit(spans, parent, action, traceId) {
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
      expect(span.data.elasticsearch.type).to.equal('mytype');
      expect(span.data.elasticsearch.index).to.equal('myindex');
    });
  }
});
