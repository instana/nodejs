/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const semver = require('semver');
const errors = require('request-promise/errors');
const expect = require('chai').expect;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const testUtils = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const globalAgent = require('../../../globalAgent');

const mochaSuiteFn =
  !supportedVersion(process.versions.node) ||
  // At some point, the mssql container failed to link correctly into the main Node.js container when running the
  // tests on Node.js 8, so all tests would fail because the app cannot connect to the MSSQL database. Since there is
  // no reasonable way of troubleshooting this we just skip these tests on Node.js 8 on CI. They run in all >= 10
  // versions though.
  (process.env.CI && semver.gte(process.versions.node, '8.0.0') && semver.lt(process.versions.node, '9.0.0'))
    ? describe.skip
    : describe;

mochaSuiteFn('tracing/mssql', function () {
  this.timeout(config.getTestTimeout());

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  const controls = new ProcessControls({
    dirname: __dirname,
    useGlobalAgent: true
  }).registerTestHooks();

  it('must trace dummy select', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/select-getdate'
      })
      .then(response => {
        expect(response.length).to.equal(1);

        return testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntrySpan = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('GET'),
              span => expect(span.data.http.url).to.equal('/select-getdate')
            ]);

            testUtils.expectAtLeastOneMatching(spans, span => {
              checkMssqlSpan(span, httpEntrySpan);
              expect(span.data.mssql.stmt).to.equal('SELECT GETDATE()');
            });
          })
        );
      }));

  it('must trace static dummy select', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/select-static'
      })
      .then(response => {
        expect(response.length).to.equal(1);

        return testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntrySpan = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('GET'),
              span => expect(span.data.http.url).to.equal('/select-static')
            ]);

            testUtils.expectAtLeastOneMatching(spans, span => {
              checkMssqlSpan(span, httpEntrySpan);
              expect(span.data.mssql.stmt).to.equal('SELECT GETDATE()');
            });
          })
        );
      }));

  it('must trace errors', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/error-callback'
      })
      .catch(errors.StatusCodeError, reason => reason)
      .then(response => {
        expect(response.statusCode).to.equal(500);

        return testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntrySpan = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('GET'),
              span => expect(span.data.http.url).to.equal('/error-callback')
            ]);

            testUtils.expectAtLeastOneMatching(spans, span => {
              checkMssqlErrorSpan(span, httpEntrySpan, "Invalid object name 'non_existing_table'");
              expect(span.data.mssql.stmt).to.equal('SELECT name, email FROM non_existing_table');
            });
          })
        );
      }));

  it('must trace select via promise', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/select-promise'
      })
      .then(response => {
        expect(response.length).to.equal(1);

        return testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntrySpan = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('GET'),
              span => expect(span.data.http.url).to.equal('/select-promise')
            ]);

            testUtils.expectAtLeastOneMatching(spans, span => {
              checkMssqlSpan(span, httpEntrySpan);
              expect(span.data.mssql.stmt).to.equal('SELECT GETDATE()');
            });
          })
        );
      }));

  it('must trace errors via promise', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/error-promise'
      })
      .catch(errors.StatusCodeError, reason => reason)
      .then(response => {
        expect(response.statusCode).to.equal(500);

        return testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntrySpan = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('GET'),
              span => expect(span.data.http.url).to.equal('/error-promise')
            ]);

            testUtils.expectAtLeastOneMatching(spans, span => {
              checkMssqlErrorSpan(span, httpEntrySpan, "Invalid object name 'non_existing_table'");
              expect(span.data.mssql.stmt).to.equal('SELECT name, email FROM non_existing_table');
            });
          })
        );
      }));

  it('must trace standard pool', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/select-standard-pool'
      })
      .then(response => {
        expect(response.length).to.equal(1);

        return testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntrySpan = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('GET'),
              span => expect(span.data.http.url).to.equal('/select-standard-pool')
            ]);

            testUtils.expectAtLeastOneMatching(spans, span => {
              checkMssqlSpan(span, httpEntrySpan);
              expect(span.data.mssql.stmt).to.equal('SELECT 1 AS NUMBER');
            });
          })
        );
      }));

  it('must trace custom pool', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/select-custom-pool'
      })
      .then(response => {
        expect(response.length).to.equal(1);

        return testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntrySpan = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('GET'),
              span => expect(span.data.http.url).to.equal('/select-custom-pool')
            ]);

            testUtils.expectAtLeastOneMatching(spans, span => {
              checkMssqlSpan(span, httpEntrySpan);
              expect(span.data.mssql.stmt).to.equal('SELECT 1 AS NUMBER');
            });
          })
        );
      }));

  it('must trace insert and select', () =>
    controls
      .sendRequest({
        method: 'POST',
        path: '/insert'
      })
      .then(() =>
        controls.sendRequest({
          method: 'POST',
          path: '/insert-params'
        })
      )
      .then(() =>
        controls.sendRequest({
          method: 'GET',
          path: '/select'
        })
      )
      .then(response => {
        expect(response.length).to.equal(2);
        expect(response[0].name).to.equal('gaius');
        expect(response[0].email).to.equal('gaius@julius.com');
        expect(response[1].name).to.equal('augustus');
        expect(response[1].email).to.equal('augustus@julius.com');
        return testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const firstWriteEntry = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('POST'),
              span => expect(span.data.http.url).to.equal('/insert')
            ]);
            const secondWriteEntry = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('POST'),
              span => expect(span.data.http.url).to.equal('/insert-params')
            ]);
            const readEntry = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('GET'),
              span => expect(span.data.http.url).to.equal('/select')
            ]);

            testUtils.expectAtLeastOneMatching(spans, span => {
              checkMssqlSpan(span, firstWriteEntry);
              expect(span.data.mssql.stmt).to.equal(
                "INSERT INTO UserTable (name, email) VALUES (N'gaius', N'gaius@julius.com')"
              );
            });
            testUtils.expectAtLeastOneMatching(spans, span => {
              checkMssqlSpan(span, secondWriteEntry);
              expect(span.data.mssql.stmt).to.equal('INSERT INTO UserTable (name, email) VALUES (@username, @email)');
            });
            testUtils.expectAtLeastOneMatching(spans, span => {
              checkMssqlSpan(span, readEntry);
              expect(span.data.mssql.stmt).to.equal('SELECT name, email FROM UserTable');
            });
          })
        );
      }));

  it('must trace prepared statements via callback', () =>
    controls
      .sendRequest({
        method: 'POST',
        path: '/insert-prepared-callback'
      })
      .then(() =>
        controls.sendRequest({
          method: 'GET',
          path: '/select-by-name/tiberius'
        })
      )
      .then(response => {
        expect(response).to.equal('tiberius@claudius.com');
        return testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const writeEntry = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('POST'),
              span => expect(span.data.http.url).to.equal('/insert-prepared-callback')
            ]);
            const readEntry = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('GET'),
              span => expect(span.data.http.url).to.equal('/select-by-name/tiberius')
            ]);

            testUtils.expectAtLeastOneMatching(spans, span => {
              checkMssqlSpan(span, writeEntry);
              expect(span.data.mssql.stmt).to.equal('INSERT INTO UserTable (name, email) VALUES (@username, @email)');
            });
            testUtils.expectAtLeastOneMatching(spans, span => {
              checkMssqlSpan(span, readEntry);
              expect(span.data.mssql.stmt).to.equal('SELECT name, email FROM UserTable WHERE name=@username');
            });
          })
        );
      }));

  it('must trace prepared statements via promise', () =>
    controls
      .sendRequest({
        method: 'POST',
        path: '/insert-prepared-promise'
      })
      .then(() =>
        controls.sendRequest({
          method: 'GET',
          path: '/select-by-name/caligula'
        })
      )
      .then(response => {
        expect(response).to.equal('caligula@julioclaudian.com');
        return testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const writeEntry = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('POST'),
              span => expect(span.data.http.url).to.equal('/insert-prepared-promise')
            ]);
            const readEntry = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('GET'),
              span => expect(span.data.http.url).to.equal('/select-by-name/caligula')
            ]);

            testUtils.expectAtLeastOneMatching(spans, span => {
              checkMssqlSpan(span, writeEntry);
              expect(span.data.mssql.stmt).to.equal('INSERT INTO UserTable (name, email) VALUES (@username, @email)');
            });
            testUtils.expectAtLeastOneMatching(spans, span => {
              checkMssqlSpan(span, readEntry);
              expect(span.data.mssql.stmt).to.equal('SELECT name, email FROM UserTable WHERE name=@username');
            });
          })
        );
      }));

  it('must trace errors in prepared statements via callback', () =>
    controls
      .sendRequest({
        method: 'POST',
        path: '/insert-prepared-error-callback'
      })
      .catch(errors.StatusCodeError, reason => reason)
      .then(response => {
        expect(response.statusCode).to.equal(500);
        return testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const writeEntry = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('POST'),
              span => expect(span.data.http.url).to.equal('/insert-prepared-error-callback')
            ]);
            testUtils.expectAtLeastOneMatching(spans, span => {
              checkMssqlErrorSpan(
                span,
                writeEntry,
                'The incoming tabular data stream (TDS) remote procedure call (RPC) protocol stream is incorrect. ' +
                  'Parameter 3 ("@email"): Data type 0xE7 has an invalid data length or metadata length.'
              );
              expect(span.data.mssql.stmt).to.equal('INSERT INTO UserTable (name, email) VALUES (@username, @email)');
            });
          })
        );
      }));

  it('must trace errors in prepared statements via promise', () =>
    controls
      .sendRequest({
        method: 'POST',
        path: '/insert-prepared-error-promise'
      })
      .catch(errors.StatusCodeError, reason => reason)
      .then(response => {
        expect(response.statusCode).to.equal(500);
        return testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const writeEntry = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('POST'),
              span => expect(span.data.http.url).to.equal('/insert-prepared-error-promise')
            ]);
            testUtils.expectAtLeastOneMatching(spans, span => {
              checkMssqlErrorSpan(
                span,
                writeEntry,
                'The incoming tabular data stream (TDS) remote procedure call (RPC) protocol stream is incorrect. ' +
                  'Parameter 3 ("@email"): Data type 0xE7 has an invalid data length or metadata length.'
              );
              expect(span.data.mssql.stmt).to.equal('INSERT INTO UserTable (name, email) VALUES (@username, @email)');
            });
          })
        );
      }));

  it('must trace transactions with callbacks', () =>
    controls
      .sendRequest({
        method: 'POST',
        path: '/transaction-callback'
      })
      .then(response => {
        expect(response).to.equal('vespasian@flavius.com');
        return testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntry = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('POST'),
              span => expect(span.data.http.url).to.equal('/transaction-callback')
            ]);
            testUtils.expectAtLeastOneMatching(spans, span => {
              checkMssqlSpan(span, httpEntry);
              expect(span.data.mssql.stmt).to.equal('INSERT INTO UserTable (name, email) VALUES (@username, @email)');
            });
            testUtils.expectAtLeastOneMatching(spans, span => {
              checkMssqlSpan(span, httpEntry);
              expect(span.data.mssql.stmt).to.equal("SELECT name, email FROM UserTable WHERE name=N'vespasian'");
            });
          })
        );
      }));

  it('must trace transactions with promises', () =>
    controls
      .sendRequest({
        method: 'POST',
        path: '/transaction-promise'
      })
      .then(response => {
        expect(response).to.equal('titus@flavius.com');
        return testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntry = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('POST'),
              span => expect(span.data.http.url).to.equal('/transaction-promise')
            ]);
            testUtils.expectAtLeastOneMatching(spans, span => {
              checkMssqlSpan(span, httpEntry);
              expect(span.data.mssql.stmt).to.equal('INSERT INTO UserTable (name, email) VALUES (@username, @email)');
            });
            testUtils.expectAtLeastOneMatching(spans, span => {
              checkMssqlSpan(span, httpEntry);
              expect(span.data.mssql.stmt).to.equal("SELECT name, email FROM UserTable WHERE name=N'titus'");
            });
          })
        );
      }));

  it('must trace stored procedure execution', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/stored-procedure-callback'
      })
      .then(response => {
        expect(response.recordset).to.exist;

        return testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntrySpan = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('GET'),
              span => expect(span.data.http.url).to.equal('/stored-procedure-callback')
            ]);

            testUtils.expectAtLeastOneMatching(spans, span => {
              checkMssqlSpan(span, httpEntrySpan);
              expect(span.data.mssql.stmt).to.equal('testProcedure');
            });
          })
        );
      }));

  it('must trace the streaming API', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/streaming'
      })
      .then(response => {
        expect(response.rows).to.exist;
        expect(response.errors.length).to.equal(0);

        return testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntrySpan = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('GET'),
              span => expect(span.data.http.url).to.equal('/streaming')
            ]);

            testUtils.expectAtLeastOneMatching(spans, span => {
              checkMssqlSpan(span, httpEntrySpan);
              expect(span.data.mssql.stmt).to.equal('SELECT name, email FROM UserTable');
            });
          })
        );
      }));

  it('must trace the pipe API', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/pipe'
      })
      .then(() =>
        testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntrySpan = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('GET'),
              span => expect(span.data.http.url).to.equal('/pipe')
            ]);

            testUtils.expectAtLeastOneMatching(spans, span => {
              checkMssqlSpan(span, httpEntrySpan);
              expect(span.data.mssql.stmt).to.equal('SELECT name, email FROM UserTable');
            });
          })
        )
      ));

  it('must trace batch with callback', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/batch-callback'
      })
      .then(response => {
        expect(response.length).to.equal(1);

        return testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntrySpan = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('GET'),
              span => expect(span.data.http.url).to.equal('/batch-callback')
            ]);

            testUtils.expectAtLeastOneMatching(spans, span => {
              checkMssqlSpan(span, httpEntrySpan);
              expect(span.data.mssql.stmt).to.equal('SELECT GETDATE()');
            });
          })
        );
      }));

  it('must trace batch with promise', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/batch-promise'
      })
      .then(response => {
        expect(response.length).to.equal(1);

        return testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntrySpan = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('GET'),
              span => expect(span.data.http.url).to.equal('/batch-promise')
            ]);

            testUtils.expectAtLeastOneMatching(spans, span => {
              checkMssqlSpan(span, httpEntrySpan);
              expect(span.data.mssql.stmt).to.equal('SELECT GETDATE()');
            });
          })
        );
      }));

  it('must trace bulk operations', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/bulk'
      })
      .then(response => {
        expect(response.rowsAffected).to.equal(3);

        return testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntrySpan = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('GET'),
              span => expect(span.data.http.url).to.equal('/bulk')
            ]);

            testUtils.expectAtLeastOneMatching(spans, span => {
              checkMssqlSpan(span, httpEntrySpan);
              expect(span.data.mssql.stmt).to.equal('MSSQL bulk operation');
            });
          })
        );
      }));

  it('must trace cancel', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/cancel'
      })
      .then(response => {
        expect(response.name).to.equal('RequestError');
        expect(response.code).to.equal('ECANCEL');

        return testUtils.retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntrySpan = testUtils.expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('GET'),
              span => expect(span.data.http.url).to.equal('/cancel')
            ]);

            testUtils.expectAtLeastOneMatching(spans, span => {
              checkMssqlErrorSpan(span, httpEntrySpan, 'Canceled.');
              expect(span.data.mssql.stmt).to.equal("WAITFOR DELAY '00:00:05'; SELECT 1 as NUMBER");
            });
          })
        );
      }));

  function checkMssqlSpan(span, parent) {
    checkMssqlInternally(span, parent, false);
  }

  function checkMssqlErrorSpan(span, parent, stringInError) {
    checkMssqlInternally(span, parent, true);
    expect(span.data.mssql.error).to.contain(stringInError);
  }

  function checkMssqlInternally(span, parent, error) {
    expect(span.t).to.equal(parent.t);
    expect(span.p).to.equal(parent.s);
    expect(span.k).to.equal(constants.EXIT);
    expect(span.f.e).to.equal(String(controls.getPid()));
    expect(span.f.h).to.equal('agent-stub-uuid');
    expect(span.n).to.equal('mssql');
    expect(span.async).to.not.exist;
    expect(span.error).to.not.exist;
    expect(span.ec).to.equal(error ? 1 : 0);
    expect(span.data).to.exist;
    expect(span.data.mssql).to.exist;
    expect(span.data.mssql.host).to.equal('localhost');
    expect(span.data.mssql.port).to.equal(1433);
    expect(span.data.mssql.user).to.equal('sa');
    expect(span.data.mssql.db).to.equal('nodejscollector');
  }
});
