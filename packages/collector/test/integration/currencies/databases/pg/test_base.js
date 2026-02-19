/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const expect = require('chai').expect;

const constants = require('@_local/core/src/tracing/constants');
const config = require('@_local/core/test/config');
const {
  retry,
  getSpansByName,
  expectAtLeastOneMatching,
  expectExactlyOneMatching
} = require('@_local/core/test/test_util');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');
const globalAgent = require('@_local/collector/test/globalAgent');

module.exports = function (name, version, isLatest) {
  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;
  let controls;

  before(async () => {
    controls = new ProcessControls({
      dirname: __dirname,
      useGlobalAgent: true,
      env: {
        LIBRARY_LATEST: isLatest,
        LIBRARY_VERSION: version,
        LIBRARY_NAME: name
      }
    });

    await controls.startAndWaitForAgentConnection(5000, Date.now() + config.getTestTimeout());
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

  it('parameterized queries', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/parameterized-query'
      })
      .then(() =>
        retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntry = verifyHttpEntry(spans, '/parameterized-query');
            const query = 'SELECT * FROM users WHERE name = $1';
            verifyPgExit(spans, httpEntry, query);
          })
        )
      ));

  it('must trace pooled select now', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/select-now-pool'
      })
      .then(response => {
        verifySimpleSelectResponse(response);
        return retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntry = verifyHttpEntry(spans, '/select-now-pool');
            verifyPgExit(spans, httpEntry, 'SELECT NOW()');
            verifyHttpExit(spans, httpEntry);
          })
        );
      }));

  it('must trace non-pooled query with callback', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/select-now-no-pool-callback'
      })
      .then(response => {
        verifySimpleSelectResponse(response);
        return retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntry = verifyHttpEntry(spans, '/select-now-no-pool-callback');
            verifyPgExit(spans, httpEntry, 'SELECT NOW()');
            verifyHttpExit(spans, httpEntry);
          })
        );
      }));

  it('must trace non-pooled query with promise', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/select-now-no-pool-promise'
      })
      .then(response => {
        verifySimpleSelectResponse(response);
        return retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntry = verifyHttpEntry(spans, '/select-now-no-pool-promise');
            verifyPgExit(spans, httpEntry, 'SELECT NOW()');
            verifyHttpExit(spans, httpEntry);
          })
        );
      }));

  it('must not associate unrelated calls with long query span', () => {
    setTimeout(() => {
      controls.sendRequest({
        method: 'GET',
        path: '/quick-query'
      });
      setTimeout(() => {
        controls.sendRequest({
          method: 'GET',
          path: '/quick-query'
        });
        setTimeout(() => {
          controls.sendRequest({
            method: 'GET',
            path: '/quick-query'
          });
        }, 200);
      }, 200);
    }, 500);
    return controls
      .sendRequest({
        method: 'GET',
        path: '/long-running-query'
      })
      .then(response => {
        verifySimpleSelectResponse(response);
        return retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntryLong = verifyHttpEntry(spans, '/long-running-query');
            const httpEntriesQuick = [];
            httpEntriesQuick[0] = verifyUniqueHttpEntry(spans, 'GET', '/quick-query', httpEntriesQuick);
            httpEntriesQuick[1] = verifyUniqueHttpEntry(spans, 'GET', '/quick-query', httpEntriesQuick);
            httpEntriesQuick[2] = verifyUniqueHttpEntry(spans, 'GET', '/quick-query', httpEntriesQuick);

            const allPgExitsFromLongQuery = spans.filter(s => s.n === 'postgres' && s.t === httpEntryLong.t);
            expect(allPgExitsFromLongQuery).to.have.lengthOf(1);
            for (let i = 0; i < httpEntriesQuick.length; i++) {
              const allPgExitsFromQuickQuery = spans.filter(s => s.n === 'postgres' && s.t === httpEntriesQuick[i].t);
              expect(allPgExitsFromQuickQuery).to.have.lengthOf(1);
            }
          })
        );
      });
  });

  it('must trace string based pool insert', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/pool-string-insert'
      })
      .then(response => {
        verifyInsertResponse(response);
        return retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntry = verifyHttpEntry(spans, '/pool-string-insert');
            verifyPgExit(spans, httpEntry, 'INSERT INTO users(name, email) VALUES($1, $2) RETURNING *');
            verifyHttpExit(spans, httpEntry);
          })
        );
      }));

  it('must trace config object based pool select', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/pool-config-select'
      })
      .then(response => {
        expect(response).to.exist;
        expect(response.command).to.equal('SELECT');
        expect(response.rowCount).to.be.a('number');

        return retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntry = verifyHttpEntry(spans, '/pool-config-select');
            verifyPgExit(spans, httpEntry, 'SELECT name, email FROM users');
            verifyHttpExit(spans, httpEntry);
          })
        );
      }));

  it('must trace promise based pool select', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/pool-config-select-promise'
      })
      .then(response => {
        verifyInsertResponse(response);
        return retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntry = verifyHttpEntry(spans, '/pool-config-select-promise');
            verifyPgExit(spans, httpEntry, 'INSERT INTO users(name, email) VALUES($1, $2) RETURNING *');
            verifyHttpExit(spans, httpEntry);
          })
        );
      }));

  it('must trace string based client insert', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/client-string-insert'
      })
      .then(response => {
        verifyInsertResponse(response);
        return retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntry = verifyHttpEntry(spans, '/client-string-insert');
            verifyPgExit(spans, httpEntry, 'INSERT INTO users(name, email) VALUES($1, $2) RETURNING *');
            verifyHttpExit(spans, httpEntry);
          })
        );
      }));

  it('must trace config object based client select', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/client-config-select'
      })
      .then(response => {
        expect(response).to.exist;
        expect(response.command).to.equal('SELECT');
        expect(response.rowCount).to.be.a('number');

        return retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntry = verifyHttpEntry(spans, '/client-config-select');
            verifyPgExit(spans, httpEntry, 'SELECT name, email FROM users');
            verifyHttpExit(spans, httpEntry);
          })
        );
      }));

  it('must capture errors', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/table-doesnt-exist',
        simple: false
      })
      .then(response => {
        expect(response).to.exist;
        expect(response.severity).to.equal('ERROR');
        // 42P01 -> PostgreSQL's code for "relation does not exist"
        expect(response.code).to.equal('42P01');

        return retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntry = verifyHttpEntry(spans, '/table-doesnt-exist');
            verifyPgExitWithError(
              spans,
              httpEntry,
              'SELECT name, email FROM nonexistanttable',
              'relation "nonexistanttable" does not exist'
            );
            verifyHttpExit(spans, httpEntry);
          })
        );
      }));

  it('must not break vanilla postgres (not tracing)', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/pool-string-insert',
        suppressTracing: true
      })
      .then(response => {
        verifyInsertResponse(response);
        return retry(() =>
          agentControls.getSpans().then(spans => {
            const entrySpans = getSpansByName(spans, 'node.http.server');
            expect(entrySpans).to.have.lengthOf(0);
            const pgExits = getSpansByName(spans, 'postgres');
            expect(pgExits).to.have.lengthOf(0);
          })
        );
      }));

  it('must trace transactions', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/transaction'
      })
      .then(response => {
        verifyInsertResponse(response, 'trans2', 'nodejstests@blah');
        return retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntry = verifyHttpEntry(spans, '/transaction');
            expect(getSpansByName(spans, 'postgres')).to.have.lengthOf(4);
            verifyPgExit(spans, httpEntry, 'BEGIN');
            verifyPgExit(spans, httpEntry, 'INSERT INTO users(name, email) VALUES($1, $2) RETURNING *');
            verifyPgExit(spans, httpEntry, 'INSERT INTO users(name, email) VALUES($1, $2) RETURNING *');
            verifyPgExit(spans, httpEntry, 'COMMIT');
            verifyHttpExit(spans, httpEntry);
          })
        );
      }));

  it('trace all asynchronous queries', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/asynchronous-query'
      })
      .then(response => {
        expect(response).to.exist;

        return retry(() =>
          agentControls.getSpans().then(spans => {
            expect(getSpansByName(spans, 'postgres')).to.have.lengthOf(3);
            const httpEntry = verifyHttpEntry(spans, '/asynchronous-query');
            verifyPgExit(spans, httpEntry, 'SELECT NOW()');
            verifyPgExit(spans, httpEntry, 'INSERT INTO users(name, email) VALUES($1, $2) RETURNING *');
            verifyPgExit(spans, httpEntry, 'SELECT NOW() FROM pg_sleep(2)');
            verifyHttpExit(spans, httpEntry);
          })
        );
      }));

  function verifySimpleSelectResponse(response) {
    expect(response).to.exist;
    expect(response.command).to.equal('SELECT');
    expect(response.rowCount).to.equal(1);
    expect(response.rows.length).to.equal(1);
    expect(response.rows[0].now).to.be.a('string');
  }

  function verifyInsertResponse(response, expectedName = 'beaker', email = 'beaker@muppets.com') {
    expect(response).to.exist;
    expect(response.command).to.equal('INSERT');
    expect(response.rowCount).to.equal(1);
    expect(response.rows.length).to.equal(1);
    expect(response.rows[0].name).to.equal(expectedName);
    expect(response.rows[0].email).to.equal(email);
  }

  function verifyHttpEntry(spans, url) {
    return expectAtLeastOneMatching(spans, [
      span => expect(span.p).to.not.exist,
      span => expect(span.k).to.equal(constants.ENTRY),
      span => expect(span.f.e).to.equal(String(controls.getPid())),
      span => expect(span.f.h).to.equal('agent-stub-uuid'),
      span => expect(span.n).to.equal('node.http.server'),
      span => expect(span.data.http.url).to.equal(url)
    ]);
  }

  function verifyPgExit(spans, parent, statement) {
    return expectAtLeastOneMatching(spans, span => {
      verifyPgExitBase(span, parent, statement);
      expect(span.error).to.not.exist;
      expect(span.ec).to.equal(0);
    });
  }

  function verifyPgExitWithError(spans, parent, statement, errorMessage) {
    return expectAtLeastOneMatching(spans, span => {
      verifyPgExitBase(span, parent, statement);
      expect(span.error).to.not.exist;
      expect(span.ec).to.equal(1);
      expect(span.data.pg.error).to.contain(errorMessage);
    });
  }

  function verifyPgExitBase(span, parent, statement) {
    expect(span.n).to.equal('postgres');
    expect(span.k).to.equal(constants.EXIT);
    expect(span.t).to.equal(parent.t);
    expect(span.p).to.equal(parent.s);
    expect(span.f.e).to.equal(String(controls.getPid()));
    expect(span.f.h).to.equal('agent-stub-uuid');
    expect(span.async).to.not.exist;
    expect(span.data).to.exist;
    expect(span.data.pg).to.exist;
    expect(span.data.pg.host).to.equal('127.0.0.1');
    expect(span.data.pg.port).to.equal(5432);
    expect(span.data.pg.user).to.equal('node');
    expect(span.data.pg.db).to.equal('nodedb');
    expect(span.data.pg.stmt).to.equal(statement);
  }

  function verifyUniqueHttpEntry(spans, method, url, other) {
    return expectAtLeastOneMatching(spans, span => {
      expect(span.p).to.not.exist;
      expect(span.k).to.equal(constants.ENTRY);
      expect(span.f.e).to.equal(String(controls.getPid()));
      expect(span.f.h).to.equal('agent-stub-uuid');
      expect(span.n).to.equal('node.http.server');
      expect(span.data.http.method).to.equal(method);
      expect(span.data.http.url).to.equal(url);
      for (let i = 0; i < other.length; i++) {
        expect(span.t).to.not.equal(other[i].t);
        expect(span.s).to.not.equal(other[i].s);
      }
    });
  }

  function verifyHttpExit(spans, parent) {
    expectExactlyOneMatching(spans, [
      span => expect(span.t).to.equal(parent.t),
      span => expect(span.p).to.equal(parent.s),
      span => expect(span.n).to.equal('node.http.client'),
      span => expect(span.k).to.equal(constants.EXIT),
      span => expect(span.f.e).to.equal(String(controls.getPid())),
      span => expect(span.f.h).to.equal('agent-stub-uuid'),
      span => expect(span.async).to.not.exist,
      span => expect(span.error).to.not.exist,
      span => expect(span.ec).to.equal(0),
      span => expect(span.data.http.method).to.equal('GET'),
      span => expect(span.data.http.url).to.match(/http:\/\/127\.0\.0\.1:/),
      span => expect(span.data.http.status).to.equal(200)
    ]);
  }
};
