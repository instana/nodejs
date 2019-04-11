'use strict';

var expect = require('chai').expect;

var constants = require('@instana/core').tracing.constants;
var supportedVersion = require('@instana/core').tracing.supportedVersion;
var config = require('../../../config');
var utils = require('../../../utils');

describe('tracing/sequelize', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  var expressPgControls = require('./controls');
  var agentStubControls = require('../../../apps/agentStubControls');

  this.timeout(config.getTestTimeout());

  agentStubControls.registerTestHooks();
  expressPgControls.registerTestHooks();

  beforeEach(function() {
    return agentStubControls.waitUntilAppIsCompletelyInitialized(expressPgControls.getPid());
  });

  it('must fetch', function() {
    return expressPgControls
      .sendRequest({
        method: 'GET',
        path: '/regents'
      })
      .then(function(response) {
        expect(response).to.exist;
        expect(Array.isArray(response)).to.be.true;
        expect(response.length).to.be.gte(1);
        expect(response[0].firstName).to.equal('Irene');
        expect(response[0].lastName).to.equal('Sarantapechaina');

        return utils.retry(function() {
          return agentStubControls.getSpans().then(function(spans) {
            var entrySpans = utils.getSpansByName(spans, 'node.http.server');
            var pgSpans = utils.getSpansByName(spans, 'postgres');

            expect(entrySpans).to.have.lengthOf(1);
            expect(pgSpans).to.have.lengthOf(1);

            var entrySpan = entrySpans[0];
            var pgSpan = pgSpans[0];

            expect(pgSpan.f.e).to.equal(String(expressPgControls.getPid()));
            expect(pgSpan.f.h).to.equal('agent-stub-uuid');
            expect(pgSpan.t).to.equal(entrySpan.t);
            expect(pgSpan.p).to.equal(entrySpan.s);
            expect(pgSpan.n).to.equal('postgres');
            expect(pgSpan.k).to.equal(constants.EXIT);
            expect(pgSpan.f.e).to.equal(String(expressPgControls.getPid()));
            expect(pgSpan.f.h).to.equal('agent-stub-uuid');
            expect(pgSpan.async).to.equal(false);
            expect(pgSpan.error).to.equal(false);
            expect(pgSpan.ec).to.equal(0);
            expect(pgSpan.data.pg.stmt).to.contain('FROM "regents"');
          });
        });
      });
  });

  it('must write', function() {
    return expressPgControls
      .sendRequest({
        method: 'POST',
        path: '/regents',
        body: {
          firstName: 'Martina',
          lastName: '-'
        }
      })
      .then(function() {
        return expressPgControls.sendRequest({
          method: 'GET',
          path: '/regents?firstName=Martina'
        });
      })
      .then(function(response) {
        expect(response).to.exist;
        expect(Array.isArray(response)).to.be.true;
        expect(response.length).to.be.gte(1);
        expect(response[0].firstName).to.equal('Martina');
        expect(response[0].lastName).to.equal('-');
        return utils.retry(function() {
          return agentStubControls.getSpans().then(function(spans) {
            var entrySpans = utils.getSpansByName(spans, 'node.http.server');
            var pgSpans = utils.getSpansByName(spans, 'postgres');

            expect(entrySpans).to.have.lengthOf(2);
            expect(pgSpans.length).to.be.gte(2);

            var entrySpan = entrySpans[0];
            var pgSpan = pgSpans[0];

            for (var i = 0; i < pgSpans.length - 1; i++) {
              expect(entrySpan.data.http.method).to.equal('POST');
              expect(pgSpan.f.e).to.equal(String(expressPgControls.getPid()));
              expect(pgSpan.f.h).to.equal('agent-stub-uuid');
              expect(pgSpan.t).to.equal(entrySpan.t);
              // The last pgSpan should be the read span triggered by HTTP GET, all others are triggered by HTTP POST
              // when writing the value.
              expect(pgSpan.p).to.equal(entrySpan.s);
              expect(pgSpan.n).to.equal('postgres');
              expect(pgSpan.k).to.equal(constants.EXIT);
              expect(pgSpan.f.e).to.equal(String(expressPgControls.getPid()));
              expect(pgSpan.f.h).to.equal('agent-stub-uuid');
              expect(pgSpan.async).to.equal(false);
              expect(pgSpan.error).to.equal(false);
              expect(pgSpan.ec).to.equal(0);
            }
          });
        });
      });
  });
});
