'use strict';

const pino = require('pino')();
const logger = pino.child({ name: '@instana/serverless', pid: process.pid });

module.exports = exports = logger;
