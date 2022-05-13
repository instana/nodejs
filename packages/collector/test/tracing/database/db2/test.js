/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const expect = require('chai').expect;
const { supportedVersion, constants } = require('@instana/core').tracing;
const testUtils = require('../../../../../core/test/test_util');
const config = require('../../../../../core/test/config');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;
const DB_LOCAL_CONN_STR = 'HOSTNAME=localhost;UID=node;PWD=<redacted>;PORT=58885;PROTOCOL=TCPIP';
const DB_REMOTE_CONN_STR = process.env.CI
  ? process.env.DB2_CONNECTION_STR.replace(/PWD=.*?(?=;)/, 'PWD=<redacted>')
  : null;

const CONN_STR = DB_REMOTE_CONN_STR || DB_LOCAL_CONN_STR;
let DB2_NAME;
let TABLE_NAME_1;
let TABLE_NAME_2;
let TABLE_NAME_3;
const DELAY_TIMEOUT_IN_MS = 500;

// NOTE: DB2 has a limitation of 8 chars
const getDatabaseName = () => {
  return 'nodedb';
};

const generateTableName = () => {
  const randomStr = Array(8)
    .fill('abcdefghijklmnopqrstuvwxyz')
    .map(function (x) {
      return x[Math.floor(Math.random() * x.length)];
    })
    .join('');

  return randomStr;
};

const verifySpans = (agentControls, controls, options = {}) => {
  return agentControls.getSpans().then(spans => {
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

    expect(spans.length).to.equal(options.spanLength || 2);

    if (options.verifyCustom) return options.verifyCustom(entrySpan, spans);

    testUtils.expectAtLeastOneMatching(spans, [
      span => expect(span.t).to.equal(entrySpan.t),
      span => expect(span.p).to.equal(entrySpan.s),
      span => expect(span.n).to.equal('db2'),
      span => expect(span.k).to.equal(constants.EXIT),
      span => expect(span.f.e).to.equal(String(controls.getPid())),
      span => expect(span.f.h).to.equal('agent-stub-uuid'),
      span => expect(span.data.db2.stmt).to.equal(options.stmt || 'select 1 from sysibm.sysdummy1'),
      span => expect(span.data.db2.dsn).to.equal(`${CONN_STR};DATABASE=${DB2_NAME}`),
      span => expect(span.async).to.not.exist,
      span =>
        options.error
          ? expect(span.data.db2.error).to.contain(options.error)
          : expect(span.data.db2.error).to.not.exist,
      span => (options.error ? expect(span.ec).to.equal(1) : expect(span.ec).to.equal(0))
    ]);
  });
};

// The db2 docker container needs a longer time to bootstrap. Please check the docker logs if
// the container is up.
mochaSuiteFn('tracing/db2', function () {
  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;
  let controls;

  describe('tracing is active', function () {
    before(async () => {
      DB2_NAME = getDatabaseName();
      TABLE_NAME_1 = generateTableName();
      TABLE_NAME_2 = generateTableName();
      TABLE_NAME_3 = generateTableName();

      controls = new ProcessControls({
        dirname: __dirname,
        port: 3322,
        useGlobalAgent: true,
        env: {
          DB2_NAME,
          DB2_TABLE_NAME_1: TABLE_NAME_1,
          DB2_TABLE_NAME_2: TABLE_NAME_2,
          DB2_TABLE_NAME_3: TABLE_NAME_3
        }
      });

      ProcessControls.setUpTestCaseCleanUpHooks(controls);
      await controls.startAndWaitForAgentConnection();
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
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls);
          });
        });
    });

    it('[with error] must trace query promise', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/query-promise?err=true'
        })
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              stmt: 'select invalid query',
              error: '[IBM][CLI Driver][DB2/LINUXX8664] SQL0104N  An unexpected token'
            });
          });
        });
    });

    it('must trace query cb (2 args)', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/query-cb'
        })
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls);
          });
        });
    });

    it('must trace query cb (3 args)', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/query-cb?args=3'
        })
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              stmt: 'select creator, name from sysibm.systables where 1 = ?'
            });
          });
        });
    });

    it('[with error] must trace query cb', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/query-cb?err=true'
        })
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              stmt: 'select invalid query',
              error: '[IBM][CLI Driver][DB2/LINUXX8664] SQL0104N  An unexpected token'
            });
          });
        });
    });

    it('must trace query sync', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/query-sync'
        })
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls);
          });
        });
    });

    it('[with connection err] must trace query sync', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/query-sync?err=conn'
        })
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              stmt: 'select invalid query',
              error: 'Connection not open.'
            });
          });
        });
    });

    it('[with query err] must trace query sync', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/query-sync?err=query'
        })
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              stmt: 'select invalid query',
              error: 'Error: [IBM][CLI Driver][DB2/LINUXX8664] SQL0104N  An unexpected token'
            });
          });
        });
    });

    it('must trace async transaction with sync query', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/transaction-sync'
        })
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              stmt: `insert into ${TABLE_NAME_1}(COLINT, COLDATETIME, COLTEXT) VALUES (42, null, null)`
            });
          });
        });
    });

    it('must not trace async transaction with sync query because of rollback', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/transaction-sync?commit=false'
        })
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              stmt: `insert into ${TABLE_NAME_1}(COLINT, COLDATETIME, COLTEXT) VALUES (42, null, null)`,
              error: 'Transaction was rolled back without error.'
            });
          });
        });
    });

    it('must trace sync transaction with sync query', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/transaction-sync?type=sync'
        })
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              stmt: `insert into ${TABLE_NAME_1}(COLINT, COLDATETIME, COLTEXT) VALUES (42, null, null)`
            });
          });
        });
    });

    it('must not trace sync transaction with sync query because of rollback', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/transaction-sync?type=sync&commit=false'
        })
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              stmt: `insert into ${TABLE_NAME_1}(COLINT, COLDATETIME, COLTEXT) VALUES (42, null, null)`,
              error: 'Transaction was rolled back without error.'
            });
          });
        });
    });

    it('must trace async transaction with async query', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/transaction-async'
        })
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              stmt: `insert into ${TABLE_NAME_1}(COLINT, COLDATETIME, COLTEXT) VALUES (42, null, null)`
            });
          });
        });
    });

    it('must not trace async transaction with async query because of rollback', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/transaction-async?commit=false'
        })
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              stmt: `insert into ${TABLE_NAME_1}(COLINT, COLDATETIME, COLTEXT) VALUES (42, null, null)`,
              error: 'Transaction was rolled back without error.'
            });
          });
        });
    });

    it('must trace sync transaction with async query', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/transaction-async?type=sync'
        })
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              stmt: `insert into ${TABLE_NAME_1}(COLINT, COLDATETIME, COLTEXT) VALUES (42, null, null)`
            });
          });
        });
    });

    it('must not trace sync transaction with async query because of rollback', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/transaction-async?type=sync&commit=false'
        })
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              stmt: `insert into ${TABLE_NAME_1}(COLINT, COLDATETIME, COLTEXT) VALUES (42, null, null)`,
              error: 'Transaction was rolled back without error.'
            });
          });
        });
    });

    it('must trace prepare on start', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/prepare-on-start'
        })
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              stmt: `SELECT * FROM ${TABLE_NAME_1}`,
              spanLength: 3
            });
          });
        });
    });

    it('[executeSync] must trace prepare on start', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/prepare-on-start?sync=true'
        })
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              stmt: `SELECT * FROM ${TABLE_NAME_1}`,
              spanLength: 3
            });
          });
        });
    });

    it('[skip close] must trace prepare on start', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/prepare-on-start?skipClose=true'
        })
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              stmt: `SELECT * FROM ${TABLE_NAME_1}`,
              spanLength: 3,
              verifyCustom: (entrySpan, spans) => {
                testUtils.expectAtLeastOneMatching(spans, [
                  span => expect(span.t).to.equal(entrySpan.t),
                  span => expect(span.p).to.equal(entrySpan.s),
                  span => expect(span.n).to.equal('db2'),
                  span => expect(span.k).to.equal(constants.EXIT),
                  span => expect(span.f.e).to.equal(String(controls.getPid())),
                  span => expect(span.f.h).to.equal('agent-stub-uuid'),
                  span => expect(span.data.db2.stmt).to.equal(`SELECT * FROM ${TABLE_NAME_1}`),
                  span => expect(span.data.db2.dsn).to.equal(`${CONN_STR};DATABASE=${DB2_NAME}`),
                  span => expect(span.async).to.not.exist,
                  span =>
                    expect(span.data.db2.error).to.eql(
                      'Error: [IBM][CLI Driver] CLI0115E  Invalid cursor state. SQLSTATE=24000'
                    ),
                  span => expect(span.ec).to.equal(1)
                ]);
              }
            });
          });
        });
    });

    it('must trace prepare execute async', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/prepare-execute-async'
        })
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              stmt: `insert into ${TABLE_NAME_1} (COLINT, COLDATETIME, COLTEXT) VALUES (?, ?, ?)`
            });
          });
        });
    });

    it('must trace prepare execute async', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/prepare-execute-async'
        })
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              stmt: `insert into ${TABLE_NAME_1} (COLINT, COLDATETIME, COLTEXT) VALUES (?, ?, ?)`
            });
          });
        });
    });

    it('must trace prepare execute async with reusage', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/prepare-execute-async?reuse=true'
        })
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              spanLength: 3,
              verifyCustom: (entrySpan, spans) => {
                testUtils.expectAtLeastOneMatching(
                  spans,
                  [
                    span => expect(span.t).to.equal(entrySpan.t),
                    span => expect(span.p).to.equal(entrySpan.s),
                    span => expect(span.n).to.equal('db2'),
                    span => expect(span.k).to.equal(constants.EXIT),
                    span => expect(span.f.e).to.equal(String(controls.getPid())),
                    span => expect(span.f.h).to.equal('agent-stub-uuid'),
                    span =>
                      expect(span.data.db2.stmt).to.equal(
                        `insert into ${TABLE_NAME_1} (COLINT, COLDATETIME, COLTEXT) VALUES (?, ?, ?)`
                      ),
                    span => expect(span.data.db2.dsn).to.equal(`${CONN_STR};DATABASE=${DB2_NAME}`),
                    span => expect(span.async).to.not.exist,
                    span => expect(span.data.db2.error).to.not.exist,
                    span => expect(span.ec).to.equal(0)
                  ],
                  { numberOfMatches: 2 }
                );
              }
            });
          });
        });
    });

    it('must trace prepare execute async with extra query', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/prepare-execute-async?extraQuery=true'
        })
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              stmt: `insert into ${TABLE_NAME_1} (COLINT, COLDATETIME, COLTEXT) VALUES (?, ?, ?)`,
              spanLength: 3,
              verifyCustom: (entrySpan, spans) => {
                testUtils.expectAtLeastOneMatching(spans, [
                  span => expect(span.t).to.equal(entrySpan.t),
                  span => expect(span.p).to.equal(entrySpan.s),
                  span => expect(span.n).to.equal('db2'),
                  span => expect(span.k).to.equal(constants.EXIT),
                  span => expect(span.f.e).to.equal(String(controls.getPid())),
                  span => expect(span.f.h).to.equal('agent-stub-uuid'),
                  span =>
                    expect(span.data.db2.stmt).to.equal(`insert into ${TABLE_NAME_1} values (3, null, 'something')`),
                  span => expect(span.data.db2.dsn).to.equal(`${CONN_STR};DATABASE=${DB2_NAME}`),
                  span => expect(span.async).to.not.exist,
                  span => expect(span.data.db2.error).to.not.exist,
                  span => expect(span.ec).to.equal(0)
                ]);
              }
            });
          });
        });
    });

    it('[with execute error] must trace prepare execute async', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/prepare-execute-async?error=execute'
        })
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              stmt: `insert into ${TABLE_NAME_1} (COLINT, COLDATETIME, COLTEXT) VALUES (?, ?, ?)`,
              error: 'Error: [IBM][CLI Driver][DB2/LINUXX8664] SQL0181N  The string representatio'
            });
          });
        });
    });

    it('[with prepare error] must trace prepare execute async', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/prepare-execute-async?error=prepare'
        })
        .then(() => testUtils.delay(DELAY_TIMEOUT_IN_MS))
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              expectNoDb2Span: true,
              spanLength: 1
            });
          });
        });
    });

    it('must trace prepare execute fetchAll async', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/prepare-execute-fetch-async'
        })
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              stmt: `SELECT * FROM ${TABLE_NAME_1}`
            });
          });
        });
    });

    // TODO: wait for ibm resp
    //       https://github.com/ibmdb/node-ibm_db/issues/846
    it.skip('[withError] prepare, execute, fetchAll', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/prepare-execute-fetch-async?error=true'
        })
        .then(() => testUtils.delay(DELAY_TIMEOUT_IN_MS))
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              expectNoDb2Span: true
            });
          });
        });
    });

    it('must trace prepare execute fetch sync', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/prepare-execute-fetch-sync'
        })
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              spanLength: 7,
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
            });
          });
        });
    });

    it('prepare, executeNonQuerySync', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/prepare-execute-non-query-sync'
        })
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              stmt: `insert into ${TABLE_NAME_1}(COLINT, COLDATETIME, COLTEXT) VALUES (?, ?, ?)`
            });
          });
        });
    });

    it('[with error] prepare, executeNonQuerySync', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/prepare-execute-non-query-sync?error=true'
        })
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              stmt: `insert into ${TABLE_NAME_1}(COLINT, COLDATETIME, COLTEXT) VALUES (?, ?, ?)`,
              error: 'Error: [IBM][CLI Driver] CLI0100E  Wrong number of parameters. SQLSTATE=07001'
            });
          });
        });
    });

    it('must trace prepare execute mixed 1', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/prepare-execute-mixed-1'
        })
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              stmt: `SELECT * FROM ${TABLE_NAME_1}`
            });
          });
        });
    });

    it('[with error raise] must trace prepare execute mixed 1', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/prepare-execute-mixed-1?error=executeRaise'
        })
        .then(() => testUtils.delay(DELAY_TIMEOUT_IN_MS))
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              expectNoDb2Span: true,
              spanLength: 1
            });
          });
        });
    });

    it('[with skipClose] must trace prepare execute mixed 1', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/prepare-execute-mixed-1?skipClose=true'
        })
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              stmt: `SELECT * FROM ${TABLE_NAME_1}`
            });
          });
        });
    });

    it('[with fetch] must trace prepare execute mixed 1', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/prepare-execute-mixed-1?fetchType=fetch'
        })
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              stmt: `SELECT * FROM ${TABLE_NAME_1}`
            });
          });
        });
    });

    it('[with fetch and error] must trace prepare execute mixed 1', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/prepare-execute-mixed-1?fetchType=fetch&error=fetch'
        })
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              stmt: `SELECT * FROM ${TABLE_NAME_1}`,
              spanLength: 2
            });
          });
        });
    });

    it('[with fetchSync] must trace prepare execute mixed 1', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/prepare-execute-mixed-1?fetchType=fetchSync'
        })
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              stmt: `SELECT * FROM ${TABLE_NAME_1}`
            });
          });
        });
    });

    it('must trace prepare execute mixed 2', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/prepare-execute-mixed-2'
        })
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              stmt: `SELECT * FROM ${TABLE_NAME_1}`
            });
          });
        });
    });

    it('[with skipClose] must trace prepare execute mixed 2', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/prepare-execute-mixed-2?skipClose=true'
        })
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              stmt: `SELECT * FROM ${TABLE_NAME_1}`
            });
          });
        });
    });

    it('prepare + execute in transaction', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/prepare-execute-transaction'
        })
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              stmt: `insert into ${TABLE_NAME_1} (COLINT, COLDATETIME, COLTEXT) VALUES (?, ?, ?)`
            });
          });
        });
    });

    it('executeFile', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/execute-file-async'
        })
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              spanLength: 11,
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
            });
          });
        });
    });

    it('executeFileSync sample1.txt', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/execute-file-sync'
        })
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              spanLength: 11,
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
            });
          });
        });
    });

    it('executeFileSync sample2.txt', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/execute-file-sync?file=sample2.txt'
        })
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              spanLength: 11,
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
            });
          });
        });
    });

    it('queryStream', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/query-stream'
        })
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              stmt: 'select 1 from sysibm.sysdummy1'
            });
          });
        });
    });

    it('queryResult', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/query-result-async'
        })
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              stmt: `SELECT * FROM ${TABLE_NAME_1}`
            });
          });
        });
    });

    it('queryResult in transaction', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/query-result-async?transaction=true'
        })
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              stmt: `SELECT * FROM ${TABLE_NAME_1}`
            });
          });
        });
    });

    it('queryResultSync', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/query-result-sync'
        })
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              stmt: `SELECT * FROM ${TABLE_NAME_1}`
            });
          });
        });
    });

    it('queryResultSync in transaction', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/query-result-sync?transaction=true'
        })
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              stmt: `SELECT * FROM ${TABLE_NAME_1}`
            });
          });
        });
    });
  });

  describe('tracing is active, but suppressed', function () {
    before(async () => {
      DB2_NAME = getDatabaseName();
      TABLE_NAME_1 = generateTableName();
      TABLE_NAME_2 = generateTableName();
      TABLE_NAME_3 = generateTableName();

      controls = new ProcessControls({
        dirname: __dirname,
        port: 3322,
        useGlobalAgent: true,
        tracingEnabled: false,
        env: {
          DB2_NAME,
          DB2_TABLE_NAME_1: TABLE_NAME_1,
          DB2_TABLE_NAME_2: TABLE_NAME_2,
          DB2_TABLE_NAME_3: TABLE_NAME_3
        }
      });

      ProcessControls.setUpTestCaseCleanUpHooks(controls);
      await controls.startAndWaitForAgentConnection();
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
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              expectSpans: false
            });
          });
        });
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
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              expectSpans: false
            });
          });
        });
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
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              expectSpans: false
            });
          });
        });
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
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              expectSpans: false
            });
          });
        });
    });
  });

  describe('tracing is disabled', function () {
    before(async () => {
      DB2_NAME = getDatabaseName();
      TABLE_NAME_1 = generateTableName();
      TABLE_NAME_2 = generateTableName();
      TABLE_NAME_3 = generateTableName();

      controls = new ProcessControls({
        dirname: __dirname,
        port: 3322,
        useGlobalAgent: true,
        tracingEnabled: false,
        env: {
          DB2_NAME,
          DB2_TABLE_NAME_1: TABLE_NAME_1,
          DB2_TABLE_NAME_2: TABLE_NAME_2,
          DB2_TABLE_NAME_3: TABLE_NAME_3
        }
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

      ProcessControls.setUpTestCaseCleanUpHooks(controls);
      await controls.startAndWaitForAgentConnection();
    });

    it('must not trace', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/transaction-async'
        })
        .then(() => testUtils.delay(DELAY_TIMEOUT_IN_MS))
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              expectSpans: false
            });
          });
        });
    });
  });
});
