/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const semver = require('semver');
const checkTableExistence = require('./util').checkTableExistence;
const cleanup = require('./util').cleanup;

const { v4: uuid } = require('uuid');
const path = require('path');
const { expect } = require('chai');
const { fail } = expect;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../../../core/test/config');
const { retry, stringifyItems, delay } = require('../../../../../../../core/test/test_util');
const ProcessControls = require('../../../../../test_util/ProcessControls');
const globalAgent = require('../../../../../globalAgent');
const {
  verifyHttpRootEntry,
  verifyExitSpan,
  verifyHttpExit
} = require('@instana/core/test/test_util/common_verifications');
const { promisifyNonSequentialCases } = require('../promisify_non_sequential');

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

const withErrorOptions = [false, true];

const requestMethods = ['v3', 'v2', 'cb'];
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

const getNextCallMethod = require('@instana/core/test/test_util/circular_list').getCircularList(requestMethods);

if (!supportedVersion(process.versions.node)) {
  mochaSuiteFn = describe.skip;
} else {
  mochaSuiteFn = describe;
}

const retryTime = config.getTestTimeout() * 2;

mochaSuiteFn('tracing/cloud/aws-sdk/v3/dynamodb', function () {
  ['@aws-sdk/client-dynamodb', '@aws-sdk/client-dynamodb2'].forEach(version => {
    describe(`version: ${version}`, function () {
      this.timeout(config.getTestTimeout() * 3);

      globalAgent.setUpCleanUpHooks();
      const agentControls = globalAgent.instance;

      let tableName = 'nodejs-team';

      if (process.env.AWS_DYNAMODB_TABLE_NAME) {
        tableName = `${process.env.AWS_DYNAMODB_TABLE_NAME}v3-${semver.major(process.versions.node)}-${uuid()}`;
      }

      const randomNumber = Math.floor(Math.random() * 1000);
      tableName = `${tableName}-${randomNumber}`;

      after(() => {
        return cleanup(tableName);
      });

      describe('tracing enabled, no suppression', function () {
        const appControls = new ProcessControls({
          appPath: path.join(__dirname, 'app'),
          port: 3215,
          useGlobalAgent: true,
          env: {
            AWS_DYNAMODB_TABLE_NAME: tableName,
            AWS_SDK_CLIENT_DYNAMODB_REQUIRE: version
          }
        });

        ProcessControls.setUpHooksWithRetryTime(retryTime, appControls);
        withErrorOptions.forEach(withError => {
          if (withError) {
            describe(`getting result with error: ${withError ? 'yes' : 'no'}`, () => {
              it(`should instrument ${availableOperations.join(', ')} with error`, () => {
                return promisifyNonSequentialCases(
                  verify,
                  availableOperations,
                  appControls,
                  withError,
                  getNextCallMethod
                );
              });
            });
          } else {
            describe(`getting result with error: ${withError ? 'yes' : 'no'}`, () => {
              availableOperations.forEach(operation => {
                const requestMethod = getNextCallMethod();
                it(`operation: ${operation}/${requestMethod}`, async () => {
                  const withErrorOption = withError ? '?withError=1' : '';
                  const apiPath = `/${operation}/${requestMethod}`;

                  const response = await appControls.sendRequest({
                    method: 'GET',
                    path: `${apiPath}${withErrorOption}`,
                    simple: withError === false
                  });

                  /**
                   * Table takes some time to be available, even though the callback gives a success message
                   */
                  if (operation === 'createTable') {
                    await checkTableExistence(tableName, true);
                  }
                  return verify(appControls, response, apiPath, operation, withError);
                });
              });
            });
          }
        });

        function verify(controls, response, apiPath, operation, withError) {
          return retry(() => {
            return agentControls
              .getSpans()
              .then(spans => verifySpans(controls, response, spans, apiPath, operation, withError));
          }, retryTime);
        }

        function verifySpans(controls, response, spans, apiPath, operation, withError) {
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
                verifyResponse(response, operation, withError);
              }
            ]
          });

          if (!withError) {
            verifyHttpExit({ spans, parent: httpEntry, pid: String(controls.getPid()) });
          }
        }
      });

      describe('tracing disabled', () => {
        this.timeout(config.getTestTimeout() * 2);

        const appControls = new ProcessControls({
          appPath: path.join(__dirname, 'app'),
          port: 3215,
          useGlobalAgent: true,
          tracingEnabled: false,
          env: {
            AWS_DYNAMODB_TABLE_NAME: tableName,
            AWS_SDK_CLIENT_DYNAMODB_REQUIRE: version
          }
        });

        ProcessControls.setUpHooksWithRetryTime(retryTime, appControls);

        describe('attempt to get result', () => {
          availableOperations.slice(1).forEach(operation => {
            const requestMethod = getNextCallMethod();
            it(`should not trace (${operation}/${requestMethod})`, async () => {
              const response = await appControls.sendRequest({
                method: 'GET',
                path: `/${operation}/${requestMethod}`
              });
              verifyResponse(response, operation, false);
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
        const appControls = new ProcessControls({
          appPath: path.join(__dirname, 'app'),
          port: 3215,
          useGlobalAgent: true,
          env: {
            AWS_DYNAMODB_TABLE_NAME: tableName,
            AWS_SDK_CLIENT_DYNAMODB_REQUIRE: version
          }
        });

        ProcessControls.setUpHooksWithRetryTime(retryTime, appControls);

        describe('attempt to get result', () => {
          availableOperations.slice(1).forEach(operation => {
            const requestMethod = getNextCallMethod();
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

      function verifyResponse(response, operation, withError) {
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
  });
});
