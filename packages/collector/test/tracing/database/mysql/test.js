/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2017
 */

'use strict';

const expect = require('chai').expect;
const { fail } = expect;
const semver = require('semver');

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const testUtils = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('tracing/mysql', function () {
  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  ['mysql', 'mysql-cluster', 'mysql2', 'mysql2/promises'].forEach(driverMode => {
    [false, true].forEach(function (useExecute) {
      // connection.query or connection.execute
      registerSuite.bind(this)(agentControls, driverMode, useExecute);
    });
  });
});

function registerSuite(agentControls, driverMode, useExecute) {
  if ((driverMode === 'mysql' || driverMode === 'mysql-cluster') && useExecute) {
    // Not applicable, mysql does not provide an execute function, only the query function whereas mysql2 provides both.
    return;
  }

  let mochaSuiteFnForDriverMode = describe;
  if (driverMode.includes('mysql2') && semver.lt(process.versions.node, '14.0.0')) {
    // mysql2 does no longer support Node.js < 14, see https://github.com/sidorares/node-mysql2/issues/1965
    mochaSuiteFnForDriverMode = describe.skip;
  }

  mochaSuiteFnForDriverMode(`driver mode: ${driverMode}, access function: ${useExecute ? 'execute' : 'query'}`, () => {
    const env = {
      DRIVER_MODE: driverMode
    };
    if (useExecute) {
      env.USE_EXECUTE = 'true';
    }

    const controls = new ProcessControls({
      dirname: __dirname,
      useGlobalAgent: true,
      env
    });
    ProcessControls.setUpHooks(controls);

    test(controls, agentControls);
  });

  mochaSuiteFnForDriverMode('suppressed', function () {
    const env = {
      DRIVER_MODE: driverMode
    };
    if (useExecute) {
      env.USE_EXECUTE = 'true';
    }

    const controls = new ProcessControls({
      dirname: __dirname,
      useGlobalAgent: true,
      env
    });

    ProcessControls.setUpHooks(controls);

    it('should not trace', async function () {
      await controls.sendRequest({
        method: 'POST',
        path: '/values',
        qs: {
          value: 42
        },
        suppressTracing: true
      });

      return testUtils
        .retry(() => testUtils.delay(1000))
        .then(() => agentControls.getSpans())
        .then(spans => {
          if (spans.length > 0) {
            fail(`Unexpected spans ${testUtils.stringifyItems(spans)}.`);
          }
        });
    });
  });
}

function test(controls, agentControls) {
  it('must trace queries', () =>
    controls
      .sendRequest({
        method: 'POST',
        path: '/values',
        qs: {
          value: 42
        }
      })
      .then(() =>
        testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const entrySpan = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.f.e).to.equal(String(controls.getPid())),
              span => expect(span.f.h).to.equal('agent-stub-uuid')
            ]);

            testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.t).to.equal(entrySpan.t),
              span => expect(span.p).to.equal(entrySpan.s),
              span => expect(span.n).to.equal('mysql'),
              span => expect(span.k).to.equal(constants.EXIT),
              span => expect(span.f.e).to.equal(String(controls.getPid())),
              span => expect(span.f.h).to.equal('agent-stub-uuid'),
              span => expect(span.async).to.not.exist,
              span => expect(span.error).to.not.exist,
              span => expect(span.ec).to.equal(0),
              span => expect(span.data.mysql.stmt).to.equal('INSERT INTO random_values (value) VALUES (?)')
            ]);
          })
        )
      ));

  it('must trace insert and get queries', () =>
    controls
      .sendRequest({
        method: 'POST',
        path: '/values',
        qs: {
          value: 43
        }
      })
      .then(() =>
        controls.sendRequest({
          method: 'GET',
          path: '/values'
        })
      )
      .then(values => {
        expect(values).to.contain(43);

        return testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const postEntrySpan = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.f.e).to.equal(String(controls.getPid())),
              span => expect(span.f.h).to.equal('agent-stub-uuid'),
              span => expect(span.data.http.method).to.equal('POST')
            ]);
            testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.t).to.equal(postEntrySpan.t),
              span => expect(span.p).to.equal(postEntrySpan.s),
              span => expect(span.n).to.equal('mysql'),
              span => expect(span.k).to.equal(constants.EXIT),
              span => expect(span.f.e).to.equal(String(controls.getPid())),
              span => expect(span.f.h).to.equal('agent-stub-uuid'),
              span => expect(span.async).to.not.exist,
              span => expect(span.error).to.not.exist,
              span => expect(span.ec).to.equal(0),
              span => expect(span.data.mysql.stmt).to.equal('INSERT INTO random_values (value) VALUES (?)'),
              span => expect(span.data.mysql.host).to.equal(process.env.MYSQL_HOST),
              span => expect(span.data.mysql.port).to.equal(Number(process.env.MYSQL_PORT)),
              span => expect(span.data.mysql.user).to.equal(process.env.MYSQL_USER),
              span => expect(span.data.mysql.db).to.equal(process.env.MYSQL_DB)
            ]);
            const getEntrySpan = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.f.e).to.equal(String(controls.getPid())),
              span => expect(span.f.h).to.equal('agent-stub-uuid'),
              span => expect(span.data.http.method).to.equal('GET')
            ]);
            testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.t).to.equal(getEntrySpan.t),
              span => expect(span.p).to.equal(getEntrySpan.s),
              span => expect(span.n).to.equal('mysql'),
              span => expect(span.k).to.equal(constants.EXIT),
              span => expect(span.f.e).to.equal(String(controls.getPid())),
              span => expect(span.f.h).to.equal('agent-stub-uuid'),
              span => expect(span.async).to.not.exist,
              span => expect(span.error).to.not.exist,
              span => expect(span.ec).to.equal(0),
              span => expect(span.data.mysql.stmt).to.equal('SELECT value FROM random_values'),
              span => expect(span.data.mysql.host).to.equal(process.env.MYSQL_HOST),
              span => expect(span.data.mysql.port).to.equal(Number(process.env.MYSQL_PORT)),
              span => expect(span.data.mysql.user).to.equal(process.env.MYSQL_USER),
              span => expect(span.data.mysql.db).to.equal(process.env.MYSQL_DB)
            ]);
          })
        );
      }));

  it('must keep the tracing context', () =>
    controls
      .sendRequest({
        method: 'POST',
        path: '/valuesAndCall',
        qs: {
          value: 1302
        }
      })
      .then(spanContext => {
        expect(spanContext).to.exist;
        expect(spanContext.s).to.exist;
        expect(spanContext.t).to.exist;

        return testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const postEntrySpan = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.f.e).to.equal(String(controls.getPid())),
              span => expect(span.f.h).to.equal('agent-stub-uuid'),
              span => expect(span.data.http.method).to.equal('POST')
            ]);

            testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.t).to.equal(postEntrySpan.t),
              span => expect(span.p).to.equal(postEntrySpan.s),
              span => expect(span.n).to.equal('mysql'),
              span => expect(span.k).to.equal(constants.EXIT),
              span => expect(span.f.e).to.equal(String(controls.getPid())),
              span => expect(span.f.h).to.equal('agent-stub-uuid'),
              span => expect(span.async).to.not.exist,
              span => expect(span.error).to.not.exist,
              span => expect(span.ec).to.equal(0),
              span => expect(span.data.mysql.stmt).to.equal('INSERT INTO random_values (value) VALUES (?)'),
              span => expect(span.data.mysql.host).to.equal(process.env.MYSQL_HOST),
              span => expect(span.data.mysql.port).to.equal(Number(process.env.MYSQL_PORT)),
              span => expect(span.data.mysql.user).to.equal(process.env.MYSQL_USER),
              span => expect(span.data.mysql.db).to.equal(process.env.MYSQL_DB)
            ]);

            testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.t).to.equal(postEntrySpan.t),
              span => expect(span.p).to.equal(postEntrySpan.s),
              span => expect(span.n).to.equal('node.http.client'),
              span => expect(span.k).to.equal(constants.EXIT),
              span => expect(span.f.e).to.equal(String(controls.getPid())),
              span => expect(span.f.h).to.equal('agent-stub-uuid'),
              span => expect(span.async).to.not.exist,
              span => expect(span.error).to.not.exist,
              span => expect(span.ec).to.equal(0),
              span => expect(span.data.http.method).to.equal('GET'),
              span => expect(span.data.http.url).to.match(/http:\/\/127\.0\.0\.1:/),
              span => expect(span.data.http.status).to.equal(200),
              span => expect(span.t).to.equal(spanContext.t),
              span => expect(span.p).to.equal(spanContext.s)
            ]);
          })
        );
      }));
}
