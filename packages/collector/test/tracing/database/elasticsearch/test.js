'use strict';

var expect = require('chai').expect;

var constants = require('@instana/core').tracing.constants;
var supportedVersion = require('@instana/core').tracing.supportedVersion;
var config = require('../../../config');
var utils = require('../../../utils');

describe('tracing/elasticsearch', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  var expressElasticsearchControls = require('./controls');
  var agentStubControls = require('../../../apps/agentStubControls');

  this.timeout(config.getTestTimeout());

  agentStubControls.registerTestHooks();
  expressElasticsearchControls.registerTestHooks();

  beforeEach(function() {
    return agentStubControls.waitUntilAppIsCompletelyInitialized(expressElasticsearchControls.getPid());
  });

  it('must report errors caused by missing indices', function() {
    return expressElasticsearchControls
      .get({
        id: 'thisDocumentWillNotExist',
        index: 'thisIndexDoesNotExist'
      })
      .then(function() {
        return utils.retry(function() {
          return agentStubControls.getSpans().then(function(spans) {
            expect(spans).to.have.lengthOf(
              2,
              'Should not generate an exit span when there is already one. Spans: ' + JSON.stringify(spans, 0, 2)
            );

            var entrySpan = utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.server');
              expect(span.f.e).to.equal(String(expressElasticsearchControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(true);
              expect(span.ec).to.equal(1);
            });

            utils.expectOneMatching(spans, function(span) {
              expect(span.t).to.equal(entrySpan.t);
              expect(span.p).to.equal(entrySpan.s);
              expect(span.n).to.equal('elasticsearch');
              expect(span.f.e).to.equal(String(expressElasticsearchControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(true);
              expect(span.ec).to.equal(1);
              expect(span.data.elasticsearch.cluster).to.be.a('string');
              expect(span.data.elasticsearch.action).to.equal('get');
              expect(span.data.elasticsearch.type).to.equal('mytype');
              expect(span.data.elasticsearch.index).to.equal('thisIndexDoesNotExist');
              expect(span.data.elasticsearch.id).to.equal('thisDocumentWillNotExist');
              expect(span.data.elasticsearch.error).to.match(/no such index|missing/gi);
            });
          });
        });
      });
  });

  it('must report successful indexing requests', function() {
    return expressElasticsearchControls
      .index({
        body: {
          title: 'A'
        }
      })
      .then(function() {
        return utils.retry(function() {
          return agentStubControls.getSpans().then(function(spans) {
            var entrySpan = utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.server');
              expect(span.f.e).to.equal(String(expressElasticsearchControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(false);
            });

            utils.expectOneMatching(spans, function(span) {
              expect(span.t).to.equal(entrySpan.t);
              expect(span.p).to.equal(entrySpan.s);
              expect(span.n).to.equal('elasticsearch');
              expect(span.f.e).to.equal(String(expressElasticsearchControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(false);
              expect(span.data.elasticsearch.cluster).to.be.a('string');
              expect(span.data.elasticsearch.action).to.equal('index');
              expect(span.data.elasticsearch.type).to.equal('mytype');
              expect(span.data.elasticsearch.index).to.equal('myindex');
            });
          });
        });
      });
  });

  it('must write to ES and retrieve the same document, tracing everything', function() {
    var titleA = 'a' + Date.now();
    return expressElasticsearchControls
      .index({
        body: {
          title: titleA
        },
        rejectWrongStatusCodes: true
      })
      .then(function(response) {
        return utils.retry(function() {
          return expressElasticsearchControls
            .get({
              id: response._id,
              rejectWrongStatusCodes: true
            })
            .then(function() {
              return response._id;
            });
        });
      })
      .then(function(documentId) {
        return utils.retry(function() {
          return agentStubControls.getSpans().then(function(spans) {
            var indexEntrySpan = utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.server');
              expect(span.f.e).to.equal(String(expressElasticsearchControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(false);
              expect(span.data.http.url).to.equal('/index');
            });

            utils.expectOneMatching(spans, function(span) {
              expect(span.t).to.equal(indexEntrySpan.t);
              expect(span.p).to.equal(indexEntrySpan.s);
              expect(span.n).to.equal('elasticsearch');
              expect(span.f.e).to.equal(String(expressElasticsearchControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(false);
              expect(span.data.elasticsearch.cluster).to.be.a('string');
              expect(span.data.elasticsearch.action).to.equal('index');
              expect(span.data.elasticsearch.type).to.equal('mytype');
              expect(span.data.elasticsearch.index).to.equal('myindex');
            });

            var getEntrySpan = utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.server');
              expect(span.f.e).to.equal(String(expressElasticsearchControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(false);
              expect(span.data.http.url).to.equal('/get');
            });

            utils.expectOneMatching(spans, function(span) {
              expect(span.t).to.equal(getEntrySpan.t);
              expect(span.p).to.equal(getEntrySpan.s);
              expect(span.n).to.equal('elasticsearch');
              expect(span.f.e).to.equal(String(expressElasticsearchControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(false);
              expect(span.data.elasticsearch.cluster).to.be.a('string');
              expect(span.data.elasticsearch.action).to.equal('get');
              expect(span.data.elasticsearch.type).to.equal('mytype');
              expect(span.data.elasticsearch.index).to.equal('myindex');
              expect(span.data.elasticsearch.id).to.equal(documentId);
            });

            expect(spans).to.have.lengthOf(4, 'Spans: ' + JSON.stringify(spans, 0, 2));
          });
        });
      });
  });

  it('must write to ES and search for matching documents, tracing everything', function() {
    var titleA = 'a' + Date.now();
    var titleB = 'b' + Date.now();

    return expressElasticsearchControls
      .index({
        body: {
          title: titleA
        },
        rejectWrongStatusCodes: true,
        parentSpanId: '42',
        traceId: '42'
      })
      .then(function() {
        return expressElasticsearchControls.index({
          body: {
            title: titleB
          },
          rejectWrongStatusCodes: true,
          parentSpanId: '43',
          traceId: '43'
        });
      })
      .then(function() {
        return utils.retry(function() {
          return expressElasticsearchControls.search({
            q: 'title:' + titleA,
            rejectWrongStatusCodes: true
          });
        });
      })
      .then(function() {
        return utils.retry(function() {
          return agentStubControls.getSpans().then(function(spans) {
            utils.expectOneMatching(spans, function(span) {
              expect(span.t).to.equal('42');
              expect(span.n).to.equal('elasticsearch');
              expect(span.f.e).to.equal(String(expressElasticsearchControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(false);
              expect(span.data.elasticsearch.cluster).to.be.a('string');
              expect(span.data.elasticsearch.action).to.equal('index');
              expect(span.data.elasticsearch.type).to.equal('mytype');
              expect(span.data.elasticsearch.index).to.equal('myindex');
            });

            utils.expectOneMatching(spans, function(span) {
              expect(span.t).to.equal('43');
              expect(span.n).to.equal('elasticsearch');
              expect(span.f.e).to.equal(String(expressElasticsearchControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(false);
              expect(span.data.elasticsearch.cluster).to.be.a('string');
              expect(span.data.elasticsearch.action).to.equal('index');
              expect(span.data.elasticsearch.type).to.equal('mytype');
              expect(span.data.elasticsearch.index).to.equal('myindex');
            });

            var getEntrySpan = utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.server');
              expect(span.f.e).to.equal(String(expressElasticsearchControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(false);
              expect(span.data.http.url).to.equal('/search');
            });

            utils.expectOneMatching(spans, function(span) {
              expect(span.t).to.equal(getEntrySpan.t);
              expect(span.p).to.equal(getEntrySpan.s);
              expect(span.n).to.equal('elasticsearch');
              expect(span.f.e).to.equal(String(expressElasticsearchControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(false);
              expect(span.data.elasticsearch.cluster).to.be.a('string');
              expect(span.data.elasticsearch.action).to.equal('search');
              expect(span.data.elasticsearch.type).to.equal('mytype');
              expect(span.data.elasticsearch.index).to.equal('myindex');
              expect(span.data.elasticsearch.hits).to.equal(1);
            });
          });
        });
      });
  });

  it('must trace mget', function() {
    var titleA = 'a' + Date.now();
    var titleB = 'b' + Date.now();
    var titleC = 'c' + Date.now();
    var idA;
    var idB;
    var idC;
    var response1;
    var response2;

    return expressElasticsearchControls
      .index({
        body: {
          title: titleA
        },
        rejectWrongStatusCodes: true,
        parentSpanId: '42',
        traceId: '42'
      })
      .then(function(response) {
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
      .then(function(response) {
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
      .then(function(response) {
        idC = response._id;
        return utils.retry(function() {
          return expressElasticsearchControls.mget1({
            id: [idA, idB],
            rejectWrongStatusCodes: true
          });
        });
      })
      .then(function(response) {
        response1 = response;
        return utils.retry(function() {
          return expressElasticsearchControls.mget2({
            id: [idB, idC],
            rejectWrongStatusCodes: true
          });
        });
      })
      .then(function(response) {
        response2 = response;
        expect(response1.docs[0]._source.title).to.deep.equal(titleA);
        expect(response1.docs[1]._source.title).to.deep.equal(titleB);
        expect(response2.docs[0]._source.title).to.deep.equal(titleB);
        expect(response2.docs[1]._source.title).to.deep.equal(titleC);
        return utils.retry(function() {
          return agentStubControls.getSpans().then(function(spans) {
            utils.expectOneMatching(spans, function(span) {
              expect(span.t).to.equal('42');
              expect(span.n).to.equal('elasticsearch');
              expect(span.f.e).to.equal(String(expressElasticsearchControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(false);
              expect(span.data.elasticsearch.cluster).to.be.a('string');
              expect(span.data.elasticsearch.action).to.equal('index');
              expect(span.data.elasticsearch.type).to.equal('mytype');
              expect(span.data.elasticsearch.index).to.equal('myindex');
            });
            utils.expectOneMatching(spans, function(span) {
              expect(span.t).to.equal('43');
              expect(span.n).to.equal('elasticsearch');
              expect(span.f.e).to.equal(String(expressElasticsearchControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(false);
              expect(span.data.elasticsearch.cluster).to.be.a('string');
              expect(span.data.elasticsearch.action).to.equal('index');
              expect(span.data.elasticsearch.type).to.equal('mytype');
              expect(span.data.elasticsearch.index).to.equal('myindex');
            });
            var mget1HttpEntry = utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.server');
              expect(span.f.e).to.equal(String(expressElasticsearchControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(false);
              expect(span.data.http.url).to.equal('/mget1');
            });
            utils.expectOneMatching(spans, function(span) {
              expect(span.t).to.equal(mget1HttpEntry.t);
              expect(span.p).to.equal(mget1HttpEntry.s);
              expect(span.n).to.equal('elasticsearch');
              expect(span.f.e).to.equal(String(expressElasticsearchControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(false);
              expect(span.data.elasticsearch.cluster).to.be.a('string');
              expect(span.data.elasticsearch.action).to.equal('mget');
              expect(span.data.elasticsearch.type).to.equal('mytype');
              expect(span.data.elasticsearch.index).to.equal('myindex');
              expect(span.data.elasticsearch.id).to.equal(idA + ',' + idB);
            });
            var mget2HttpEntry = utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.server');
              expect(span.f.e).to.equal(String(expressElasticsearchControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(false);
              expect(span.data.http.url).to.equal('/mget2');
            });
            utils.expectOneMatching(spans, function(span) {
              expect(span.t).to.equal(mget2HttpEntry.t);
              expect(span.p).to.equal(mget2HttpEntry.s);
              expect(span.n).to.equal('elasticsearch');
              expect(span.f.e).to.equal(String(expressElasticsearchControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(false);
              expect(span.data.elasticsearch.cluster).to.be.a('string');
              expect(span.data.elasticsearch.action).to.equal('mget');
              expect(span.data.elasticsearch.type).to.equal('mytype');
              expect(span.data.elasticsearch.index).to.equal('myindex');
              expect(span.data.elasticsearch.id).to.equal(idB + ',' + idC);
            });
          });
        });
      });
  });

  it('must trace msearch', function() {
    var titleA = 'a' + Date.now();
    var titleB = 'b' + Date.now();
    var titleC = 'c' + Date.now();

    return expressElasticsearchControls
      .index({
        body: {
          title: titleA
        },
        rejectWrongStatusCodes: true,
        parentSpanId: '42',
        traceId: '42'
      })
      .then(function() {
        return expressElasticsearchControls.index({
          body: {
            title: titleB
          },
          rejectWrongStatusCodes: true,
          parentSpanId: '43',
          traceId: '43'
        });
      })
      .then(function() {
        return expressElasticsearchControls.index({
          body: {
            title: titleC
          },
          rejectWrongStatusCodes: true,
          parentSpanId: '44',
          traceId: '44'
        });
      })
      .then(function() {
        return utils.retry(function() {
          return expressElasticsearchControls.msearch({
            q: ['title:' + titleA, 'title:' + titleB],
            rejectWrongStatusCodes: true
          });
        });
      })
      .then(function(response) {
        expect(response.responses).to.exist;
        expect(response.responses[0].hits.total).to.equal(1);
        expect(response.responses[1].hits.total).to.equal(1);
        return utils.retry(function() {
          return agentStubControls.getSpans().then(function(spans) {
            utils.expectOneMatching(spans, function(span) {
              expect(span.t).to.equal('42');
              expect(span.n).to.equal('elasticsearch');
              expect(span.f.e).to.equal(String(expressElasticsearchControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(false);
              expect(span.data.elasticsearch.cluster).to.be.a('string');
              expect(span.data.elasticsearch.action).to.equal('index');
              expect(span.data.elasticsearch.type).to.equal('mytype');
              expect(span.data.elasticsearch.index).to.equal('myindex');
            });
            utils.expectOneMatching(spans, function(span) {
              expect(span.t).to.equal('43');
              expect(span.n).to.equal('elasticsearch');
              expect(span.f.e).to.equal(String(expressElasticsearchControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(false);
              expect(span.data.elasticsearch.cluster).to.be.a('string');
              expect(span.data.elasticsearch.action).to.equal('index');
              expect(span.data.elasticsearch.type).to.equal('mytype');
              expect(span.data.elasticsearch.index).to.equal('myindex');
            });
            var getEntrySpan = utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.server');
              expect(span.f.e).to.equal(String(expressElasticsearchControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(false);
              expect(span.data.http.url).to.equal('/msearch');
            });
            utils.expectOneMatching(spans, function(span) {
              expect(span.t).to.equal(getEntrySpan.t);
              expect(span.p).to.equal(getEntrySpan.s);
              expect(span.n).to.equal('elasticsearch');
              expect(span.f.e).to.equal(String(expressElasticsearchControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(false);
              expect(span.data.elasticsearch.cluster).to.be.a('string');
              expect(span.data.elasticsearch.action).to.equal('msearch');
              expect(span.data.elasticsearch.type).to.equal('mytype');
              expect(span.data.elasticsearch.index).to.equal('myindex');
              expect(span.data.elasticsearch.hits).to.equal(2);
            });
          });
        });
      });
  });

  it('must not consider queries as failed when there are no hits', function() {
    return expressElasticsearchControls
      .index({
        body: {
          title: 'A'
        },
        rejectWrongStatusCodes: true,
        parentSpanId: 42,
        traceSpanId: 42
      })
      .then(function() {
        return utils.retry(function() {
          return expressElasticsearchControls.search({
            q: 'title:Z',
            rejectWrongStatusCodes: true
          });
        });
      })
      .then(function() {
        return utils.retry(function() {
          return agentStubControls.getSpans().then(function(spans) {
            utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('elasticsearch');
              expect(span.f.e).to.equal(String(expressElasticsearchControls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(false);
              expect(span.data.elasticsearch.cluster).to.be.a('string');
              expect(span.data.elasticsearch.action).to.equal('search');
              expect(span.data.elasticsearch.type).to.equal('mytype');
              expect(span.data.elasticsearch.index).to.equal('myindex');
              expect(span.data.elasticsearch.hits).to.equal(0);
            });
          });
        });
      });
  });

  it('must trace across native promise boundaries', function() {
    return expressElasticsearchControls
      .searchAndGet({
        q: 'name:foo'
      })
      .then(function() {
        return utils.retry(function() {
          return agentStubControls.getSpans().then(function(spans) {
            var httpEntrySpan = utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.server');
              expect(span.k).to.equal(constants.ENTRY);
            });

            utils.expectOneMatching(spans, function(span) {
              expect(span.t).to.equal(httpEntrySpan.t);
              expect(span.p).to.equal(httpEntrySpan.s);
              expect(span.n).to.equal('elasticsearch');
              expect(span.k).to.equal(constants.EXIT);
            });

            utils.expectOneMatching(spans, function(span) {
              expect(span.t).to.equal(httpEntrySpan.t);
              expect(span.p).to.equal(httpEntrySpan.s);
              expect(span.n).to.equal('node.http.client');
              expect(span.k).to.equal(constants.EXIT);
            });
          });
        });
      });
  });
});
