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
const constants = require('@_local/core').tracing.constants;
const config = require('@_local/core/test/config');
const {
  expectExactlyOneMatching,
  expectAtLeastOneMatching,
  retry,
  delay,
  stringifyItems
} = require('@_local/core/test/test_util');
const ProcessControls = require('@_local/collector/test/test_util/ProcessControls');
const { AgentStubControls } = require('@_local/collector/test/apps/agentStubControls');

let queueName = 'nodejs-team';

if (process.env.BULL_QUEUE_NAME) {
  queueName = `${process.env.BULL_QUEUE_NAME}${semver.major(process.versions.node)}`;
}

const retryTime = 1000;

module.exports = function (name, version, isLatest) {
  this.timeout(config.getTestTimeout() * 3);

  const commonEnv = {
    LIBRARY_LATEST: isLatest,
    LIBRARY_VERSION: version,
    LIBRARY_NAME: name
  };

  const customAgentControls = new AgentStubControls();

  before(async () => {
    const files = fs.readdirSync(__dirname);
    files.forEach(f => {
      if (f.startsWith('file-created-by-job') && f.endsWith('.json')) {
        fs.unlinkSync(path.join(__dirname, f));
      }
    });

    await customAgentControls.startAgent({
      uniqueAgentUuids: true
    });
  });

  after(async () => {
    await customAgentControls.stopAgent();
  });

  describe('tracing enabled, no suppression', function () {
    let senderControls;

    before(async () => {
      senderControls = new ProcessControls({
        dirname: __dirname,
        appName: 'sender',
        agentControls: customAgentControls,
        env: {
          ...commonEnv,
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

    if (!process.env.RUN_ESM) {
      describe('receiving via "Process" API', function () {
        let receiverControls;
        const receiveMethod = 'Process';

        before(async () => {
          receiverControls = new ProcessControls({
            dirname: __dirname,
            appName: 'receiver',
            agentControls: customAgentControls,
            env: {
              ...commonEnv,
              REDIS_SERVER: 'redis://127.0.0.1:6379',
              BULL_QUEUE_NAME: queueName,
              BULL_RECEIVE_TYPE: receiveMethod,
              BULL_JOB_NAME: 'steve',
              BULL_JOB_NAME_ENABLED: 'true'
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
                spanLength: 5,
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
                spanLength: 8,
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
                spanLength: 13,
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
                spanLength: 22,
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
                spanLength: 9,
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
                spanLength: 15,
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
          dirname: __dirname,
          appName: 'receiver',
          agentControls: customAgentControls,
          env: {
            ...commonEnv,
            REDIS_SERVER: 'redis://127.0.0.1:6379',
            BULL_QUEUE_NAME: queueName,
            BULL_RECEIVE_TYPE: receiveMethod,
            BULL_JOB_NAME: 'steve',
            BULL_JOB_NAME_ENABLED: 'true'
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
              spanLength: 5,
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
              spanLength: 8,
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
              spanLength: 13,
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
              spanLength: 22,
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
              spanLength: 9,
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
              spanLength: 15,
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
        const ipcErrorMessage = receiverControls.getIpcMessages().find(m => m.hasError);

        if (ipcErrorMessage) {
          throw new Error(ipcErrorMessage.error);
        }

        await delay(1000 * 2);
        const contentsCreatedByJob = await verifyResponseAndJobProcessing({ response, testId, isRepeatable, isBulk });

        return customAgentControls.getSpans().then(spans => {
          expect(spans.length).to.equal(spanLength);

          verifySpans({
            receiverControls,
            receiveMethod,
            spans,
            apiPath,
            withError,
            isRepeatable,
            isBulk,
            contentsCreatedByJob
          });
        });
      }, retryTime);
    }

    function verifySpans({
      receiverControls,
      receiveMethod,
      spans,
      apiPath,
      withError,
      isRepeatable,
      isBulk,
      contentsCreatedByJob
    }) {
      const httpEntry = verifyHttpEntry({ spans, apiPath, withError });
      const bullExit = verifyBullExit({ spans, parent: httpEntry, withError, isRepeatable, isBulk });

      const bullEntry = verifyBullEntry({
        spans,
        parent: bullExit,
        receiverControls,
        contentsCreatedByJob,
        withError
      });

      verifyHttpExit({
        spans,
        parent: bullEntry,
        contentsCreatedByJob,
        receiverControls,
        inProcess: receiveMethod === 'Process' ? 'child' : 'main'
      });
    }

    function verifyHttpEntry({ spans, apiPath, withError }) {
      return expectExactlyOneMatching(spans, [
        span => expect(span.p).to.not.exist,
        span => expect(span.k).to.equal(constants.ENTRY),
        span => expect(span.f.e).to.equal(String(senderControls.getPid())),
        span => expect(span.f.h).to.equal(`agent-stub-uuid-${senderControls.getPid()}`),
        span => expect(span.n).to.equal('node.http.server'),
        span =>
          expect(`${span.data.http.url}?${span.data.http.params}`).to.equal(
            apiPath + (withError ? '&withError=true' : '')
          )
      ]);
    }

    function verifyHttpExit({ spans, parent, inProcess = 'main', receiverControls, contentsCreatedByJob }) {
      const expectations = [
        span => expect(span.t).to.equal(parent.t),
        span => expect(span.p).to.equal(parent.s),
        span => expect(span.k).to.equal(constants.EXIT),
        span => expect(span.n).to.equal('node.http.client')
      ];

      if (inProcess === 'main') {
        expectations.push(span => expect(span.f.e).to.equal(String(receiverControls.getPid())));
        expectations.push(span => expect(span.f.h).to.equal(`agent-stub-uuid-${receiverControls.getPid()}`));
      } else if (inProcess === 'child') {
        expectations.push(span => expect(span.f.e).to.be.oneOf(contentsCreatedByJob.map(c => String(c.pid))));
        expectations.push(span =>
          expect(span.f.h).to.be.oneOf(contentsCreatedByJob.map(c => `agent-stub-uuid-${c.pid}`))
        );
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
          span => expect(span.t).to.equal(parent.t),
          span => expect(span.p).to.equal(parent.s),
          span => expect(span.f.e).to.equal(String(senderControls.getPid())),
          span => expect(span.f.h).to.equal(`agent-stub-uuid-${senderControls.getPid()}`),
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

    function verifyBullEntry({ spans, parent, withError = false, receiverControls }) {
      return expectExactlyOneMatching(spans, [
        span => expect(span.n).to.equal('bull'),
        span => expect(span.k).to.equal(constants.ENTRY),
        span => expect(span.t).to.equal(parent.t),
        span => expect(span.p).to.equal(parent.s),
        span => expect(span.f.e).to.equal(String(receiverControls.getPid())),
        span => expect(span.f.h).to.equal(`agent-stub-uuid-${receiverControls.getPid()}`),
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

  if (!process.env.RUN_ESM) {
    describe('tracing disabled', function () {
      this.timeout(config.getTestTimeout() * 2);

      let senderControls;

      before(async () => {
        senderControls = new ProcessControls({
          dirname: __dirname,
          appName: 'sender',
          agentControls: customAgentControls,
          tracingEnabled: false,
          env: {
            ...commonEnv,
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
            dirname: __dirname,
            appName: 'receiver',
            agentControls: customAgentControls,
            tracingEnabled: false,
            env: {
              ...commonEnv,
              REDIS_SERVER: 'redis://127.0.0.1:6379',
              BULL_QUEUE_NAME: queueName,
              BULL_RECEIVE_TYPE: receiveMethod,
              BULL_JOB_NAME: 'steve',
              BULL_JOB_NAME_ENABLED: 'true'
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
        dirname: __dirname,
        appName: 'sender',
        agentControls: customAgentControls,
        env: {
          ...commonEnv,
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
          dirname: __dirname,
          appName: 'receiver',
          agentControls: customAgentControls,
          env: {
            ...commonEnv,
            REDIS_SERVER: 'redis://127.0.0.1:6379',
            BULL_QUEUE_NAME: queueName,
            BULL_RECEIVE_TYPE: receiveMethod,
            BULL_JOB_NAME: 'steve',
            BULL_JOB_NAME_ENABLED: 'true'
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
        dirname: __dirname,
        appName: 'allowRootExitSpanApp',
        agentControls: customAgentControls,
        env: {
          ...commonEnv,
          REDIS_SERVER: `redis://${process.env.INSTANA_CONNECT_REDIS}`,
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

  async function verifyResponseAndJobProcessing({ response, testId, isRepeatable, isBulk }) {
    expect(response).to.be.an('object');

    if (isRepeatable || isBulk) {
      expect(response.status).to.equal('Jobs sent');
    } else {
      expect(response.status).to.equal('Job sent');
    }

    try {
      if (isBulk) {
        const firstJobContent = await verifyJobCreatedAFile('file-created-by-job-1.json', testId);
        const secondJobContent = await verifyJobCreatedAFile('file-created-by-job-2.json', testId);
        return [firstJobContent, secondJobContent];
      } else if (isRepeatable) {
        try {
          const firstJobContent = await verifyJobCreatedAFile(`file-created-by-job-repeat-${testId}-1.json`, testId);
          const secondJobContent = await verifyJobCreatedAFile(`file-created-by-job-repeat-${testId}-2.json`, testId);
          return [firstJobContent, secondJobContent];
        } catch (e) {
          throw new Error('Not Ready yet.');
        }
      } else {
        return [await verifyJobCreatedAFile('file-created-by-job.json', testId)];
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

    return contentCreatedByJob;
  }
};
