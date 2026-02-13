/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const { expect } = require('chai');
const { fail } = expect;
const supportedVersion = require('@_local/core').tracing.supportedVersion;
const config = require('@_local/core/test/config');
const { retry, stringifyItems, delay } = require('@_local/core/test/test_util');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');
const globalAgent = require('@_local/collector/test/globalAgent');
const { verifyHttpRootEntry, verifyExitSpan } = require('@_local/core/test/test_util/common_verifications');
const SPAN_NAME = 'aws.lambda.invoke';
// We are using a single function, 'nodejs-tracer-lambda', for our Lambda testing since we invoke an existing function.
// Our tests focus on invoking function and retrieving details of the function, rather than creating new ones.
// We originally created this function specifically for testing and are now using it across all test cases.
const functionName = 'nodejs-tracer-lambda';
let appControls;

const availableCtx = [null, '{"Custom": {"awesome_company": "Instana"}}', '{"Custom": "Something"}'];
const requestMethods = ['async', 'promise', 'cb', 'promise-v2', 'cb-v2'];
const availableOperations = ['invoke', 'getFunction'];
let envConfig = {};
const getNextCallMethod = require('@_local/core/test/test_util/circular_list').getCircularList(requestMethods);
let libraryEnv;
async function start() {
  this.timeout(config.getTestTimeout() * 20);

  if (!supportedVersion(process.versions.node)) {
    it.skip('unsupported node version', () => { });
    return;
  }
  const { isLocalStackDisabled } = require('./utils');

  if (isLocalStackDisabled()) {
    // invokeAsync currently not supported in localstack
    // https://docs.localstack.cloud/references/coverage/coverage_lambda/
    availableOperations.push('invokeAsync');
    envConfig = {
      AWS_LAMBDA_FUNCTION_NAME: functionName
    };
  } else {
    envConfig = {
      AWS_LAMBDA_FUNCTION_NAME: functionName,
      AWS_ENDPOINT: process.env.INSTANA_CONNECT_LOCALSTACK_AWS
    };
  }

  if (!isLocalStackDisabled()) {
    const { createFunction, removeFunction } = require('./utils');
    before(async () => {
      await createFunction(functionName);
    });

    after(async () => {
      await removeFunction(functionName);
    });
  }
  describe('tracing enabled', function () {
    globalAgent.setUpCleanUpHooks();
    const agentControls = globalAgent.instance;

    describe('tracing enabled, no suppression', function () {
      before(async () => {
        appControls = new ProcessControls({
          dirname: __dirname,
          appName: 'app',
          useGlobalAgent: true,
          env: { ...libraryEnv, ...envConfig }
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

      availableOperations.forEach(operation => {
        availableCtx.forEach(ctx => {
          const requestMethod = getNextCallMethod();

          it(`operation: ${operation}/${requestMethod} (ctx: ${ctx})`, async () => {
            const apiPath = `/${operation}/${requestMethod}`;
            const response = await appControls.sendRequest({
              method: 'GET',
              path: `${apiPath}?ctx=${ctx}`,
              simple: true
            });

            return verify(appControls, response, apiPath, operation, ctx);
          });
        });
      });
      function verify(controls, response, apiPath, operation, ctx) {
        return retry(
          () => agentControls.getSpans().then(spans => verifySpans(controls, response, spans, apiPath, operation, ctx)),
          1000
        );
      }
      function verifySpans(controls, response, spans, apiPath, operation, ctx) {
        const httpEntry = verifyHttpRootEntry({ spans, apiPath, pid: String(controls.getPid()) });

        verifyExitSpan({
          spanName: SPAN_NAME,
          spans,
          parent: httpEntry,
          pid: String(controls.getPid()),
          extraTests: [
            span => expect(span.data[SPAN_NAME].function).to.equal(functionName),
            span =>
              expect(span.data[SPAN_NAME].type).to.equal(span.data[SPAN_NAME].type ? 'RequestResponse' : undefined),
            span => {
              if (operation === 'invoke') {
                const clientContextString = Buffer.from(response.data.clientContext || '', 'base64').toString();

                const clientContext = JSON.parse(clientContextString);
                expect(clientContext.Custom['x-instana-s']).to.equal(span.s);
                expect(clientContext.Custom['x-instana-t']).to.equal(span.t);
                expect(clientContext.Custom['x-instana-l']).to.equal('1');

                if (ctx) {
                  const ctxJSON = JSON.parse(ctx);

                  if (ctxJSON.Custom.awesome_company) {
                    expect(clientContext.Custom.awesome_company).to.exist;
                    expect(ctxJSON.Custom.awesome_company).to.equal(clientContext.Custom.awesome_company);
                  }
                }
              }
            }
          ]
        });
      }
    });

    describe('tracing disabled', () => {
      before(async () => {
        appControls = new ProcessControls({
          dirname: __dirname,
          appName: 'app',
          useGlobalAgent: true,
          tracingEnabled: false,
          env: { ...libraryEnv, ...envConfig }
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
        availableOperations.forEach(operation => {
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
      before(async () => {
        appControls = new ProcessControls({
          dirname: __dirname,
          appName: 'app',
          useGlobalAgent: true,
          env: { ...libraryEnv, ...envConfig }
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
        availableOperations.forEach(operation => {
          const requestMethod = getNextCallMethod();

          it(`should not trace (${operation}/${requestMethod})`, async () => {
            const resp = await appControls.sendRequest({
              suppressTracing: true,
              method: 'GET',
              path: `/${operation}/${requestMethod}`
            });
            if (requestMethod === 'invoke') {
              const clientContextString = Buffer.from(resp.data.clientContext || '', 'base64').toString();
              const clientContext = JSON.parse(clientContextString);
              expect(clientContext.Custom['x-instana-s']).to.not.exist;
              expect(clientContext.Custom['x-instana-t']).to.not.exist;
              expect(clientContext.Custom['x-instana-l']).to.equal('0');
            }

            await delay(1000);
            const spans = await agentControls.getSpans();
            if (spans.length > 0) {
              fail(`Unexpected spans: ${stringifyItems(spans)}`);
            }
          });
        });
      });
    });
  });
}
module.exports = function (name, version, isLatest) {
  libraryEnv = { LIBRARY_VERSION: version, LIBRARY_NAME: name, LIBRARY_LATEST: isLatest };
  return start.call(this);
};
