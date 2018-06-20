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

  it('must trace string based pool insert', function() {
    return expressPgControls.sendRequest({
      method: 'GET',
      path: '/pool-string-insert',
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
            expect(pgSpan.data.pg.stmt).to.equal('INSERT INTO users(name, email) VALUES($1, $2) RETURNING *');
          });
      });
    });
  });

  it('must trace config object based pool select', function() {
    return expressPgControls.sendRequest({
      method: 'GET',
      path: '/pool-config-select',
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
            expect(pgSpan.data.pg.stmt).to.equal('SELECT name, email FROM users');
          });
      });
    });
  });

  it('must trace promise based pool select', function() {
    return expressPgControls.sendRequest({
      method: 'GET',
      path: '/pool-config-select-promise',
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
            expect(pgSpan.data.pg.stmt).to.equal('INSERT INTO users(name, email) VALUES($1, $2) RETURNING *');
          });
      });
    });
  });

  it('must trace string based client insert', function() {
    return expressPgControls.sendRequest({
      method: 'GET',
      path: '/client-string-insert',
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
            expect(pgSpan.data.pg.stmt).to.equal('INSERT INTO users(name, email) VALUES($1, $2) RETURNING *');
          });
      });
    });
  });

  it('must trace config object based client select', function() {
    return expressPgControls.sendRequest({
      method: 'GET',
      path: '/client-config-select',
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
            expect(pgSpan.data.pg.stmt).to.equal('SELECT name, email FROM users');
          });
      });
    });
  });

  it('must capture errors', function() {
    return expressPgControls.sendRequest({
      method: 'GET',
      path: '/table-doesnt-exist',
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
            expect(pgSpan.error).to.equal(true);
            expect(pgSpan.ec).to.equal(1);
            expect(pgSpan.data.pg.stmt).to.equal('SELECT name, email FROM nonexistanttable');
          });
      });
    });
  });

  it('must not break vanilla postgres (not tracing)', function() {
    return expressPgControls.sendRequest({
      method: 'GET',
      path: '/pool-string-insert',
      suppressTracing: true
    })
    .then(function(response) {
      return utils.retry(function() {
        return agentStubControls.getSpans()
          .then(function(spans) {
            var entrySpans = utils.getSpansByName(spans, 'node.http.server');
            var pgSpans = utils.getSpansByName(spans, 'postgres');

            expect(entrySpans).to.have.lengthOf(0);
            expect(pgSpans).to.have.lengthOf(0);

            expect(response.rows).to.lengthOf(1);
            expect(response.rows[0].name).to.equal('beaker');
            expect(response.rows[0].email).to.equal('beaker@muppets.com');
          });
      });
    });
  });

  // TBD Not supported (yet)
  it.skip('must trace transactions', function() {
    return expressPgControls.sendRequest({
      method: 'GET',
      path: '/transaction',
      body: {}
    })
    .then(function() {
      return utils.retry(function() {
        return agentStubControls.getSpans()
          .then(function(spans) {
            var entrySpans = utils.getSpansByName(spans, 'node.http.server');
            var pgSpans = utils.getSpansByName(spans, 'postgres');

            expect(entrySpans).to.have.lengthOf(1);
            expect(pgSpans).to.have.lengthOf(4);

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
            expect(pgSpan.data.pg.stmt).to.equal('BEGIN');
          });
      });
    });
  });
});
