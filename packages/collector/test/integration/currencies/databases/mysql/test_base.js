/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2017
 */

'use strict';

const expect = require('chai').expect;
const { fail } = expect;

const constants = require('@_local/core').tracing.constants;
const config = require('@_local/core/test/config');
const testUtils = require('@_local/core/test/test_util');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');
const globalAgent = require('@_local/collector/test/globalAgent');
const { AgentStubControls } = require('@_local/collector/test/apps/agentStubControls');

module.exports = function (name, version, isLatest, mode) {
  this.timeout(config.getTestTimeout() * 10);

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  describe(`driver mode: ${mode}`, () => {
    const env = {
      DRIVER_MODE: mode,
      LIBRARY_VERSION: version,
      LIBRARY_NAME: name,
      LIBRARY_LATEST: isLatest
    };

    test(env);
  });

  describe('suppressed', function () {
    const env = {
      DRIVER_MODE: mode,
      LIBRARY_VERSION: version,
      LIBRARY_NAME: name,
      LIBRARY_LATEST: isLatest
    };
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

  function test(env) {
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
                span => expect(span.data.mysql.host).to.equal(process.env.INSTANA_CONNECT_MYSQL_HOST),
                span => expect(span.data.mysql.port).to.equal(Number(process.env.INSTANA_CONNECT_MYSQL_PORT)),
                span => expect(span.data.mysql.user).to.equal(process.env.INSTANA_CONNECT_MYSQL_USER),
                span => expect(span.data.mysql.db).to.equal(process.env.INSTANA_CONNECT_MYSQL_DB)
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
                span => expect(span.data.mysql.host).to.equal(process.env.INSTANA_CONNECT_MYSQL_HOST),
                span => expect(span.data.mysql.port).to.equal(Number(process.env.INSTANA_CONNECT_MYSQL_PORT)),
                span => expect(span.data.mysql.user).to.equal(process.env.INSTANA_CONNECT_MYSQL_USER),
                span => expect(span.data.mysql.db).to.equal(process.env.INSTANA_CONNECT_MYSQL_DB)
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
                span => expect(span.data.mysql.host).to.equal(process.env.INSTANA_CONNECT_MYSQL_HOST),
                span => expect(span.data.mysql.port).to.equal(Number(process.env.INSTANA_CONNECT_MYSQL_PORT)),
                span => expect(span.data.mysql.user).to.equal(process.env.INSTANA_CONNECT_MYSQL_USER),
                span => expect(span.data.mysql.db).to.equal(process.env.INSTANA_CONNECT_MYSQL_DB)
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

    it('must not capture bind variables by default (question-mark style)', () =>
      controls.sendRequest({ method: 'GET', path: '/bind-variables?scenario=question-select' }).then(() =>
        testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            verifyHttpEntry(spans, '/bind-variables');
            const mysqlSpans = testUtils.getSpansByName(spans, 'mysql');
            mysqlSpans.forEach(span => {
              expect(span.data.mysql.binds).to.not.exist;
            });
          })
        )
      ));

    describe('question-mark (?) style — with INSTANA_TRACING_DB_BIND_VARIABLES_DISABLE=false and allowed-columns=name', () => {
      before(async () => {
        await controls.stop();
        controls.env.INSTANA_TRACING_DB_BIND_VARIABLES_DISABLE = 'false';
        controls.env.INSTANA_TRACING_DB_BIND_VARIABLES_ALLOWED_COLUMNS = 'name';
        await controls.startAndWaitForAgentConnection(5000, Date.now() + config.getTestTimeout());
      });

      after(async () => {
        await controls.stop();
        delete controls.env.INSTANA_TRACING_DB_BIND_VARIABLES_DISABLE;
        delete controls.env.INSTANA_TRACING_DB_BIND_VARIABLES_ALLOWED_COLUMNS;
        await controls.startAndWaitForAgentConnection(5000, Date.now() + config.getTestTimeout());
      });

      it('must capture only the allowed column (name), not email — SELECT', () =>
        controls.sendRequest({ method: 'GET', path: '/bind-variables?scenario=question-select' }).then(() =>
          testUtils.retry(() =>
            agentControls.getSpans().then(spans => {
              verifyHttpEntry(spans, '/bind-variables');

              const span = testUtils
                .getSpansByName(spans, 'mysql')
                .find(s => s.data.mysql.stmt === 'SELECT * FROM users WHERE name = ? AND email = ?');
              expect(span).to.exist;
              expect(span.data.mysql.binds).to.be.an('array');
              expect(span.data.mysql.binds).to.have.lengthOf(1);
              expect(span.data.mysql.binds[0]).to.deep.equal({ name: 'name', value: 'bindtest' });
            })
          )
        ));

      it('must capture allowed binds for INSERT — column list correlated with ? positions', () =>
        controls.sendRequest({ method: 'GET', path: '/bind-variables?scenario=question-insert' }).then(() =>
          testUtils.retry(() =>
            agentControls.getSpans().then(spans => {
              verifyHttpEntry(spans, '/bind-variables');

              const span = testUtils
                .getSpansByName(spans, 'mysql')
                .find(s => s.data.mysql.stmt === 'INSERT INTO users (name, email) VALUES (?, ?)');
              expect(span).to.exist;
              expect(span.data.mysql.binds).to.be.an('array');
              expect(span.data.mysql.binds).to.have.lengthOf(1);
              expect(span.data.mysql.binds[0]).to.deep.equal({ name: 'name', value: 'insertuser' });
            })
          )
        ));

      it('must capture only the allowed column (name), not email or id — UPDATE', () =>
        controls.sendRequest({ method: 'GET', path: '/bind-variables?scenario=question-update' }).then(() =>
          testUtils.retry(() =>
            agentControls.getSpans().then(spans => {
              verifyHttpEntry(spans, '/bind-variables');

              const span = testUtils
                .getSpansByName(spans, 'mysql')
                .find(s => s.data.mysql.stmt === 'UPDATE users SET name = ?, email = ? WHERE id = ?');
              expect(span).to.exist;
              expect(span.data.mysql.binds).to.be.an('array');
              expect(span.data.mysql.binds).to.have.lengthOf(1);
              expect(span.data.mysql.binds[0]).to.deep.equal({ name: 'name', value: 'updatedname' });
            })
          )
        ));

      it('must capture only the allowed column (name), not email — DELETE', () =>
        controls.sendRequest({ method: 'GET', path: '/bind-variables?scenario=question-delete' }).then(() =>
          testUtils.retry(() =>
            agentControls.getSpans().then(spans => {
              verifyHttpEntry(spans, '/bind-variables');

              const span = testUtils
                .getSpansByName(spans, 'mysql')
                .find(s => s.data.mysql.stmt === 'DELETE FROM users WHERE name = ? AND email = ?');
              expect(span).to.exist;
              expect(span.data.mysql.binds).to.be.an('array');
              expect(span.data.mysql.binds).to.have.lengthOf(1);
              expect(span.data.mysql.binds[0]).to.deep.equal({ name: 'name', value: 'deleteuser' });
            })
          )
        ));

      it('must capture two separate bind entries for OR clause on the same column', () =>
        controls.sendRequest({ method: 'GET', path: '/bind-variables?scenario=question-or' }).then(() =>
          testUtils.retry(() =>
            agentControls.getSpans().then(spans => {
              verifyHttpEntry(spans, '/bind-variables');

              const span = testUtils
                .getSpansByName(spans, 'mysql')
                .find(s => s.data.mysql.stmt === 'SELECT * FROM users WHERE name = ? OR name = ?');
              expect(span).to.exist;
              expect(span.data.mysql.binds).to.be.an('array');
              expect(span.data.mysql.binds).to.have.lengthOf(2);
              expect(span.data.mysql.binds[0]).to.deep.equal({ name: 'name', value: 'alice' });
              expect(span.data.mysql.binds[1]).to.deep.equal({ name: 'name', value: 'bob' });
            })
          )
        ));

      it('must represent null bind values as the string "null"', () =>
        controls.sendRequest({ method: 'GET', path: '/bind-variables?scenario=question-null' }).then(() =>
          testUtils.retry(() =>
            agentControls.getSpans().then(spans => {
              verifyHttpEntry(spans, '/bind-variables');

              const span = testUtils
                .getSpansByName(spans, 'mysql')
                .find(s => s.data.mysql.stmt === 'SELECT * FROM users WHERE name = ?');
              expect(span).to.exist;
              expect(span.data.mysql.binds).to.be.an('array');
              expect(span.data.mysql.binds).to.have.lengthOf(1);
              expect(span.data.mysql.binds[0]).to.deep.equal({ name: 'name', value: 'null' });
            })
          )
        ));

      it('must capture the allowed column (name) from WHERE and ignore non-column ORDER BY param', () =>
        controls.sendRequest({ method: 'GET', path: '/bind-variables?scenario=question-order-by' }).then(() =>
          testUtils.retry(() =>
            agentControls.getSpans().then(spans => {
              verifyHttpEntry(spans, '/bind-variables');

              const span = testUtils
                .getSpansByName(spans, 'mysql')
                .find(
                  s =>
                    s.data.mysql.stmt === 'SELECT * FROM users WHERE name = ? ORDER BY email ASC LIMIT ?'
                );
              expect(span).to.exist;
              expect(span.data.mysql.binds).to.be.an('array');
              // Only the WHERE name=? position is an allowed column; the LIMIT ? has no column context.
              expect(span.data.mysql.binds).to.have.lengthOf(1);
              expect(span.data.mysql.binds[0]).to.deep.equal({ name: 'name', value: 'alice' });
            })
          )
        ));

      it('must not capture binds for HAVING clause (no column-to-param mapping)', () =>
        controls.sendRequest({ method: 'GET', path: '/bind-variables?scenario=question-having' }).then(() =>
          testUtils.retry(() =>
            agentControls.getSpans().then(spans => {
              verifyHttpEntry(spans, '/bind-variables');

              const span = testUtils
                .getSpansByName(spans, 'mysql')
                .find(
                  s =>
                    s.data.mysql.stmt ===
                    'SELECT name, COUNT(*) AS cnt FROM users GROUP BY name HAVING cnt > ?'
                );
              expect(span).to.exist;
              // HAVING cnt > ? — "cnt" is an alias, not a base column, so no bind is captured.
              expect(span.data.mysql.binds).to.not.exist;
            })
          )
        ));

      it('must capture IN collection binds as a single grouped JSON-array entry', () =>
        controls.sendRequest({ method: 'GET', path: '/bind-variables?scenario=question-in' }).then(() =>
          testUtils.retry(() =>
            agentControls.getSpans().then(spans => {
              verifyHttpEntry(spans, '/bind-variables');

              const span = testUtils
                .getSpansByName(spans, 'mysql')
                .find(s => s.data.mysql.stmt === 'SELECT * FROM users WHERE name IN (?, ?, ?)');
              expect(span).to.exist;
              expect(span.data.mysql.binds).to.be.an('array');
              expect(span.data.mysql.binds).to.have.lengthOf(1);
              expect(span.data.mysql.binds[0]).to.deep.equal({ name: 'name', value: '["alice","bob","carol"]' });
            })
          )
        ));
    });

    describe('question-mark (?) style — with INSTANA_TRACING_DB_BIND_VARIABLES_DISABLE=true (kill switch)', () => {
      before(async () => {
        await controls.stop();
        controls.env.INSTANA_TRACING_DB_BIND_VARIABLES_DISABLE = 'true';
        controls.env.INSTANA_TRACING_DB_BIND_VARIABLES_ALLOWED_COLUMNS = 'name';
        await controls.startAndWaitForAgentConnection(5000, Date.now() + config.getTestTimeout());
      });

      after(async () => {
        await controls.stop();
        delete controls.env.INSTANA_TRACING_DB_BIND_VARIABLES_DISABLE;
        delete controls.env.INSTANA_TRACING_DB_BIND_VARIABLES_ALLOWED_COLUMNS;
        await controls.startAndWaitForAgentConnection(5000, Date.now() + config.getTestTimeout());
      });

      it('must not capture any bind variables when disable=true, even with allowed-columns set', () =>
        controls.sendRequest({ method: 'GET', path: '/bind-variables?scenario=question-select' }).then(() =>
          testUtils.retry(() =>
            agentControls.getSpans().then(spans => {
              verifyHttpEntry(spans, '/bind-variables');

              const mysqlSpans = testUtils.getSpansByName(spans, 'mysql');
              expect(mysqlSpans.length).to.be.greaterThan(0);
              mysqlSpans.forEach(span => {
                expect(span.data.mysql.binds).to.not.exist;
              });
            })
          )
        ));
    });

    describe('question-mark (?) style — Config precedence', () => {
      describe('when both agent config and env var are set, env var kill switch takes precedence', () => {
        const customAgentControls = new AgentStubControls();
        let configControls;

        before(async () => {
          await customAgentControls.startAgent({
            dbBindVariablesConfig: {
              disable: false,
              'allowed-columns': ['name']
            }
          });

          configControls = new ProcessControls({
            agentControls: customAgentControls,
            dirname: __dirname,
            env: {
              ...env,
              INSTANA_TRACING_DB_BIND_VARIABLES_DISABLE: 'true',
              INSTANA_TRACING_DB_BIND_VARIABLES_ALLOWED_COLUMNS: 'name'
            }
          });
          await configControls.startAndWaitForAgentConnection(5000, Date.now() + config.getTestTimeout());
        });

        beforeEach(async () => {
          await customAgentControls.clearReceivedTraceData();
        });

        after(async () => {
          await customAgentControls.stopAgent();
          await configControls.stop();
        });

        it('must not capture bind variables when env var kill switch overrides agent config', () =>
          configControls.sendRequest({ method: 'GET', path: '/bind-variables?scenario=question-select' }).then(() =>
            testUtils.retry(() =>
              customAgentControls.getSpans().then(spans => {
                testUtils.expectAtLeastOneMatching(spans, [
                  span => expect(span.p).to.not.exist,
                  span => expect(span.k).to.equal(constants.ENTRY),
                  span => expect(span.n).to.equal('node.http.server'),
                  span => expect(span.data.http.url).to.equal('/bind-variables')
                ]);

                const mysqlSpans = testUtils.getSpansByName(spans, 'mysql');
                expect(mysqlSpans.length).to.be.greaterThan(0);
                mysqlSpans.forEach(span => {
                  expect(span.data.mysql.binds).to.not.exist;
                });
              })
            )
          ));
      });

      describe('when only agent config is set (no env var), question-mark (?) style', () => {
        const customAgentControls = new AgentStubControls();
        let configControls;

        before(async () => {
          await customAgentControls.startAgent({
            dbBindVariablesConfig: {
              disable: false,
              'allowed-columns': ['name']
            }
          });

          configControls = new ProcessControls({
            agentControls: customAgentControls,
            dirname: __dirname,
            env
          });
          await configControls.startAndWaitForAgentConnection(5000, Date.now() + config.getTestTimeout());
        });

        beforeEach(async () => {
          await customAgentControls.clearReceivedTraceData();
        });

        after(async () => {
          await customAgentControls.stopAgent();
          await configControls.stop();
        });

        it('must capture allowed bind variables when config is delivered via agent', () =>
          configControls.sendRequest({ method: 'GET', path: '/bind-variables?scenario=question-select' }).then(() =>
            testUtils.retry(() =>
              customAgentControls.getSpans().then(spans => {
                testUtils.expectAtLeastOneMatching(spans, [
                  span => expect(span.p).to.not.exist,
                  span => expect(span.k).to.equal(constants.ENTRY),
                  span => expect(span.n).to.equal('node.http.server'),
                  span => expect(span.data.http.url).to.equal('/bind-variables')
                ]);

                const span = testUtils
                  .getSpansByName(spans, 'mysql')
                  .find(s => s.data.mysql.stmt === 'SELECT * FROM users WHERE name = ? AND email = ?');
                expect(span).to.exist;
                expect(span.data.mysql.binds).to.be.an('array');
                expect(span.data.mysql.binds).to.have.lengthOf(1);
                expect(span.data.mysql.binds[0]).to.deep.equal({ name: 'name', value: 'bindtest' });
              })
            )
          ));
      });
    });
  }

  function verifyHttpEntry(spans, url) {
    return testUtils.expectAtLeastOneMatching(spans, [
      span => expect(span.p).to.not.exist,
      span => expect(span.k).to.equal(constants.ENTRY),
      span => expect(span.n).to.equal('node.http.server'),
      span => expect(span.data.http.url).to.contain(url.split('?')[0])
    ]);
  }
};
