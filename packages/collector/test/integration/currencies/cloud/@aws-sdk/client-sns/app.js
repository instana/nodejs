/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('@instana/collector')();
const express = require('express');

const app = express();
const agentPort = process.env.INSTANA_AGENT_PORT;
const port = require('@_local/collector/test/test_util/app-port')();
const sns = require('@aws-sdk/client-sns');
const { StandardRetryStrategy } = require('@aws-sdk/middleware-retry');

const logPrefix = `AWS SDK v3 SNS (${process.pid}):\t`;
const log = require('@_local/core/test/test_util/log').getLogger(logPrefix);

const maxAttempts = 6;
const customRetryStrategy = new StandardRetryStrategy(async () => maxAttempts, {
  retryDecider: err => {
    // eslint-disable-next-line no-console
    console.log('Not connected to LocalStack, retrying...', err.code);
    return true;
  },
  delayDecider: () => 5000
});

const clientOpts = {
  credentials: {
    accessKeyId: 'test',
    secretAccessKey: 'test'
  },
  endpoint: process.env.INSTANA_CONNECT_LOCALSTACK_AWS,
  region: 'us-east-2',
  retryStrategy: customRetryStrategy
};

const client = new sns.SNSClient(clientOpts);
const clientV2 = new sns.SNS(clientOpts);

const addMsgAttributes = (options, msgattrs) => {
  options.MessageAttributes = {};

  for (let i = 0; i < msgattrs; i++) {
    options.MessageAttributes[`dummy-attribute-${i}`] = {
      DataType: 'String',
      StringValue: `dummy value ${i}`
    };
  }
};

const defaultStyle = async (Command, options) => {
  return client.send(new Command(options));
};
const callbackStyle = (Command, options, cb) => {
  client.send(new Command(options), cb);
};
const v2Style = async (command, options) => {
  let fn = command.match(/(.*)Command$/)[1];
  fn = fn[0].toLowerCase() + fn.slice(1);
  return clientV2[fn](options);
};

async function executeCommand(options) {
  const Command = sns[options.command];
  const style = options.style;
  const command = options.command;
  const msgattrs = options.msgattrs || 0;

  delete options.command;
  delete options.style;
  delete options.msgattrs;

  addMsgAttributes(options, msgattrs);

  if (style === 'callback') {
    return new Promise((resolve, reject) => {
      callbackStyle(Command, options, (err, data) => {
        if (err) return reject(err);
        resolve(data);
      });
    });
  } else if (style === 'v2') {
    return v2Style(command, options);
  }

  return defaultStyle(Command, options);
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

app.get('/execute', async (req, res) => {
  try {
    const data = await executeCommand(req.query);
    await fetch(`http://127.0.0.1:${agentPort}/ping`);
    httpSuccess(res, data);
  } catch (err) {
    httpError(res, err);
  }
});

app.get('/', (_req, res) => {
  res.send('Ok');
});

app.listen(port, () => {
  log(`AWS SNS v3 test app started at port ${port}`);
});
