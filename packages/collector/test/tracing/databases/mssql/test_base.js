/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const uuid = require('uuid').v4;
const path = require('path');
const expect = require('chai').expect;

const constants = require('@_instana/core/src/tracing/constants');
const config = require('@_instana/core/test/config');
const { retry, expectAtLeastOneMatching, expectExactlyOneMatching } = require('@_instana/core/test/test_util');
const ProcessControls = require('@_instana/collector/test/test_util/ProcessControls');
const globalAgent = require('@_instana/collector/test/globalAgent');

const userTable = `UserTable_${uuid()}`.replace(/-/g, '_');
const procedureName = `testProcedure_${uuid()}`.replace(/-/g, '_');

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
        LIBRARY_NAME: name,
        AZURE_USER_TABLE: userTable,
        AZURE_PROCEDURE_NAME: procedureName
      }
    });

    await controls.startAndWaitForAgentConnection(5000, Date.now() + config.getTestTimeout() * 3);
  });

  beforeEach(async () => {
    await agentControls.clearReceivedTraceData();
  });

  after(async () => {
    await controls.sendRequest({
      method: 'DELETE',
      path: '/delete'
    });

    await controls.stop();
  });

  afterEach(async () => {
    await controls.clearIpcMessages();
  });

  it('must trace the pipe API', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/pipe'
      })
      .then(() =>
        retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntrySpan = expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('GET'),
              span => expect(span.data.http.url).to.equal('/pipe')
            ]);

            expectAtLeastOneMatching(spans, span => {
              checkMssqlSpan(span, httpEntrySpan);
              expect(span.data.mssql.stmt).to.equal(`SELECT name, email FROM ${userTable}`);
            });
          })
        )
      ));

  it('must trace dummy select', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/select-getdate'
      })
      .then(response => {
        expect(response.length).to.equal(1);

        return retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntrySpan = expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('GET'),
              span => expect(span.data.http.url).to.equal('/select-getdate')
            ]);

            expectAtLeastOneMatching(spans, span => {
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

        return retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntrySpan = expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('GET'),
              span => expect(span.data.http.url).to.equal('/select-static')
            ]);

            expectAtLeastOneMatching(spans, span => {
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
      .then(errorResponse => {
        expect(errorResponse.code).to.equal('EREQUEST');
        expect(errorResponse.name).to.equal('RequestError');
        return retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntrySpan = expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('GET'),
              span => expect(span.data.http.url).to.equal('/error-callback')
            ]);

            expectAtLeastOneMatching(spans, span => {
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

        return retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntrySpan = expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('GET'),
              span => expect(span.data.http.url).to.equal('/select-promise')
            ]);

            expectAtLeastOneMatching(spans, span => {
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
      .then(errorResponse => {
        expect(errorResponse.code).to.equal('EREQUEST');
        expect(errorResponse.name).to.equal('RequestError');
        return retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntrySpan = expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('GET'),
              span => expect(span.data.http.url).to.equal('/error-promise')
            ]);

            expectAtLeastOneMatching(spans, span => {
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

        return retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntrySpan = expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('GET'),
              span => expect(span.data.http.url).to.equal('/select-standard-pool')
            ]);

            expectAtLeastOneMatching(spans, span => {
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

        return retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntrySpan = expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('GET'),
              span => expect(span.data.http.url).to.equal('/select-custom-pool')
            ]);

            expectAtLeastOneMatching(spans, span => {
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
        return retry(() =>
          agentControls.getSpans().then(spans => {
            const firstWriteEntry = expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('POST'),
              span => expect(span.data.http.url).to.equal('/insert')
            ]);
            const secondWriteEntry = expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('POST'),
              span => expect(span.data.http.url).to.equal('/insert-params')
            ]);
            const readEntry = expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('GET'),
              span => expect(span.data.http.url).to.equal('/select')
            ]);

            expectAtLeastOneMatching(spans, span => {
              checkMssqlSpan(span, firstWriteEntry);
              expect(span.data.mssql.stmt).to.equal(
                `INSERT INTO ${userTable} (name, email) VALUES (N'gaius', N'gaius@julius.com')`
              );
            });
            expectAtLeastOneMatching(spans, span => {
              checkMssqlSpan(span, secondWriteEntry);
              expect(span.data.mssql.stmt).to.equal(
                `INSERT INTO ${userTable} (name, email) VALUES (@username, @email)`
              );
            });
            expectAtLeastOneMatching(spans, span => {
              checkMssqlSpan(span, readEntry);
              expect(span.data.mssql.stmt).to.equal(`SELECT name, email FROM ${userTable}`);
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
        return retry(() =>
          agentControls.getSpans().then(spans => {
            const writeEntry = expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('POST'),
              span => expect(span.data.http.url).to.equal('/insert-prepared-callback')
            ]);
            const readEntry = expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('GET'),
              span => expect(span.data.http.url).to.equal('/select-by-name/tiberius')
            ]);

            expectAtLeastOneMatching(spans, span => {
              checkMssqlSpan(span, writeEntry);
              expect(span.data.mssql.stmt).to.equal(
                `INSERT INTO ${userTable} (name, email) VALUES (@username, @email)`
              );
            });
            expectAtLeastOneMatching(spans, span => {
              checkMssqlSpan(span, readEntry);
              expect(span.data.mssql.stmt).to.equal(`SELECT name, email FROM ${userTable} WHERE name=@username`);
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
        return retry(() =>
          agentControls.getSpans().then(spans => {
            const writeEntry = expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('POST'),
              span => expect(span.data.http.url).to.equal('/insert-prepared-promise')
            ]);
            const readEntry = expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('GET'),
              span => expect(span.data.http.url).to.equal('/select-by-name/caligula')
            ]);

            expectAtLeastOneMatching(spans, span => {
              checkMssqlSpan(span, writeEntry);
              expect(span.data.mssql.stmt).to.equal(
                `INSERT INTO ${userTable} (name, email) VALUES (@username, @email)`
              );
            });
            expectAtLeastOneMatching(spans, span => {
              checkMssqlSpan(span, readEntry);
              expect(span.data.mssql.stmt).to.equal(`SELECT name, email FROM ${userTable} WHERE name=@username`);
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
      .then(errorResponse => {
        expect(errorResponse.code).to.equal('EREQUEST');
        expect(errorResponse.name).to.equal('RequestError');
        return retry(() =>
          agentControls.getSpans().then(spans => {
            const writeEntry = expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('POST'),
              span => expect(span.data.http.url).to.equal('/insert-prepared-error-callback')
            ]);
            expectAtLeastOneMatching(spans, span => {
              checkMssqlErrorSpan(
                span,
                writeEntry,
                'The incoming tabular data stream (TDS) remote procedure call (RPC) protocol stream is ' +
                'incorrect. Parameter 3 ("@email"): Data type 0xE7 has an invalid data length or metadata length.'
              );
              expect(span.data.mssql.stmt).to.equal(
                `INSERT INTO ${userTable} (name, email) VALUES (@username, @email)`
              );
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
      .then(errorResponse => {
        expect(errorResponse.code).to.equal('EREQUEST');
        expect(errorResponse.name).to.equal('RequestError');
        return retry(() =>
          agentControls.getSpans().then(spans => {
            const writeEntry = expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('POST'),
              span => expect(span.data.http.url).to.equal('/insert-prepared-error-promise')
            ]);
            expectAtLeastOneMatching(spans, span => {
              checkMssqlErrorSpan(
                span,
                writeEntry,
                'The incoming tabular data stream (TDS) remote procedure call (RPC) protocol stream is ' +
                'incorrect. Parameter 3 ("@email"): Data type 0xE7 has an invalid data length or metadata length.'
              );
              expect(span.data.mssql.stmt).to.equal(
                `INSERT INTO ${userTable} (name, email) VALUES (@username, @email)`
              );
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
        return retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntry = expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('POST'),
              span => expect(span.data.http.url).to.equal('/transaction-callback')
            ]);
            expectAtLeastOneMatching(spans, span => {
              checkMssqlSpan(span, httpEntry);
              expect(span.data.mssql.stmt).to.equal(
                `INSERT INTO ${userTable} (name, email) VALUES (@username, @email)`
              );
            });
            expectAtLeastOneMatching(spans, span => {
              checkMssqlSpan(span, httpEntry);
              expect(span.data.mssql.stmt).to.equal(`SELECT name, email FROM ${userTable} WHERE name=N'vespasian'`);
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
        return retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntry = expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('POST'),
              span => expect(span.data.http.url).to.equal('/transaction-promise')
            ]);
            expectAtLeastOneMatching(spans, span => {
              checkMssqlSpan(span, httpEntry);
              expect(span.data.mssql.stmt).to.equal(
                `INSERT INTO ${userTable} (name, email) VALUES (@username, @email)`
              );
            });
            expectAtLeastOneMatching(spans, span => {
              checkMssqlSpan(span, httpEntry);
              expect(span.data.mssql.stmt).to.equal(`SELECT name, email FROM ${userTable} WHERE name=N'titus'`);
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

        return retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntrySpan = expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('GET'),
              span => expect(span.data.http.url).to.equal('/stored-procedure-callback')
            ]);

            expectAtLeastOneMatching(spans, span => {
              checkMssqlSpan(span, httpEntrySpan);
              expect(span.data.mssql.stmt).to.equal(procedureName);
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

        return retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntrySpan = expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('GET'),
              span => expect(span.data.http.url).to.equal('/streaming')
            ]);

            expectAtLeastOneMatching(spans, span => {
              checkMssqlSpan(span, httpEntrySpan);
              expect(span.data.mssql.stmt).to.equal(`SELECT name, email FROM ${userTable}`);
            });
          })
        );
      }));

  it('must trace batch with callback', () =>
    controls
      .sendRequest({
        method: 'GET',
        path: '/batch-callback'
      })
      .then(response => {
        expect(response.length).to.equal(1);

        return retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntrySpan = expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('GET'),
              span => expect(span.data.http.url).to.equal('/batch-callback')
            ]);

            expectAtLeastOneMatching(spans, span => {
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

        return retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntrySpan = expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('GET'),
              span => expect(span.data.http.url).to.equal('/batch-promise')
            ]);

            expectAtLeastOneMatching(spans, span => {
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

        return retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntrySpan = expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('GET'),
              span => expect(span.data.http.url).to.equal('/bulk')
            ]);

            expectAtLeastOneMatching(spans, span => {
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

        return retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntrySpan = expectAtLeastOneMatching(spans, [
              span => expect(span.n).to.equal('node.http.server'),
              span => expect(span.data.http.method).to.equal('GET'),
              span => expect(span.data.http.url).to.equal('/cancel')
            ]);

            expectAtLeastOneMatching(spans, span => {
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
    expect(span.data.mssql.host).to.contain('nodejs-team-db-server.database.window');
    expect(span.data.mssql.port).to.equal(1433);
    expect(span.data.mssql.user).to.equal('admin@instana@nodejs-team-db-server');
    expect(span.data.mssql.db).to.equal('azure-nodejs-test');
  }
};