/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const { v4: uuid } = require('uuid');
const { checkTableExistence, cleanup } = require('./util');
const semver = require('semver');
const { expect } = require('chai');
const { fail } = expect;
const supportedVersion = require('@_local/core').tracing.supportedVersion;
const config = require('../../../../../../../core/test/config');
const { retry, stringifyItems, delay, expectAtLeastOneMatching } = require('../../../../../../../core/test/test_util');
const ProcessControls = require('../../../../../test_util/ProcessControls');
const globalAgent = require('../../../../../globalAgent');
const {
  verifyHttpRootEntry,
  verifyExitSpan,
  verifyHttpExit
} = require('@_local/core/test/test_util/common_verifications');
const { promisifyNonSequentialCases } = require('../promisify_non_sequential');

const tablePrefix = 'nodejs-team';
const tableName = `${tablePrefix}-v2-${semver.major(process.versions.node)}-${uuid()}`;

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

const requestMethods = ['Callback', 'Async'];
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

const getNextCallMethod = require('@_local/core/test/test_util/circular_list').getCircularList(requestMethods);

if (!supportedVersion(process.versions.node)) {
  mochaSuiteFn = describe.skip;
} else {
  mochaSuiteFn = describe;
}

mochaSuiteFn('tracing/cloud/aws-sdk/v2/dynamodb', function () {
  this.timeout(config.getTestTimeout() * 10);

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  after(() => cleanup(tableName));

  describe('tracing enabled, no suppression', function () {
    let appControls;

    before(async () => {
      appControls = new ProcessControls({
        dirname: __dirname,
        useGlobalAgent: true,
        env: {
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

    withErrorOptions.forEach(withError => {
      if (withError) {
        describe(`getting result with error: ${withError ? 'yes' : 'no'}`, () => {
          it(`should instrument ${availableOperations.join(', ')} with error`, () =>
            promisifyNonSequentialCases(verify, availableOperations, appControls, withError, getNextCallMethod));
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
      return retry(
        () => agentControls.getSpans().then(spans => verifySpans(controls, spans, apiPath, operation, withError)),
        1000
      );
    }

    function verifySpans(controls, spans, apiPath, operation, withError) {
      const httpEntry = verifyHttpRootEntry({ spans, apiPath, pid: String(controls.getPid()) });
      verifyExitSpan({
        spanName: 'dynamodb',
        spans,
        parent: httpEntry,
        withError,
        pid: String(controls.getPid()),
        extraTests: [
          span => expect(span.data.dynamodb.op).to.equal(operationsInfo[operation]),
          span => expect(span.data.dynamodb.table).to.equal(operation !== 'listTables' ? tableName : undefined),
          span => expect(span.data.dynamodb.region).to.equal('us-east-2')
        ]
      });

      if (!withError) {
        expect(spans.length).to.equal(3);
        verifyHttpExit({ spans, parent: httpEntry, pid: String(controls.getPid()) });
      }
    }
  });

  describe('tracing disabled', () => {
    this.timeout(config.getTestTimeout() * 2);

    let appControls;

    before(async () => {
      appControls = new ProcessControls({
        dirname: __dirname,
        useGlobalAgent: true,
        tracingEnabled: false,
        env: {
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

    describe('attempt to get result', () => {
      availableOperations.slice(1).forEach(operation => {
        const requestMethod = getNextCallMethod();
        it(`should not trace (${operation}/${requestMethod})`, async () => {
          await appControls.sendRequest({
            method: 'GET',
            path: `/${operation}/${requestMethod}`
          });

          await delay(1000);
          const spans = await agentControls.getSpans();
          if (spans.length > 0) {
            fail(`Unexpected spans: ${stringifyItems(spans)}`);
          }
        });
      });
    });
  });

  describe('tracing enabled but suppressed', () => {
    let appControls;

    before(async () => {
      appControls = new ProcessControls({
        dirname: __dirname,
        useGlobalAgent: true,
        env: {
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

    describe('attempt to get result', () => {
      availableOperations.slice(1).forEach(operation => {
        const requestMethod = getNextCallMethod();
        it(`should not trace (${operation}/${requestMethod})`, async () => {
          await appControls.sendRequest({
            suppressTracing: true,
            method: 'GET',
            path: `/${operation}/${requestMethod}`
          });

          await delay(1000);
          const spans = await agentControls.getSpans();
          if (spans.length > 0) {
            fail(`Unexpected spans: ${stringifyItems(spans)}`);
          }
        });
      });
    });
  });
  describe('when ignore-endpoints enabled via tracing config', async () => {
    let appControls;
    before(async () => {
      appControls = new ProcessControls({
        dirname: __dirname,
        useGlobalAgent: true,
        env: {
          AWS_DYNAMODB_TABLE_NAME: tableName,
          INSTANA_IGNORE_ENDPOINTS: 'dynamodb:list'
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

    const requestMethod = getNextCallMethod();
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
      const apiPath = `/scan/${requestMethod}`;

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
        span => expect(span.data.dynamodb.op).to.equal('scan')
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
