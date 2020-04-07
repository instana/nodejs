'use strict';

const semver = require('semver');
const expect = require('chai').expect;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const testUtils = require('../../../../../core/test/test_util');

let controls;
let agentStubControls;

describe('tracing/mysql', function() {
  if (!supportedVersion(process.versions.node) || semver.lt(process.versions.node, '6.0.0')) {
    // mysql2 recently started to use ES6 syntax.
    return;
  }

  controls = require('./controls');
  agentStubControls = require('../../../apps/agentStubControls');

  this.timeout(config.getTestTimeout());

  agentStubControls.registerTestHooks();

  ['mysql', 'mysql-cluster', 'mysql2', 'mysql2/promises'].forEach(driverMode => {
    [false, true].forEach(function(useExecute) {
      // connection.query or connection.execute
      registerSuite.bind(this)(driverMode, useExecute);
    });
  });
});

function registerSuite(driverMode, useExecute) {
  if ((driverMode === 'mysql' || driverMode === 'mysql-cluster') && useExecute) {
    // Not applicable, mysql does not provide an execute function, only the query function whereas mysql2 provides both.
    return;
  }

  describe(`driver mode: ${driverMode}, access function: ${useExecute ? 'execute' : 'query'}`, () => {
    const opts = {
      useExecute
    };

    opts.driverMode = driverMode;
    controls.registerTestHooks(opts);
    test();
  });
}

function test() {
  beforeEach(() => agentStubControls.waitUntilAppIsCompletelyInitialized(controls.getPid()));

  it('must trace queries', () =>
    controls.addValue(42).then(() =>
      testUtils.retry(() =>
        agentStubControls.getSpans().then(spans => {
          const entrySpan = testUtils.expectAtLeastOneMatching(spans, span => {
            expect(span.n).to.equal('node.http.server');
            expect(span.f.e).to.equal(String(controls.getPid()));
            expect(span.f.h).to.equal('agent-stub-uuid');
          });

          testUtils.expectAtLeastOneMatching(spans, span => {
            expect(span.t).to.equal(entrySpan.t);
            expect(span.p).to.equal(entrySpan.s);
            expect(span.n).to.equal('mysql');
            expect(span.k).to.equal(constants.EXIT);
            expect(span.f.e).to.equal(String(controls.getPid()));
            expect(span.f.h).to.equal('agent-stub-uuid');
            expect(span.async).to.not.exist;
            expect(span.error).to.not.exist;
            expect(span.ec).to.equal(0);
            expect(span.data.mysql.stmt).to.equal('INSERT INTO random_values (value) VALUES (?)');
          });
        })
      )
    ));

  it('must trace insert and get queries', () =>
    controls
      .addValue(43)
      .then(() => controls.getValues())
      .then(values => {
        expect(values).to.contain(43);

        // controls.getValues().then(() => {
        return testUtils.retry(() =>
          agentStubControls.getSpans().then(spans => {
            const postEntrySpan = testUtils.expectAtLeastOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.f.e).to.equal(String(controls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.data.http.method).to.equal('POST');
            });
            testUtils.expectAtLeastOneMatching(spans, span => {
              expect(span.t).to.equal(postEntrySpan.t);
              expect(span.p).to.equal(postEntrySpan.s);
              expect(span.n).to.equal('mysql');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.f.e).to.equal(String(controls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(0);
              expect(span.data.mysql.stmt).to.equal('INSERT INTO random_values (value) VALUES (?)');
              expect(span.data.mysql.host).to.equal(process.env.MYSQL_HOST);
              expect(span.data.mysql.port).to.equal(Number(process.env.MYSQL_PORT));
              expect(span.data.mysql.user).to.equal(process.env.MYSQL_USER);
              expect(span.data.mysql.db).to.equal(process.env.MYSQL_DB);
            });
            const getEntrySpan = testUtils.expectAtLeastOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.f.e).to.equal(String(controls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.data.http.method).to.equal('GET');
            });
            testUtils.expectAtLeastOneMatching(spans, span => {
              expect(span.t).to.equal(getEntrySpan.t);
              expect(span.p).to.equal(getEntrySpan.s);
              expect(span.n).to.equal('mysql');
              expect(span.k).to.equal(constants.EXIT);
              expect(span.f.e).to.equal(String(controls.getPid()));
              expect(span.f.h).to.equal('agent-stub-uuid');
              expect(span.async).to.not.exist;
              expect(span.error).to.not.exist;
              expect(span.ec).to.equal(0);
              expect(span.data.mysql.stmt).to.equal('SELECT value FROM random_values');
              expect(span.data.mysql.host).to.equal(process.env.MYSQL_HOST);
              expect(span.data.mysql.port).to.equal(Number(process.env.MYSQL_PORT));
              expect(span.data.mysql.user).to.equal(process.env.MYSQL_USER);
              expect(span.data.mysql.db).to.equal(process.env.MYSQL_DB);
            });
          })
        );
      }));

  it('must keep the tracing context', () =>
    controls.addValueAndDoCall(1302).then(spanContext => {
      expect(spanContext).to.exist;
      spanContext = JSON.parse(spanContext);
      expect(spanContext.s).to.exist;
      expect(spanContext.t).to.exist;

      return testUtils.retry(() =>
        agentStubControls.getSpans().then(spans => {
          const postEntrySpan = testUtils.expectAtLeastOneMatching(spans, span => {
            expect(span.n).to.equal('node.http.server');
            expect(span.f.e).to.equal(String(controls.getPid()));
            expect(span.f.h).to.equal('agent-stub-uuid');
            expect(span.data.http.method).to.equal('POST');
          });

          testUtils.expectAtLeastOneMatching(spans, span => {
            expect(span.t).to.equal(postEntrySpan.t);
            expect(span.p).to.equal(postEntrySpan.s);
            expect(span.n).to.equal('mysql');
            expect(span.k).to.equal(constants.EXIT);
            expect(span.f.e).to.equal(String(controls.getPid()));
            expect(span.f.h).to.equal('agent-stub-uuid');
            expect(span.async).to.not.exist;
            expect(span.error).to.not.exist;
            expect(span.ec).to.equal(0);
            expect(span.data.mysql.stmt).to.equal('INSERT INTO random_values (value) VALUES (?)');
            expect(span.data.mysql.host).to.equal(process.env.MYSQL_HOST);
            expect(span.data.mysql.port).to.equal(Number(process.env.MYSQL_PORT));
            expect(span.data.mysql.user).to.equal(process.env.MYSQL_USER);
            expect(span.data.mysql.db).to.equal(process.env.MYSQL_DB);
          });

          testUtils.expectAtLeastOneMatching(spans, span => {
            expect(span.t).to.equal(postEntrySpan.t);
            expect(span.p).to.equal(postEntrySpan.s);
            expect(span.n).to.equal('node.http.client');
            expect(span.k).to.equal(constants.EXIT);
            expect(span.f.e).to.equal(String(controls.getPid()));
            expect(span.f.h).to.equal('agent-stub-uuid');
            expect(span.async).to.not.exist;
            expect(span.error).to.not.exist;
            expect(span.ec).to.equal(0);
            expect(span.data.http.method).to.equal('GET');
            expect(span.data.http.url).to.match(/http:\/\/127\.0\.0\.1:/);
            expect(span.data.http.status).to.equal(200);

            expect(span.t).to.equal(spanContext.t);
            expect(span.p).to.equal(spanContext.s);
          });
        })
      );
    }));
}
