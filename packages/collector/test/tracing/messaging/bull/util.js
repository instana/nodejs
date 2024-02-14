/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

const fs = require('fs');
const path = require('path');
const request = require('request-promise');
const { delay } = require('../../../../../core/test/test_util');

const agentPort = process.env.INSTANA_AGENT_PORT;

/**
 * @typedef {Object} QueueData
 * @property {string} name
 */

const ProcessTypes = (exports.ProcessTypes = {
  CALLBACK: 1,
  PROMISE: 2,
  AS_PROCESS: 3
});

const NUMBER_OF_PROCESSES = 2;

/**
 * @param {import('bull').Job} job
 * @param {import('bull').DoneCallback | undefined} done
 * @param {(...args: *)=>{}} log
 * @param {string} [info]
 * @returns
 */
function processJob(job, done, log, info) {
  /** @type {QueueData} */
  const data = job.data;

  if (!data || typeof data.name !== 'string') {
    log('error', data);
    if (done) {
      log('Invalid data. Expected data structure is {name: string}');
      done(new Error('Invalid data. Expected data structure is {name: string}'));
    } else {
      log('Invalid data. Expected data structure is {name: string}');
      return Promise.reject(new Error('Invalid data. Expected data structure is {name: string}'));
    }
  } else {
    log(`Consuming: ${info || 'no extra info provided'}: ${JSON.stringify(job.data)}`);

    if (done) {
      setTimeout(() => {
        writeToAFileToProveThatThisParticularJobHasBeenProcessed(getJobData(job)).then(() => {
          request(`http://127.0.0.1:${agentPort}`)
            .then(() => {
              log('The follow up request after receiving a message has happened.');

              if (job.data.withError) {
                /**
                 * Bull expects an error object.
                 * If this is a string, our instrumentation won't capture the error properly either
                 */
                done(new Error('"withError=true" was provided'));
              } else {
                done(null, 'Data processed');
              }
            })
            .catch(catchErr => {
              log('The follow up request after receiving a message has failed.', catchErr);
              done(catchErr);
            });
        });
      }, 100);
    } else {
      return delay(100)
        .then(() => writeToAFileToProveThatThisParticularJobHasBeenProcessed(getJobData(job)))
        .then(() => request(`http://127.0.0.1:${agentPort}`))
        .then(() => {
          log('The follow up request after receiving a message has happened.');
          if (job.data.withError) {
            /**
             * Bull expects an error object.
             * If this is a string, our instrumentation won't capture the error properly either
             */
            return Promise.reject(new Error('"withError=true" was provided'));
          } else {
            return Promise.resolve(null, 'Data processed');
          }
        });
    }
  }
}

exports.processJob = processJob;

/**
 * @param {import('bull').Queue} queue
 * @param {number} processType
 * @param {(...args: *)=>{}} log
 * @param {string} jobName
 * @param {boolean} isConcurrent
 */
exports.buildReceiver = function (queue, processType, log, jobName, isConcurrent) {
  const processorPath = path.join(__dirname, 'child-processor.js');

  const callbackCb = (job, done) => processJob(job, done, log, 'callback');

  const promiseCb = job => processJob(job, undefined, log, 'promise');

  const callbackArgs = [callbackCb];
  const promiseArgs = [promiseCb];
  const asProcessArgs = [processorPath];
  let currentTypeArgs;

  switch (processType) {
    case ProcessTypes.CALLBACK:
      currentTypeArgs = callbackArgs;
      break;
    case ProcessTypes.PROMISE:
      currentTypeArgs = promiseArgs;
      break;
    case ProcessTypes.AS_PROCESS:
      currentTypeArgs = asProcessArgs;
      break;
    default:
      throw new Error(`Option ${processType} is invalid`);
  }

  if (jobName && isConcurrent) {
    log(`Job named ${jobName} and concurrent`);
    currentTypeArgs.unshift(jobName, NUMBER_OF_PROCESSES);
  } else if (jobName && !isConcurrent) {
    log(`Job named ${jobName}, not concurrent`);
    currentTypeArgs.unshift(jobName);
  } else if (!jobName && isConcurrent) {
    log('Job unnamed, concurrent');
    currentTypeArgs.unshift(NUMBER_OF_PROCESSES);
  } else {
    log('Job unnamed, not concurrent');
  }
  queue.process.apply(queue, currentTypeArgs);
};

/**
 * @param {import('bull').Job} job
 * @returns {{ data: any, opts: import('bull').JobOptions }}
 */
function getJobData(job) {
  return {
    data: job.data,
    opts: job.opts
  };
}

function writeToAFileToProveThatThisParticularJobHasBeenProcessed(jobData) {
  let fileCreatedByJob;
  if (jobData.data.bulkIndex) {
    fileCreatedByJob = path.join(__dirname, `file-created-by-job-${jobData.data.bulkIndex}.json`);
  } else {
    fileCreatedByJob = path.join(__dirname, 'file-created-by-job.json');
  }

  return new Promise((resolve, reject) => {
    fs.writeFile(fileCreatedByJob, JSON.stringify(jobData, null, 2), (err, success) => {
      if (err) {
        return reject(err);
      }
      return resolve(success);
    });
  });
}
