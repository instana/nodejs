/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const expect = require('chai').expect;
const { supportedVersion, constants } = require('@instana/core').tracing;
// const config = require('../../../../../core/test/config');
const testUtils = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

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
      span =>
        expect(span.data.db2.dsn).to.equal(
          process.env.DB2_CONNECTION_STR ||
            'DATABASE=nodedb;HOSTNAME=localhost;UID=node;PWD=nodepw;PORT=58885;PROTOCOL=TCPIP'
        ),
      span => expect(span.async).to.not.exist,
      span =>
        options.error
          ? expect(span.data.db2.error).to.contain(options.error)
          : expect(span.data.db2.error).to.not.exist,
      span => (options.error ? expect(span.ec).to.equal(1) : expect(span.ec).to.equal(0))
    ]);
  });
};

mochaSuiteFn('tracing/db2', function () {
  const timeout = 30 * 1000;
  this.timeout(timeout);

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  let controls = new ProcessControls({
    dirname: __dirname,
    port: 3322,
    useGlobalAgent: true,
    env: {
      INSTANA_ATTACH_FETCH_SYNC: true
    }
  });

  ProcessControls.setUpTestCaseCleanUpHooks(controls);

  before(async () => {
    await controls.startAndWaitForAgentConnection(timeout);
  });
  after(async () => {
    await controls.stop();
  });

  describe('tracing is active', function () {
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
              stmt: 'insert into shoes(COLINT, COLDATETIME, COLTEXT) VALUES (42, null, null)'
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
              stmt: 'insert into shoes(COLINT, COLDATETIME, COLTEXT) VALUES (42, null, null)',
              expectNoDb2Span: true
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
              stmt: 'insert into shoes(COLINT, COLDATETIME, COLTEXT) VALUES (42, null, null)'
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
              stmt: 'insert into shoes(COLINT, COLDATETIME, COLTEXT) VALUES (42, null, null)',
              expectNoDb2Span: true
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
              stmt: 'insert into shoes(COLINT, COLDATETIME, COLTEXT) VALUES (42, null, null)'
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
              stmt: 'insert into shoes(COLINT, COLDATETIME, COLTEXT) VALUES (42, null, null)',
              expectNoDb2Span: true
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
              stmt: 'insert into shoes(COLINT, COLDATETIME, COLTEXT) VALUES (42, null, null)'
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
              stmt: 'insert into shoes(COLINT, COLDATETIME, COLTEXT) VALUES (42, null, null)',
              expectNoDb2Span: true
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
              stmt: 'insert into shoes (COLINT, COLDATETIME, COLTEXT) VALUES (?, ?, ?)'
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
              stmt: 'insert into shoes (COLINT, COLDATETIME, COLTEXT) VALUES (?, ?, ?)'
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
                        'insert into shoes (COLINT, COLDATETIME, COLTEXT) VALUES (?, ?, ?)'
                      ),
                    span =>
                      expect(span.data.db2.dsn).to.equal(
                        process.env.DB2_CONNECTION_STR ||
                          'DATABASE=nodedb;HOSTNAME=localhost;UID=node;PWD=nodepw;PORT=58885;PROTOCOL=TCPIP'
                      ),
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
              stmt: 'insert into shoes (COLINT, COLDATETIME, COLTEXT) VALUES (?, ?, ?)',
              spanLength: 3,
              verifyCustom: (entrySpan, spans) => {
                testUtils.expectAtLeastOneMatching(spans, [
                  span => expect(span.t).to.equal(entrySpan.t),
                  span => expect(span.p).to.equal(entrySpan.s),
                  span => expect(span.n).to.equal('db2'),
                  span => expect(span.k).to.equal(constants.EXIT),
                  span => expect(span.f.e).to.equal(String(controls.getPid())),
                  span => expect(span.f.h).to.equal('agent-stub-uuid'),
                  span => expect(span.data.db2.stmt).to.equal("insert into shoes values (3, null, 'something')"),
                  span =>
                    expect(span.data.db2.dsn).to.equal(
                      process.env.DB2_CONNECTION_STR ||
                        'DATABASE=nodedb;HOSTNAME=localhost;UID=node;PWD=nodepw;PORT=58885;PROTOCOL=TCPIP'
                    ),
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
              stmt: 'insert into shoes (COLINT, COLDATETIME, COLTEXT) VALUES (?, ?, ?)',
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
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              stmt: 'insert into shoes (COLINT, COLDATETIME, COLTEXT) VALUES (?, ?, ?)',
              expectNoDb2Span: true
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
              stmt: 'SELECT * FROM shoes'
            });
          });
        });
    });

    // TODO: wait for ibm resp
    it.skip('[withError] prepare, execute, fetchAll', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/prepare-execute-fetch-async?error=true'
        })
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
                  'drop table hits if exists',
                  'create table hits (col1 varchar(40), col2 int)',
                  'drop table hits',
                  "insert into hits values ('something', 42)",
                  "insert into hits values ('für', 43)",
                  'select * from hits'
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
              stmt: 'insert into shoes(COLINT, COLDATETIME, COLTEXT) VALUES (?, ?, ?)'
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
              stmt: 'insert into shoes(COLINT, COLDATETIME, COLTEXT) VALUES (?, ?, ?)',
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
              stmt: 'SELECT * FROM shoes'
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
              stmt: 'SELECT * FROM shoes'
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
              stmt: 'SELECT * FROM shoes'
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
              expectNoDb2Span: true,
              spanLength: 1
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
              stmt: 'SELECT * FROM shoes'
            });
          });
        });
    });

    it('[with fetchSync and error] must trace prepare execute mixed 1', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/prepare-execute-mixed-1?fetchType=fetchSync&error=fetchSync'
        })
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              spanLength: 2,
              stmt: 'insert into shoes(COLINT, COLDATETIME, COLTEXT) VALUES (88, null, null)',
              error: 'Error: simulated error\n    at ODBCResult.result.originalFetchSync'
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
              stmt: 'SELECT * FROM shoes'
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
              stmt: 'SELECT * FROM shoes'
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
              stmt: 'insert into shoes (COLINT, COLDATETIME, COLTEXT) VALUES (?, ?, ?)'
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
                  'create table sample(no integer,name varchar(10))',
                  "insert into sample values(1,'pri')",
                  "insert into sample values(2,'anbu')",
                  'select * from sample',
                  'drop table sample',
                  'create table sample1(no integer)',
                  'insert into sample1 values(1)',
                  'insert into sample1 values(2)',
                  'select * from sample1',
                  'drop table sample1'
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
                  'create table sample(no integer,name varchar(10))',
                  "\ninsert into sample values(1,'pri')",
                  "\ninsert into sample values(2,'anbu')",
                  '\nselect * from sample',
                  '\ndrop table sample',
                  '\ncreate table sample1(no integer)',
                  '\ninsert into sample1 values(1)',
                  '\ninsert into sample1 values(2)',
                  '\nselect * from sample1',
                  '\ndrop table sample1'
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
                  'create table sample(no integer,name varchar(10))',
                  "insert into sample values(1,'pri')",
                  "insert into sample values(2,'anbu')",
                  'select * from sample',
                  'drop table sample',
                  'create table sample1(no integer)',
                  'insert into sample1 values(1)',
                  'insert into sample1 values(2)',
                  'select * from sample1',
                  'drop table sample1'
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
              stmt: 'SELECT * FROM shoes'
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
              stmt: 'SELECT * FROM shoes'
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
              stmt: 'SELECT * FROM shoes'
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
              stmt: 'SELECT * FROM shoes'
            });
          });
        });
    });
  });

  describe('tracing is active, but suppressed', function () {
    it('must not trace for query', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/query-promise',
          headers: {
            'X-INSTANA-L': '0'
          }
        })
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
        .then(() => {
          return testUtils.retry(() => {
            return verifySpans(agentControls, controls, {
              expectSpans: false
            });
          });
        });
    });
  });

  describe('tracing disabled', function () {
    before(async () => {
      await controls.stop();

      controls = new ProcessControls({
        dirname: __dirname,
        port: 3322,
        useGlobalAgent: true,
        tracingEnabled: false,
        env: {
          INSTANA_ATTACH_FETCH_SYNC: true
        }
      });

      await controls.startAndWaitForAgentConnection();
    });

    after(async () => {
      await controls.stop();
    });

    it('must not trace', function () {
      return controls
        .sendRequest({
          method: 'GET',
          path: '/transaction-async'
        })
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
