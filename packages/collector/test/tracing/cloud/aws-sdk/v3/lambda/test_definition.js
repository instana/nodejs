/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const { expect } = require('chai');
const { fail } = expect;
const path = require('path');
const semver = require('semver');
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('@instana/core/test/config');
const { retry, stringifyItems, delay } = require('@instana/core/test/test_util');
const ProcessControls = require('../../../../../test_util/ProcessControls');
const globalAgent = require('../../../../../globalAgent');
const { verifyHttpRootEntry, verifyExitSpan } = require('@instana/core/test/test_util/common_verifications');

const SPAN_NAME = 'aws.lambda.invoke';
const functionName = 'wrapped-async';
let mochaSuiteFn;

const availableCtx = [null, '{"Custom": {"awesome_company": "Instana"}}', '{"Custom": "Something"}'];
const requestMethods = ['Callback', 'Promise', 'CallbackV2', 'PromiseV2'];
const availableOperations = ['invoke', 'invokeAsync'];

const getNextCallMethod = require('@instana/core/test/test_util/circular_list').getCircularList(requestMethods);
function start(version) {
  if (!supportedVersion(process.versions.node) || semver.lt(process.versions.node, '14.0.0')) {
    mochaSuiteFn = describe.skip;
    return;
  } else {
    mochaSuiteFn = describe;
  }

  const retryTime = config.getTestTimeout() * 5;

  mochaSuiteFn(`npm: ${version}`, function () {
    this.timeout(config.getTestTimeout() * 10);
    globalAgent.setUpCleanUpHooks();
    const agentControls = globalAgent.instance;

    describe('tracing enabled, no suppression', function () {
      const appControls = new ProcessControls({
        appPath: path.join(__dirname, 'app'),
        useGlobalAgent: true,
        env: {
          AWS_LAMBDA_FUNCTION_NAME: functionName
        }
      });

      ProcessControls.setUpHooksWithRetryTime(retryTime, appControls);
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
          retryTime
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
      this.timeout(config.getTestTimeout() * 2);

      const appControls = new ProcessControls({
        appPath: path.join(__dirname, 'app'),
        useGlobalAgent: true,
        tracingEnabled: false,
        env: {
          AWS_LAMBDA_FUNCTION_NAME: functionName
        }
      });
      ProcessControls.setUpHooksWithRetryTime(retryTime, appControls);
      describe('attempt to get result', () => {
        availableOperations.forEach(operation => {
          const requestMethod = getNextCallMethod();
          it(`should not trace (${operation}/${requestMethod})`, async () => {
            await appControls.sendRequest({
              method: 'GET',
              path: `/${operation}/${requestMethod}`
            });
            return retry(() => delay(config.getTestTimeout() / 4))
              .then(() => agentControls.getSpans())
              .then(spans => {
                if (spans.length > 0) {
                  fail(`Unexpected spans AWS Lambda invoke function suppressed: ${stringifyItems(spans)}`);
                }
              });
          });
        });
      });
    });

    describe('tracing enabled but suppressed', () => {
      const appControls = new ProcessControls({
        appPath: path.join(__dirname, 'app'),
        useGlobalAgent: true,
        env: {
          AWS_LAMBDA_FUNCTION_NAME: functionName
        }
      });

      ProcessControls.setUpHooksWithRetryTime(retryTime, appControls);

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
            return retry(() => delay(config.getTestTimeout() / 4), retryTime)
              .then(() => agentControls.getSpans())
              .then(spans => {
                if (spans.length > 0) {
                  fail(`Unexpected spans AWS Lambda invoke function suppressed: ${stringifyItems(spans)}`);
                }
              });
          });
        });
      });
    });
  });
}
module.exports = function (version) {
  return start.bind(this)(version);
};
