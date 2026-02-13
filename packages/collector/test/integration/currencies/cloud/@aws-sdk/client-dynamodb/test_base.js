/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const { checkTableExistence, cleanup } = require('./util');
const semver = require('semver');
const { v4: uuid } = require('uuid');
const { expect } = require('chai');
const { fail } = expect;
const supportedVersion = require('@_local/core').tracing.supportedVersion;
const config = require('@_local/core/test/config');
const { retry, stringifyItems, delay, expectAtLeastOneMatching } = require('@_local/core/test/test_util');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');
const globalAgent = require('@_local/collector/test/globalAgent');
const {
  verifyHttpRootEntry,
  verifyExitSpan,
  verifyHttpExit
} = require('@_local/core/test/test_util/common_verifications');
const { promisifyNonSequentialCases } = require('./promisify_non_sequential');

const availableOperations = [
  'createTable',
  'putItem',
  'listTables',
  'updateItem',
  'getItem',
  'scan',
  'query',
  'deleteItem',
  'batchWriteItem'
];

const createTableName = () => {
  const tablePrefix = 'nodejs-team';
  const tableName = `${tablePrefix}-v3-${semver.major(process.versions.node)}-${uuid()}`;

  return tableName;
};

let libraryEnv;
let requestMethod;

function start(reducedTestSuite = false) {
  const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;

  mochaSuiteFn(`npm: ${libraryEnv.LIBRARY_NAME}, style: ${requestMethod}`, function () {
    this.timeout(config.getTestTimeout() * 5);

    globalAgent.setUpCleanUpHooks();
    const agentControls = globalAgent.instance;

    describe('tracing enabled, no suppression', function () {
      const tableName = createTableName();
      let appControls;

      before(async () => {
        appControls = new ProcessControls({
          dirname: __dirname,
          appName: 'app',
          useGlobalAgent: true,
          env: {
            ...libraryEnv,
            AWS_DYNAMODB_TABLE_NAME: tableName
          }
        });

        await appControls.startAndWaitForAgentConnection();
      });

      beforeEach(async () => {
        await agentControls.clearReceivedTraceData();
      });
      after(async () => {
        await appControls.stop();
      });

      afterEach(async () => {
        await appControls.clearIpcMessages();
      });

      after(() => cleanup(tableName));

      let ops = availableOperations;
      if (reducedTestSuite) {
        ops = ops.slice(0, 1);
      }

      ops.forEach(operation => {
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

    describe('with @aws-sdk/lib-dynamodb', function () {
      const tableName = createTableName();
      let appControls;

      before(async () => {
        appControls = new ProcessControls({
          dirname: __dirname,
          appName: 'app',
          useGlobalAgent: true,
          env: {
            ...libraryEnv,
            AWS_DYNAMODB_TABLE_NAME: tableName,
            USE_LIB_DYNAMODB: true
          }
        });

        await appControls.startAndWaitForAgentConnection();
      });

      beforeEach(async () => {
        await agentControls.clearReceivedTraceData();
      });

      beforeEach(async () => {
        await agentControls.clearReceivedTraceData();
      });

      after(async () => {
        await appControls.stop();
      });

      afterEach(async () => {
        await appControls.clearIpcMessages();
      });

      after(() => cleanup(tableName));

      it('should succeed', async () => {
        const apiPath = `/listTables/${requestMethod}`;

        const response = await appControls.sendRequest({
          method: 'GET',
          path: `${apiPath}`
        });

        return verify(appControls, response, apiPath, 'listTables', false, tableName);
      });
    });

    describe('should handle errors', function () {
      const tableName = createTableName();
      let appControls;

      before(async () => {
        appControls = new ProcessControls({
          dirname: __dirname,
          appName: 'app',
          useGlobalAgent: true,
          env: {
            ...libraryEnv,
            AWS_DYNAMODB_TABLE_NAME: tableName
          }
        });

        await appControls.startAndWaitForAgentConnection();
      });

      beforeEach(async () => {
        await agentControls.clearReceivedTraceData();
      });

      after(async () => {
        await appControls.stop();
      });

      afterEach(async () => {
        await appControls.clearIpcMessages();
      });

      after(() => cleanup(tableName));

      it(`should instrument ${availableOperations.join(', ')} with error`, () =>
        promisifyNonSequentialCases(
          (controls, response, apiPath, operation, withError) =>
            verify(controls, response, apiPath, operation, withError, tableName),
          availableOperations,
          appControls,
          true,
          () => requestMethod
        ));
    });

    describe('tracing disabled', () => {
      this.timeout(config.getTestTimeout() * 2);
      const tableName = createTableName();
      let appControls;

      before(async () => {
        appControls = new ProcessControls({
          dirname: __dirname,
          appName: 'app',
          useGlobalAgent: true,
          tracingEnabled: false,
          env: {
            ...libraryEnv,
            AWS_DYNAMODB_TABLE_NAME: tableName
          }
        });

        await appControls.startAndWaitForAgentConnection();

        try {
          const response = await appControls.sendRequest({
            method: 'GET',
            path: `/${availableOperations[0]}/${requestMethod}`
          });

          verifyResponse(response, availableOperations[0], false, tableName);
        } catch (error) {
          console.log('Error:', error);
        }
      });

      beforeEach(async () => {
        await agentControls.clearReceivedTraceData();
      });

      after(async () => {
        await appControls.stop();
      });

      afterEach(async () => {
        await appControls.clearIpcMessages();
      });

      after(() => cleanup(tableName));

      describe('attempt to get result', () => {
        let ops = availableOperations;
        if (reducedTestSuite) {
          ops = ops.slice(0, 1);
        }

        ops.slice(1).forEach(operation => {
          it(`should not trace (${operation}/${requestMethod})`, async () => {
            const response = await appControls.sendRequest({
              method: 'GET',
              path: `/${operation}/${requestMethod}`
            });

            verifyResponse(response, operation, false, tableName);

            await delay(1000);
            const spans = await agentControls.getSpans();

            if (spans.length > 0) {
              fail(`Unexpected spans (AWS DynamoDB suppressed: ${stringifyItems(spans)}`);
            }
          });
        });
      });
    });

    describe('tracing enabled but suppressed', () => {
      const tableName = createTableName();
      let appControls;

      before(async () => {
        appControls = new ProcessControls({
          dirname: __dirname,
          appName: 'app',
          useGlobalAgent: true,
          env: {
            ...libraryEnv,
            AWS_DYNAMODB_TABLE_NAME: tableName
          }
        });

        await appControls.startAndWaitForAgentConnection();

        try {
          const response = await appControls.sendRequest({
            method: 'GET',
            path: `/${availableOperations[0]}/${requestMethod}`
          });

          verifyResponse(response, availableOperations[0], false, tableName);

          await retry(async () => {
            const spans = await agentControls.getSpans();
            expect(spans.length).to.eql(3);
          });

          await agentControls.clearReceivedData();
        } catch (error) {
          console.log('Error:', error);
        }
      });

      beforeEach(async () => {
        await agentControls.clearReceivedTraceData();
      });

      after(async () => {
        await appControls.stop();
      });

      afterEach(async () => {
        await appControls.clearIpcMessages();
      });

      after(() => cleanup(tableName));

      describe('attempt to get result', () => {
        let ops = availableOperations;
        if (reducedTestSuite) {
          ops = ops.slice(0, 1);
        }

        ops.slice(1).forEach(operation => {
          it(`should not trace (${operation}/${requestMethod})`, async () => {
            const response = await appControls.sendRequest({
              suppressTracing: true,
              method: 'GET',
              path: `/${operation}/${requestMethod}`
            });

            verifyResponse(response, operation, false);

            await delay(1000);
            const spans = await agentControls.getSpans();

            if (spans.length > 0) {
              fail(`Unexpected spans (AWS DynamoDB suppressed: ${stringifyItems(spans)}`);
            }
          });
        });
      });
    });

    describe('ignore-endpoints:', function () {
      describe('when ignore-endpoints is enabled via agent configuration', () => {
        const { AgentStubControls } = require('@_local/collector/test/apps/agentStubControls');
        const customAgentControls = new AgentStubControls();
        let controls;
        const tableName = createTableName();
        before(async () => {
          await customAgentControls.startAgent({
            ignoreEndpoints: { dynamodb: ['listTables'] }
          });

          controls = new ProcessControls({
            agentControls: customAgentControls,
            dirname: __dirname,
            appName: 'app',
            env: {
              ...libraryEnv,
              AWS_DYNAMODB_TABLE_NAME: tableName
            }
          });
          await controls.startAndWaitForAgentConnection();
        });

        beforeEach(async () => {
          await customAgentControls.clearReceivedTraceData();
        });

        after(async () => {
          await customAgentControls.stopAgent();
          await controls.stop();
        });
        after(() => cleanup(tableName));

        it('should ignore dynamodb spans for ignored endpoints (listTables)', async () => {
          const apiPath = `/listTables/${requestMethod}`;

          await controls.sendRequest({
            method: 'GET',
            path: `${apiPath}`
          });
          await delay(1000);
          const spans = await customAgentControls.getSpans();
          // 1 x http entry span
          // 1 x http client span
          expect(spans.length).to.equal(2);
          spans.forEach(span => {
            expect(span.n).not.to.equal('dynamodb');
          });
          expectAtLeastOneMatching(spans, [
            span => expect(span.n).to.equal('node.http.server'),
            span => expect(span.data.http.method).to.equal('GET')
          ]);
          expectAtLeastOneMatching(spans, [
            span => expect(span.n).to.equal('node.http.client'),
            span => expect(span.data.http.method).to.equal('GET')
          ]);
        });
      });
      describe('ignore-endpoints enabled via tracing config', async () => {
        const tableName = createTableName();
        let appControls;

        before(async () => {
          appControls = new ProcessControls({
            useGlobalAgent: true,
            dirname: __dirname,
            appName: 'app',
            env: {
              ...libraryEnv,
              AWS_DYNAMODB_TABLE_NAME: tableName,
              INSTANA_IGNORE_ENDPOINTS: 'dynamodb:listTables'
            }
          });
          await appControls.startAndWaitForAgentConnection();
        });

        beforeEach(async () => {
          await agentControls.clearReceivedTraceData();
        });

        after(async () => {
          await appControls.stop();
        });

        afterEach(async () => {
          await appControls.clearIpcMessages();
        });

        after(() => cleanup(tableName));

        it('should ignore spans for configured ignore endpoints(listTables)', async function () {
          const apiPath = `/listTables/${requestMethod}`;

          await appControls.sendRequest({
            method: 'GET',
            path: `${apiPath}`
          });
          await delay(1000);
          const spans = await agentControls.getSpans();
          // 1 x http entry span
          // 1 x http client span
          expect(spans.length).to.equal(2);
          spans.forEach(span => {
            expect(span.n).not.to.equal('dynamodb');
          });
          expectAtLeastOneMatching(spans, [
            span => expect(span.n).to.equal('node.http.server'),
            span => expect(span.data.http.method).to.equal('GET')
          ]);
          expectAtLeastOneMatching(spans, [
            span => expect(span.n).to.equal('node.http.client'),
            span => expect(span.data.http.method).to.equal('GET')
          ]);
        });
        it('should not ignore spans for endpoints that are not in the ignore list', async () => {
          const apiPath = `/createTable/${requestMethod}`;

          await appControls.sendRequest({
            method: 'GET',
            path: `${apiPath}`
          });
          await delay(1000);
          const spans = await agentControls.getSpans();

          // 1 x http entry span
          // 1 x http client span
          // 1 x dynamodb span
          expect(spans.length).to.equal(3);

          expectAtLeastOneMatching(spans, [
            span => expect(span.n).to.equal('dynamodb'),
            span => expect(span.data.dynamodb.op).to.equal('createTable')
          ]);
          expectAtLeastOneMatching(spans, [
            span => expect(span.n).to.equal('node.http.server'),
            span => expect(span.data.http.method).to.equal('GET')
          ]);
          expectAtLeastOneMatching(spans, [
            span => expect(span.n).to.equal('node.http.client'),
            span => expect(span.data.http.method).to.equal('GET')
          ]);
        });
      });
    });

    function verify(controls, response, apiPath, operation, withError, tableName) {
      return retry(
        () =>
          agentControls
            .getSpans()
            .then(spans => verifySpans(controls, response, spans, apiPath, operation, withError, tableName)),
        1000
      );
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
          span => expect(span.data.dynamodb.op).to.exist,
          span => expect(span.data.dynamodb.region).to.equal('us-east-2'),
          span => {
            let expected;

            if (operation !== 'listTables') {
              if (operation !== 'createTable' || !withError) {
                expected = tableName;
              }
            }
            if (withError) {
              expected = 'invalid_table_name!';
            }

            expect(span.data.dynamodb.table).to.equal(expected);
          },
          () => {
            verifyResponse(response, operation, withError, tableName);
          }
        ]
      });

      if (!withError) {
        expect(spans.length).to.equal(3);
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
}

module.exports = function (name, version, isLatest, mode) {
  libraryEnv = { LIBRARY_VERSION: version, LIBRARY_NAME: name, LIBRARY_LATEST: isLatest };
  requestMethod = mode || 'default-style';

  // For v2-style and cb-style modes, use reducedTestSuite
  const reducedTestSuite = (mode === 'v2-style' || mode === 'cb-style');
  return start.call(this, reducedTestSuite);
};
