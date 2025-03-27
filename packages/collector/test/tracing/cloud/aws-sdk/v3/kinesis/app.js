/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('../../../../../..')();
const express = require('express-v4');
const fetch = require('node-fetch-v2');
const app = express();
const agentPort = process.env.INSTANA_AGENT_PORT;
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
const commandMapping = {
  createStream: CreateStreamCommand,
  putRecord: PutRecordCommand,
  putRecords: PutRecordsCommand,
  getRecords: GetRecordsCommand,
  getShardIterator: GetShardIteratorCommand,
  listStreams: ListStreamsCommand,
  listShards: ListShardsCommand
};
function enforceErrors(options) {
  // this will enforce error for all commands except liststreams
  options.ShardCount = 0;
}
async function executeOperation(operation, withError, method) {
  const operationOptions = availableOperations[operation];
  const mergedOptions = { ...operationOptions };

  if (withError) {
    enforceErrors(mergedOptions);
  }
  const command = commandMapping[operation];
  switch (operation) {
    case 'getRecords': {
      const data = await executeOperation('getShardIterator', withError, method);
      mergedOptions.ShardIterator = data.ShardIterator;
      return kinesisSend(new command(mergedOptions), method);
    }
    case 'getShardIterator': {
      const shards = await executeOperation('listShards', withError, method);
      const { ShardId, SequenceNumberRange } = shards.Shards[0];
      const StartingSequenceNumber = SequenceNumberRange.StartingSequenceNumber;
      mergedOptions.ShardId = ShardId;
      mergedOptions.StartingSequenceNumber = StartingSequenceNumber;
      return kinesisSend(new command(mergedOptions), method);
    }
    default:
      return kinesisSend(new command(mergedOptions), method);
  }
}
async function kinesisSendWithPromise(command) {
  return kinesis.send(command).then(result => {
    return result;
  });
}

function kinesisSendWithCB(command, cb) {
  kinesis.send(command, (error, result) => {
    if (error) {
      cb(new Error(`Error executing "${command.constructor.name}": ${error.message}`));
    } else {
      cb(null, result);
    }
  });
}

function kinesisV2SendWithPromise(command) {
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

function kinesisSendV2WithCB(command, callback) {
  kinesisV2.send(command, (error, result) => {
    if (error) {
      callback(new Error(`Error executing "${command.constructor.name}": ${error.message}`));
    } else {
      callback(null, result);
    }
  });
}
async function kinesisSend(command, method) {
  switch (method) {
    case 'async':
      return kinesis.send(command);
    case 'promise':
      return kinesisSendWithPromise(command);
    case 'cb':
      return new Promise((resolve, reject) => {
        kinesisSendWithCB(command, (err, result) => {
          if (err) {
            reject(err);
          } else {
            resolve(result);
          }
        });
      });
    case 'async-v2':
      return kinesisV2.send(command);
    case 'promise-v2':
      return kinesisV2SendWithPromise(command);
    case 'cb-v2':
      return new Promise((resolve, reject) => {
        kinesisSendV2WithCB(command, (err, result) => {
          if (err) {
            reject(err);
          } else {
            resolve(result);
          }
        });
      });
    default:
      return null;
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
operationNames.forEach(operation => {
  app.get(`/${operation}/:method`, async (req, res) => {
    const withError = typeof req.query.withError === 'string' && req.query.withError !== '';
    const method = req.params.method;
    try {
      const data = await executeOperation(operation, withError, method);
      await fetch(`http://127.0.0.1:${agentPort}`);
      httpSuccess(res, data);
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
