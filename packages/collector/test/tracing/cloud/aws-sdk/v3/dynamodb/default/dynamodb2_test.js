/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

let checkTableExistence;
let cleanup;

const semver = require('semver');
const bypassTest = semver.lt(process.versions.node, '10.0.0');

/**
 * We need to add this verification here, or else Mocha breaks with an error about generators, used in the AWS SDK v3
 */
if (!bypassTest) {
  checkTableExistence = require('../util').checkTableExistence;
  cleanup = require('../util').cleanup;
}

const { v4: uuid } = require('uuid');
const path = require('path');
const { expect } = require('chai');
const { fail } = expect;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('@instana/core/test/config');
const { retry, stringifyItems, delay } = require('@instana/core/test/test_util');
const ProcessControls = require('../../../../../../test_util/ProcessControls');
const globalAgent = require('../../../../../../globalAgent');
const {
  verifyHttpRootEntry,
  verifyExitSpan,
  verifyHttpExit
} = require('@instana/core/test/test_util/common_verifications');
const { promisifyNonSequentialCases } = require('../../promisify_non_sequential');

let mochaSuiteFn;

const operationsInfo = {
  createTable: 'create',
  listTables: 'list',
  scan: 'scan',
  query: 'query',
  getItem: 'get',
  deleteItem: 'delete',
  putItem: 'put',
  updateItem: 'update'
};

const availableOperations = [
  'createTable',
  'putItem',
  'listTables',
  'updateItem',
  'getItem',
  'scan',
  'query',
  'deleteItem'
];

if (!supportedVersion(process.versions.node) || bypassTest) {
  mochaSuiteFn = describe.skip;
} else {
  mochaSuiteFn = describe;
}

const retryTime = config.getTestTimeout() * 2;

const createTableName = () => {
  let tableName = 'nodejs-team';

  if (process.env.AWS_DYNAMODB_TABLE_NAME) {
    tableName = `${process.env.AWS_DYNAMODB_TABLE_NAME}v3-${semver.major(process.versions.node)}-${uuid()}`;
  }

  const randomNumber = Math.floor(Math.random() * 10000);
  tableName = `${tableName}-${randomNumber}`;
  return tableName;
};

const requestMethod = 'v3';
const version = '@aws-sdk/client-dynamodb2';

mochaSuiteFn('tracing/cloud/aws-sdk/v3/dynamodb', function () {
  describe(`version: ${version}, ${requestMethod}`, function () {
    this.timeout(config.getTestTimeout() * 5);

    globalAgent.setUpCleanUpHooks();
    const agentControls = globalAgent.instance;

    describe('tracing enabled, no suppression', function () {
      const tableName = createTableName();

      const appControls = new ProcessControls({
        appPath: path.join(__dirname, '../app'),
        port: 3215,
        useGlobalAgent: true,
        env: {
          AWS_DYNAMODB_TABLE_NAME: tableName,
          AWS_SDK_CLIENT_DYNAMODB_REQUIRE: version
        }
      });

      ProcessControls.setUpHooksWithRetryTime(retryTime, appControls);

      after(() => {
        return cleanup(tableName);
      });

      availableOperations.forEach(operation => {
        it(`operation: ${operation}/${requestMethod}`, async () => {
          const apiPath = `/${operation}/${requestMethod}`;

          const response = await appControls.sendRequest({
            method: 'GET',
            path: `${apiPath}`
          });

          /**
           * Table takes some time to be available, even though the callback gives a success message
           */
          if (operation === 'createTable') {
            await checkTableExistence(tableName, true);
          }

          return verify(appControls, response, apiPath, operation, false, tableName);
        });
      });
    });

    describe('should handle errors', function () {
      const tableName = createTableName();

      const appControls = new ProcessControls({
        appPath: path.join(__dirname, '../app'),
        port: 3215,
        useGlobalAgent: true,
        env: {
          AWS_DYNAMODB_TABLE_NAME: tableName,
          AWS_SDK_CLIENT_DYNAMODB_REQUIRE: version
        }
      });

      ProcessControls.setUpHooksWithRetryTime(retryTime, appControls);

      after(() => {
        return cleanup(tableName);
      });

      it(`should instrument ${availableOperations.join(', ')} with error`, () => {
        return promisifyNonSequentialCases(
          (controls, response, apiPath, operation, withError) => {
            return verify(controls, response, apiPath, operation, withError, tableName);
          },
          availableOperations,
          appControls,
          true,
          () => requestMethod
        );
      });
    });

    describe('tracing disabled', () => {
      this.timeout(config.getTestTimeout() * 2);

      const tableName = createTableName();

      const appControls = new ProcessControls({
        appPath: path.join(__dirname, '../app'),
        port: 3215,
        useGlobalAgent: true,
        tracingEnabled: false,
        env: {
          AWS_DYNAMODB_TABLE_NAME: tableName,
          AWS_SDK_CLIENT_DYNAMODB_REQUIRE: version
        }
      });

      ProcessControls.setUpHooksWithRetryTime(retryTime, appControls);

      after(() => {
        return cleanup(tableName);
      });

      before(async () => {
        // Create table first!
        const response = await appControls.sendRequest({
          method: 'GET',
          path: `/${availableOperations[0]}/${requestMethod}`
        });

        verifyResponse(response, availableOperations[0], false, tableName);
        await agentControls.clearReceivedData();
      });

      describe('attempt to get result', () => {
        availableOperations.slice(1).forEach(operation => {
          it(`should not trace (${operation}/${requestMethod})`, async () => {
            const response = await appControls.sendRequest({
              method: 'GET',
              path: `/${operation}/${requestMethod}`
            });

            verifyResponse(response, operation, false, tableName);

            return retry(() => delay(config.getTestTimeout() / 4))
              .then(() => agentControls.getSpans())
              .then(spans => {
                if (spans.length > 0) {
                  fail(`Unexpected spans (AWS DynamoDB suppressed: ${stringifyItems(spans)}`);
                }
              });
          });
        });
      });
    });

    describe('tracing enabled but suppressed', () => {
      const tableName = createTableName();

      const appControls = new ProcessControls({
        appPath: path.join(__dirname, '../app'),
        port: 3215,
        useGlobalAgent: true,
        env: {
          AWS_DYNAMODB_TABLE_NAME: tableName,
          AWS_SDK_CLIENT_DYNAMODB_REQUIRE: version
        }
      });

      ProcessControls.setUpHooksWithRetryTime(retryTime, appControls);

      after(() => {
        return cleanup(tableName);
      });

      before(async () => {
        // Create table first!
        const response = await appControls.sendRequest({
          method: 'GET',
          path: `/${availableOperations[0]}/${requestMethod}`
        });

        verifyResponse(response, availableOperations[0], false, tableName);
        await agentControls.clearReceivedData();
      });

      describe('attempt to get result', () => {
        availableOperations.slice(1).forEach(operation => {
          it(`should not trace (${operation}/${requestMethod})`, async () => {
            const response = await appControls.sendRequest({
              suppressTracing: true,
              method: 'GET',
              path: `/${operation}/${requestMethod}`
            });

            verifyResponse(response, operation, false);

            return retry(() => delay(config.getTestTimeout() / 4), retryTime)
              .then(() => agentControls.getSpans())
              .then(spans => {
                if (spans.length > 0) {
                  fail(`Unexpected spans (AWS DynamoDB suppressed: ${stringifyItems(spans)}`);
                }
              });
          });
        });
      });
    });

    function verify(controls, response, apiPath, operation, withError, tableName) {
      return retry(() => {
        return agentControls
          .getSpans()
          .then(spans => verifySpans(controls, response, spans, apiPath, operation, withError, tableName));
      }, retryTime);
    }

    function verifySpans(controls, response, spans, apiPath, operation, withError, tableName) {
      const httpEntry = verifyHttpRootEntry({ spans, apiPath, pid: String(controls.getPid()) });

      verifyExitSpan({
        spanName: 'dynamodb',
        spans,
        parent: httpEntry,
        withError,
        pid: String(controls.getPid()),
        extraTests: [
          span => expect(span.data.dynamodb.op).to.equal(operationsInfo[operation]),
          span => {
            let expected;

            if (operation !== 'listTables') {
              if (operation !== 'createTable' || !withError) {
                expected = tableName;
              }
            }

            expect(span.data.dynamodb.table).to.equal(expected);
          },
          () => {
            verifyResponse(response, operation, withError, tableName);
          }
        ]
      });

      if (!withError) {
        verifyHttpExit({ spans, parent: httpEntry, pid: String(controls.getPid()) });
      }
    }
  });

  function verifyResponse(response, operation, withError, tableName) {
    if (!withError) {
      expect(response.result).to.exist;

      switch (operation) {
        case 'createTable':
          expect(response.result.TableDescription).to.exist;
          expect(response.result.TableDescription.TableName).to.equal(tableName);
          expect(response.result.TableDescription.TableStatus).to.equal('CREATING');
          break;
        case 'listTables':
          expect(response.result.TableNames.length).to.gte(1);
          break;
        case 'getItem':
          expect(response.result.Item).to.exist;
          break;
        case 'scan':
        case 'query':
          expect(response.result.Count).to.gte(1);
          expect(response.result.Items.length).to.gte(1);
          break;
        default:
      }
    }
  }
});
