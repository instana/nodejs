'use strict';

var expect = require('chai').expect;

var supportedVersion = require('../../src/tracing/index').supportedVersion;
var config = require('../config');
var utils = require('../utils');


describe.only('tracing/pg', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  // controls require features that aren't available in early Node.js versions
  var expressPgControls = require('../apps/expressPgControls');
  var agentStubControls = require('../apps/agentStubControls');

  this.timeout(config.getTestTimeout());

  agentStubControls.registerTestHooks();
  expressPgControls.registerTestHooks();

  beforeEach(function() {
    return agentStubControls.waitUntilAppIsCompletelyInitialized(expressPgControls.getPid());
  });

  it('must trace select now', function() {
    return expressPgControls.sendRequest({
      method: 'GET',
      path: '/select-now',
      body: {}
    })
    .then(function() {
      return utils.retry(function() {
        return agentStubControls.getSpans()
          .then(function(spans) {
            var entrySpans = utils.getSpansByName(spans, 'node.http.server');
            var pgSpans = utils.getSpansByName(spans, 'postgres');

            expect(entrySpans).to.have.lengthOf(1);
            expect(pgSpans).to.have.lengthOf(1);

            var entrySpan = entrySpans[0];
            var pgSpan = pgSpans[0];

            expect(pgSpan.f.e).to.equal(String(expressPgControls.getPid()));
            expect(pgSpan.t).to.equal(entrySpan.t);
            expect(pgSpan.p).to.equal(entrySpan.s);
            expect(pgSpan.n).to.equal('postgres');
            expect(pgSpan.f.e).to.equal(String(expressPgControls.getPid()));
            expect(pgSpan.async).to.equal(false);
            expect(pgSpan.error).to.equal(false);
            expect(pgSpan.ec).to.equal(0);
            expect(pgSpan.data.pg.stmt).to.equal('SELECT NOW()');
          });
      });
    });
  });

  it('must trace insert and select queries', function() {
    return expressPgControls.sendRequest({
      method: 'GET',
      path: '/insert-and-select',
      body: {}
    })
    .then(function() {
      return utils.retry(function() {
        return agentStubControls.getSpans()
          .then(function(spans) {
            var entrySpans = utils.getSpansByName(spans, 'node.http.server');
            var pgSpans = utils.getSpansByName(spans, 'postgres');

            expect(entrySpans).to.have.lengthOf(1);
            expect(pgSpans).to.have.lengthOf(1);
          });
      });
    });
  });
});
