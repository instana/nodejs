/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

require('../../../../../../')();
const express = require('express');
const app = express();
const port = process.env.APP_PORT || 3215;
const streamName = process.env.AWS_KINESIS_STREAM_NAME || 'nodejs-team';
const agentPort = process.env.INSTANA_AGENT_PORT || 42699;
const request = require('request-promise');
const AWS = require('aws-sdk');
const logPrefix = `AWS SDK v2 Kinesis (${process.pid}):\t`;
const log = require('@instana/core/test/test_util/log').getLogger(logPrefix);
AWS.config.update({ region: 'us-east-2' });
const kinesis = new AWS.Kinesis();

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
    Data: 'I am the data',
    PartitionKey: 'partition1'
  },
  putRecords: {
    StreamName: streamName,
    Records: [
      {
        Data: 'I am the data record 1',
        PartitionKey: 'partition1'
      },
      {
        Data: 'I am the data record 2',
        PartitionKey: 'partition1'
      }
    ]
  }
};

const operationNames = Object.keys(availableOperations);

const options = {};

function execOperation(operation, cb, opts, withError) {
  const operationOptions = availableOperations[operation];
  const mergedOptions = { ...options, ...operationOptions, ...(opts || {}) };

  if (withError) {
    mergedOptions.WrongOption = 1;
  }

  if (cb) {
    /**
     * In order to getRecords, we need to provide a shard iterator from getShardIterator.
     * In order to get a shard iterator, we need to provide shard data from listShards.
     */
    if (operation === 'getRecords') {
      execOperation(
        'getShardIterator',
        (err2, data) => {
          if (err2) {
            cb(err2);
          } else {
            mergedOptions.ShardIterator = data.ShardIterator;
            kinesis[operation](mergedOptions, cb);
          }
        },
        null,
        withError
      );
    } else if (operation === 'getShardIterator') {
      execOperation(
        'listShards',
        (err, shards) => {
          if (err) {
            cb(err);
          } else {
            const { ShardId, SequenceNumberRange } = shards.Shards[0];
            const StartingSequenceNumber = SequenceNumberRange.StartingSequenceNumber;

            mergedOptions.StartingSequenceNumber = StartingSequenceNumber;
            mergedOptions.ShardId = ShardId;
            kinesis[operation](mergedOptions, cb);
          }
        },
        null,
        withError
      );
    } else {
      kinesis[operation](mergedOptions, cb);
    }
  } else if (operation === 'getRecords') {
    return execOperation('getShardIterator', null, null, withError).then(data => {
      mergedOptions.ShardIterator = data.ShardIterator;
      return kinesis[operation](mergedOptions).promise();
    });
  } else if (operation === 'getShardIterator') {
    return execOperation('listShards', null, {}, withError).then(shards => {
      const { ShardId, SequenceNumberRange } = shards.Shards[0];
      const StartingSequenceNumber = SequenceNumberRange.StartingSequenceNumber;

      mergedOptions.ShardId = ShardId;
      mergedOptions.StartingSequenceNumber = StartingSequenceNumber;
      return kinesis[operation](mergedOptions).promise();
    });
  } else {
    return kinesis[operation](mergedOptions).promise();
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
  app.get(`/${operation}/:method`, (req, res) => {
    const method = req.params.method;
    const withError = req.query.withError === '1';

    if (!method.match(/Callback|Promise/)) {
      res.status(500).statusMessage(`Method must be Callback or Promise, but received ${method}`);
      return;
    }

    if (method === 'Callback') {
      execOperation(
        operation,
        (err, data) => {
          if (err) {
            httpError(res, err);
          } else {
            setTimeout(() => {
              request(`http://127.0.0.1:${agentPort}`)
                .then(() => {
                  httpSuccess(res, data);
                })
                .catch(err2 => {
                  httpError(res, err2);
                });
            }, 200);
          }
        },
        null,
        withError
      );
    } else if (method === 'Promise') {
      execOperation(operation, null, null, withError)
        .then(data => {
          request(`http://127.0.0.1:${agentPort}`)
            .then(() => {
              httpSuccess(res, data);
            })
            .catch(err2 => {
              httpError(res, err2);
            });
        })
        .catch(err => {
          httpError(res, err);
        });
    } else {
      res.status(500).statusMessage(`Operation + method combo not found: ${operation}/${method || 'not specified'}`);
    }
  });
});

app.get('/', (_req, res) => {
  res.send('Ok');
});

app.listen(port, () => {
  log(`AWS Kinesis test app started at port ${port}`);
});
