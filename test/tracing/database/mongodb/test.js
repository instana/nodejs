'use strict';

var expect = require('chai').expect;
var Promise = require('bluebird');
var _ = require('lodash');

var supportedVersion = require('../../../../src/tracing/index').supportedVersion;
var config = require('../../../config');
var utils = require('../../../utils');

describe('tracing/mongodb', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  var expressMongodbControls = require('./controls');
  var agentStubControls = require('../../../apps/agentStubControls');

  this.timeout(config.getTestTimeout());

  agentStubControls.registerTestHooks();
  expressMongodbControls.registerTestHooks();

  beforeEach(function() {
    return agentStubControls.waitUntilAppIsCompletelyInitialized(expressMongodbControls.getPid());
  });

  it('must trace insert requests', function() {
    return expressMongodbControls
      .sendRequest({
        method: 'POST',
        path: '/insert',
        body: {
          foo: 'bar'
        }
      })
      .then(function() {
        return utils.retry(function() {
          return agentStubControls.getSpans().then(function(spans) {
            var entrySpan = utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.server');
              expect(span.f.e).to.equal(String(expressMongodbControls.getPid()));
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(false);
            });

            utils.expectOneMatching(spans, function(span) {
              expect(span.t).to.equal(entrySpan.t);
              expect(span.p).to.equal(entrySpan.s);
              expect(span.n).to.equal('mongo');
              expect(span.f.e).to.equal(String(expressMongodbControls.getPid()));
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(false);
              expect(span.data.peer.hostname).to.equal('127.0.0.1');
              expect(span.data.peer.port).to.equal(27017);
              expect(span.data.mongo.command).to.equal('insert');
              expect(span.data.mongo.service).to.equal(process.env.MONGODB);
              expect(span.data.mongo.namespace).to.equal('myproject.mydocs');
            });
          });
        });
      });
  });

  it('must trace find requests', function() {
    return expressMongodbControls
      .sendRequest({
        method: 'POST',
        path: '/find',
        body: {
          bla: 'blub'
        }
      })
      .then(function() {
        return utils.retry(function() {
          return agentStubControls.getSpans().then(function(spans) {
            var entrySpan = utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.server');
              expect(span.f.e).to.equal(String(expressMongodbControls.getPid()));
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(false);
            });

            utils.expectOneMatching(spans, function(span) {
              expect(span.t).to.equal(entrySpan.t);
              expect(span.p).to.equal(entrySpan.s);
              expect(span.n).to.equal('mongo');
              expect(span.f.e).to.equal(String(expressMongodbControls.getPid()));
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(false);
              expect(span.data.peer.hostname).to.equal('127.0.0.1');
              expect(span.data.peer.port).to.equal(27017);
              expect(span.data.mongo.command).to.equal('find');
              expect(span.data.mongo.service).to.equal(process.env.MONGODB);
              expect(span.data.mongo.namespace).to.equal('myproject.mydocs');
              expect(span.data.mongo.filter).to.deep.equal(
                JSON.stringify({
                  bla: 'blub'
                })
              );
            });
          });
        });
      });
  });

  // correlating multiple operations (bulk writes, find with getMore) is broken in mongodb APM support since
  // version 3.0.6, see https://groups.google.com/forum/#!topic/node-mongodb-native/uBae-HO0zw8
  it.skip('must trace find requests with cursors', function() {
    return Promise.all(
      _.range(10).map(function(i) {
        return expressMongodbControls.sendRequest({
          method: 'POST',
          path: '/insert',
          body: {
            type: 'foobar-' + i
          }
        });
      })
    )
      .then(function() {
        return Promise.delay(1000);
      })
      .then(agentStubControls.clearRetrievedData)
      .then(function() {
        return expressMongodbControls.sendRequest({
          method: 'GET',
          path: '/findall'
        });
      })
      .then(function() {
        return utils.retry(function() {
          return agentStubControls.getSpans().then(function(spans) {
            var entrySpan = utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.server');
              expect(span.f.e).to.equal(String(expressMongodbControls.getPid()));
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(false);
              expect(span.data.http.url).to.equal('/findall');
            });

            utils.expectOneMatching(spans, function(span) {
              expect(span.t).to.equal(entrySpan.t);
              expect(span.p).to.equal(entrySpan.s);
              expect(span.n).to.equal('mongo');
              expect(span.f.e).to.equal(String(expressMongodbControls.getPid()));
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(false);
              expect(span.data.peer.hostname).to.equal('127.0.0.1');
              expect(span.data.peer.port).to.equal(27017);
              expect(span.data.mongo.command).to.equal('find');
              expect(span.data.mongo.service).to.equal(process.env.MONGODB);
              expect(span.data.mongo.namespace).to.equal('myproject.mydocs');
              expect(span.data.mongo.filter).to.deep.equal('{}');
            });

            utils.expectOneMatching(spans, function(span) {
              expect(span.t).to.equal(entrySpan.t);
              expect(span.p).to.equal(entrySpan.s);
              expect(span.n).to.equal('mongo');
              expect(span.f.e).to.equal(String(expressMongodbControls.getPid()));
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(false);
              expect(span.data.peer.hostname).to.equal('127.0.0.1');
              expect(span.data.peer.port).to.equal(27017);
              expect(span.data.mongo.command).to.equal('getMore');
              expect(span.data.mongo.service).to.equal(process.env.MONGODB);
              expect(span.data.mongo.namespace).to.equal('myproject.mydocs');
            });
          });
        });
      });
  });
});
