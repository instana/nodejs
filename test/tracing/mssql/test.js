'use strict';

var errors = require('request-promise/errors');
var expect = require('chai').expect;

var supportedVersion = require('../../../src/tracing/index').supportedVersion;
var config = require('../../config');
var utils = require('../../utils');

describe('tracing/mssql', function() {
  if (!supportedVersion(process.versions.node)) {
    return;
  }

  this.timeout(config.getTestTimeout());
  var agentControls = require('../../apps/agentStubControls');
  agentControls.registerTestHooks();
  var AppControls = require('./controls');
  var appControls = new AppControls({
    agentControls: agentControls
  });
  appControls.registerTestHooks();


  it('must trace dummy select', function() {
    return appControls.sendRequest({
      method: 'GET',
      path: '/select-getdate'
    })
    .then(function(response) {
      expect(response.length).to.equal(1);

      return utils.retry(function() {
        return agentControls.getSpans()
        .then(function(spans) {
          var httpEntrySpan = utils.expectOneMatching(spans, function(span) {
            expect(span.n).to.equal('node.http.server');
            expect(span.data.http.method).to.equal('GET');
            expect(span.data.http.url).to.equal('/select-getdate');
          });

          utils.expectOneMatching(spans, function(span) {
            checkMssqlSpan(span, httpEntrySpan);
            expect(span.data.mssql.stmt).to.equal('SELECT GETDATE()');
          });
        });
      });
    });
  });


  it('must trace errors', function() {
    return appControls.sendRequest({
      method: 'GET',
      path: '/error-callback'
    })
    .catch(errors.StatusCodeError, function(reason) {
      return reason;
    })
    .then(function(response) {
      expect(response.statusCode).to.equal(500);

      return utils.retry(function() {
        return agentControls.getSpans()
        .then(function(spans) {
          var httpEntrySpan = utils.expectOneMatching(spans, function(span) {
            expect(span.n).to.equal('node.http.server');
            expect(span.data.http.method).to.equal('GET');
            expect(span.data.http.url).to.equal('/error-callback');
          });

          utils.expectOneMatching(spans, function(span) {
            checkMssqlErrorSpan(span, httpEntrySpan, 'Invalid object name \'non_existing_table\'');
            expect(span.data.mssql.stmt).to.equal('SELECT name, email FROM non_existing_table');
          });
        });
      });
    });
  });


  it('must trace select via promise', function() {
    return appControls.sendRequest({
      method: 'GET',
      path: '/select-promise'
    })
    .then(function(response) {
      expect(response.length).to.equal(1);

      return utils.retry(function() {
        return agentControls.getSpans()
        .then(function(spans) {
          var httpEntrySpan = utils.expectOneMatching(spans, function(span) {
            expect(span.n).to.equal('node.http.server');
            expect(span.data.http.method).to.equal('GET');
            expect(span.data.http.url).to.equal('/select-promise');
          });

          utils.expectOneMatching(spans, function(span) {
            checkMssqlSpan(span, httpEntrySpan);
            expect(span.data.mssql.stmt).to.equal('SELECT GETDATE()');
          });
        });
      });
    });
  });


  it('must trace errors via promise', function() {
    return appControls.sendRequest({
      method: 'GET',
      path: '/error-promise'
    })
    .catch(errors.StatusCodeError, function(reason) {
      return reason;
    })
    .then(function(response) {
      expect(response.statusCode).to.equal(500);

      return utils.retry(function() {
        return agentControls.getSpans()
        .then(function(spans) {
          var httpEntrySpan = utils.expectOneMatching(spans, function(span) {
            expect(span.n).to.equal('node.http.server');
            expect(span.data.http.method).to.equal('GET');
            expect(span.data.http.url).to.equal('/error-promise');
          });

          utils.expectOneMatching(spans, function(span) {
            checkMssqlErrorSpan(span, httpEntrySpan, 'Invalid object name \'non_existing_table\'');
            expect(span.data.mssql.stmt).to.equal('SELECT name, email FROM non_existing_table');
          });
        });
      });
    });
  });


  it('must trace standard pool', function() {
    return appControls.sendRequest({
      method: 'GET',
      path: '/select-standard-pool'
    })
    .then(function(response) {
      expect(response.length).to.equal(1);

      return utils.retry(function() {
        return agentControls.getSpans()
        .then(function(spans) {
          var httpEntrySpan = utils.expectOneMatching(spans, function(span) {
            expect(span.n).to.equal('node.http.server');
            expect(span.data.http.method).to.equal('GET');
            expect(span.data.http.url).to.equal('/select-standard-pool');
          });

          utils.expectOneMatching(spans, function(span) {
            checkMssqlSpan(span, httpEntrySpan);
            expect(span.data.mssql.stmt).to.equal('SELECT 1 AS NUMBER');
          });
        });
      });
    });
  });


  it('must trace custom pool', function() {
    return appControls.sendRequest({
      method: 'GET',
      path: '/select-custom-pool'
    })
    .then(function(response) {
      expect(response.length).to.equal(1);

      return utils.retry(function() {
        return agentControls.getSpans()
        .then(function(spans) {
          var httpEntrySpan = utils.expectOneMatching(spans, function(span) {
            expect(span.n).to.equal('node.http.server');
            expect(span.data.http.method).to.equal('GET');
            expect(span.data.http.url).to.equal('/select-custom-pool');
          });

          utils.expectOneMatching(spans, function(span) {
            checkMssqlSpan(span, httpEntrySpan);
            expect(span.data.mssql.stmt).to.equal('SELECT 1 AS NUMBER');
          });
        });
      });
    });
  });


  it('must trace insert and select', function() {
    return appControls.sendRequest({
      method: 'POST',
      path: '/insert'
    })
    .then(function() {
      return appControls.sendRequest({
        method: 'POST',
        path: '/insert-params'
      });
    })
    .then(function() {
      return appControls.sendRequest({
        method: 'GET',
        path: '/select'
      });
    })
    .then(function(response) {
      expect(response.length).to.equal(2);
      expect(response[0].name).to.equal('gaius');
      expect(response[0].email).to.equal('gaius@julius.com');
      expect(response[1].name).to.equal('augustus');
      expect(response[1].email).to.equal('augustus@julius.com');
      return utils.retry(function() {
        return agentControls.getSpans()
        .then(function(spans) {
          var firstWriteEntry = utils.expectOneMatching(spans, function(span) {
            expect(span.n).to.equal('node.http.server');
            expect(span.data.http.method).to.equal('POST');
            expect(span.data.http.url).to.equal('/insert');
          });
          var secondWriteEntry = utils.expectOneMatching(spans, function(span) {
            expect(span.n).to.equal('node.http.server');
            expect(span.data.http.method).to.equal('POST');
            expect(span.data.http.url).to.equal('/insert-params');
          });
          var readEntry = utils.expectOneMatching(spans, function(span) {
            expect(span.n).to.equal('node.http.server');
            expect(span.data.http.method).to.equal('GET');
            expect(span.data.http.url).to.equal('/select');
          });

          utils.expectOneMatching(spans, function(span) {
            checkMssqlSpan(span, firstWriteEntry);
            expect(span.data.mssql.stmt).to.equal(
              'INSERT INTO UserTable (name, email) VALUES (N\'gaius\', N\'gaius@julius.com\')'
            );
          });
          utils.expectOneMatching(spans, function(span) {
            checkMssqlSpan(span, secondWriteEntry);
            expect(span.data.mssql.stmt).to.equal('INSERT INTO UserTable (name, email) VALUES (@username, @email)');
          });
          utils.expectOneMatching(spans, function(span) {
            checkMssqlSpan(span, readEntry);
            expect(span.data.mssql.stmt).to.equal('SELECT name, email FROM UserTable');
          });
        });
      });
    });
  });


  it('must trace prepared statements via callback', function() {
    return appControls.sendRequest({
      method: 'POST',
      path: '/insert-prepared-callback'
    })
    .then(function() {
      return appControls.sendRequest({
        method: 'GET',
        path: '/select-by-name/tiberius'
      });
    })
    .then(function(response) {
      expect(response).to.equal('tiberius@claudius.com');
      return utils.retry(function() {
        return agentControls.getSpans()
        .then(function(spans) {
          var writeEntry = utils.expectOneMatching(spans, function(span) {
            expect(span.n).to.equal('node.http.server');
            expect(span.data.http.method).to.equal('POST');
            expect(span.data.http.url).to.equal('/insert-prepared-callback');
          });
          var readEntry = utils.expectOneMatching(spans, function(span) {
            expect(span.n).to.equal('node.http.server');
            expect(span.data.http.method).to.equal('GET');
            expect(span.data.http.url).to.equal('/select-by-name/tiberius');
          });

          utils.expectOneMatching(spans, function(span) {
            checkMssqlSpan(span, writeEntry);
            expect(span.data.mssql.stmt).to.equal(
              'INSERT INTO UserTable (name, email) VALUES (@username, @email)'
            );
          });
          utils.expectOneMatching(spans, function(span) {
            checkMssqlSpan(span, readEntry);
            expect(span.data.mssql.stmt).to.equal('SELECT name, email FROM UserTable WHERE name=@username');
          });
        });
      });
    });
  });


  it('must trace prepared statements via promise', function() {
    return appControls.sendRequest({
      method: 'POST',
      path: '/insert-prepared-promise'
    })
    .then(function() {
      return appControls.sendRequest({
        method: 'GET',
        path: '/select-by-name/caligula'
      });
    })
    .then(function(response) {
      expect(response).to.equal('caligula@julioclaudian.com');
      return utils.retry(function() {
        return agentControls.getSpans()
        .then(function(spans) {
          var writeEntry = utils.expectOneMatching(spans, function(span) {
            expect(span.n).to.equal('node.http.server');
            expect(span.data.http.method).to.equal('POST');
            expect(span.data.http.url).to.equal('/insert-prepared-promise');
          });
          var readEntry = utils.expectOneMatching(spans, function(span) {
            expect(span.n).to.equal('node.http.server');
            expect(span.data.http.method).to.equal('GET');
            expect(span.data.http.url).to.equal('/select-by-name/caligula');
          });

          utils.expectOneMatching(spans, function(span) {
            checkMssqlSpan(span, writeEntry);
            expect(span.data.mssql.stmt).to.equal(
              'INSERT INTO UserTable (name, email) VALUES (@username, @email)'
            );
          });
          utils.expectOneMatching(spans, function(span) {
            checkMssqlSpan(span, readEntry);
            expect(span.data.mssql.stmt).to.equal('SELECT name, email FROM UserTable WHERE name=@username');
          });
        });
      });
    });
  });


  it('must trace errors in prepared statements via callback', function() {
    return appControls.sendRequest({
      method: 'POST',
      path: '/insert-prepared-error-callback'
    })
    .catch(errors.StatusCodeError, function(reason) {
      return reason;
    })
   .then(function(response) {
      expect(response.statusCode).to.equal(500);
      return utils.retry(function() {
        return agentControls.getSpans()
        .then(function(spans) {
          var writeEntry = utils.expectOneMatching(spans, function(span) {
            expect(span.n).to.equal('node.http.server');
            expect(span.data.http.method).to.equal('POST');
            expect(span.data.http.url).to.equal('/insert-prepared-error-callback');
          });
          utils.expectOneMatching(spans, function(span) {
            checkMssqlErrorSpan(span, writeEntry,
              'The incoming tabular data stream (TDS) remote procedure call (RPC) protocol stream is incorrect. ' +
              'Parameter 3 ("@email"): Data type 0xE7 has an invalid data length or metadata length.');
            expect(span.data.mssql.stmt).to.equal(
              'INSERT INTO UserTable (name, email) VALUES (@username, @email)'
            );
          });
        });
      });
    });
  });


  it('must trace errors in prepared statements via promise', function() {
    return appControls.sendRequest({
      method: 'POST',
      path: '/insert-prepared-error-promise'
    })
    .catch(errors.StatusCodeError, function(reason) {
      return reason;
    })
   .then(function(response) {
      expect(response.statusCode).to.equal(500);
      return utils.retry(function() {
        return agentControls.getSpans()
        .then(function(spans) {
          var writeEntry = utils.expectOneMatching(spans, function(span) {
            expect(span.n).to.equal('node.http.server');
            expect(span.data.http.method).to.equal('POST');
            expect(span.data.http.url).to.equal('/insert-prepared-error-promise');
          });
          utils.expectOneMatching(spans, function(span) {
            checkMssqlErrorSpan(span, writeEntry,
              'The incoming tabular data stream (TDS) remote procedure call (RPC) protocol stream is incorrect. ' +
              'Parameter 3 ("@email"): Data type 0xE7 has an invalid data length or metadata length.');
            expect(span.data.mssql.stmt).to.equal(
              'INSERT INTO UserTable (name, email) VALUES (@username, @email)'
            );
          });
        });
      });
    });
  });


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
    expect(span.f.e).to.equal(String(appControls.getPid()));
    expect(span.n).to.equal('mssql');
    expect(span.async).to.equal(false);
    expect(span.error).to.equal(error);
    expect(span.data).to.exist;
    expect(span.data.mssql).to.exist;
    expect(span.data.mssql.host).to.equal('127.0.0.1');
    expect(span.data.mssql.port).to.equal(1433);
    expect(span.data.mssql.user).to.equal('sa');
    expect(span.data.mssql.db).to.equal('nodejssensor');
  }
});
