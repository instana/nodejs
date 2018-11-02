'use strict';

var expect = require('chai').expect;
var uuid = require('uuid/v4');

var supportedVersion = require('../../../../src/tracing/index').supportedVersion;
var config = require('../../../config');
var utils = require('../../../utils');

describe('tracing/mongoose', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  var agentControls = require('../../../apps/agentStubControls');
  var MongooseControls = require('./controls');

  this.timeout(config.getTestTimeout());

  agentControls.registerTestHooks();

  var mongooseControls = new MongooseControls({
    agentControls: agentControls
  });
  mongooseControls.registerTestHooks();

  it('must trace create calls', function() {
    return mongooseControls
      .sendRequest({
        method: 'POST',
        path: '/insert',
        body: {
          name: 'Some Body',
          age: 999
        }
      })
      .then(function() {
        return utils.retry(function() {
          return agentControls.getSpans().then(function(spans) {
            var entrySpan = utils.expectOneMatching(spans, function(span) {
              expect(span.n).to.equal('node.http.server');
              expect(span.f.e).to.equal(String(mongooseControls.getPid()));
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(false);
            });

            utils.expectOneMatching(spans, function(span) {
              expect(span.t).to.equal(entrySpan.t);
              expect(span.p).to.equal(entrySpan.s);
              expect(span.n).to.equal('mongo');
              expect(span.f.e).to.equal(String(mongooseControls.getPid()));
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(false);
              expect(span.data.mongo.command).to.equal('insert');
              expect(span.data.mongo.service).to.equal(process.env.MONGODB);
              expect(span.data.mongo.namespace).to.equal('mongoose.people');
            });
          });
        });
      });
  });

  it('must trace findOne calls', function() {
    var randomName = uuid();
    return mongooseControls
      .sendRequest({
        method: 'POST',
        path: '/insert',
        body: {
          name: randomName,
          age: 42
        }
      })
      .then(function() {
        return mongooseControls.sendRequest({
          method: 'POST',
          path: '/find',
          body: {
            name: randomName,
            age: 42
          }
        });
      })
      .then(function() {
        return utils.retry(function() {
          return agentControls.getSpans().then(function(spans) {
            var entrySpan = utils.expectOneMatching(spans, function(span) {
              expect(span.data.http.url).to.equal('/find');
              expect(span.n).to.equal('node.http.server');
              expect(span.f.e).to.equal(String(mongooseControls.getPid()));
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(false);
            });

            utils.expectOneMatching(spans, function(span) {
              expect(span.t).to.equal(entrySpan.t);
              expect(span.p).to.equal(entrySpan.s);
              expect(span.n).to.equal('mongo');
              expect(span.f.e).to.equal(String(mongooseControls.getPid()));
              expect(span.async).to.equal(false);
              expect(span.error).to.equal(false);
              expect(span.data.mongo.command).to.equal('find');
              expect(span.data.mongo.service).to.equal(process.env.MONGODB);
              expect(span.data.mongo.namespace).to.equal('mongoose.people');
              expect(span.data.mongo.filter).to.contain('"age":42');
              expect(span.data.mongo.filter).to.contain('"name":"' + randomName + '"');
            });
          });
        });
      });
  });
});
