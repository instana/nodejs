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

module.exports = function (name, version, isLatest) {
  this.timeout(config.getTestTimeout() * 10);

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  const drivers = ['mysql2', 'mysql2/promises'];
  const executionModes = [false, true];

  drivers.forEach(driverMode => {
    executionModes.forEach(useExecute => {
      registerSuite.call(this, driverMode, useExecute);
    });
  });

  function registerSuite(driverMode, useExecute) {
    describe(`driver mode: ${driverMode}, access function: ${useExecute ? 'execute' : 'query'}`, () => {
      const env = {
        DRIVER_MODE: driverMode,
        LIBRARY_VERSION: version,
        LIBRARY_NAME: name,
        LIBRARY_LATEST: isLatest
      };

      if (useExecute) {
        env.USE_EXECUTE = 'true';
      }

      test(env);
    });

    describe('suppressed', function () {
      const env = {
        DRIVER_MODE: driverMode,
        LIBRARY_VERSION: version,
        LIBRARY_NAME: name,
        LIBRARY_LATEST: isLatest
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

    it('must not capture bind variables by default (? style)', () =>
      controls.sendRequest({ method: 'GET', path: '/bind-variables?scenario=question-select' }).then(() =>
        testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            verifyHttpEntry(spans, '/bind-variables');
            testUtils.getSpansByName(spans, 'mysql').forEach(span => {
              expect(span.data.mysql.binds).to.not.exist;
            });
          })
        )
      ));

    it('must not capture bind variables by default (:param style)', () =>
      controls.sendRequest({ method: 'GET', path: '/bind-variables?scenario=named-select' }).then(() =>
        testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            verifyHttpEntry(spans, '/bind-variables');
            testUtils.getSpansByName(spans, 'mysql').forEach(span => {
              expect(span.data.mysql.binds).to.not.exist;
            });
          })
        )
      ));

    describe('bind variables with allowed-columns=name', () => {
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

      it('? style: must capture only name, not email — SELECT', () =>
        controls.sendRequest({ method: 'GET', path: '/bind-variables?scenario=question-select' }).then(() =>
          testUtils.retry(() =>
            agentControls.getSpans().then(spans => {
              verifyHttpEntry(spans, '/bind-variables');
              const span = testUtils
                .getSpansByName(spans, 'mysql')
                .find(s => s.data.mysql.stmt === 'SELECT * FROM users WHERE name = ? AND email = ?');
              expect(span).to.exist;
              expect(span.data.mysql.binds).to.be.an('array').with.lengthOf(1);
              expect(span.data.mysql.binds[0]).to.deep.equal({ name: 'name', value: 'bindtest' });
            })
          )
        ));

      it('? style: must capture name from INSERT column list', () =>
        controls.sendRequest({ method: 'GET', path: '/bind-variables?scenario=question-insert' }).then(() =>
          testUtils.retry(() =>
            agentControls.getSpans().then(spans => {
              verifyHttpEntry(spans, '/bind-variables');
              const span = testUtils
                .getSpansByName(spans, 'mysql')
                .find(s => s.data.mysql.stmt === 'INSERT INTO users (name, email) VALUES (?, ?)');
              expect(span).to.exist;
              expect(span.data.mysql.binds).to.be.an('array').with.lengthOf(1);
              expect(span.data.mysql.binds[0]).to.deep.equal({ name: 'name', value: 'insertuser' });
            })
          )
        ));

      it('? style: must represent null as "null"', () =>
        controls.sendRequest({ method: 'GET', path: '/bind-variables?scenario=question-null' }).then(() =>
          testUtils.retry(() =>
            agentControls.getSpans().then(spans => {
              verifyHttpEntry(spans, '/bind-variables');
              const span = testUtils
                .getSpansByName(spans, 'mysql')
                .find(s => s.data.mysql.stmt === 'SELECT * FROM users WHERE name = ?');
              expect(span).to.exist;
              expect(span.data.mysql.binds).to.be.an('array').with.lengthOf(1);
              expect(span.data.mysql.binds[0]).to.deep.equal({ name: 'name', value: 'null' });
            })
          )
        ));

      it(':param style: must capture only name, not email — SELECT', () =>
        controls.sendRequest({ method: 'GET', path: '/bind-variables?scenario=named-select' }).then(() =>
          testUtils.retry(() =>
            agentControls.getSpans().then(spans => {
              verifyHttpEntry(spans, '/bind-variables');
              const span = testUtils
                .getSpansByName(spans, 'mysql')
                .find(s => s.data.mysql.stmt === 'SELECT * FROM users WHERE name = :name AND email = :email');
              expect(span).to.exist;
              expect(span.data.mysql.binds).to.be.an('array').with.lengthOf(1);
              expect(span.data.mysql.binds[0]).to.deep.equal({ name: 'name', value: 'nameduser' });
            })
          )
        ));

      it(':param style: must capture name from INSERT column list', () =>
        controls.sendRequest({ method: 'GET', path: '/bind-variables?scenario=named-insert' }).then(() =>
          testUtils.retry(() =>
            agentControls.getSpans().then(spans => {
              verifyHttpEntry(spans, '/bind-variables');
              const span = testUtils
                .getSpansByName(spans, 'mysql')
                .find(s => s.data.mysql.stmt === 'INSERT INTO users (name, email) VALUES (:name, :email)');
              expect(span).to.exist;
              expect(span.data.mysql.binds).to.be.an('array').with.lengthOf(1);
              expect(span.data.mysql.binds[0]).to.deep.equal({ name: 'name', value: 'namedinsert' });
            })
          )
        ));

      it(':param style: must represent null as "null"', () =>
        controls.sendRequest({ method: 'GET', path: '/bind-variables?scenario=named-null' }).then(() =>
          testUtils.retry(() =>
            agentControls.getSpans().then(spans => {
              verifyHttpEntry(spans, '/bind-variables');
              const span = testUtils
                .getSpansByName(spans, 'mysql')
                .find(s => s.data.mysql.stmt === 'SELECT * FROM users WHERE name = :name');
              expect(span).to.exist;
              expect(span.data.mysql.binds).to.be.an('array').with.lengthOf(1);
              expect(span.data.mysql.binds[0]).to.deep.equal({ name: 'name', value: 'null' });
            })
          )
        ));
    });
  }
};

function verifyHttpEntry(spans, url) {
  return testUtils.expectAtLeastOneMatching(spans, [
    span => expect(span.p).to.not.exist,
    span => expect(span.k).to.equal(constants.ENTRY),
    span => expect(span.n).to.equal('node.http.server'),
    span => expect(span.data.http.url).to.contain(url.split('?')[0])
  ]);
}
