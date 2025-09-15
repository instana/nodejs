/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const fs = require('fs');
const path = require('path');
const semver = require('semver');
const { expect } = require('chai');
const { v4: uuid } = require('uuid');
const { fail } = expect;
const constants = require('@instana/core').tracing.constants;
const supportedVersion = require('@instana/core').tracing.supportedVersion;
const config = require('../../../../../core/test/config');
const {
  expectExactlyOneMatching,
  expectAtLeastOneMatching,
  retry,
  delay,
  stringifyItems
} = require('../../../../../core/test/test_util');
const ProcessControls = require('../../../test_util/ProcessControls');
const { AgentStubControls } = require('../../../apps/agentStubControls');

/**
 * !!! In order to test Bull, Redis must be running.
 * Run `node bin/start-test-containers.js --redis`
 */

let queueName = 'nodejs-team';

if (process.env.BULL_QUEUE_NAME) {
  queueName = `${process.env.BULL_QUEUE_NAME}${semver.major(process.versions.node)}`;
}

const mochaSuiteFn = supportedVersion(process.versions.node) ? describe : describe.skip;
const retryTime = 1000;

mochaSuiteFn.only('tracing/messaging/bull', function () {
  this.timeout(config.getTestTimeout() * 3);
  const customAgentControls = new AgentStubControls();

  before(async () => {
    await customAgentControls.startAgent({
      // To ensure parent and child process are getting unique uuids from the agent stub!
      uniqueAgentUuids: true
    });
  });

  describe('tracing enabled, no suppression', function () {
    let senderControls;

    before(async () => {
      senderControls = new ProcessControls({
        appPath: path.join(__dirname, 'sender'),
        agentControls: customAgentControls,
        env: {
          REDIS_SERVER: 'redis://127.0.0.1:6379',
          BULL_QUEUE_NAME: queueName,
          BULL_JOB_NAME: 'steve'
        }
      });

      await senderControls.startAndWaitForAgentConnection();
    });

    beforeEach(async () => {
      await customAgentControls.clearReceivedTraceData();
    });

    after(async () => {
      await senderControls.stop();
    });

    afterEach(async () => {
      await senderControls.clearIpcMessages();
    });

    // NOTE: Bull doesn't officially support Process API when using processor with ES module syntax
    //       See: https://github.com/OptimalBits/bull/blob/489c6ab8466c1db122f92af3ddef12eacc54179e/lib/queue.js#L712
    //       Related issue: https://github.com/OptimalBits/bull/issues/924
    if (!process.env.RUN_ESM) {
      describe('receiving via "Process" API', function () {
        let receiverControls;
        const receiveMethod = 'Process';

        before(async () => {
          receiverControls = new ProcessControls({
            appPath: path.join(__dirname, 'receiver'),
            agentControls: customAgentControls,
            env: {
              REDIS_SERVER: 'redis://127.0.0.1:6379',
              BULL_QUEUE_NAME: queueName,
              BULL_RECEIVE_TYPE: receiveMethod,
              BULL_JOB_NAME: 'steve',
              BULL_JOB_NAME_ENABLED: 'true',
              BULL_CONCURRENCY_ENABLED: 'true'
            }
          });

          await receiverControls.startAndWaitForAgentConnection();
        });

        beforeEach(async () => {
          await customAgentControls.clearReceivedTraceData();
        });

        after(async () => {
          await receiverControls.stop();
        });

        afterEach(async () => {
          await receiverControls.clearIpcMessages();
        });

        describe('sendOption: default', function () {
          let testId;
          let sendOption;
          let apiPath;
          let withError;
          let urlWithParams;

          describe('without error', function () {
            beforeEach(() => {
              testId = uuid();
              sendOption = 'default';
              apiPath = `/send?jobName=true&${sendOption}&testId=${testId}`;
              withError = false;
              urlWithParams = withError ? `${apiPath}&withError=true` : apiPath;
            });

            it(`send: ${sendOption}; receive: ${receiveMethod}; error: ${!!withError}`, async () => {
              const response = await senderControls.sendRequest({
                method: 'POST',
                path: urlWithParams
              });

              return verify({
                receiverControls,
                receiveMethod,
                response,
                apiPath,
                testId,
                // 1 x node.http.server 1
                // 1 x bull receive
                // 1 x otel (?)
                // 1 x node.http.client (?)
                // 1 x redis
                // 1 x bull sender
                spanLength: 6,
                withError,
                isRepeatable: sendOption === 'repeat=true',
                isBulk: sendOption === 'bulk=true'
              });
            });
          });

          describe('with error', function () {
            beforeEach(() => {
              withError = true;
              testId = uuid();
              sendOption = 'default';
              apiPath = `/send?jobName=true&${sendOption}&testId=${testId}`;
              urlWithParams = withError ? `${apiPath}&withError=true` : apiPath;
            });

            it.only(`send: ${sendOption}; receive: ${receiveMethod}; error: ${!!withError}`, async () => {
              const response = await senderControls.sendRequest({
                method: 'POST',
                path: urlWithParams
              });

              return verify({
                receiverControls,
                receiveMethod,
                response,
                apiPath,
                testId,
                spanLength: 9,
                withError,
                isRepeatable: sendOption === 'repeat=true',
                isBulk: sendOption === 'bulk=true'
              });
            });
          });
        });

        describe('sendOption: bulk=true', function () {
          let testId;
          let sendOption;
          let apiPath;

          beforeEach(() => {
            testId = uuid();
            sendOption = 'bulk=true';
            apiPath = `/send?jobName=true&${sendOption}&testId=${testId}`;
          });

          describe('without error', function () {
            let withError;
            let urlWithParams;

            beforeEach(() => {
              withError = false;
              urlWithParams = withError ? `${apiPath}&withError=true` : apiPath;
            });

            it(`send: ${sendOption}; receive: ${receiveMethod}; error: ${!!withError}`, async () => {
              const response = await senderControls.sendRequest({
                method: 'POST',
                path: urlWithParams
              });

              return verify({
                receiverControls,
                receiveMethod,
                response,
                apiPath,
                testId,
                // TODO: all other bull tests also produce a huge number of spans
                //       https://jsw.ibm.com/browse/INSTA-15029
                spanLength: 16,
                withError,
                isRepeatable: sendOption === 'repeat=true',
                isBulk: sendOption === 'bulk=true'
              });
            });
          });

          describe('with error', function () {
            let withError;
            let urlWithParams;

            beforeEach(() => {
              withError = true;
              urlWithParams = withError ? `${apiPath}&withError=true` : apiPath;
            });

            it(`send: ${sendOption}; receive: ${receiveMethod}; error: ${!!withError}`, async () => {
              const response = await senderControls.sendRequest({
                method: 'POST',
                path: urlWithParams
              });

              return verify({
                receiverControls,
                receiveMethod,
                response,
                apiPath,
                testId,
                withError,
                spanLength: 25,
                isRepeatable: sendOption === 'repeat=true',
                isBulk: sendOption === 'bulk=true'
              });
            });
          });
        });

        describe('sendOption: repeat=true', function () {
          let testId;
          let sendOption;
          let apiPath;

          beforeEach(() => {
            testId = uuid();
            sendOption = 'repeat=true';
            apiPath = `/send?jobName=true&${sendOption}&testId=${testId}`;
          });

          describe('without error', function () {
            let withError;
            let urlWithParams;

            beforeEach(() => {
              withError = false;
              urlWithParams = withError ? `${apiPath}&withError=true` : apiPath;
            });

            it(`send: ${sendOption}; receive: ${receiveMethod}; error: ${!!withError}`, async () => {
              const response = await senderControls.sendRequest({
                method: 'POST',
                path: urlWithParams
              });

              return verify({
                receiverControls,
                receiveMethod,
                response,
                apiPath,
                testId,
                withError,
                spanLength: 11,
                isRepeatable: sendOption === 'repeat=true',
                isBulk: sendOption === 'bulk=true'
              });
            });
          });

          describe('with error', function () {
            let withError;
            let urlWithParams;

            beforeEach(() => {
              withError = true;
              urlWithParams = withError ? `${apiPath}&withError=true` : apiPath;
            });

            it(`send: ${sendOption}; receive: ${receiveMethod}; error: ${!!withError}`, async () => {
              const response = await senderControls.sendRequest({
                method: 'POST',
                path: urlWithParams
              });

              return verify({
                receiverControls,
                receiveMethod,
                response,
                apiPath,
                spanLength: 17,
                testId,
                withError,
                isRepeatable: sendOption === 'repeat=true',
                isBulk: sendOption === 'bulk=true'
              });
            });
          });
        });
      });
    }

    describe('receiving via "Promise" API', function () {
      let receiverControls;
      const receiveMethod = 'Promise';

      before(async () => {
        receiverControls = new ProcessControls({
          appPath: path.join(__dirname, 'receiver'),
          agentControls: customAgentControls,
          env: {
            REDIS_SERVER: 'redis://127.0.0.1:6379',
            BULL_QUEUE_NAME: queueName,
            BULL_RECEIVE_TYPE: receiveMethod,
            BULL_JOB_NAME: 'steve',
            BULL_JOB_NAME_ENABLED: 'true',
            BULL_CONCURRENCY_ENABLED: 'true'
          }
        });

        await receiverControls.startAndWaitForAgentConnection();
      });

      beforeEach(async () => {
        await customAgentControls.clearReceivedTraceData();
      });

      after(async () => {
        await receiverControls.stop();
      });

      afterEach(async () => {
        await receiverControls.clearIpcMessages();
      });

      describe('sendOption: default', function () {
        let sendOption;
        let apiPath;
        let testId;

        beforeEach(() => {
          sendOption = 'default';
          testId = uuid();
          apiPath = `/send?jobName=true&${sendOption}&testId=${testId}`;
        });

        describe('without error', function () {
          let withError;
          let urlWithParams;

          beforeEach(() => {
            withError = false;
            urlWithParams = withError ? `${apiPath}&withError=true` : apiPath;
          });

          it(`send: ${sendOption}; receive: ${receiveMethod}; error: ${!!withError}`, async () => {
            const response = await senderControls.sendRequest({
              method: 'POST',
              path: urlWithParams
            });

            return verify({
              receiverControls,
              receiveMethod,
              response,
              apiPath,
              spanLength: 6,
              testId,
              withError,
              isRepeatable: sendOption === 'repeat=true',
              isBulk: sendOption === 'bulk=true'
            });
          });
        });

        describe('with error', function () {
          let withError;
          let urlWithParams;

          beforeEach(() => {
            withError = true;
            urlWithParams = withError ? `${apiPath}&withError=true` : apiPath;
          });

          it(`send: ${sendOption}; receive: ${receiveMethod}; error: ${!!withError}`, async () => {
            const response = await senderControls.sendRequest({
              method: 'POST',
              path: urlWithParams
            });

            return verify({
              receiverControls,
              receiveMethod,
              response,
              spanLength: 9,
              apiPath,
              testId,
              withError,
              isRepeatable: sendOption === 'repeat=true',
              isBulk: sendOption === 'bulk=true'
            });
          });
        });
      });

      describe('sendOption: bulk=true', function () {
        let sendOption;
        let apiPath;
        let testId;

        beforeEach(() => {
          sendOption = 'bulk=true';
          testId = uuid();
          apiPath = `/send?jobName=true&${sendOption}&testId=${testId}`;
        });

        describe('without error', function () {
          let withError;
          let urlWithParams;

          beforeEach(() => {
            withError = false;
            urlWithParams = withError ? `${apiPath}&withError=true` : apiPath;
          });

          it(`send: ${sendOption}; receive: ${receiveMethod}; error: ${!!withError}`, async () => {
            const response = await senderControls.sendRequest({
              method: 'POST',
              path: urlWithParams
            });

            return verify({
              receiverControls,
              receiveMethod,
              response,
              apiPath,
              testId,
              withError,
              spanLength: 16,
              isRepeatable: sendOption === 'repeat=true',
              isBulk: sendOption === 'bulk=true'
            });
          });
        });

        describe('with error', function () {
          let withError;
          let urlWithParams;

          beforeEach(() => {
            withError = true;
            urlWithParams = withError ? `${apiPath}&withError=true` : apiPath;
          });

          it(`send: ${sendOption}; receive: ${receiveMethod}; error: ${!!withError}`, async () => {
            const response = await senderControls.sendRequest({
              method: 'POST',
              path: urlWithParams
            });

            return verify({
              receiverControls,
              receiveMethod,
              response,
              apiPath,
              spanLength: 25,
              testId,
              withError,
              isRepeatable: sendOption === 'repeat=true',
              isBulk: sendOption === 'bulk=true'
            });
          });
        });
      });

      describe('sendOption: repeat=true', function () {
        let sendOption;
        let apiPath;
        let testId;

        beforeEach(() => {
          sendOption = 'repeat=true';
          testId = uuid();
          apiPath = `/send?jobName=true&${sendOption}&testId=${testId}`;
        });

        describe('without error', function () {
          let withError;
          let urlWithParams;

          beforeEach(() => {
            withError = false;
            urlWithParams = withError ? `${apiPath}&withError=true` : apiPath;
          });

          it(`send: ${sendOption}; receive: ${receiveMethod}; error: ${!!withError}`, async () => {
            const response = await senderControls.sendRequest({
              method: 'POST',
              path: urlWithParams
            });

            return verify({
              receiverControls,
              receiveMethod,
              response,
              apiPath,
              spanLength: 11,
              testId,
              withError,
              isRepeatable: sendOption === 'repeat=true',
              isBulk: sendOption === 'bulk=true'
            });
          });
        });

        describe('with error', function () {
          let withError;
          let urlWithParams;

          beforeEach(() => {
            withError = true;
            urlWithParams = withError ? `${apiPath}&withError=true` : apiPath;
          });

          it(`send: ${sendOption}; receive: ${receiveMethod}; error: ${!!withError}`, async () => {
            const response = await senderControls.sendRequest({
              method: 'POST',
              path: urlWithParams
            });

            return verify({
              receiverControls,
              receiveMethod,
              response,
              spanLength: 17,
              apiPath,
              testId,
              withError,
              isRepeatable: sendOption === 'repeat=true',
              isBulk: sendOption === 'bulk=true'
            });
          });
        });
      });
    });

    async function verify({
      //
      receiverControls,
      receiveMethod,
      response,
      apiPath,
      spanLength,
      testId,
      withError,
      isRepeatable,
      isBulk
    }) {
      return retry(async () => {
        /**
         * The receiver.js test app sends errors via IPC messages to receiverControls.
         * If we catch any, we just throw them so the test fails and we can check what is wrong.
         */
        const ipcErrorMessage = receiverControls.getIpcMessages().find(m => m.hasError);

        if (ipcErrorMessage) {
          throw new Error(ipcErrorMessage.error);
        }

        await verifyResponseAndJobProcessing({ response, testId, isRepeatable, isBulk });

        return customAgentControls.getSpans().then(spans => {
          expect(spans.length).to.equal(spanLength);

          verifySpans({
            receiverControls,
            receiveMethod,
            spans,
            apiPath,
            withError,
            isRepeatable,
            isBulk
          });
        });
      }, retryTime);
    }

    function verifySpans({ receiverControls, receiveMethod, spans, apiPath, withError, isRepeatable, isBulk }) {
      const httpEntry = verifyHttpEntry({ spans, apiPath, withError });
      const bullExit = verifyBullExit({ spans, parent: httpEntry, withError, isRepeatable, isBulk });

      const bullEntry = verifyBullEntry({
        spans,
        parentAgentUuid: httpEntry.f.h,
        parent: bullExit,
        receiverControls,
        withError
      });

      // This is the http exit from the forked bull to the agent!
      verifyHttpExit({
        spans,
        parentAgentUuid: httpEntry.f.h,
        parent: bullEntry,
        receiverControls,
        inProcess: receiveMethod === 'Process' ? 'child' : 'main'
      });
    }

    function verifyHttpEntry({ spans, apiPath, withError }) {
      return expectExactlyOneMatching(spans, [
        span => expect(span.p).to.not.exist,
        span => expect(span.k).to.equal(constants.ENTRY),
        span => expect(span.f.e).to.equal(String(senderControls.getPid())),
        span => expect(span.f.h).to.contain('agent-stub-uuid'),
        span => expect(span.n).to.equal('node.http.server'),
        span =>
          expect(`${span.data.http.url}?${span.data.http.params}`).to.equal(
            apiPath + (withError ? '&withError=true' : '')
          )
      ]);
    }

    function verifyHttpExit({ parentAgentUuid, spans, parent, inProcess = 'main', receiverControls }) {
      const expectations = [
        span => expect(span.t).to.equal(parent.t),
        span => expect(span.p).to.equal(parent.s),
        span => expect(span.k).to.equal(constants.EXIT),
        span => expect(span.f.h).to.equal(parentAgentUuid),
        span => expect(span.n).to.equal('node.http.client')
      ];

      if (inProcess === 'main') {
        expectations.push(span => expect(span.f.e).to.equal(String(receiverControls.getPid())));
      } else if (inProcess === 'child') {
        expectations.push(span => expect(span.f.e).to.not.equal(String(receiverControls.getPid())));
      } else {
        expectations.push(() => fail(`Invalid value for inProcess argument: ${inProcess}.`));
      }

      return expectExactlyOneMatching(spans, expectations);
    }

    function verifyBullExit({ spans, parent, isRepeatable = false, isBulk = false }) {
      if (isBulk) {
        return expectAtLeastOneMatching(spans, [
          span => expect(span.n).to.equal('bull'),
          span => expect(span.k).to.equal(constants.EXIT),
          // Bulk cannot have repeatable jobs
          span => expect(span.t).to.equal(parent.t),
          span => expect(span.p).to.equal(parent.s),
          span => expect(span.f.e).to.equal(String(senderControls.getPid())),
          span => expect(span.f.h).to.contain('agent-stub-uuid'),
          span => expect(span.error).to.not.exist,
          span => expect(span.async).to.not.exist,
          span => expect(span.data).to.exist,
          span => expect(span.data.bull).to.be.an('object'),
          span => expect(span.data.bull.sort).to.equal('exit'),
          span => expect(span.data.bull.queue).to.equal(queueName)
        ]);
      } else {
        return expectExactlyOneMatching(spans, [
          span => expect(span.n).to.equal('bull'),
          span => expect(span.k).to.equal(constants.EXIT),
          // When a job is repeatable, the span is a root span
          span => expect(span.t).to.equal(isRepeatable ? span.t : parent.t),
          span => expect(span.p).to.equal(isRepeatable ? undefined : parent.s),
          span => expect(span.f.e).to.equal(String(senderControls.getPid())),
          span => expect(span.f.h).to.equal(`agent-stub-uuid-${senderControls.getPid()}`),
          span => expect(span.error).to.not.exist,
          span => expect(span.async).to.not.exist,
          span => expect(span.data).to.exist,
          span => expect(span.data.bull).to.be.an('object'),
          span => expect(span.data.bull.sort).to.equal('exit'),
          span => expect(span.data.bull.queue).to.equal(queueName)
        ]);
      }
    }

    function verifyBullEntry({ parentAgentUuid, receiverControls, spans, parent, withError = false }) {
      return expectExactlyOneMatching(spans, [
        span => expect(span.n).to.equal('bull'),
        span => expect(span.k).to.equal(constants.ENTRY),
        span => expect(span.t).to.equal(parent.t),
        span => expect(span.p).to.equal(parent.s),
        span => expect(span.f.h).to.equal(parentAgentUuid),
        span => expect(span.f.e).to.equal(String(receiverControls.getPid())),
        span => expect(span.error).to.not.exist,
        span => expect(span.ec).to.equal(withError ? 1 : 0),
        span => expect(span.async).to.not.exist,
        span => expect(span.data).to.exist,
        span => expect(span.data.bull).to.be.an('object'),
        span => expect(span.data.bull.sort).to.equal('entry'),
        span => expect(span.data.bull.queue).to.equal(queueName)
      ]);
    }
  });

  // NOTE: Bull doesn't officially support Process API when using processor with ES module syntax
  // See: https://github.com/OptimalBits/bull/blob/489c6ab8466c1db122f92af3ddef12eacc54179e/lib/queue.js#L712
  // Related issue: https://github.com/OptimalBits/bull/issues/924
  if (!process.env.RUN_ESM) {
    describe('tracing disabled', function () {
      this.timeout(config.getTestTimeout() * 2);

      let senderControls;

      before(async () => {
        senderControls = new ProcessControls({
          appPath: path.join(__dirname, 'sender'),
          agentControls: customAgentControls,
          tracingEnabled: false,
          env: {
            REDIS_SERVER: 'redis://127.0.0.1:6379',
            BULL_QUEUE_NAME: queueName,
            BULL_JOB_NAME: 'steve'
          }
        });

        await senderControls.startAndWaitForAgentConnection();
      });

      beforeEach(async () => {
        await customAgentControls.clearReceivedTraceData();
      });

      after(async () => {
        await senderControls.stop();
      });

      afterEach(async () => {
        await senderControls.clearIpcMessages();
      });

      describe('sending and receiving', function () {
        let receiverControls;
        const receiveMethod = 'Process';

        before(async () => {
          receiverControls = new ProcessControls({
            appPath: path.join(__dirname, 'receiver'),
            agentControls: customAgentControls,
            tracingEnabled: false,
            env: {
              REDIS_SERVER: 'redis://127.0.0.1:6379',
              BULL_QUEUE_NAME: queueName,
              BULL_RECEIVE_TYPE: receiveMethod,
              BULL_JOB_NAME: 'steve',
              BULL_JOB_NAME_ENABLED: 'true',
              BULL_CONCURRENCY_ENABLED: 'true'
            }
          });

          await receiverControls.startAndWaitForAgentConnection();
        });

        beforeEach(async () => {
          await customAgentControls.clearReceivedTraceData();
        });

        after(async () => {
          await receiverControls.stop();
        });

        afterEach(async () => {
          await receiverControls.clearIpcMessages();
        });

        const testId = uuid();

        describe('sendOption: default', function () {
          const sendOption = 'default';
          const isRepeatable = sendOption === 'repeat=true';
          const isBulk = sendOption === 'bulk=true';

          const apiPath = `/send?jobName=true&${sendOption}&testId=${testId}`;

          it(`should not trace for sending(${sendOption}) / receiving(${receiveMethod})`, async () => {
            const urlWithParams = apiPath;
            const response = await senderControls.sendRequest({
              method: 'POST',
              path: urlWithParams
            });

            return retry(
              async () => verifyResponseAndJobProcessing({ response, testId, isRepeatable, isBulk }),
              retryTime
            )
              .then(() => delay(1000))
              .then(() => customAgentControls.getSpans())
              .then(spans => {
                if (spans.length > 0) {
                  fail(`Unexpected spans (Bull suppressed: ${stringifyItems(spans)}`);
                }
              });
          });
        });
      });
    });
  }

  describe('tracing enabled but suppressed', function () {
    let senderControls;

    before(async () => {
      senderControls = new ProcessControls({
        appPath: path.join(__dirname, 'sender'),
        agentControls: customAgentControls,
        env: {
          REDIS_SERVER: 'redis://127.0.0.1:6379',
          BULL_QUEUE_NAME: queueName,
          BULL_JOB_NAME: 'steve'
        }
      });

      await senderControls.startAndWaitForAgentConnection();
    });

    beforeEach(async () => {
      await customAgentControls.clearReceivedTraceData();
    });

    after(async () => {
      await senderControls.stop();
    });

    afterEach(async () => {
      await senderControls.clearIpcMessages();
    });

    describe('tracing suppressed', function () {
      let receiverControls;
      const receiveMethod = 'Promise';

      before(async () => {
        receiverControls = new ProcessControls({
          appPath: path.join(__dirname, 'receiver'),
          agentControls: customAgentControls,
          env: {
            REDIS_SERVER: 'redis://127.0.0.1:6379',
            BULL_QUEUE_NAME: queueName,
            BULL_RECEIVE_TYPE: receiveMethod,
            BULL_JOB_NAME: 'steve',
            BULL_JOB_NAME_ENABLED: 'true',
            BULL_CONCURRENCY_ENABLED: 'true'
          }
        });

        await receiverControls.startAndWaitForAgentConnection();
      });

      beforeEach(async () => {
        await customAgentControls.clearReceivedTraceData();
      });

      after(async () => {
        await receiverControls.stop();
      });

      afterEach(async () => {
        await receiverControls.clearIpcMessages();
      });

      const testId = uuid();

      const sendOption = 'default';
      const isRepeatable = sendOption === 'repeat=true';
      const isBulk = sendOption === 'bulk=true';

      const apiPath = `/send?jobName=true&${sendOption}&testId=${testId}`;
      it(`doesn't trace when sending(${sendOption}) and receiving(${receiveMethod})`, async () => {
        const urlWithParams = apiPath;

        const response = await senderControls.sendRequest({
          method: 'POST',
          path: urlWithParams,
          suppressTracing: true
        });

        return retry(async () => {
          await verifyResponseAndJobProcessing({ response, testId, isRepeatable, isBulk });
        }, retryTime)
          .then(() => delay(1000))
          .then(() => customAgentControls.getSpans())
          .then(spans => {
            if (spans.length > 0) {
              fail(`Unexpected spans (Bull suppressed: ${stringifyItems(spans)}`);
            }
          });
      });
    });
  });

  describe('allowRootExitSpan', function () {
    let controls;

    before(async () => {
      controls = new ProcessControls({
        agentControls: customAgentControls,
        appPath: path.join(__dirname, 'allowRootExitSpanApp'),
        env: {
          REDIS_SERVER: `redis://${process.env.REDIS}`,
          BULL_QUEUE_NAME: queueName,
          BULL_JOB_NAME: 'steve',
          INSTANA_ALLOW_ROOT_EXIT_SPAN: 1
        }
      });

      await controls.start(null, null, true);
    });

    beforeEach(async () => {
      await customAgentControls.clearReceivedTraceData();
    });

    it('must trace', async function () {
      await retry(async () => {
        await delay(500);
        const spans = await customAgentControls.getSpans();

        expect(spans.length).to.be.eql(2);

        expectExactlyOneMatching(spans, [span => expect(span.n).to.equal('bull'), span => expect(span.k).to.equal(2)]);
        expectExactlyOneMatching(spans, [span => expect(span.n).to.equal('redis'), span => expect(span.k).to.equal(2)]);
      });
    });
  });
});

async function verifyResponseAndJobProcessing({ response, testId, isRepeatable, isBulk }) {
  expect(response).to.be.an('object');

  if (isRepeatable || isBulk) {
    expect(response.status).to.equal('Jobs sent');
  } else {
    expect(response.status).to.equal('Job sent');
  }

  // We need some mechanism to verify that the job was actually received and processed. Usually, we use IPC for
  // that. With the Bull framework, this is a bit cumbersome, because Bull can start child processes to process
  // jobs. In such a child process worker, process.send refers to a different parent process (it is then the
  // application under test instead of the test process). Thus, instead of IPC, we let the job processing create a
  // file with known file name and context. The existence of the file together with a unique ID in its content
  // verifies that the job has been processed.
  try {
    if (isBulk) {
      await verifyJobCreatedAFile('file-created-by-job-1.json', testId);
      await verifyJobCreatedAFile('file-created-by-job-2.json', testId);
    } else {
      await verifyJobCreatedAFile('file-created-by-job.json', testId);
    }
  } catch (ex) {
    fail(ex);
  }
}

async function verifyJobCreatedAFile(filename, testId) {
  const readFilePromise = new Promise((resolve, reject) => {
    fs.readFile(path.join(__dirname, filename), (err, data) => {
      if (err) {
        return reject(err);
      }
      return resolve(data);
    });
  });

  let fileCreatedByJob;
  try {
    fileCreatedByJob = await readFilePromise;
  } catch (ex) {
    fail(ex);
  }

  expect(fileCreatedByJob.toString(), 'All Instana data must be removed from original Job data').to.not.match(
    /X_INSTANA_/
  );
  const contentCreatedByJob = JSON.parse(fileCreatedByJob.toString());
  expect(contentCreatedByJob.data.testId).to.equal(testId);
}
