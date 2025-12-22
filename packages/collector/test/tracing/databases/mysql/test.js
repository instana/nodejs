/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2017
 */

'use strict';

const expect = require('chai').expect;
const { fail } = expect;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const testUtils = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

mochaSuiteFn('tracing/mysql', function () {
  this.timeout(config.getTestTimeout() * 10);

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  const drivers = ['mysql', 'mysql-cluster', 'mysql2', 'mysql2/promises'];
  const mysql2Versions = ['latest', 'v3.11.4'];
  const executionModes = [false, true];

  drivers.forEach(driverMode => {
    if (driverMode === 'mysql2') {
      // Handling for 'mysql2' with different versions
      mysql2Versions.forEach(version => {
        executionModes.forEach(useExecute => {
          registerSuite.call(this, agentControls, driverMode, useExecute, version);
        });
      });
    } else {
      // Generic handling for other drivers
      executionModes.forEach(useExecute => {
        registerSuite.call(this, agentControls, driverMode, useExecute, 'latest');
      });
    }
  });
});

function registerSuite(agentControls, driverMode, useExecute, mysql2Version) {
  if ((driverMode === 'mysql' || driverMode === 'mysql-cluster') && useExecute) {
    // Not applicable, mysql does not provide an execute function, only the query function whereas mysql2 provides both.
    return;
  }
  // NOTE: require-mock is not working with esm apps. There is also no need to run the ESM APP for all versions.
  // TODO: Support for mocking `import` in ESM apps is planned under INSTA-788.
  if (process.env.RUN_ESM && mysql2Version !== 'latest') return;

  describe(`driver mode: ${driverMode} version: ${mysql2Version || 'default'}, access function: ${
    useExecute ? 'execute' : 'query'
  }`, () => {
    const env = {
      DRIVER_MODE: driverMode,
      MYSQL2_VERSION: mysql2Version
    };

    if (useExecute) {
      env.USE_EXECUTE = 'true';
    }

    test(env, agentControls);
  });

  describe('suppressed', function () {
    const env = {
      DRIVER_MODE: driverMode,
      MYSQL2_VERSION: mysql2Version
    };
    if (useExecute) {
      env.USE_EXECUTE = 'true';
    }
    let controls;

    before(async () => {
      controls = new ProcessControls({
        dirname: __dirname,
        useGlobalAgent: true,
        env
      });

      await controls.startAndWaitForAgentConnection(5000, Date.now() * 30 * 1000);
    });

    beforeEach(async () => {
      await agentControls.clearReceivedTraceData();
    });

    after(async () => {
      await controls.stop();
    });

    afterEach(async () => {
      await controls.clearIpcMessages();
    });

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

function test(env, agentControls) {
  let controls;

  before(async () => {
    controls = new ProcessControls({
      dirname: __dirname,
      useGlobalAgent: true,
      env
    });

    await controls.startAndWaitForAgentConnection(5000, Date.now() * 30 * 1000);
  });

  beforeEach(async () => {
    await agentControls.clearReceivedTraceData();
  });

  after(async () => {
    await controls.stop();
  });

  afterEach(async () => {
    await controls.clearIpcMessages();
  });

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
            // 1 x mysql
            // 1 x httpserver
            // Expect 2 spans if OTEL is disabled, or 3 if enabled — except when driverMode is 'mysql2/promises'.
            expect(spans.length).to.equal(2);
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
            // 2 x mysql
            // 2 x httpserver
            expect(spans.length).to.equal(4);
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
            // 1 x mysql
            // 1 x httpserver
            // 1 x httpclient
            // Expect 3 spans if OTEL is disabled, or 4 if enabled — except when driverMode is 'mysql2/promises'.
            expect(spans.length).to.equal(3);
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

  it('must replace stack trace with error stack when query fails', () =>
    controls
      .sendRequest({
        method: 'POST',
        path: '/error'
      })
      .then(() =>
        testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            expect(spans.length).to.equal(2);
            const entrySpan = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.f.e).to.equal(String(controls.getPid())),
              span => expect(span.f.h).to.equal('agent-stub-uuid')
            ]);

            const mysqlSpan = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.t).to.equal(entrySpan.t),
              span => expect(span.p).to.equal(entrySpan.s),
              span => expect(span.n).to.equal('mysql'),
              span => expect(span.k).to.equal(constants.EXIT),
              span => expect(span.f.e).to.equal(String(controls.getPid())),
              span => expect(span.f.h).to.equal('agent-stub-uuid'),
              span => expect(span.ec).to.equal(1),
              span => expect(span.data.mysql.error).to.exist
            ]);

            expect(mysqlSpan.stack).to.exist;
          })
        )
      ));
}
