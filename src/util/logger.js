'use strict';

const pino = require('pino')();
const logger = pino.child({ name: 'instana-serverless-nodejs', pid: process.pid });

module.exports = exports = logger;
