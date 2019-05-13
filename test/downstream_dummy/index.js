'use strict';

const express = require('express');
const http = require('http');
const morgan = require('morgan');
const pino = require('pino')();

const sendToParent = require('../util/send_to_parent');
const delay = require('../util/delay');

const logPrefix = 'downstream-dummy';
const logger = pino.child({ name: logPrefix, pid: process.pid });
logger.level = 'info';

const port = process.env.DOWNSTREAM_DUMMY_PORT || 3456;
const app = express();

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix} (${process.pid}): :method :url :status`));
}

app.get('/', (_, res) => {
  delay(200).then(() => res.sendStatus(200));
});

http.createServer(app).listen(port, error => {
  if (error) {
    logger.error(error);
    return process.exit(1);
  } else {
    logger.info('Listening on port: %s', port);
    sendToParent('downstream dummy: started');
  }
});
