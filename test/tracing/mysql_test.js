'use strict';

var expect = require('chai').expect;

var supportedVersion = require('../../src/tracing/index').supportedVersion;
var expressMysqlControls = require('../apps/expressMysqlControls');
var agentStubControls = require('../apps/agentStubControls');
var config = require('../config');
var utils = require('../utils');

describe('tracing/mysql', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  this.timeout(config.getTestTimeout());

  agentStubControls.registerTestHooks();
  expressMysqlControls.registerTestHooks();

  beforeEach(function() {
    return agentStubControls.waitUntilAppIsCompletelyInitialized(expressMysqlControls.getPid());
  });

  it('must trace queries', function() {
    return expressMysqlControls.addValue(42)
    .then(function() {
      return utils.retry(function() {
        return agentStubControls.getSpans()
        .then(function(spans) {
          var entrySpan = utils.expectOneMatching(spans, function(span) {
            expect(span.n).to.equal('node.http.server');
            expect(span.f.e).to.equal(String(expressMysqlControls.getPid()));
          });

          utils.expectOneMatching(spans, function(span) {
            expect(span.t).to.equal(entrySpan.t);
            expect(span.p).to.equal(entrySpan.s);
            expect(span.n).to.equal('mysql');
            expect(span.f.e).to.equal(String(expressMysqlControls.getPid()));
            expect(span.async).to.equal(false);
            expect(span.error).to.equal(false);
            expect(span.ec).to.equal(0);
            expect(span.data.mysql.stmt).to.equal('INSERT INTO random_values (value) VALUES (?)');
          });
        });
      });
    });
  });

  it('must trace insert and get queries', function() {
    return expressMysqlControls.addValue(43)
    .then(function() {
      return expressMysqlControls.getValues();
    })
    .then(function(values) {
      expect(values).to.contain(43);

      return utils.retry(function() {
        return agentStubControls.getSpans()
        .then(function(spans) {
          var postEntrySpan = utils.expectOneMatching(spans, function(span) {
            expect(span.n).to.equal('node.http.server');
            expect(span.f.e).to.equal(String(expressMysqlControls.getPid()));
            expect(span.data.http.method).to.equal('POST');
          });

          utils.expectOneMatching(spans, function(span) {
            expect(span.t).to.equal(postEntrySpan.t);
            expect(span.p).to.equal(postEntrySpan.s);
            expect(span.n).to.equal('mysql');
            expect(span.f.e).to.equal(String(expressMysqlControls.getPid()));
            expect(span.async).to.equal(false);
            expect(span.error).to.equal(false);
            expect(span.ec).to.equal(0);
            expect(span.data.mysql.stmt).to.equal('INSERT INTO random_values (value) VALUES (?)');
            expect(span.data.mysql.host).to.equal(process.env.MYSQL_HOST);
            expect(span.data.mysql.port).to.equal(Number(process.env.MYSQL_PORT));
            expect(span.data.mysql.user).to.equal(process.env.MYSQL_USER);
            expect(span.data.mysql.db).to.equal(process.env.MYSQL_DB);
          });

          var getEntrySpan = utils.expectOneMatching(spans, function(span) {
            expect(span.n).to.equal('node.http.server');
            expect(span.f.e).to.equal(String(expressMysqlControls.getPid()));
            expect(span.data.http.method).to.equal('GET');
          });

          utils.expectOneMatching(spans, function(span) {
            expect(span.t).to.equal(getEntrySpan.t);
            expect(span.p).to.equal(getEntrySpan.s);
            expect(span.n).to.equal('mysql');
            expect(span.f.e).to.equal(String(expressMysqlControls.getPid()));
            expect(span.async).to.equal(false);
            expect(span.error).to.equal(false);
            expect(span.ec).to.equal(0);
            expect(span.data.mysql.stmt).to.equal('SELECT value FROM random_values');
            expect(span.data.mysql.host).to.equal(process.env.MYSQL_HOST);
            expect(span.data.mysql.port).to.equal(Number(process.env.MYSQL_PORT));
            expect(span.data.mysql.user).to.equal(process.env.MYSQL_USER);
            expect(span.data.mysql.db).to.equal(process.env.MYSQL_DB);
          });
        });
      });
    });
  });
});
