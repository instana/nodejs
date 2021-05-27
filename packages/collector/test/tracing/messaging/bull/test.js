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
const globalAgent = require('../../../globalAgent');

let queueName = 'nodejs-team';

if (process.env.BULL_QUEUE_NAME) {
  queueName = `${process.env.BULL_QUEUE_NAME}${semver.major(process.versions.node)}`;
}

let mochaSuiteFn;

const sendingOptions = ['default', 'bulk=true', 'repeat=true'];
const receivingMethods = ['Process', 'Promise', 'Callback'];

// Bull relies on EventEmitter.prototype.off, which is available from Node 10 on
if (!supportedVersion(process.versions.node) || semver.lt(process.version, '10.0.0')) {
  mochaSuiteFn = describe.skip;
} else {
  mochaSuiteFn = describe;
}

const retryTime = config.getTestTimeout() * 2;

mochaSuiteFn('tracing/messaging/bull', function () {
  this.timeout(config.getTestTimeout() * 3);

  globalAgent.setUpCleanUpHooks();
  const agentControls = globalAgent.instance;

  describe('tracing enabled, no suppression', function () {
    const senderControls = new ProcessControls({
      appPath: path.join(__dirname, 'sender'),
      port: 3215,
      useGlobalAgent: true,
      env: {
        REDIS_SERVER: 'redis://127.0.0.1:6379',
        BULL_QUEUE_NAME: queueName,
        BULL_JOB_NAME: 'steve'
      }
    });

    ProcessControls.setUpHooksWithRetryTime(retryTime, senderControls);

    receivingMethods.forEach(receiveMethod => {
      describe(`receiving via ${receiveMethod} API`, () => {
        const receiverControls = new ProcessControls({
          appPath: path.join(__dirname, 'receiver'),
          port: 3216,
          useGlobalAgent: true,
          env: {
            REDIS_SERVER: 'redis://127.0.0.1:6379',
            BULL_QUEUE_NAME: queueName,
            BULL_RECEIVE_TYPE: receiveMethod,
            BULL_JOB_NAME: 'steve',
            BULL_JOB_NAME_ENABLED: 'true',
            BULL_CONCURRENCY_ENABLED: 'true'
          }
        });

        ProcessControls.setUpHooksWithRetryTime(retryTime, receiverControls);

        const testId = uuid();

        sendingOptions.forEach(sendOption => {
          const apiPath = `/send?jobName=true&${sendOption}&testId=${testId}`;
          [false, true].forEach(withError => {
            const urlWithParams = withError ? apiPath + '&withError=true' : apiPath;

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
                isRepeatable: sendOption === 'repeat=true',
                isBulk: sendOption === 'bulk=true'
              });
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
      testId,
      withError,
      isRepeatable,
      isBulk
    }) {
      return retry(async () => {
        await verifyResponseAndJobProcessing({ response, testId, isRepeatable, isBulk });
        return agentControls.getSpans().then(spans =>
          verifySpans({
            receiverControls,
            receiveMethod,
            spans,
            apiPath,
            withError,
            isRepeatable,
            isBulk
          })
        );
      }, retryTime);
    }

    function verifySpans({ receiverControls, receiveMethod, spans, apiPath, withError, isRepeatable, isBulk }) {
      const httpEntry = verifyHttpEntry({ spans, apiPath, withError });
      const bullExit = verifyBullExit({ spans, parent: httpEntry, withError, isRepeatable, isBulk });
      const bullEntry = verifyBullEntry({
        spans,
        parent: bullExit,
        receiverControls,
        withError
      });
      verifyHttpExit({
        spans,
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
        span => expect(span.f.h).to.equal('agent-stub-uuid'),
        span => expect(span.n).to.equal('node.http.server'),
        span =>
          expect(span.data.http.url + '?' + span.data.http.params).to.equal(
            apiPath + (withError ? '&withError=true' : '')
          )
      ]);
    }

    function verifyHttpExit({ spans, parent, inProcess = 'main', receiverControls }) {
      const expectations = [
        span => expect(span.t).to.equal(parent.t),
        span => expect(span.p).to.equal(parent.s),
        span => expect(span.k).to.equal(constants.EXIT),
        span => expect(span.f.h).to.equal('agent-stub-uuid'),
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
          span => expect(span.f.h).to.equal('agent-stub-uuid'),
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
          span => expect(span.f.h).to.equal('agent-stub-uuid'),
          span => expect(span.error).to.not.exist,
          span => expect(span.async).to.not.exist,
          span => expect(span.data).to.exist,
          span => expect(span.data.bull).to.be.an('object'),
          span => expect(span.data.bull.sort).to.equal('exit'),
          span => expect(span.data.bull.queue).to.equal(queueName)
        ]);
      }
    }

    function verifyBullEntry({ receiverControls, spans, parent, withError = false }) {
      return expectExactlyOneMatching(spans, [
        span => expect(span.n).to.equal('bull'),
        span => expect(span.k).to.equal(constants.ENTRY),
        span => expect(span.t).to.equal(parent.t),
        span => expect(span.p).to.equal(parent.s),
        span => expect(span.f.h).to.equal('agent-stub-uuid'),
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

  describe('tracing disabled', () => {
    this.timeout(config.getTestTimeout() * 2);

    const senderControls = new ProcessControls({
      appPath: path.join(__dirname, 'sender'),
      port: 3215,
      useGlobalAgent: true,
      tracingEnabled: false,
      env: {
        REDIS_SERVER: 'redis://127.0.0.1:6379',
        BULL_QUEUE_NAME: queueName,
        BULL_JOB_NAME: 'steve'
      }
    });

    ProcessControls.setUpHooksWithRetryTime(retryTime, senderControls);

    receivingMethods.forEach(receiveMethod => {
      describe('sending and receiving', () => {
        const receiverControls = new ProcessControls({
          appPath: path.join(__dirname, 'receiver'),
          port: 3216,
          useGlobalAgent: true,
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

        ProcessControls.setUpHooksWithRetryTime(retryTime, receiverControls);

        const testId = uuid();

        sendingOptions.forEach(sendOption => {
          const isRepeatable = sendOption === 'repeat=true';
          const isBulk = sendOption === 'bulk=true';

          const apiPath = `/send?jobName=true&${sendOption}&testId=${testId}`;

          it(`should not trace for sending(${sendOption}) / receiving(${receiveMethod})`, async () => {
            const urlWithParams = apiPath;
            const response = await senderControls.sendRequest({
              method: 'POST',
              path: urlWithParams
            });

            return retry(() => verifyResponseAndJobProcessing({ response, testId, isRepeatable, isBulk }), retryTime)
              .then(() => delay(config.getTestTimeout() / 4))
              .then(() => agentControls.getSpans())
              .then(spans => {
                if (spans.length > 0) {
                  fail(`Unexpected spans (Bull suppressed: ${stringifyItems(spans)}`);
                }
              });
          });
        });
      });
    });
  });

  describe('tracing enabled but suppressed', () => {
    const senderControls = new ProcessControls({
      appPath: path.join(__dirname, 'sender'),
      port: 3215,
      useGlobalAgent: true,
      env: {
        REDIS_SERVER: 'redis://127.0.0.1:6379',
        BULL_QUEUE_NAME: queueName,
        BULL_JOB_NAME: 'steve'
      }
    });

    ProcessControls.setUpHooksWithRetryTime(retryTime, senderControls);

    receivingMethods.forEach(receiveMethod => {
      describe('tracing suppressed', () => {
        const receiverControls = new ProcessControls({
          appPath: path.join(__dirname, 'receiver'),
          port: 3216,
          useGlobalAgent: true,
          env: {
            REDIS_SERVER: 'redis://127.0.0.1:6379',
            BULL_QUEUE_NAME: queueName,
            BULL_RECEIVE_TYPE: receiveMethod,
            BULL_JOB_NAME: 'steve',
            BULL_JOB_NAME_ENABLED: 'true',
            BULL_CONCURRENCY_ENABLED: 'true'
          }
        });

        ProcessControls.setUpHooksWithRetryTime(retryTime, receiverControls);

        const testId = uuid();

        sendingOptions.forEach(sendOption => {
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
              .then(() => delay(config.getTestTimeout() / 4))
              .then(() => agentControls.getSpans())
              .then(spans => {
                if (spans.length > 0) {
                  fail(`Unexpected spans (Bull suppressed: ${stringifyItems(spans)}`);
                }
              });
          });
        });
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
