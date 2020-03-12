'use strict';

const semver = require('semver');
const errors = require('request-promise/errors');
const expect = require('chai').expect;

const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const utils = require('../../../../../core/test/utils');

describe('tracing/mssql', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }
  if (process.env.CI && semver.gte(process.versions.node, '8.0.0') && semver.lt(process.versions.node, '9.0.0')) {
    // At some point, the mssql container failed to link correctly into the main Node.js container when running the
    // tests on Node.js 8, so all tests would fail because the app cannot connect to the MSSQL database. Since there is
    // no reasonable way of troubleshooting this we just skip these tests on Node.js 8. They run in Node.js 6 and all
    // >= 10 versions though.
    return;
  }

  this.timeout(config.getTestTimeout());
  const agentControls = require('../../../apps/agentStubControls');
  agentControls.registerTestHooks();
  const AppControls = require('./controls');
  const appControls = new AppControls({
    agentControls
  });
  appControls.registerTestHooks();

  it('must trace dummy select', () =>
    appControls
      .sendRequest({
        method: 'GET',
        path: '/select-getdate'
      })
      .then(response => {
        expect(response.length).to.equal(1);

        return utils.retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntrySpan = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.data.http.method).to.equal('GET');
              expect(span.data.http.url).to.equal('/select-getdate');
            });

            utils.expectOneMatching(spans, span => {
              checkMssqlSpan(span, httpEntrySpan);
              expect(span.data.mssql.stmt).to.equal('SELECT GETDATE()');
            });
          })
        );
      }));

  it('must trace static dummy select', () =>
    appControls
      .sendRequest({
        method: 'GET',
        path: '/select-static'
      })
      .then(response => {
        expect(response.length).to.equal(1);

        return utils.retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntrySpan = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.data.http.method).to.equal('GET');
              expect(span.data.http.url).to.equal('/select-static');
            });

            utils.expectOneMatching(spans, span => {
              checkMssqlSpan(span, httpEntrySpan);
              expect(span.data.mssql.stmt).to.equal('SELECT GETDATE()');
            });
          })
        );
      }));

  it('must trace errors', () =>
    appControls
      .sendRequest({
        method: 'GET',
        path: '/error-callback'
      })
      .catch(errors.StatusCodeError, reason => reason)
      .then(response => {
        expect(response.statusCode).to.equal(500);

        return utils.retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntrySpan = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.data.http.method).to.equal('GET');
              expect(span.data.http.url).to.equal('/error-callback');
            });

            utils.expectOneMatching(spans, span => {
              checkMssqlErrorSpan(span, httpEntrySpan, "Invalid object name 'non_existing_table'");
              expect(span.data.mssql.stmt).to.equal('SELECT name, email FROM non_existing_table');
            });
          })
        );
      }));

  it('must trace select via promise', () =>
    appControls
      .sendRequest({
        method: 'GET',
        path: '/select-promise'
      })
      .then(response => {
        expect(response.length).to.equal(1);

        return utils.retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntrySpan = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.data.http.method).to.equal('GET');
              expect(span.data.http.url).to.equal('/select-promise');
            });

            utils.expectOneMatching(spans, span => {
              checkMssqlSpan(span, httpEntrySpan);
              expect(span.data.mssql.stmt).to.equal('SELECT GETDATE()');
            });
          })
        );
      }));

  it('must trace errors via promise', () =>
    appControls
      .sendRequest({
        method: 'GET',
        path: '/error-promise'
      })
      .catch(errors.StatusCodeError, reason => reason)
      .then(response => {
        expect(response.statusCode).to.equal(500);

        return utils.retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntrySpan = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.data.http.method).to.equal('GET');
              expect(span.data.http.url).to.equal('/error-promise');
            });

            utils.expectOneMatching(spans, span => {
              checkMssqlErrorSpan(span, httpEntrySpan, "Invalid object name 'non_existing_table'");
              expect(span.data.mssql.stmt).to.equal('SELECT name, email FROM non_existing_table');
            });
          })
        );
      }));

  it('must trace standard pool', () =>
    appControls
      .sendRequest({
        method: 'GET',
        path: '/select-standard-pool'
      })
      .then(response => {
        expect(response.length).to.equal(1);

        return utils.retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntrySpan = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.data.http.method).to.equal('GET');
              expect(span.data.http.url).to.equal('/select-standard-pool');
            });

            utils.expectOneMatching(spans, span => {
              checkMssqlSpan(span, httpEntrySpan);
              expect(span.data.mssql.stmt).to.equal('SELECT 1 AS NUMBER');
            });
          })
        );
      }));

  it('must trace custom pool', () =>
    appControls
      .sendRequest({
        method: 'GET',
        path: '/select-custom-pool'
      })
      .then(response => {
        expect(response.length).to.equal(1);

        return utils.retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntrySpan = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.data.http.method).to.equal('GET');
              expect(span.data.http.url).to.equal('/select-custom-pool');
            });

            utils.expectOneMatching(spans, span => {
              checkMssqlSpan(span, httpEntrySpan);
              expect(span.data.mssql.stmt).to.equal('SELECT 1 AS NUMBER');
            });
          })
        );
      }));

  it('must trace insert and select', () =>
    appControls
      .sendRequest({
        method: 'POST',
        path: '/insert'
      })
      .then(() =>
        appControls.sendRequest({
          method: 'POST',
          path: '/insert-params'
        })
      )
      .then(() =>
        appControls.sendRequest({
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
        return utils.retry(() =>
          agentControls.getSpans().then(spans => {
            const firstWriteEntry = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.data.http.method).to.equal('POST');
              expect(span.data.http.url).to.equal('/insert');
            });
            const secondWriteEntry = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.data.http.method).to.equal('POST');
              expect(span.data.http.url).to.equal('/insert-params');
            });
            const readEntry = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.data.http.method).to.equal('GET');
              expect(span.data.http.url).to.equal('/select');
            });

            utils.expectOneMatching(spans, span => {
              checkMssqlSpan(span, firstWriteEntry);
              expect(span.data.mssql.stmt).to.equal(
                "INSERT INTO UserTable (name, email) VALUES (N'gaius', N'gaius@julius.com')"
              );
            });
            utils.expectOneMatching(spans, span => {
              checkMssqlSpan(span, secondWriteEntry);
              expect(span.data.mssql.stmt).to.equal('INSERT INTO UserTable (name, email) VALUES (@username, @email)');
            });
            utils.expectOneMatching(spans, span => {
              checkMssqlSpan(span, readEntry);
              expect(span.data.mssql.stmt).to.equal('SELECT name, email FROM UserTable');
            });
          })
        );
      }));

  it('must trace prepared statements via callback', () =>
    appControls
      .sendRequest({
        method: 'POST',
        path: '/insert-prepared-callback'
      })
      .then(() =>
        appControls.sendRequest({
          method: 'GET',
          path: '/select-by-name/tiberius'
        })
      )
      .then(response => {
        expect(response).to.equal('tiberius@claudius.com');
        return utils.retry(() =>
          agentControls.getSpans().then(spans => {
            const writeEntry = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.data.http.method).to.equal('POST');
              expect(span.data.http.url).to.equal('/insert-prepared-callback');
            });
            const readEntry = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.data.http.method).to.equal('GET');
              expect(span.data.http.url).to.equal('/select-by-name/tiberius');
            });

            utils.expectOneMatching(spans, span => {
              checkMssqlSpan(span, writeEntry);
              expect(span.data.mssql.stmt).to.equal('INSERT INTO UserTable (name, email) VALUES (@username, @email)');
            });
            utils.expectOneMatching(spans, span => {
              checkMssqlSpan(span, readEntry);
              expect(span.data.mssql.stmt).to.equal('SELECT name, email FROM UserTable WHERE name=@username');
            });
          })
        );
      }));

  it('must trace prepared statements via promise', () =>
    appControls
      .sendRequest({
        method: 'POST',
        path: '/insert-prepared-promise'
      })
      .then(() =>
        appControls.sendRequest({
          method: 'GET',
          path: '/select-by-name/caligula'
        })
      )
      .then(response => {
        expect(response).to.equal('caligula@julioclaudian.com');
        return utils.retry(() =>
          agentControls.getSpans().then(spans => {
            const writeEntry = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.data.http.method).to.equal('POST');
              expect(span.data.http.url).to.equal('/insert-prepared-promise');
            });
            const readEntry = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.data.http.method).to.equal('GET');
              expect(span.data.http.url).to.equal('/select-by-name/caligula');
            });

            utils.expectOneMatching(spans, span => {
              checkMssqlSpan(span, writeEntry);
              expect(span.data.mssql.stmt).to.equal('INSERT INTO UserTable (name, email) VALUES (@username, @email)');
            });
            utils.expectOneMatching(spans, span => {
              checkMssqlSpan(span, readEntry);
              expect(span.data.mssql.stmt).to.equal('SELECT name, email FROM UserTable WHERE name=@username');
            });
          })
        );
      }));

  it('must trace errors in prepared statements via callback', () =>
    appControls
      .sendRequest({
        method: 'POST',
        path: '/insert-prepared-error-callback'
      })
      .catch(errors.StatusCodeError, reason => reason)
      .then(response => {
        expect(response.statusCode).to.equal(500);
        return utils.retry(() =>
          agentControls.getSpans().then(spans => {
            const writeEntry = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.data.http.method).to.equal('POST');
              expect(span.data.http.url).to.equal('/insert-prepared-error-callback');
            });
            utils.expectOneMatching(spans, span => {
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
    appControls
      .sendRequest({
        method: 'POST',
        path: '/insert-prepared-error-promise'
      })
      .catch(errors.StatusCodeError, reason => reason)
      .then(response => {
        expect(response.statusCode).to.equal(500);
        return utils.retry(() =>
          agentControls.getSpans().then(spans => {
            const writeEntry = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.data.http.method).to.equal('POST');
              expect(span.data.http.url).to.equal('/insert-prepared-error-promise');
            });
            utils.expectOneMatching(spans, span => {
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
    appControls
      .sendRequest({
        method: 'POST',
        path: '/transaction-callback'
      })
      .then(response => {
        expect(response).to.equal('vespasian@flavius.com');
        return utils.retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntry = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.data.http.method).to.equal('POST');
              expect(span.data.http.url).to.equal('/transaction-callback');
            });
            utils.expectOneMatching(spans, span => {
              checkMssqlSpan(span, httpEntry);
              expect(span.data.mssql.stmt).to.equal('INSERT INTO UserTable (name, email) VALUES (@username, @email)');
            });
            utils.expectOneMatching(spans, span => {
              checkMssqlSpan(span, httpEntry);
              expect(span.data.mssql.stmt).to.equal("SELECT name, email FROM UserTable WHERE name=N'vespasian'");
            });
          })
        );
      }));

  it('must trace transactions with promises', () =>
    appControls
      .sendRequest({
        method: 'POST',
        path: '/transaction-promise'
      })
      .then(response => {
        expect(response).to.equal('titus@flavius.com');
        return utils.retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntry = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.data.http.method).to.equal('POST');
              expect(span.data.http.url).to.equal('/transaction-promise');
            });
            utils.expectOneMatching(spans, span => {
              checkMssqlSpan(span, httpEntry);
              expect(span.data.mssql.stmt).to.equal('INSERT INTO UserTable (name, email) VALUES (@username, @email)');
            });
            utils.expectOneMatching(spans, span => {
              checkMssqlSpan(span, httpEntry);
              expect(span.data.mssql.stmt).to.equal("SELECT name, email FROM UserTable WHERE name=N'titus'");
            });
          })
        );
      }));

  it('must trace stored procedure execution', () =>
    appControls
      .sendRequest({
        method: 'GET',
        path: '/stored-procedure-callback'
      })
      .then(response => {
        expect(response.recordset).to.exist;

        return utils.retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntrySpan = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.data.http.method).to.equal('GET');
              expect(span.data.http.url).to.equal('/stored-procedure-callback');
            });

            utils.expectOneMatching(spans, span => {
              checkMssqlSpan(span, httpEntrySpan);
              expect(span.data.mssql.stmt).to.equal('testProcedure');
            });
          })
        );
      }));

  it('must trace the streaming API', () =>
    appControls
      .sendRequest({
        method: 'GET',
        path: '/streaming'
      })
      .then(response => {
        expect(response.rows).to.exist;
        expect(response.errors.length).to.equal(0);

        return utils.retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntrySpan = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.data.http.method).to.equal('GET');
              expect(span.data.http.url).to.equal('/streaming');
            });

            utils.expectOneMatching(spans, span => {
              checkMssqlSpan(span, httpEntrySpan);
              expect(span.data.mssql.stmt).to.equal('SELECT name, email FROM UserTable');
            });
          })
        );
      }));

  it('must trace the pipe API', () =>
    appControls
      .sendRequest({
        method: 'GET',
        path: '/pipe'
      })
      .then(() =>
        utils.retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntrySpan = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.data.http.method).to.equal('GET');
              expect(span.data.http.url).to.equal('/pipe');
            });

            utils.expectOneMatching(spans, span => {
              checkMssqlSpan(span, httpEntrySpan);
              expect(span.data.mssql.stmt).to.equal('SELECT name, email FROM UserTable');
            });
          })
        )
      ));

  it('must trace batch with callback', () =>
    appControls
      .sendRequest({
        method: 'GET',
        path: '/batch-callback'
      })
      .then(response => {
        expect(response.length).to.equal(1);

        return utils.retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntrySpan = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.data.http.method).to.equal('GET');
              expect(span.data.http.url).to.equal('/batch-callback');
            });

            utils.expectOneMatching(spans, span => {
              checkMssqlSpan(span, httpEntrySpan);
              expect(span.data.mssql.stmt).to.equal('SELECT GETDATE()');
            });
          })
        );
      }));

  it('must trace batch with promise', () =>
    appControls
      .sendRequest({
        method: 'GET',
        path: '/batch-promise'
      })
      .then(response => {
        expect(response.length).to.equal(1);

        return utils.retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntrySpan = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.data.http.method).to.equal('GET');
              expect(span.data.http.url).to.equal('/batch-promise');
            });

            utils.expectOneMatching(spans, span => {
              checkMssqlSpan(span, httpEntrySpan);
              expect(span.data.mssql.stmt).to.equal('SELECT GETDATE()');
            });
          })
        );
      }));

  it('must trace bulk operations', () =>
    appControls
      .sendRequest({
        method: 'GET',
        path: '/bulk'
      })
      .then(response => {
        expect(response.rowsAffected).to.equal(3);

        return utils.retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntrySpan = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.data.http.method).to.equal('GET');
              expect(span.data.http.url).to.equal('/bulk');
            });

            utils.expectOneMatching(spans, span => {
              checkMssqlSpan(span, httpEntrySpan);
              expect(span.data.mssql.stmt).to.equal('MSSQL bulk operation');
            });
          })
        );
      }));

  it('must trace cancel', () =>
    appControls
      .sendRequest({
        method: 'GET',
        path: '/cancel'
      })
      .then(response => {
        expect(response.name).to.equal('RequestError');
        expect(response.code).to.equal('ECANCEL');

        return utils.retry(() =>
          agentControls.getSpans().then(spans => {
            const httpEntrySpan = utils.expectOneMatching(spans, span => {
              expect(span.n).to.equal('node.http.server');
              expect(span.data.http.method).to.equal('GET');
              expect(span.data.http.url).to.equal('/cancel');
            });

            utils.expectOneMatching(spans, span => {
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
    expect(span.f.e).to.equal(String(appControls.getPid()));
    expect(span.f.h).to.equal('agent-stub-uuid');
    expect(span.n).to.equal('mssql');
    expect(span.async).to.not.exist;
    expect(span.error).to.not.exist;
    expect(span.ec).to.equal(error ? 1 : 0);
    expect(span.data).to.exist;
    expect(span.data.mssql).to.exist;
    expect(span.data.mssql.host).to.equal('127.0.0.1');
    expect(span.data.mssql.port).to.equal(1433);
    expect(span.data.mssql.user).to.equal('sa');
    expect(span.data.mssql.db).to.equal('nodejscollector');
  }
});
