/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2016
 */

'use strict';

const expect = require('chai').expect;
const semver = require('semver');

const constants = require('@instana/core').tracing.constants;
const config = require('../../../../../core/test/config');
const {
  stringifyItems,
  expectExactlyOneMatching,
  getSpansByName,
  retry
} = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');

const { fail } = expect;

const mochaSuiteFn = semver.gte(process.versions.node, '10.0.0') ? describe : describe.skip;

mochaSuiteFn('tracing/elasticsearch (modern client)', function () {
  this.timeout(Math.max(config.getTestTimeout() * 4, 30000));

  /**
   * transport: instrumentation > 7.9.1
   * api: instrumentation < 7.9.1
   *
   * The words "transport" and "api" try to describe the different
   * mechanismn we use in core/src/tracing/instrumentation/database/elasticsearchModern.js
   */
  [
    {
      version: 'latest',
      instrumentationFlavor: 'transport'
    },
    {
      version: '7.9.0',
      instrumentationFlavor: 'api'
    }
  ].forEach(({ version, instrumentationFlavor }) => {
    describe(
      // eslint-disable-next-line no-useless-concat
      `@elastic/elasticsearch@${version}/` + `instrumentation flavor: ${instrumentationFlavor}`,
      function () {
        globalAgent.setUpCleanUpHooks();
        const agentControls = globalAgent.instance;

        const controls = new ProcessControls({
          dirname: __dirname,
          useGlobalAgent: true,
          env: {
            ELASTIC_VERSION: version
          }
        });

        ProcessControls.setUpHooks(controls);

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
            body: {
              title: 'A'
            }
          }).then(res => {
            if (res.error) {
              fail('Unexpected errors:' + JSON.stringify(res.error, null, 2));
            }
            expect(res.error).to.not.exist;
            expect(res.response).to.exist;
            expect(res.response.body._index).to.equal('modern_index');
            expect(res.response.body._shards.successful).to.equal(1);
            return retry(() =>
              agentControls.getSpans().then(spans => {
                const entrySpan = verifyHttpEntry(spans, '/index');
                verifyElasticsearchExit(spans, entrySpan, 'index');
                verifyElasticsearchExit(spans, entrySpan, 'indices.refresh', '_all', '/_all/_refresh');
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
              expect(res1.response.statusCode).to.equal(201);
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
                  verifyElasticsearchExit(spans, indexEntrySpan, 'indices.refresh', '_all', '/_all/_refresh');

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
              expect(res.response.body).to.be.an('object');
              expect(res.response.body.timed_out).to.be.false;
              expect(res.response.body.hits).to.be.an('object');
              expect(res.response.body.hits.total.value).to.equal(1);
              expect(res.response.body.hits.hits).to.be.an('array');
              expect(res.response.body.hits.hits[0]._source.title).to.equal(titleA);

              return retry(() =>
                agentControls.getSpans().then(spans => {
                  const index1Entry = verifyHttpEntry(spans, '/index', '42');
                  verifyElasticsearchExit(spans, index1Entry, 'index');
                  verifyElasticsearchExit(spans, index1Entry, 'indices.refresh', '_all', '/_all/_refresh');
                  const index2Entry = verifyHttpEntry(spans, '/index', '43');
                  verifyElasticsearchExit(spans, index2Entry, 'index');
                  verifyElasticsearchExit(spans, index2Entry, 'indices.refresh', '_all', '/_all/_refresh');

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
            body: {
              title: titleA
            },
            parentSpanId: '42',
            traceId: '42'
          })
            .then(res => {
              expect(res.error).to.not.exist;
              expect(res.response).to.exist;
              idA = res.response.body._id;
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
              idB = res.response.body._id;
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
                  verifyElasticsearchExit(spans, null, 'index', undefined, undefined, '42');
                  verifyElasticsearchExit(spans, null, 'indices.refresh', '_all', '/_all/_refresh', '42');
                  verifyElasticsearchExit(spans, null, 'index', undefined, undefined, '43');
                  verifyElasticsearchExit(spans, null, 'indices.refresh', '_all', '/_all/_refresh', '43');
                  verifyElasticsearchExit(spans, null, 'index', undefined, undefined, '44');
                  verifyElasticsearchExit(spans, null, 'indices.refresh', '_all', '/_all/_refresh', '44');

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
              expect(res.response.body).to.be.an('object');
              expect(res.response.body.responses).to.exist;
              expect(res.response.body.responses).to.have.lengthOf(2);
              expect(res.response.body.responses[0].hits.total.value).to.equal(1);
              expect(res.response.body.responses[1].hits.total.value).to.equal(1);
              expect(res.response.body.responses[0].hits.hits[0]._source.title).to.be.oneOf([titleA, titleB]);
              expect(res.response.body.responses[1].hits.hits[0]._source.title).to.be.oneOf([titleA, titleB]);
              return retry(() =>
                agentControls.getSpans().then(spans => {
                  verifyElasticsearchExit(spans, null, 'index', undefined, undefined, '42');
                  verifyElasticsearchExit(spans, null, 'indices.refresh', '_all', '/_all/_refresh', '42');
                  verifyElasticsearchExit(spans, null, 'index', undefined, undefined, '43');
                  verifyElasticsearchExit(spans, null, 'indices.refresh', '_all', '/_all/_refresh', '43');
                  verifyElasticsearchExit(spans, null, 'index', undefined, undefined, '44');
                  verifyElasticsearchExit(spans, null, 'indices.refresh', '_all', '/_all/_refresh', '44');

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
              expect(res.response.body.hits.total.value).to.equal(0);
              expect(res.response.body.hits.hits).to.have.lengthOf(0);
              return retry(() =>
                agentControls.getSpans().then(spans => {
                  const entrySpan = verifyHttpEntry(spans, '/index');
                  verifyElasticsearchExit(spans, entrySpan, 'index');
                  verifyElasticsearchExit(spans, entrySpan, 'indices.refresh', '_all', '/_all/_refresh');

                  const searchExit = verifyElasticsearchExit(spans, null, 'search', undefined, '/modern_index/_search');
                  expect(searchExit.data.elasticsearch.hits).to.equal(0);

                  verifyNoHttpExitsToElasticsearch(spans);
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
  });
});
