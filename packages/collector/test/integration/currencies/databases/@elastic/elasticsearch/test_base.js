/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

/* eslint-disable max-len */

'use strict';

const expect = require('chai').expect;
const { fail } = expect;
const semver = require('semver');
const constants = require('@_local/core').tracing.constants;
const config = require('@_local/core/test/config');
const {
  stringifyItems,
  expectExactlyOneMatching,
  getSpansByName,
  retry,
  delay
} = require('@_local/core/test/test_util');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');
const globalAgent = require('@_local/collector/test/globalAgent');

module.exports = function (name, version, isLatest) {
  // Determine instrumentation flavor and engine requirement based on version
  // transport: instrumentation >= 7.9.1, api: instrumentation < 7.9.1
  let instrumentationFlavor;
  let engine;

  /**
 * transport: instrumentation >= 7.9.1
 * api: instrumentation < 7.9.1
 *
 * The words "transport" and "api" try to describe the different
 * mechanismn we use in core/src/tracing/instrumentation/databases/elasticsearch.js
 *
 * Breaking changes between 8x and 9x are not big enough to run the tests for both v8 and v9:
 * https://www.elastic.co/docs/release-notes/elasticsearch/clients/javascript#elasticsearch-javascript-client-9.0.0-release-notes
 */

  if (semver.gte(version, '7.9.1')) {
    instrumentationFlavor = 'transport';
    engine = isLatest ? '20.0.0' : '12.0.0';
  } else {
    instrumentationFlavor = 'api';
    engine = '8.0.0';
  }

  const versionDescribe = semver.gte(process.versions.node, engine) ? describe : describe.skip;

  versionDescribe(
    // eslint-disable-next-line no-useless-concat
    `@elastic/elasticsearch@${version}/` + `instrumentation flavor: ${instrumentationFlavor}`,
    function () {
      this.timeout(Math.max(config.getTestTimeout() * 4, 30000));
      const indicesKey = version === 'latest' ? 'Indices.refresh' : 'indices.refresh';

      globalAgent.setUpCleanUpHooks();
      const agentControls = globalAgent.instance;
      let controls;

      before(async () => {
        controls = new ProcessControls({
          dirname: __dirname,
          useGlobalAgent: true,
          env: {
            LIBRARY_VERSION: version,
            LIBRARY_NAME: name,
            LIBRARY_LATEST: isLatest,
            ELASTIC_VERSION: version
          }
        });

        await controls.startAndWaitForAgentConnection();
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

      it('must report errors caused by missing indices', () =>
        get({ id: 'thisDocumentWillNotExist', index: 'thisIndexDoesNotExist' }).then(res => {
          expect(res.error).to.exist;
          expect(res.error.meta.body.error.root_cause[0].type).to.equal('index_not_found_exception');

          return retry(() =>
            agentControls.getSpans().then(spans => {
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
                expect(span.data.elasticsearch.action).to.equal('get');
                verifyClusterOrAddressPort(span);
                verifyIndexOrEndpoint(
                  span,
                  'thisIndexDoesNotExist',
                  '/thisIndexDoesNotExist/_doc/thisDocumentWillNotExist'
                );
                expect(span.data.elasticsearch.id).to.equal('thisDocumentWillNotExist');
                expect(span.data.elasticsearch.error).to.match(/index_not_found_exception/);
              });

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
          body: JSON.stringify({
            title: 'A'
          })
        }).then(res => {
          if (res.error) {
            fail(`Unexpected errors:${JSON.stringify(res.error, null, 2)}`);
          }
          expect(res.error).to.not.exist;
          expect(res.response).to.exist;
          expect(res.response.body._index).to.equal('modern_index');
          expect(res.response.body._shards.successful).to.equal(1);

          return retry(() =>
            agentControls.getSpans().then(spans => {
              const entrySpan = verifyHttpEntry(spans, '/index');
              verifyElasticsearchExit(spans, entrySpan, 'index');
              verifyElasticsearchExit(spans, entrySpan, indicesKey, '_all', '/_all/_refresh');
              verifyNoHttpExitsToElasticsearch(spans);
            })
          );
        }));

      it('must write to ES and retrieve the same document, tracing everything', () => {
        const titleA = `a${Date.now()}`;

        return index({
          body: JSON.stringify({
            title: titleA
          })
        })
          .then(res1 => {
            expect(res1.error).to.not.exist;
            expect(res1.response).to.exist;

            if (version === 'latest') {
              expect(res1.response.body.result).to.equal('created');
            } else {
              expect(res1.response.statusCode).to.equal(201);
            }

            expect(res1.response.body._index).to.equal('modern_index');
            expect(res1.response.body._shards.successful).to.equal(1);

            return retry(() =>
              get({
                id: res1.response.body._id
              }).then(res2 => {
                expect(res2.error).to.not.exist;
                expect(res2.response).to.exist;
                expect(res2.response.body._source.title).to.equal(titleA);
                return res2.response.body._id;
              })
            );
          })
          .then(documentId =>
            retry(() =>
              agentControls.getSpans().then(spans => {
                const indexEntrySpan = verifyHttpEntry(spans, '/index');
                verifyElasticsearchExit(spans, indexEntrySpan, 'index');
                verifyElasticsearchExit(spans, indexEntrySpan, indicesKey, '_all', '/_all/_refresh');

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
          body: JSON.stringify({
            title: titleA
          }),
          parentSpanId: '0000000000000042',
          traceId: '0000000000000042'
        })
          .then(() =>
            index({
              body: JSON.stringify({
                title: titleB
              }),
              parentSpanId: '0000000000000043',
              traceId: '0000000000000043'
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

            expect(res.response.body).to.be.an('object');
            expect(res.response.body.timed_out).to.be.false;
            expect(res.response.body.hits).to.be.an('object');
            expect(res.response.body.hits.total.value).to.equal(1);
            expect(res.response.body.hits.hits).to.be.an('array');
            expect(res.response.body.hits.hits[0]._source.title).to.equal(titleA);

            return retry(() =>
              agentControls.getSpans().then(spans => {
                const index1Entry = verifyHttpEntry(spans, '/index', '0000000000000042');

                verifyElasticsearchExit(spans, index1Entry, 'index');
                verifyElasticsearchExit(spans, index1Entry, indicesKey, '_all', '/_all/_refresh');

                const index2Entry = verifyHttpEntry(spans, '/index', '0000000000000043');

                verifyElasticsearchExit(spans, index2Entry, 'index');
                verifyElasticsearchExit(spans, index2Entry, indicesKey, '_all', '/_all/_refresh');

                const searchEntrySpan = verifyHttpEntry(spans, '/search');
                const searchExitSpan = verifyElasticsearchExit(
                  spans,
                  searchEntrySpan,
                  'search',
                  'modern_index',
                  '/modern_index/_search'
                );
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
          body: JSON.stringify({
            title: titleA
          }),
          parentSpanId: '0000000000000042',
          traceId: '0000000000000042'
        })
          .then(res => {
            expect(res.error).to.not.exist;
            expect(res.response).to.exist;
            idA = res.response.body._id;

            return index({
              body: JSON.stringify({
                title: titleB
              }),
              parentSpanId: '0000000000000043',
              traceId: '0000000000000043'
            });
          })
          .then(res => {
            expect(res.error).to.not.exist;
            expect(res.response).to.exist;
            idB = res.response.body._id;

            return index({
              body: JSON.stringify({
                title: titleC
              }),
              parentSpanId: '0000000000000044',
              traceId: '0000000000000044'
            });
          })
          .then(res => {
            expect(res.error).to.not.exist;
            expect(res.response).to.exist;
            idC = res.response.body._id;

            return retry(() =>
              mget1({
                id: [idA, idB]
              })
            );
          })
          .then(res => {
            expect(res.error).to.not.exist;
            expect(res.response).to.exist;
            response1 = res.response.body;

            return retry(() =>
              mget2({
                id: [idB, idC]
              })
            );
          })
          .then(res => {
            expect(res.error).to.not.exist;
            expect(res.response).to.exist;
            response2 = res.response.body;

            expect(response1.docs[0]._source.title).to.deep.equal(titleA);
            expect(response1.docs[1]._source.title).to.deep.equal(titleB);
            expect(response2.docs[0]._source.title).to.deep.equal(titleB);
            expect(response2.docs[1]._source.title).to.deep.equal(titleC);

            return retry(() =>
              agentControls.getSpans().then(spans => {
                verifyElasticsearchExit(spans, null, 'index', undefined, undefined, '0000000000000042');
                verifyElasticsearchExit(spans, null, indicesKey, '_all', '/_all/_refresh', '0000000000000042');

                verifyElasticsearchExit(spans, null, 'index', undefined, undefined, '0000000000000043');
                verifyElasticsearchExit(spans, null, indicesKey, '_all', '/_all/_refresh', '0000000000000043');

                verifyElasticsearchExit(spans, null, 'index', undefined, undefined, '0000000000000044');
                verifyElasticsearchExit(spans, null, indicesKey, '_all', '/_all/_refresh', '0000000000000044');

                const mget1HttpEntry = verifyHttpEntry(spans, '/mget1');
                const mget1Exit = verifyElasticsearchExit(
                  spans,
                  mget1HttpEntry,
                  'mget',
                  undefined,
                  '/_mget',
                  undefined,
                  true
                );
                expect(mget1Exit.data.elasticsearch.id).to.equal(`${idA},${idB}`);

                const mget2HttpEntry = verifyHttpEntry(spans, '/mget2');
                const mget2Exit = verifyElasticsearchExit(spans, mget2HttpEntry, 'mget', undefined, '/_mget');
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
          body: JSON.stringify({
            title: titleA
          }),
          parentSpanId: '0000000000000042',
          traceId: '0000000000000042'
        })
          .then(() =>
            index({
              body: JSON.stringify({
                title: titleB
              }),
              parentSpanId: '0000000000000043',
              traceId: '0000000000000043'
            })
          )
          .then(() =>
            index({
              body: JSON.stringify({
                title: titleC
              }),
              parentSpanId: '0000000000000044',
              traceId: '0000000000000044'
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
            expect(res.response.body).to.be.an('object');
            expect(res.response.body.responses).to.exist;
            expect(res.response.body.responses).to.have.lengthOf(2);
            expect(res.response.body.responses[0].hits.total.value).to.equal(1);
            expect(res.response.body.responses[1].hits.total.value).to.equal(1);
            expect(res.response.body.responses[0].hits.hits[0]._source.title).to.be.oneOf([titleA, titleB]);
            expect(res.response.body.responses[1].hits.hits[0]._source.title).to.be.oneOf([titleA, titleB]);
            return retry(() =>
              agentControls.getSpans().then(spans => {
                verifyElasticsearchExit(spans, null, 'index', undefined, undefined, '0000000000000042');
                verifyElasticsearchExit(spans, null, indicesKey, '_all', '/_all/_refresh', '0000000000000042');
                verifyElasticsearchExit(spans, null, 'index', undefined, undefined, '0000000000000043');
                verifyElasticsearchExit(spans, null, indicesKey, '_all', '/_all/_refresh', '0000000000000043');
                verifyElasticsearchExit(spans, null, 'index', undefined, undefined, '0000000000000044');
                verifyElasticsearchExit(spans, null, indicesKey, '_all', '/_all/_refresh', '0000000000000044');

                const msearchEntrySpan = verifyHttpEntry(spans, '/msearch');
                const msearchExitSpan = verifyElasticsearchExit(
                  spans,
                  msearchEntrySpan,
                  'msearch',
                  undefined,
                  '_msearch',
                  undefined,
                  true
                );
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
          body: JSON.stringify({
            title: 'A'
          })
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
            expect(res.response.body.hits.total.value).to.equal(0);
            expect(res.response.body.hits.hits).to.have.lengthOf(0);
            return retry(() =>
              agentControls.getSpans().then(spans => {
                const entrySpan = verifyHttpEntry(spans, '/index');
                verifyElasticsearchExit(spans, entrySpan, 'index');
                verifyElasticsearchExit(spans, entrySpan, indicesKey, '_all', '/_all/_refresh');

                const searchExit = verifyElasticsearchExit(spans, null, 'search', undefined, '/modern_index/_search');
                expect(searchExit.data.elasticsearch.hits).to.equal(0);

                verifyNoHttpExitsToElasticsearch(spans);
              })
            );
          }));

      it('[suppressed] should not trace', async function () {
        await controls.sendRequest({
          method: 'GET',
          path: '/search?q=nope',
          suppressTracing: true
        });

        await delay(1000);
        const spans = await agentControls.getSpans();
        if (spans.length > 0) {
          fail(`Unexpected spans: ${stringifyItems(spans)}`);
        }
      });

      it('call two different hosts', async function () {
        if (instrumentationFlavor === 'api') {
          // We only capture the destination host when instrumenting the transport layer on newer client versions.
          this.skip();
        }
        const response = await controls.sendRequest({
          method: 'POST',
          path: '/two-different-target-hosts',
          qs: {
            key: 'key',
            value1: 'value1',
            value2: 'value2'
          }
        });

        if (version === 'latest') {
          expect(response.response1).to.equal('created');
          expect(response.response2).to.equal('created');
        } else {
          expect(response.response1).to.equal(201);
          expect(response.response2).to.equal(201);
        }

        await retry(async () => {
          const spans = await agentControls.getSpans();
          const entrySpan = expectExactlyOneMatching(spans, [
            span => expect(span.n).to.equal('node.http.server'),
            span => expect(span.data.http.method).to.equal('POST')
          ]);
          expectExactlyOneMatching(spans, [
            span => expect(span.t).to.equal(entrySpan.t),
            span => expect(span.p).to.equal(entrySpan.s),
            span => expect(span.n).to.equal('elasticsearch'),
            span => expect(span.data.elasticsearch.action).to.equal('index'),
            span => expect(span.data.elasticsearch.address).to.equal('127.0.0.1'),
            span => expect(span.data.elasticsearch.port).to.equal('9200')
          ]);
          expectExactlyOneMatching(spans, [
            span => expect(span.t).to.equal(entrySpan.t),
            span => expect(span.p).to.equal(entrySpan.s),
            span => expect(span.n).to.equal('elasticsearch'),
            span => expect(span.data.elasticsearch.action).to.equal('index'),
            span => expect(span.data.elasticsearch.address).to.equal('localhost'),
            span => expect(span.data.elasticsearch.port).to.equal('9200')
          ]);
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

      function index(opts) {
        return sendRequest('POST', '/index', opts);
      }

      function sendRequest(method, httpPath, opts) {
        opts.method = method;
        opts.path = httpPath;
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
        if (opts.body) {
          opts.headers = {
            ...opts.headers,
            'Content-Type': 'application/json'
          };
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

      function verifyElasticsearchExit(spans, parent, action, expectedIndex, expectedEndpoint, traceId) {
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
          expect(span.data.elasticsearch.action).to.equal(action);
          verifyClusterOrAddressPort(span);
          verifyIndexOrEndpoint(span, expectedIndex, expectedEndpoint);
        });
      }

      function verifyClusterOrAddressPort(span) {
        if (instrumentationFlavor === 'api') {
          expect(span.data.elasticsearch.cluster).to.be.a.string;
          if (
            span.data.elasticsearch.cluster !== 'docker-cluster' &&
            span.data.elasticsearch.cluster !== 'elasticsearch'
          ) {
            fail(`Unexpected cluster name: ${span.data.elasticsearch.cluster}`);
          }
        } else if (instrumentationFlavor === 'transport') {
          expect(span.data.elasticsearch.address).to.equal('127.0.0.1');
          expect(span.data.elasticsearch.port).to.equal('9200');
        } else {
          fail(`Unknown instrumentation flavor: ${instrumentationFlavor}`);
        }
      }

      function verifyIndexOrEndpoint(span, expectedIndex = 'modern_index', expectedEndpoint = '/modern_index/_doc') {
        if (instrumentationFlavor === 'api') {
          expect(span.data.elasticsearch.index).to.equal(expectedIndex);
        } else if (instrumentationFlavor === 'transport') {
          expect(span.data.elasticsearch.endpoint).to.contain(expectedEndpoint);
        } else {
          fail(`Unknown instrumentation flavor: ${instrumentationFlavor}`);
        }
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
    }
  );
};
