/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const dns = require('dns').promises;
const path = require('path');
const expect = require('chai').expect;

const { supportedVersion, constants } = require('@instana/core').tracing;
const testUtils = require('../../../../../core/test/test_util');
const config = require('../../../../../core/test/config');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

if (testUtils.isCI() && !process.env.DB2_CONNECTION_STR) {
  throw new Error(
    'No connection string for IBM DB2, please make sure the environment variable DB2_CONNECTION_STR is set.'
  );
}

const DB2_CONN_STR =
  process.env.DB2_CONNECTION_STR || 'HOSTNAME=localhost;UID=node;PWD=nodepw;PORT=58885;PROTOCOL=TCPIP';
let DB2_CONN_STR_ALTERNATIVE;
let EXPECTED_DB2_CONN_STR;
let EXPECTED_DB2_CONN_STR_ALTERNATIVE;
const DB2_HOSTNAME = /HOSTNAME=([^;]+)/.exec(DB2_CONN_STR)[1];

// NOTE: DB2 has a limitation of 8 chars
const DB2_DATABASE_NAME = 'nodedb';
let TABLE_NAME_1;
let TABLE_NAME_2;
let TABLE_NAME_3;
const DELAY_TIMEOUT_IN_MS = 2000;

const DB2_CLOSE_TIMEOUT_IN_MS = 1000;

const testTimeout = Math.max(50000, config.getTestTimeout());
const retryTime = 10 * 1000;

const generateTableName = () => {
  const randomStr = Array(8)
    .fill('abcdefghijklmnopqrstuvwxyz')
    .map(function (x) {
      return x[Math.floor(Math.random() * x.length)];
    })
    .join('');

  return randomStr;
};

const verifySpans = (agentControls, controls, options = {}) =>
  agentControls.getSpans().then(spans => {
    if (options.expectSpans === false) {
      expect(spans).to.be.empty;
      return;
    }

    const entrySpan = testUtils.expectAtLeastOneMatching(spans, [
      span => expect(span.n).to.equal('node.http.server'),
      span => expect(span.f.e).to.equal(String(controls.getPid())),
      span => expect(span.f.h).to.equal('agent-stub-uuid')
    ]);

    if (options.expectNoDb2Span) {
      expect(spans.length).to.equal(1);
      return;
    }

    if (options.numberOfSpansAtLeast) {
      expect(spans).to.have.lengthOf.at.least(options.numberOfSpansAtLeast);
    } else {
      expect(spans.length).to.equal(options.numberOfSpans || 2);
    }

    if (options.verifyCustom) return options.verifyCustom(entrySpan, spans);

    testUtils.expectAtLeastOneMatching(spans, [
      span => expect(span.t).to.equal(entrySpan.t),
      span => expect(span.p).to.equal(entrySpan.s),
      span => expect(span.n).to.equal('ibmdb2'),
      span => expect(span.k).to.equal(constants.EXIT),
      span => expect(span.f.e).to.equal(String(controls.getPid())),
      span => expect(span.f.h).to.equal('agent-stub-uuid'),
      span => expect(span.data.db2.stmt).to.equal(options.stmt || 'select 1 from sysibm.sysdummy1'),
      span => expect(span.data.db2.dsn).to.equal(`${EXPECTED_DB2_CONN_STR};DATABASE=${DB2_DATABASE_NAME}`),
      span => expect(span.async).to.not.exist,
      span =>
        options.error
          ? expect(span.data.db2.error).to.contain(options.error)
          : expect(span.data.db2.error).to.not.exist,
      span => (options.error ? expect(span.ec).to.equal(1) : expect(span.ec).to.equal(0))
    ]);
  });

// The db2 docker container needs a longer time to bootstrap. Please check the docker logs if
// the container is up.
mochaSuiteFn('tracing/db2', function () {
  this.timeout(testTimeout);

  before(async () => {
    // We need a second connection string pointing to the same DB2 instance, for the test "call two different hosts". We
    // produce one by resolving the host name in the original connection string to an IP.
    const dnsLookupResult = await dns.lookup(DB2_HOSTNAME, { family: 4 });
    if (dnsLookupResult && dnsLookupResult.address) {
      DB2_CONN_STR_ALTERNATIVE = DB2_CONN_STR.replace(DB2_HOSTNAME, dnsLookupResult.address);
    } else {
      DB2_CONN_STR_ALTERNATIVE = DB2_CONN_STR.replace('localhost', dnsLookupResult.address);
    }

    // The EXPECTED_... variables are what the tracer will capture (with the password redacted).
    EXPECTED_DB2_CONN_STR = DB2_CONN_STR.replace(/PWD=.*?(?=;)/, 'PWD=<redacted>');
    EXPECTED_DB2_CONN_STR_ALTERNATIVE = DB2_CONN_STR_ALTERNATIVE.replace(/PWD=.*?(?=;)/, 'PWD=<redacted>');
  });

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;
  let controls;

  describe('tracing is active', function () {
    before(async () => {
      TABLE_NAME_1 = generateTableName();
      TABLE_NAME_2 = generateTableName();
      TABLE_NAME_3 = generateTableName();

      controls = new ProcessControls({
        dirname: __dirname,
        useGlobalAgent: true,
        env: {
          DB2_CONN_STR,
          DB2_CONN_STR_ALTERNATIVE,
          DB2_DATABASE_NAME,
          DB2_TABLE_NAME_1: TABLE_NAME_1,
          DB2_TABLE_NAME_2: TABLE_NAME_2,
          DB2_TABLE_NAME_3: TABLE_NAME_3,
          DB2_CLOSE_TIMEOUT_IN_MS
        }
      });

      await controls.startAndWaitForAgentConnection(retryTime, Date.now() + testTimeout - 5000);
    });

    beforeEach(async () => {
      await agentControls.clearReceivedTraceData();
    });

    after(async () => {
      await controls.sendRequest({
        method: 'DELETE',
        path: '/tables'
      });

      await controls.sendRequest({
        method: 'DELETE',
        path: '/conn'
      });

      await controls.stop();
    });

    it('must trace query promise', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/query-promise'
        })
        .then(() => testUtils.retry(() => verifySpans(agentControls, controls)));
    });

    it('[with error] must trace query promise', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/query-promise?err=true'
        })
        .then(() =>
          testUtils.retry(() =>
            verifySpans(agentControls, controls, {
              stmt: 'select invalid query',
              error: '[IBM][CLI Driver][DB2/LINUXX8664] SQL0104N  An unexpected token'
            })
          )
        );
    });

    it('must trace query cb (2 args)', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/query-cb'
        })
        .then(() => testUtils.retry(() => verifySpans(agentControls, controls)));
    });

    it('must trace query cb (3 args)', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/query-cb?args=3'
        })
        .then(() =>
          testUtils.retry(() =>
            verifySpans(agentControls, controls, {
              stmt: 'select creator, name from sysibm.systables where 1 = ?'
            })
          )
        );
    });

    it('[with error] must trace query cb', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/query-cb?err=true'
        })
        .then(() =>
          testUtils.retry(() =>
            verifySpans(agentControls, controls, {
              stmt: 'select invalid query',
              error: '[IBM][CLI Driver][DB2/LINUXX8664] SQL0104N  An unexpected token'
            })
          )
        );
    });

    it('must trace query sync', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/query-sync'
        })
        .then(() => testUtils.retry(() => verifySpans(agentControls, controls)));
    });

    it('[with connection err] must trace query sync', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/query-sync?err=conn'
        })
        .then(() =>
          testUtils.retry(() =>
            verifySpans(agentControls, controls, {
              stmt: 'select invalid query',
              error: 'Connection not open.'
            })
          )
        );
    });

    it('[with query err] must trace query sync', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/query-sync?err=query'
        })
        .then(() =>
          testUtils.retry(() =>
            verifySpans(agentControls, controls, {
              stmt: 'select invalid query',
              error: 'Error: [IBM][CLI Driver][DB2/LINUXX8664] SQL0104N  An unexpected token'
            })
          )
        );
    });

    it('must trace async transaction with sync query', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/transaction-sync'
        })
        .then(() =>
          testUtils.retry(() =>
            verifySpans(agentControls, controls, {
              stmt: `insert into ${TABLE_NAME_1}(COLINT, COLDATETIME, COLTEXT) VALUES (42, null, null)`
            })
          )
        );
    });

    it('must trace async transaction with sync query because of rollback', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/transaction-sync?commit=false'
        })
        .then(() =>
          testUtils.retry(() =>
            verifySpans(agentControls, controls, {
              stmt: `insert into ${TABLE_NAME_1}(COLINT, COLDATETIME, COLTEXT) VALUES (42, null, null)`
            })
          )
        );
    });

    it('must trace sync transaction with sync query', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/transaction-sync?type=sync'
        })
        .then(() =>
          testUtils.retry(() =>
            verifySpans(agentControls, controls, {
              stmt: `insert into ${TABLE_NAME_1}(COLINT, COLDATETIME, COLTEXT) VALUES (42, null, null)`
            })
          )
        );
    });

    it('must trace sync transaction with sync query because of rollback', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/transaction-sync?type=sync&commit=false'
        })
        .then(() =>
          testUtils.retry(() =>
            verifySpans(agentControls, controls, {
              stmt: `insert into ${TABLE_NAME_1}(COLINT, COLDATETIME, COLTEXT) VALUES (42, null, null)`
            })
          )
        );
    });

    it('must trace async transaction with async query', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/transaction-async'
        })
        .then(() =>
          testUtils.retry(() =>
            verifySpans(agentControls, controls, {
              stmt: `insert into ${TABLE_NAME_1}(COLINT, COLDATETIME, COLTEXT) VALUES (42, null, null)`
            })
          )
        );
    });

    it('must trace async transaction with async query because of rollback', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/transaction-async?commit=false'
        })
        .then(() =>
          testUtils.retry(() =>
            verifySpans(agentControls, controls, {
              stmt: `insert into ${TABLE_NAME_1}(COLINT, COLDATETIME, COLTEXT) VALUES (42, null, null)`
            })
          )
        );
    });

    it('must trace sync transaction with async query', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/transaction-async?type=sync'
        })
        .then(() =>
          testUtils.retry(() =>
            verifySpans(agentControls, controls, {
              stmt: `insert into ${TABLE_NAME_1}(COLINT, COLDATETIME, COLTEXT) VALUES (42, null, null)`
            })
          )
        );
    });

    it('must trace sync transaction with async query because of rollback', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/transaction-async?type=sync&commit=false'
        })
        .then(() =>
          testUtils.retry(() =>
            verifySpans(agentControls, controls, {
              stmt: `insert into ${TABLE_NAME_1}(COLINT, COLDATETIME, COLTEXT) VALUES (42, null, null)`
            })
          )
        );
    });

    it('must trace prepare on start', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/prepare-on-start'
        })
        .then(() =>
          testUtils.retry(() =>
            verifySpans(agentControls, controls, {
              stmt: `SELECT * FROM ${TABLE_NAME_1}`,
              numberOfSpans: 3
            })
          )
        );
    });

    it('[executeSync] must trace prepare on start', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/prepare-on-start?sync=true'
        })
        .then(() =>
          testUtils.retry(() =>
            verifySpans(agentControls, controls, {
              stmt: `SELECT * FROM ${TABLE_NAME_1}`,
              numberOfSpans: 3
            })
          )
        );
    });

    it('[skip close] must trace prepare on start', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/prepare-on-start?skipClose=true'
        })
        .then(() => testUtils.delay(DB2_CLOSE_TIMEOUT_IN_MS))
        .then(() =>
          testUtils.retry(() =>
            verifySpans(agentControls, controls, {
              stmt: `SELECT * FROM ${TABLE_NAME_1}`,
              error: 'Error: [IBM][CLI Driver] CLI0115E  Invalid cursor state. SQLSTATE=24000',
              numberOfSpans: 3,
              verifyCustom: (entrySpan, spans) => {
                testUtils.expectAtLeastOneMatching(spans, [
                  span => expect(span.t).to.equal(entrySpan.t),
                  span => expect(span.p).to.equal(entrySpan.s),
                  span => expect(span.n).to.equal('ibmdb2'),
                  span => expect(span.k).to.equal(constants.EXIT),
                  span => expect(span.f.e).to.equal(String(controls.getPid())),
                  span => expect(span.f.h).to.equal('agent-stub-uuid'),
                  span => expect(span.data.db2.stmt).to.equal(`SELECT * FROM ${TABLE_NAME_1}`),
                  span => expect(span.data.db2.dsn).to.equal(`${EXPECTED_DB2_CONN_STR};DATABASE=${DB2_DATABASE_NAME}`),
                  span => expect(span.async).to.not.exist,
                  span =>
                    expect(span.data.db2.error).to.eql(
                      `'result.closeSync' was not called within ${DB2_CLOSE_TIMEOUT_IN_MS}ms.`
                    ),
                  span => expect(span.ec).to.equal(1)
                ]);
              }
            })
          )
        );
    });

    it('must trace prepare/execute with two different http endpoints', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/prepare-in-http'
        })
        .then(() =>
          controls.sendRequest({
            method: 'GET',
            path: '/execute-in-http'
          })
        )
        .then(() =>
          testUtils.retry(() =>
            verifySpans(agentControls, controls, {
              stmt: `SELECT * FROM ${TABLE_NAME_1}`,
              numberOfSpans: 3,
              verifyCustom: (entrySpan, spans) => {
                const realParent = testUtils.expectAtLeastOneMatching(spans, [
                  span => expect(span.n).to.equal('node.http.server'),
                  span => expect(span.f.e).to.equal(String(controls.getPid())),
                  span => expect(span.f.h).to.equal('agent-stub-uuid'),
                  span => expect(span.data.http.path_tpl).to.equal('/execute-in-http')
                ]);
                testUtils.expectAtLeastOneMatching(spans, [
                  span => expect(span.n).to.equal('node.http.server'),
                  span => expect(span.f.e).to.equal(String(controls.getPid())),
                  span => expect(span.f.h).to.equal('agent-stub-uuid'),
                  span => expect(span.data.http.path_tpl).to.equal('/prepare-in-http')
                ]);

                testUtils.expectAtLeastOneMatching(spans, [span => expect(span.p).to.equal(realParent.s)]);
              }
            })
          )
        );
    });

    it('must trace prepare execute async', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/prepare-execute-async'
        })
        .then(() =>
          testUtils.retry(() =>
            verifySpans(agentControls, controls, {
              stmt: `insert into ${TABLE_NAME_1} (COLINT, COLDATETIME, COLTEXT) VALUES (?, ?, ?)`
            })
          )
        );
    });

    it('must trace prepare execute async', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/prepare-execute-async'
        })
        .then(() =>
          testUtils.retry(() =>
            verifySpans(agentControls, controls, {
              stmt: `insert into ${TABLE_NAME_1} (COLINT, COLDATETIME, COLTEXT) VALUES (?, ?, ?)`
            })
          )
        );
    });

    it('must trace prepare execute async with reusage', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/prepare-execute-async?reuse=true'
        })
        .then(() =>
          testUtils.retry(() =>
            verifySpans(agentControls, controls, {
              numberOfSpans: 3,
              verifyCustom: (entrySpan, spans) => {
                testUtils.expectExactlyNMatching(spans, 2, [
                  span => expect(span.t).to.equal(entrySpan.t),
                  span => expect(span.p).to.equal(entrySpan.s),
                  span => expect(span.n).to.equal('ibmdb2'),
                  span => expect(span.k).to.equal(constants.EXIT),
                  span => expect(span.f.e).to.equal(String(controls.getPid())),
                  span => expect(span.f.h).to.equal('agent-stub-uuid'),
                  span =>
                    expect(span.data.db2.stmt).to.equal(
                      `insert into ${TABLE_NAME_1} (COLINT, COLDATETIME, COLTEXT) VALUES (?, ?, ?)`
                    ),
                  span => expect(span.data.db2.dsn).to.equal(`${EXPECTED_DB2_CONN_STR};DATABASE=${DB2_DATABASE_NAME}`),
                  span => expect(span.async).to.not.exist,
                  span => expect(span.data.db2.error).to.not.exist,
                  span => expect(span.ec).to.equal(0)
                ]);
              }
            })
          )
        );
    });

    it('must trace prepare execute async with extra query', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/prepare-execute-async?extraQuery=true'
        })
        .then(() =>
          testUtils.retry(() =>
            verifySpans(agentControls, controls, {
              numberOfSpans: 3,
              stmt: `insert into ${TABLE_NAME_1} (COLINT, COLDATETIME, COLTEXT) VALUES (?, ?, ?)`,
              verifyCustom: (entrySpan, spans) => {
                testUtils.expectAtLeastOneMatching(spans, [
                  span => expect(span.t).to.equal(entrySpan.t),
                  span => expect(span.p).to.equal(entrySpan.s),
                  span => expect(span.n).to.equal('ibmdb2'),
                  span => expect(span.k).to.equal(constants.EXIT),
                  span => expect(span.f.e).to.equal(String(controls.getPid())),
                  span => expect(span.f.h).to.equal('agent-stub-uuid'),
                  span =>
                    expect(span.data.db2.stmt).to.equal(`insert into ${TABLE_NAME_1} values (3, null, 'something')`),
                  span => expect(span.data.db2.dsn).to.equal(`${EXPECTED_DB2_CONN_STR};DATABASE=${DB2_DATABASE_NAME}`),
                  span => expect(span.async).to.not.exist,
                  span => expect(span.data.db2.error).to.not.exist,
                  span => expect(span.ec).to.equal(0)
                ]);
              }
            })
          )
        );
    });

    it('[with execute error] must trace prepare execute async', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/prepare-execute-async?error=execute'
        })
        .then(() =>
          testUtils.retry(() =>
            verifySpans(agentControls, controls, {
              stmt: `insert into ${TABLE_NAME_1} (COLINT, COLDATETIME, COLTEXT) VALUES (?, ?, ?)`,
              error: 'Error: [IBM][CLI Driver][DB2/LINUXX8664] SQL0181N  The string representatio'
            })
          )
        );
    });

    it('[with prepare error] must trace prepare execute async', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/prepare-execute-async?error=prepare'
        })
        .then(() => testUtils.delay(DELAY_TIMEOUT_IN_MS))
        .then(() =>
          testUtils.retry(() =>
            verifySpans(agentControls, controls, {
              expectNoDb2Span: true
            })
          )
        );
    });

    it('must trace prepare execute fetchAll async', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/prepare-execute-fetch-async'
        })
        .then(() =>
          testUtils.retry(() =>
            verifySpans(agentControls, controls, {
              stmt: `SELECT * FROM ${TABLE_NAME_1}`
            })
          )
        );
    });

    it('[withError] prepare, execute, fetchAll', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/prepare-execute-fetch-async?error=true'
        })
        .then(() => testUtils.delay(DELAY_TIMEOUT_IN_MS))
        .then(() =>
          testUtils.retry(() =>
            verifySpans(agentControls, controls, {
              stmt: `SELECT * FROM ${TABLE_NAME_1}`,
              error: "TypeError: Cannot read properties of null (reading 'fetchMode')"
            })
          )
        );
    });

    it('must trace prepare execute fetch sync', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/prepare-execute-fetch-sync'
        })
        .then(() =>
          testUtils.retry(() =>
            verifySpans(agentControls, controls, {
              // 6x db2 and 1 entry
              numberOfSpans: 7,
              verifyCustom: (entrySpan, spans) => {
                const stmtsToExpect = [
                  `drop table ${TABLE_NAME_2} if exists`,
                  `create table ${TABLE_NAME_2} (col1 varchar(40), col2 int)`,
                  `drop table ${TABLE_NAME_2}`,
                  `insert into ${TABLE_NAME_2} values ('something', 42)`,
                  `insert into ${TABLE_NAME_2} values ('für', 43)`,
                  `select * from ${TABLE_NAME_2}`
                ];

                stmtsToExpect.forEach(stmt => {
                  expect(
                    spans.find(span => {
                      // CASE: http span and the already matched span
                      if (!span.data.db2) {
                        return false;
                      }

                      if (span.data.db2.stmt !== stmt) {
                        return false;
                      }

                      return true;
                    })
                  ).to.not.be.undefined;
                });
              }
            })
          )
        );
    });

    it('prepare, executeNonQuerySync', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/prepare-execute-non-query-sync'
        })
        .then(() =>
          testUtils.retry(() =>
            verifySpans(agentControls, controls, {
              stmt: `insert into ${TABLE_NAME_1}(COLINT, COLDATETIME, COLTEXT) VALUES (?, ?, ?)`
            })
          )
        );
    });

    it('[with error] prepare, executeNonQuerySync', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/prepare-execute-non-query-sync?error=true'
        })
        .then(() =>
          testUtils.retry(() =>
            verifySpans(agentControls, controls, {
              stmt: `insert into ${TABLE_NAME_1}(COLINT, COLDATETIME, COLTEXT) VALUES (?, ?, ?)`,
              error: 'Error: [IBM][CLI Driver] CLI0100E  Wrong number of parameters. SQLSTATE=07001'
            })
          )
        );
    });

    it('must trace prepare execute mixed 1', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/prepare-execute-mixed-1'
        })
        .then(() =>
          testUtils.retry(() =>
            verifySpans(agentControls, controls, {
              stmt: `SELECT * FROM ${TABLE_NAME_1}`
            })
          )
        );
    });

    it('[with error raise] must trace prepare execute mixed 1', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/prepare-execute-mixed-1?error=executeRaise'
        })
        .then(() => testUtils.delay(DELAY_TIMEOUT_IN_MS))
        .then(() =>
          testUtils.retry(() =>
            verifySpans(agentControls, controls, {
              expectNoDb2Span: true
            })
          )
        );
    });

    it('[with skipClose] must trace prepare execute mixed 1', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/prepare-execute-mixed-1?skipClose=true'
        })
        .then(() => testUtils.delay(DB2_CLOSE_TIMEOUT_IN_MS))
        .then(() =>
          testUtils.retry(() =>
            verifySpans(agentControls, controls, {
              stmt: `SELECT * FROM ${TABLE_NAME_1}`,
              error: `'result.closeSync' was not called within ${DB2_CLOSE_TIMEOUT_IN_MS}ms.`
            })
          )
        );
    });

    it('[with fetch] must trace prepare execute mixed 1', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/prepare-execute-mixed-1?fetchType=fetch'
        })
        .then(() =>
          testUtils.retry(() =>
            verifySpans(agentControls, controls, {
              stmt: `SELECT * FROM ${TABLE_NAME_1}`
            })
          )
        );
    });

    it('[with fetch and error] must trace prepare execute mixed 1', function () {
      const expectedError = 'TypeError: Cannot read properties of null (reading';

      return controls
        .sendRequest({
          method: 'GET',
          path: '/prepare-execute-mixed-1?fetchType=fetch&error=fetch'
        })
        .then(() =>
          testUtils.retry(() =>
            verifySpans(agentControls, controls, {
              stmt: `SELECT * FROM ${TABLE_NAME_1}`,
              error: expectedError
            })
          )
        );
    });

    it('[with fetchSync] must trace prepare execute mixed 1', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/prepare-execute-mixed-1?fetchType=fetchSync'
        })
        .then(() =>
          testUtils.retry(() =>
            verifySpans(agentControls, controls, {
              stmt: `SELECT * FROM ${TABLE_NAME_1}`
            })
          )
        );
    });

    it('must trace prepare execute mixed 2', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/prepare-execute-mixed-2'
        })
        .then(() =>
          testUtils.retry(() =>
            verifySpans(agentControls, controls, {
              stmt: `SELECT * FROM ${TABLE_NAME_1}`
            })
          )
        );
    });

    it('[with skipClose] must trace prepare execute mixed 2', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/prepare-execute-mixed-2?skipClose=true'
        })
        .then(() => testUtils.delay(DB2_CLOSE_TIMEOUT_IN_MS))
        .then(() =>
          testUtils.retry(() =>
            verifySpans(agentControls, controls, {
              stmt: `SELECT * FROM ${TABLE_NAME_1}`,
              error: `'result.closeSync' was not called within ${DB2_CLOSE_TIMEOUT_IN_MS}ms.`
            })
          )
        );
    });

    it('prepare + execute in transaction', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/prepare-execute-transaction'
        })
        .then(() =>
          testUtils.retry(() =>
            verifySpans(agentControls, controls, {
              stmt: `insert into ${TABLE_NAME_1} (COLINT, COLDATETIME, COLTEXT) VALUES (?, ?, ?)`
            })
          )
        );
    });

    it('executeFile', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/execute-file-async'
        })
        .then(() =>
          testUtils.retry(() =>
            verifySpans(agentControls, controls, {
              numberOfSpans: 11,
              // Spans:
              // 10 queries splitted from the file
              // 5 fs operations on top (ours + from db2 internally fs-extra)
              // https://github.com/ibmdb/node-ibm_db/blob/fb25937524d74d25917e9aa67fb4737971317986/lib/odbc.js#L916
              // If the Otel integration is disabled, we expect 11 spans.
              verifyCustom: (entrySpan, spans) => {
                const stmtsToExpect = [
                  `create table ${TABLE_NAME_3}(no integer,name varchar(10))`,
                  `insert into ${TABLE_NAME_3} values(1,'pri')`,
                  `insert into ${TABLE_NAME_3} values(2,'anbu')`,
                  `select * from ${TABLE_NAME_3}`,
                  `drop table ${TABLE_NAME_3}`,
                  `create table ${TABLE_NAME_3}(no integer)`,
                  `insert into ${TABLE_NAME_3} values(1)`,
                  `insert into ${TABLE_NAME_3} values(2)`,
                  `select * from ${TABLE_NAME_3}`,
                  `drop table ${TABLE_NAME_3}`
                ];

                stmtsToExpect.forEach(stmt => {
                  expect(
                    spans.find(span => {
                      // CASE: http span
                      if (!span.data.db2) {
                        return false;
                      }

                      if (span.data.db2.stmt !== stmt) {
                        return false;
                      }

                      return true;
                    })
                  ).to.not.be.undefined;
                });
              }
            })
          )
        );
    });

    it('executeFileSync sample1.txt', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/execute-file-sync'
        })
        .then(() =>
          testUtils.retry(() =>
            verifySpans(agentControls, controls, {
              // If the Otel integration is disabled, we expect 11 spans, else 14 spans.
              numberOfSpansAtLeast: 11,
              verifyCustom: (entrySpan, spans) => {
                const stmtsToExpect = [
                  `create table ${TABLE_NAME_3}(no integer,name varchar(10))`,
                  `\ninsert into ${TABLE_NAME_3} values(1,'pri')`,
                  `\ninsert into ${TABLE_NAME_3} values(2,'anbu')`,
                  `\nselect * from ${TABLE_NAME_3}`,
                  `\ndrop table ${TABLE_NAME_3}`,
                  `\ncreate table ${TABLE_NAME_3}(no integer)`,
                  `\ninsert into ${TABLE_NAME_3} values(1)`,
                  `\ninsert into ${TABLE_NAME_3} values(2)`,
                  `\nselect * from ${TABLE_NAME_3}`,
                  `\ndrop table ${TABLE_NAME_3}`
                ];

                stmtsToExpect.forEach(stmt => {
                  expect(
                    spans.find(span => {
                      // CASE: http span
                      if (!span.data.db2) {
                        return false;
                      }

                      if (span.data.db2.stmt !== stmt) {
                        return false;
                      }

                      return true;
                    })
                  ).to.not.be.undefined;
                });
              }
            })
          )
        );
    });

    it('executeFileSync sample2.txt', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/execute-file-sync?file=sample2.txt'
        })
        .then(() =>
          testUtils.retry(() =>
            verifySpans(agentControls, controls, {
              // If the Otel integration is disabled, we expect 11 spans, else 14 spans.
              numberOfSpansAtLeast: 11,
              verifyCustom: (entrySpan, spans) => {
                const stmtsToExpect = [
                  `create table ${TABLE_NAME_3}(no integer,name varchar(10))`,
                  `insert into ${TABLE_NAME_3} values(1,'pri')`,
                  `insert into ${TABLE_NAME_3} values(2,'anbu')`,
                  `select * from ${TABLE_NAME_3}`,
                  `drop table ${TABLE_NAME_3}`,
                  `create table ${TABLE_NAME_3}(no integer)`,
                  `insert into ${TABLE_NAME_3} values(1)`,
                  `insert into ${TABLE_NAME_3} values(2)`,
                  `select * from ${TABLE_NAME_3}`,
                  `drop table ${TABLE_NAME_3}`
                ];

                stmtsToExpect.forEach(stmt => {
                  expect(
                    spans.find(span => {
                      // CASE: http span
                      if (!span.data.db2) {
                        return false;
                      }

                      if (span.data.db2.stmt !== stmt) {
                        return false;
                      }

                      return true;
                    })
                  ).to.not.be.undefined;
                });
              }
            })
          )
        );
    });

    it('queryStream', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/query-stream'
        })
        .then(() =>
          testUtils.retry(() =>
            verifySpans(agentControls, controls, {
              stmt: 'select 1 from sysibm.sysdummy1'
            })
          )
        );
    });

    it('queryResult', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/query-result-async'
        })
        .then(() =>
          testUtils.retry(() =>
            verifySpans(agentControls, controls, {
              stmt: `SELECT * FROM ${TABLE_NAME_1}`
            })
          )
        );
    });

    it('queryResult in transaction', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/query-result-async?transaction=true'
        })
        .then(() =>
          testUtils.retry(() =>
            verifySpans(agentControls, controls, {
              stmt: `SELECT * FROM ${TABLE_NAME_1}`
            })
          )
        );
    });

    it('queryResultSync', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/query-result-sync'
        })
        .then(() =>
          testUtils.retry(() =>
            verifySpans(agentControls, controls, {
              stmt: `SELECT * FROM ${TABLE_NAME_1}`
            })
          )
        );
    });

    it('queryResultSync in transaction', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/query-result-sync?transaction=true'
        })
        .then(() =>
          testUtils.retry(() =>
            verifySpans(agentControls, controls, {
              stmt: `SELECT * FROM ${TABLE_NAME_1}`
            })
          )
        );
    });

    it('call two different hosts', async () => {
      const response = await controls.sendRequest({
        method: 'GET',
        path: '/two-different-target-hosts'
      });

      expect(response.data1).to.deep.equal([{ 1: 1 }]);
      expect(response.data2).to.deep.equal([{ 1: 'a' }]);
      await testUtils.retry(async () => {
        const spans = await agentControls.getSpans();
        const entrySpan = testUtils.expectAtLeastOneMatching(spans, [
          span => expect(span.n).to.equal('node.http.server'),
          span => expect(span.data.http.method).to.equal('GET')
        ]);
        testUtils.expectExactlyOneMatching(spans, [
          span => expect(span.t).to.equal(entrySpan.t),
          span => expect(span.p).to.equal(entrySpan.s),
          span => expect(span.n).to.equal('ibmdb2'),
          span => expect(span.data.db2.stmt).to.equal('select 1 from sysibm.sysdummy1'),
          span => expect(span.data.db2.dsn).to.contain(EXPECTED_DB2_CONN_STR)
        ]);
        testUtils.expectExactlyOneMatching(spans, [
          span => expect(span.t).to.equal(entrySpan.t),
          span => expect(span.p).to.equal(entrySpan.s),
          span => expect(span.n).to.equal('ibmdb2'),
          span => expect(span.data.db2.stmt).to.equal("select 'a' from sysibm.sysdummy1"),
          span => expect(span.data.db2.dsn).to.contain(EXPECTED_DB2_CONN_STR_ALTERNATIVE)
        ]);
      });
    });
  });

  describe('tracing is active, but suppressed', function () {
    before(async () => {
      TABLE_NAME_1 = generateTableName();
      TABLE_NAME_2 = generateTableName();
      TABLE_NAME_3 = generateTableName();

      controls = new ProcessControls({
        dirname: __dirname,
        useGlobalAgent: true,
        tracingEnabled: false,
        env: {
          DB2_CONN_STR,
          DB2_CONN_STR_ALTERNATIVE,
          DB2_DATABASE_NAME,
          DB2_TABLE_NAME_1: TABLE_NAME_1,
          DB2_TABLE_NAME_2: TABLE_NAME_2,
          DB2_TABLE_NAME_3: TABLE_NAME_3,
          DB2_CLOSE_TIMEOUT_IN_MS
        }
      });

      await controls.startAndWaitForAgentConnection(retryTime, Date.now() + testTimeout - 5000);
    });

    beforeEach(async () => {
      await agentControls.clearReceivedTraceData();
    });

    after(async () => {
      await controls.sendRequest({
        method: 'DELETE',
        path: '/tables'
      });

      await controls.sendRequest({
        method: 'DELETE',
        path: '/conn'
      });

      await controls.stop();
    });

    it('must not trace for query', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/query-promise',
          headers: {
            'X-INSTANA-L': '0'
          }
        })
        .then(() => testUtils.delay(DELAY_TIMEOUT_IN_MS))
        .then(() =>
          testUtils.retry(() =>
            verifySpans(agentControls, controls, {
              expectSpans: false
            })
          )
        );
    });

    it('must not trace for prepareSync', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/prepare-execute-fetch-sync',
          headers: {
            'X-INSTANA-L': '0'
          }
        })
        .then(() => testUtils.delay(DELAY_TIMEOUT_IN_MS))
        .then(() =>
          testUtils.retry(() =>
            verifySpans(agentControls, controls, {
              expectSpans: false
            })
          )
        );
    });
    it('must not trace for prepare', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/prepare-execute-async',
          headers: {
            'X-INSTANA-L': '0'
          }
        })
        .then(() => testUtils.delay(DELAY_TIMEOUT_IN_MS))
        .then(() =>
          testUtils.retry(() =>
            verifySpans(agentControls, controls, {
              expectSpans: false
            })
          )
        );
    });
    it('must not trace for transaction', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/transaction-async',
          headers: {
            'X-INSTANA-L': '0'
          }
        })
        .then(() => testUtils.delay(DELAY_TIMEOUT_IN_MS))
        .then(() =>
          testUtils.retry(() =>
            verifySpans(agentControls, controls, {
              expectSpans: false
            })
          )
        );
    });
  });

  describe('When allowRootExitSpan: true is set', function () {
    before(async () => {
      TABLE_NAME_1 = generateTableName();

      controls = new ProcessControls({
        useGlobalAgent: true,
        appPath: path.join(__dirname, 'allowRootExitSpanApp'),
        env: {
          DB2_CONN_STR,
          DB2_DATABASE_NAME,
          DB2_TABLE_NAME_1: TABLE_NAME_1
        }
      });

      await controls.start(retryTime, Date.now() + testTimeout - 5000, true);
    });

    beforeEach(async () => {
      await agentControls.clearReceivedTraceData();
    });

    it('must trace', async function () {
      await testUtils.retry(async () => {
        const spans = await agentControls.getSpans();
        expect(spans.length).to.be.eql(4);

        // 4 spans, because we drop the table, create the table and do 2 x queries.
        testUtils.expectExactlyNMatching(spans, 4, [
          span => expect(span.n).to.equal('ibmdb2'),
          span => expect(span.k).to.equal(2),
          span => expect(span.data.db2.stmt).to.exist
        ]);
      });
    });
  });

  describe('tracing is disabled', function () {
    before(async () => {
      TABLE_NAME_1 = generateTableName();
      TABLE_NAME_2 = generateTableName();
      TABLE_NAME_3 = generateTableName();

      controls = new ProcessControls({
        dirname: __dirname,
        useGlobalAgent: true,
        tracingEnabled: false,
        env: {
          DB2_CONN_STR,
          DB2_CONN_STR_ALTERNATIVE,
          DB2_DATABASE_NAME,
          DB2_TABLE_NAME_1: TABLE_NAME_1,
          DB2_TABLE_NAME_2: TABLE_NAME_2,
          DB2_TABLE_NAME_3: TABLE_NAME_3,
          DB2_CLOSE_TIMEOUT_IN_MS
        }
      });

      await controls.startAndWaitForAgentConnection(retryTime, Date.now() + testTimeout - 5000);
    });

    beforeEach(async () => {
      await agentControls.clearReceivedTraceData();
    });
    after(async () => {
      await controls.sendRequest({
        method: 'DELETE',
        path: '/tables'
      });

      await controls.sendRequest({
        method: 'DELETE',
        path: '/conn'
      });

      await controls.stop();
    });

    it('must not trace', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/transaction-async'
        })
        .then(() => testUtils.delay(DELAY_TIMEOUT_IN_MS))
        .then(() =>
          testUtils.retry(() =>
            verifySpans(agentControls, controls, {
              expectSpans: false
            })
          )
        );
    });
  });
});
