/* eslint-disable consistent-return */

'use strict';

const bodyParser = require('body-parser');
const express = require('express');
const morgan = require('morgan');
const pino = require('pino')();

const sendToParent = require('../../../serverless/test/util/send_to_parent');

const logPrefix = 'metadata-mock';
const logger = pino.child({ name: logPrefix, pid: process.pid });
logger.level = 'info';

const port = process.env.METADATA_MOCK_PORT || 1606;

const app = express();

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix} (${process.pid}): :method :url :status`));
}

app.use(bodyParser.json());

app.get('/metadata', (req, res) =>
  res.json({
    key: 'value'
  })
);

app.listen(port, () => {
  logger.info('Listening on port: %s', port);
  sendToParent('metadata mock: started');
});
