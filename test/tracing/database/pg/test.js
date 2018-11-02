'use strict';

var expect = require('chai').expect;

var supportedVersion = require('../../../../src/tracing/index').supportedVersion;
var config = require('../../../config');
var utils = require('../../../utils');

describe('tracing/pg', function() {
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

  it('must trace select now', function() {
    return expressPgControls
      .sendRequest({
        method: 'GET',
        path: '/select-now',
        body: {}
      })
      .then(function(response) {
        expect(response).to.exist;
        expect(response.command).to.equal('SELECT');
        expect(response.rowCount).to.equal(1);
        expect(response.rows.length).to.equal(1);
        expect(response.rows[0].now).to.be.a('string');

        return utils.retry(function() {
          return agentStubControls.getSpans().then(function(spans) {
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
    return expressPgControls
      .sendRequest({
        method: 'GET',
        path: '/pool-string-insert',
        body: {}
      })
      .then(function(response) {
        expect(response).to.exist;
        expect(response.command).to.equal('INSERT');
        expect(response.rowCount).to.equal(1);
        expect(response.rows.length).to.equal(1);
        expect(response.rows[0].name).to.equal('beaker');
        expect(response.rows[0].email).to.equal('beaker@muppets.com');

        return utils.retry(function() {
          return agentStubControls.getSpans().then(function(spans) {
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
    return expressPgControls
      .sendRequest({
        method: 'GET',
        path: '/pool-config-select',
        body: {}
      })
      .then(function(response) {
        expect(response).to.exist;
        expect(response.command).to.equal('SELECT');
        expect(response.rowCount).to.be.a('number');

        return utils.retry(function() {
          return agentStubControls.getSpans().then(function(spans) {
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
    return expressPgControls
      .sendRequest({
        method: 'GET',
        path: '/pool-config-select-promise',
        body: {}
      })
      .then(function(response) {
        expect(response).to.exist;
        expect(response.command).to.equal('INSERT');
        expect(response.rowCount).to.equal(1);
        expect(response.rows.length).to.equal(1);
        expect(response.rows[0].name).to.equal('beaker');
        expect(response.rows[0].email).to.equal('beaker@muppets.com');

        return utils.retry(function() {
          return agentStubControls.getSpans().then(function(spans) {
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
    return expressPgControls
      .sendRequest({
        method: 'GET',
        path: '/client-string-insert',
        body: {}
      })
      .then(function(response) {
        expect(response).to.exist;
        expect(response.command).to.equal('INSERT');
        expect(response.rowCount).to.equal(1);
        expect(response.rows.length).to.equal(1);
        expect(response.rows[0].name).to.equal('beaker');
        expect(response.rows[0].email).to.equal('beaker@muppets.com');

        return utils.retry(function() {
          return agentStubControls.getSpans().then(function(spans) {
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
    return expressPgControls
      .sendRequest({
        method: 'GET',
        path: '/client-config-select',
        body: {}
      })
      .then(function(response) {
        expect(response).to.exist;
        expect(response.command).to.equal('SELECT');
        expect(response.rowCount).to.be.a('number');

        return utils.retry(function() {
          return agentStubControls.getSpans().then(function(spans) {
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
    return expressPgControls
      .sendRequest({
        method: 'GET',
        path: '/table-doesnt-exist',
        body: {}
      })
      .then(function(response) {
        expect(response).to.exist;
        expect(response.name).to.equal('StatusCodeError');
        expect(response.statusCode).to.equal(500);
        // 42P01 -> PostgreSQL's code for "relation does not exist"
        expect(response.message).to.include('42P01');

        return utils.retry(function() {
          return agentStubControls.getSpans().then(function(spans) {
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
            // expect(pgSpan.data.pg.error).to.equal('blah');
            expect(pgSpan.ec).to.equal(1);
            expect(pgSpan.data.pg.stmt).to.equal('SELECT name, email FROM nonexistanttable');
          });
        });
      });
  });

  it('must not break vanilla postgres (not tracing)', function() {
    return expressPgControls
      .sendRequest({
        method: 'GET',
        path: '/pool-string-insert',
        suppressTracing: true
      })
      .then(function(response) {
        expect(response).to.exist;
        expect(response.command).to.equal('INSERT');
        expect(response.rowCount).to.equal(1);
        expect(response.rows.length).to.equal(1);
        expect(response.rows[0].name).to.equal('beaker');
        expect(response.rows[0].email).to.equal('beaker@muppets.com');

        return utils.retry(function() {
          return agentStubControls.getSpans().then(function(spans) {
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

  it('must trace transactions', function() {
    return expressPgControls
      .sendRequest({
        method: 'GET',
        path: '/transaction',
        body: {}
      })
      .then(function(response) {
        expect(response).to.exist;
        expect(response.command).to.equal('INSERT');
        expect(response.rowCount).to.equal(1);
        expect(response.rows.length).to.equal(1);
        expect(response.rows[0].name).to.equal('trans2');
        expect(response.rows[0].email).to.equal('nodejstests@blah');

        return utils.retry(function() {
          return agentStubControls.getSpans().then(function(spans) {
            var entrySpans = utils.getSpansByName(spans, 'node.http.server');
            var pgSpans = utils.getSpansByName(spans, 'postgres');

            expect(entrySpans).to.have.lengthOf(1);
            expect(pgSpans).to.have.lengthOf(4);

            var entrySpan = entrySpans[0];
            var pgSpan1 = pgSpans[0];
            var pgSpan2 = pgSpans[1];
            var pgSpan3 = pgSpans[2];
            var pgSpan4 = pgSpans[3];

            expect(pgSpan1.f.e).to.equal(String(expressPgControls.getPid()));
            expect(pgSpan1.t).to.equal(entrySpan.t);
            expect(pgSpan1.p).to.equal(entrySpan.s);
            expect(pgSpan1.n).to.equal('postgres');
            expect(pgSpan1.f.e).to.equal(String(expressPgControls.getPid()));
            expect(pgSpan1.async).to.equal(false);
            expect(pgSpan1.error).to.equal(false);
            expect(pgSpan1.ec).to.equal(0);
            expect(pgSpan1.data.pg.stmt).to.equal('BEGIN');

            expect(pgSpan2.f.e).to.equal(String(expressPgControls.getPid()));
            expect(pgSpan2.t).to.equal(entrySpan.t);
            expect(pgSpan2.p).to.equal(entrySpan.s);
            expect(pgSpan2.n).to.equal('postgres');
            expect(pgSpan2.f.e).to.equal(String(expressPgControls.getPid()));
            expect(pgSpan2.async).to.equal(false);
            expect(pgSpan2.error).to.equal(false);
            expect(pgSpan2.ec).to.equal(0);
            expect(pgSpan2.data.pg.stmt).to.equal('INSERT INTO users(name, email) VALUES($1, $2) RETURNING *');

            expect(pgSpan3.f.e).to.equal(String(expressPgControls.getPid()));
            expect(pgSpan3.t).to.equal(entrySpan.t);
            expect(pgSpan3.p).to.equal(entrySpan.s);
            expect(pgSpan3.n).to.equal('postgres');
            expect(pgSpan3.f.e).to.equal(String(expressPgControls.getPid()));
            expect(pgSpan3.async).to.equal(false);
            expect(pgSpan3.error).to.equal(false);
            expect(pgSpan3.ec).to.equal(0);
            expect(pgSpan3.data.pg.stmt).to.equal('INSERT INTO users(name, email) VALUES($1, $2) RETURNING *');

            expect(pgSpan4.f.e).to.equal(String(expressPgControls.getPid()));
            expect(pgSpan4.t).to.equal(entrySpan.t);
            expect(pgSpan4.p).to.equal(entrySpan.s);
            expect(pgSpan4.n).to.equal('postgres');
            expect(pgSpan4.f.e).to.equal(String(expressPgControls.getPid()));
            expect(pgSpan4.async).to.equal(false);
            expect(pgSpan4.error).to.equal(false);
            expect(pgSpan4.ec).to.equal(0);
            expect(pgSpan4.data.pg.stmt).to.equal('COMMIT');
          });
        });
      });
  });
});
