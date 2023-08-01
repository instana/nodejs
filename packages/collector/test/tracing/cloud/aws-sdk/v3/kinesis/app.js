/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

require('../../../../../..')();
const express = require('express');
const request = require('request-promise');
const app = express();
const agentPort = process.env.INSTANA_AGENT_PORT || 42699;
const port = require('../../../../../test_util/app-port')();
const streamName = process.env.AWS_KINESIS_STREAM_NAME || 'nodejs-team';

const {
  KinesisClient,
  Kinesis,
  CreateStreamCommand,
  GetRecordsCommand,
  GetShardIteratorCommand,
  ListStreamsCommand,
  ListShardsCommand,
  PutRecordCommand,
  PutRecordsCommand
} = require('@aws-sdk/client-kinesis');
const logPrefix = `AWS SDK v3 Kinesis (${process.pid}):\t`;
const log = require('@instana/core/test/test_util/log').getLogger(logPrefix);

const kinesis = new KinesisClient({ region: 'us-east-2' });
const kinesisV2 = new Kinesis({ region: 'us-east-2' });
const availableOperations = {
  deleteStream: {
    StreamName: streamName
  },
  createStream: {
    StreamName: streamName,
    ShardCount: 1
  },
  getRecords: {
    ShardIterator: '',
    Limit: 3
  },
  getShardIterator: {
    StreamName: streamName,
    ShardIteratorType: 'AT_SEQUENCE_NUMBER',
    ShardId: '',
    StartingSequenceNumber: ''
  },
  listStreams: {},
  listShards: {
    StreamName: streamName
  },
  putRecord: {
    StreamName: streamName,
    Data: Buffer.from('I am the data'),
    PartitionKey: 'partition1'
  },
  putRecords: {
    StreamName: streamName,
    Records: [
      {
        Data: Buffer.from('I am the data record 1'),
        PartitionKey: 'partition1'
      },
      {
        Data: Buffer.from('I am the data record 2'),
        PartitionKey: 'partition1'
      }
    ]
  }
};
const operationNames = Object.keys(availableOperations);

async function executeAsync(operation, withError) {
  const operationOptions = availableOperations[operation];
  const mergedOptions = { ...operationOptions };

  if (withError) {
    enforceErrors(mergedOptions);
  }

  switch (operation) {
    case 'getRecords': {
      const data = await executeAsync('getShardIterator', withError);
      mergedOptions.ShardIterator = data.ShardIterator;
      return kinesis.send(new GetRecordsCommand(mergedOptions));
    }

    case 'getShardIterator': {
      const shards = await executeAsync('listShards', withError);
      const { ShardId, SequenceNumberRange } = shards.Shards[0];
      const StartingSequenceNumber = SequenceNumberRange.StartingSequenceNumber;
      mergedOptions.ShardId = ShardId;
      mergedOptions.StartingSequenceNumber = StartingSequenceNumber;
      return kinesis.send(new GetShardIteratorCommand(mergedOptions));
    }

    case 'createStream':
      return kinesis.send(new CreateStreamCommand(mergedOptions));

    case 'putRecords':
      return kinesis.send(new PutRecordsCommand(mergedOptions));

    case 'putRecord':
      return kinesis.send(new PutRecordCommand(mergedOptions));

    case 'listStreams':
      return kinesis.send(new ListStreamsCommand(mergedOptions));

    case 'listShards':
      return kinesis.send(new ListShardsCommand(mergedOptions));

    default:
      // Use kinesis.send() for all other operations
      if (kinesis[operation]) {
        return kinesis.send(new kinesis[operation](mergedOptions));
      } else {
        //  throw new Error(`Operation "${operation}" not supported.`);
      }
  }
}

async function executePromise(operation, withError) {
  const operationOptions = availableOperations[operation];
  const mergedOptions = { ...operationOptions };

  if (withError) {
    enforceErrors(mergedOptions);
  }
  async function kinesisSend(command) {
    try {
      return await kinesis.send(command);
    } catch (error) {
      // throw new Error(`Error executing "${command.constructor.name}": ${error.message}`);
    }
  }

  switch (operation) {
    case 'getRecords':
      return executePromise('getShardIterator', withError)
        .then(async data => {
          mergedOptions.ShardIterator = data.ShardIterator;
          return kinesis.send(new GetRecordsCommand(mergedOptions));
        });

    case 'getShardIterator':
      return executePromise('listShards', withError)
        .then(shards => {
          const { ShardId, SequenceNumberRange } = shards.Shards[0];
          const StartingSequenceNumber = SequenceNumberRange.StartingSequenceNumber;
          mergedOptions.ShardId = ShardId;
          mergedOptions.StartingSequenceNumber = StartingSequenceNumber;
          return kinesis.send(new GetShardIteratorCommand(mergedOptions));
        });

    case 'createStream':
      return kinesisSend(new CreateStreamCommand(mergedOptions));

    case 'putRecords':
      return kinesisSend(new PutRecordsCommand(mergedOptions));

    case 'putRecord':
      return kinesisSend(new PutRecordCommand(mergedOptions));

    case 'listStreams':
      return kinesisSend(new ListStreamsCommand(mergedOptions));

    case 'listShards':
      return kinesisSend(new ListShardsCommand(mergedOptions));

    default:
      // Use kinesis.send() for all other operations
      if (kinesis[operation]) {
        return kinesisSend(new kinesis[operation](mergedOptions));
      } else {
        // throw new Error(`Operation "${operation}" not supported.`);
      }
  }
}
async function executeCallback(operation, withError, callback) {
  const operationOptions = availableOperations[operation];
  const mergedOptions = { ...operationOptions };

  if (withError) {
    enforceErrors(mergedOptions);
  }

  const kinesisSendWithCallback = (command, cb) => {
    kinesis.send(command, (error, result) => {
      if (error) {
        cb(new Error(`Error executing "${command.constructor.name}": ${error.message}`));
      } else {
        cb(null, result);
      }
    });
  };

  switch (operation) {
    case 'getRecords':
      return executeCallback('getShardIterator', withError, (err, data) => {
        if (err) {
          callback(err);
        } else {
          mergedOptions.ShardIterator = data.ShardIterator;
          kinesisSendWithCallback(new GetRecordsCommand(mergedOptions), callback);
        }
      });

    case 'getShardIterator':
      return executeCallback('listShards', withError, (err, shards) => {
        if (err) {
          callback(err);
        } else {
          const { ShardId, SequenceNumberRange } = shards.Shards[0];
          const StartingSequenceNumber = SequenceNumberRange.StartingSequenceNumber;
          mergedOptions.ShardId = ShardId;
          mergedOptions.StartingSequenceNumber = StartingSequenceNumber;
          kinesisSendWithCallback(new GetShardIteratorCommand(mergedOptions), callback);
        }
      });

    case 'createStream':
      kinesisSendWithCallback(new CreateStreamCommand(mergedOptions), callback);
      break;

    case 'putRecords':
      kinesisSendWithCallback(new PutRecordsCommand(mergedOptions), callback);
      break;

    case 'putRecord':
      kinesisSendWithCallback(new PutRecordCommand(mergedOptions), callback);
      break;

    case 'listStreams':
      return kinesisSendWithCallback(new ListStreamsCommand(mergedOptions), callback);

    case 'listShards':
      return kinesisSendWithCallback(new ListShardsCommand(mergedOptions), callback);

    default:
      // Use kinesis.send() for all other operations
      if (kinesis[operation]) {
        return kinesisSendWithCallback(new kinesis[operation](mergedOptions), callback);
      } else {
        callback(new Error(`Operation "${operation}" not supported.`));
      }
  }
}
// AWS SDK v2 style for executing the Kinesis operations
function kinesisSendV2(command) {
  return new Promise((resolve, reject) => {
    kinesisV2.send(command, (error, result) => {
      if (error) {
        reject(new Error(`Error executing "${command.constructor.name}": ${error.message}`));
      } else {
        resolve(result);
      }
    });
  });
}

// AWS SDK v2 style for executing the Kinesis operations with a callback
function kinesisSendV2Callback(command, callback) {
  kinesisV2.send(command, (error, result) => {
    if (error) {
      callback(new Error(`Error executing "${command.constructor.name}": ${error.message}`));
    } else {
      callback(null, result);
    }
  });
}
function executeCallbackV2(operation, withError, callback) {
  const operationOptions = availableOperations[operation];
  const mergedOptions = { ...operationOptions };

  if (withError) {
    enforceErrors(mergedOptions);
  }

  switch (operation) {
    case 'getRecords':
      executeCallbackV2('getShardIterator', withError, (err, data) => {
        if (err) {
          callback(err);
        } else {
          mergedOptions.ShardIterator = data.ShardIterator;
          kinesisSendV2Callback(new GetRecordsCommand(mergedOptions), callback);
        }
      });
      break;

    case 'getShardIterator':
      executeCallbackV2('listShards', withError, (err, shards) => {
        if (err) {
          callback(err);
        } else {
          const { ShardId, SequenceNumberRange } = shards.Shards[0];
          const StartingSequenceNumber = SequenceNumberRange.StartingSequenceNumber;
          mergedOptions.ShardId = ShardId;
          mergedOptions.StartingSequenceNumber = StartingSequenceNumber;
          kinesisSendV2Callback(new GetShardIteratorCommand(mergedOptions), callback);
        }
      });
      break;

    case 'createStream':
      kinesisSendV2Callback(new CreateStreamCommand(mergedOptions), callback);
      break;

    case 'putRecords':
      kinesisSendV2Callback(new PutRecordsCommand(mergedOptions), callback);
      break;

    case 'putRecord':
      kinesisSendV2Callback(new PutRecordCommand(mergedOptions), callback);
      break;

    case 'listStreams':
      kinesisSendV2Callback(new ListStreamsCommand(mergedOptions), callback);
      break;

    case 'listShards':
      kinesisSendV2Callback(new ListShardsCommand(mergedOptions), callback);
      break;

    default:
      // Use kinesis.send() for all other operations
      if (kinesisV2[operation]) {
        kinesisSendV2Callback(new kinesisV2[operation](mergedOptions), callback);
      } else {
        callback(new Error(`Operation "${operation}" not supported.`));
      }
  }
}

async function executePromiseV2(operation, withError) {
  const operationOptions = availableOperations[operation];
  const mergedOptions = { ...operationOptions };

  if (withError) {
    enforceErrors(mergedOptions, operation);
  }

  switch (operation) {
    case 'getRecords':
      return executePromiseV2('getShardIterator', withError)
        .then(async data => {
          mergedOptions.ShardIterator = data.ShardIterator;
          return kinesisSendV2(new GetRecordsCommand(mergedOptions));
        })
        .catch(error => {
          throw new Error(`Error executing "getRecords": ${error.message}`);
        });

    case 'getShardIterator':
      return executePromiseV2('listShards', withError)
        .then(shards => {
          const { ShardId, SequenceNumberRange } = shards.Shards[0];
          const StartingSequenceNumber = SequenceNumberRange.StartingSequenceNumber;
          mergedOptions.ShardId = ShardId;
          mergedOptions.StartingSequenceNumber = StartingSequenceNumber;
          return kinesisSendV2(new GetShardIteratorCommand(mergedOptions));
        })
        .catch(error => {
          throw new Error(`Error executing "getShardIterator": ${error.message}`);
        });

    case 'createStream':
      return kinesisSendV2(new CreateStreamCommand(mergedOptions));

    case 'putRecords':
      return kinesisSendV2(new PutRecordsCommand(mergedOptions));

    case 'putRecord':
      return kinesisSendV2(new PutRecordCommand(mergedOptions));

    case 'listStreams':
      return kinesisSendV2(new ListStreamsCommand(mergedOptions));

    case 'listShards':
      return kinesisSendV2(new ListShardsCommand(mergedOptions));

    default:
      throw new Error(`Operation "${operation}" not supported.`);
  }
}

function httpError(res, err) {
  res.status(500).send({
    status: 'failed',
    error: err
  });
}

function httpSuccess(res, data) {
  res.send({
    status: 'ok',
    data: data
  });
}
function enforceErrors(options) {
  // this will enforce error for all commands except liststreams
  options.ShardCount = 0;
}
operationNames.forEach(operation => {
  app.get(`/${operation}/:method`, async (req, res) => {
    const withError = typeof req.query.withError === 'string' && req.query.withError !== '';
    const method = req.params.method;
    let data;

    try {
      switch (method) {
        case 'async-style':
          data = await executeAsync(operation, withError);
          request(`http://127.0.0.1:${agentPort}`)
            .then(() => {
              httpSuccess(res, data);
            })
            .catch(err2 => {
              httpError(res, err2);
            });
          break;

        case 'promise-style':
          executePromise(operation, withError);
          request(`http://127.0.0.1:${agentPort}`)
            .then(() => {
              httpSuccess(res, data);
            })
            .catch(err2 => {
              httpError(res, err2);
            });
          break;

        case 'cb-style':
          executeCallback(operation, withError, (err, result) => {
            if (err) {
              httpError(res, err);
            } else {
              request(`http://127.0.0.1:${agentPort}`)
                .then(() => {
                  httpSuccess(res, result);
                })
                .catch(err2 => {
                  httpError(res, err2);
                });
            }
          });
          break;

        case 'promise-v2-style':
          data = await executePromiseV2(operation, withError);
          request(`http://127.0.0.1:${agentPort}`)
            .then(() => {
              httpSuccess(res, data);
            })
            .catch(err2 => {
              httpError(res, err2);
            });
          break;

        case 'cb-v2-style':
          executeCallbackV2(operation, withError, (err, result) => {
            if (err) {
              httpError(res, err);
            } else {
              request(`http://127.0.0.1:${agentPort}`)
                .then(() => {
                  httpSuccess(res, result);
                })
                .catch(err2 => {
                  httpError(res, err2);
                });
            }
          });
          break;

        default:
          res.status(500).send({ error: `URL must match one of the methods: ${operationNames.join(', ')}` });
          return;
      }
    } catch (err) {
      httpError(res, err);
    }
  });
});

app.get('/', (_req, res) => {
  res.send('Ok');
});

app.listen(port, () => {
  log(`AWS Kinesis v3 test app started at port ${port}`);
});
