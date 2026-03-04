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

  it('must collect bind variables from parameterized queries', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/bind-variables-test'
      })
      .then(() =>
        retry(() =>
          agentControls.getSpans().then(spans => {
            verifyHttpEntry(spans, '/bind-variables-test');

            // Verify first query with string and array parameters
            let selectQuery = getSpansByName(spans, 'postgres');

            console.log('SPAN SELECT QUERY: ', selectQuery[0].data);

            selectQuery = selectQuery.find(
              span => span.data.pg.stmt === 'SELECT * FROM users WHERE name = $1 AND email = $2'
            );
            expect(selectQuery).to.exist;
            expect(selectQuery.data.pg.params).to.exist;
            expect(selectQuery.data.pg.params).to.be.an('array');
            expect(selectQuery.data.pg.params).to.have.lengthOf(2);
            // Verify values are masked (first 2 and last 2 chars visible, exact length preserved)
            // 'testuser' (8 chars) -> 'te****er'
            expect(selectQuery.data.pg.params[0]).to.equal('te****er');
            expect(selectQuery.data.pg.params[0]).to.have.lengthOf(8);
            // 'test@example.com' (16 chars) -> 'te************om'
            expect(selectQuery.data.pg.params[1]).to.equal('te************om');
            expect(selectQuery.data.pg.params[1]).to.have.lengthOf(16);

            // Verify second query with config object containing values
            const insertQuery = getSpansByName(spans, 'postgres').find(
              span => span.data.pg.stmt === 'INSERT INTO users(name, email) VALUES($1, $2) RETURNING *'
            );
            expect(insertQuery).to.exist;
            expect(insertQuery.data.pg.params).to.exist;
            expect(insertQuery.data.pg.params).to.be.an('array');
            expect(insertQuery.data.pg.params).to.have.lengthOf(2);
            // Verify values are masked with exact length preserved
            // 'bindtest' (8 chars) -> 'bi****st'
            expect(insertQuery.data.pg.params[0]).to.equal('bi****st');
            expect(insertQuery.data.pg.params[0]).to.have.lengthOf(8);
            // 'bindtest@example.com' (20 chars) -> 'bi****************om'
            expect(insertQuery.data.pg.params[1]).to.equal('bi****************om');
            expect(insertQuery.data.pg.params[1]).to.have.lengthOf(20);
          })
        )
      ));

  it('must collect bind variables when calling stored procedures', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/stored-procedure-test'
      })
      .then(() =>
        retry(() =>
          agentControls.getSpans().then(spans => {
            verifyHttpEntry(spans, '/stored-procedure-test');

            // Verify INSERT query with bind variables
            const insertQuery = getSpansByName(spans, 'postgres').find(
              span => span.data.pg.stmt && span.data.pg.stmt.includes('INSERT INTO users(name, email) VALUES($1, $2)')
            );
            expect(insertQuery).to.exist;
            expect(insertQuery.data.pg.params).to.exist;
            expect(insertQuery.data.pg.params).to.be.an('array');
            expect(insertQuery.data.pg.params).to.have.lengthOf(2);
            // Verify values are masked with exact length preserved
            // 'proceduretest' (13 chars) -> 'pr*********st'
            expect(insertQuery.data.pg.params[0]).to.equal('pr*********st');
            expect(insertQuery.data.pg.params[0]).to.have.lengthOf(13);
            // 'procedure@example.com' (21 chars) -> 'pr*****************om'
            expect(insertQuery.data.pg.params[1]).to.equal('pr*****************om');
            expect(insertQuery.data.pg.params[1]).to.have.lengthOf(21);

            // Verify stored procedure call with bind variable
            const procedureCall = getSpansByName(spans, 'postgres').find(
              span => span.data.pg.stmt === 'SELECT * FROM get_user_by_name($1)'
            );
            expect(procedureCall).to.exist;
            expect(procedureCall.data.pg.params).to.exist;
            expect(procedureCall.data.pg.params).to.be.an('array');
            expect(procedureCall.data.pg.params).to.have.lengthOf(1);
            // Verify value is masked with exact length preserved
            // 'proceduretest' (13 chars) -> 'pr*********st'
            expect(procedureCall.data.pg.params[0]).to.equal('pr*********st');
            expect(procedureCall.data.pg.params[0]).to.have.lengthOf(13);
          })
        )
      ));

  it('must collect and mask all data types correctly', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/all-data-types-test'
      })
      .then(() =>
        retry(() =>
          agentControls.getSpans().then(spans => {
            verifyHttpEntry(spans, '/all-data-types-test');
            const pgSpans = getSpansByName(spans, 'postgres');

            // 1. String value test
            const stringQuery = pgSpans.find(span => span.data.pg.stmt.includes('string_value'));
            expect(stringQuery).to.exist;
            expect(stringQuery.data.pg.params).to.exist;
            // 'sensitive_password_123' (23 chars) -> 'se*******************23'
            expect(stringQuery.data.pg.params[0]).to.equal('se******************23');
            expect(stringQuery.data.pg.params[0]).to.have.lengthOf(22);

            // 2. Number values test
            const numberQuery = pgSpans.find(span => span.data.pg.stmt.includes('int_value'));
            expect(numberQuery).to.exist;
            expect(numberQuery.data.pg.params).to.have.lengthOf(2);
            // 42 -> '**'
            expect(numberQuery.data.pg.params[0]).to.equal('**');
            // 3.14159 -> '3.***59'
            expect(numberQuery.data.pg.params[1]).to.equal('3.***59');

            // 3. Boolean value test
            const boolQuery = pgSpans.find(span => span.data.pg.stmt.includes('bool_value'));
            expect(boolQuery).to.exist;
            // true -> 't**e'
            expect(boolQuery.data.pg.params[0]).to.equal('t**e');

            // 4. Null value test
            const nullQuery = pgSpans.find(span => span.data.pg.stmt.includes('null_value'));
            expect(nullQuery).to.exist;
            expect(nullQuery.data.pg.params[0]).to.equal('<null>');

            // 5. Date value test
            const dateQuery = pgSpans.find(span => span.data.pg.stmt.includes('date_value'));
            expect(dateQuery).to.exist;
            // Date ISO string is masked
            expect(dateQuery.data.pg.params[0]).to.match(/^20\*+0Z$/);
            expect(dateQuery.data.pg.params[0]).to.have.lengthOf(24);

            // 6. JSON object test
            const jsonQuery = pgSpans.find(span => span.data.pg.stmt.includes('json_value'));
            expect(jsonQuery).to.exist;
            // JSON is now masked with structure preserved
            const parsedJson = JSON.parse(jsonQuery.data.pg.params[0]);
            expect(parsedJson).to.have.property('u**r', 'j**n');
            expect(parsedJson).to.have.property('em**l', 'jo**************om');
            expect(parsedJson).to.have.property('pr********s');
            expect(parsedJson['pr********s']).to.have.property('th**e', 'd**k');
            expect(parsedJson['pr********s']).to.have.property('no*********ns', 't**e');

            // 7. Array test
            const arrayQuery = pgSpans.find(span => span.data.pg.stmt.includes('array_value'));
            expect(arrayQuery).to.exist;
            // Array is now masked with structure preserved
            const parsedArray = JSON.parse(arrayQuery.data.pg.params[0]);
            expect(parsedArray).to.be.an('array');
            expect(parsedArray).to.have.lengthOf(5);
            expect(parsedArray[0]).to.equal('1');
            expect(parsedArray[1]).to.equal('2');
            expect(parsedArray[2]).to.equal('3');
            expect(parsedArray[3]).to.equal('4');
            expect(parsedArray[4]).to.equal('5');

            // 8. Nested JSON test
            const nestedQuery = pgSpans.find(span => span.data.pg.stmt.includes('nested_value'));
            expect(nestedQuery).to.exist;
            // Complex nested JSON is now masked with structure preserved
            const parsedNested = JSON.parse(nestedQuery.data.pg.params[0]);
            expect(parsedNested).to.have.property('us**s');
            expect(parsedNested['us**s']).to.be.an('array');
            expect(parsedNested['us**s']).to.have.lengthOf(2);
            expect(parsedNested['us**s'][0]).to.have.property('*d', '1');
            expect(parsedNested['us**s'][0]).to.have.property('n**e', 'Al**e');
            expect(parsedNested['us**s'][0]).to.have.property('em**l', 'al**************om');
            expect(parsedNested).to.have.property('me*****a');
            expect(parsedNested['me*****a']).to.have.property('cr****d', '20********01');
            expect(parsedNested['me*****a']).to.have.property('ve****n', '1');

            // 9. Buffer/Binary data test
            const binaryQuery = pgSpans.find(span => span.data.pg.stmt.includes('binary_value'));
            expect(binaryQuery).to.exist;
            // Buffer shown as size
            expect(binaryQuery.data.pg.params[0]).to.equal('<Buffer 8 bytes>');

            // 10. Large buffer test
            const largeBinaryQuery = pgSpans.find(span => span.data.pg.stmt.includes('large_binary'));
            expect(largeBinaryQuery).to.exist;
            expect(largeBinaryQuery.data.pg.params[0]).to.equal('<Buffer 1024 bytes>');

            // 11. Mixed types in single query
            const mixedQuery = pgSpans.find(span =>
              span.data.pg.stmt.includes('SELECT $1::text, $2::integer, $3::boolean, $4::jsonb, $5::bytea')
            );
            expect(mixedQuery).to.exist;
            expect(mixedQuery.data.pg.params).to.have.lengthOf(5);
            // String: 'user@example.com' -> 'us************om'
            expect(mixedQuery.data.pg.params[0]).to.equal('us************om');
            // Number: 12345 -> '1***5'
            expect(mixedQuery.data.pg.params[1]).to.equal('1***5');
            // Boolean: false -> 'f***e'
            expect(mixedQuery.data.pg.params[2]).to.equal('f***e');
            // JSON: '{"key":"value"}' is now masked with structure preserved
            const parsedMixed = JSON.parse(mixedQuery.data.pg.params[3]);
            expect(parsedMixed).to.have.property('k*y', 'va**e');
            // Buffer: '<Buffer 6 bytes>'
            expect(mixedQuery.data.pg.params[4]).to.equal('<Buffer 6 bytes>');
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
