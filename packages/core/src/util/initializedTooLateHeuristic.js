/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

/** @type {import('../logger').GenericLogger} */
let logger;
logger = require('../logger').getLogger('util/initializedTooLateHeuristic', newLogger => {
  logger = newLogger;
});

let firstCall = true;
let hasBeenInitializedTooLate = false;

let patterns = [
  /\/@apollo\/gateway\/dist\//,
  /\/@elastic\/elasticsearch\/index.js/,
  /\/@google-cloud\/pubsub\/build\/src\/publisher\/index.js/,
  /\/@google-cloud\/pubsub\/build\/src\/subscriber.js/,
  /\/@google-cloud\/storage\/build\/src\/index.js/,
  /\/@hapi\/call\/lib\//,
  /\/amqplib\/lib\//,
  /\/aws-sdk\/lib\//,
  /\/@aws-sdk\/smithy-client\//,
  // deliberately not including bunyan because we depend on bunyan ourselves
  /\/cls-hooked\/index.js/,
  /\/elasticsearch\/src\/elasticsearch.js/,
  /\/express\/index.js/,
  /\/fastify\/fastify/,
  /\/graphql-subscriptions\/dist\//,
  /\/graphql\/execution\//,
  /\/grpc\/index.js/,
  /\/grpc\/src\//,
  /\/@grpc\/grpc-js\/build\/src\//,
  /\/ioredis\/built\//,
  /\/node-rdkafka\/lib\//,
  /\/kafka-node\/lib\//,
  /\/kafka-node\/kafka.js/,
  /\/kafkajs\/index.js/,
  /\/kafkajs\/src\//,
  /\/koa-router\/lib\//,
  /\/log4js\/lib\//,
  /\/memored\/index.js/,
  /\/mongoose\/index.js/,
  /\/mongodb\/lib\//,
  /\/mongodb-core\/lib\//,
  /\/sqs-consumer\/dist\//,
  /\/mssql\/index.js/,
  /\/mysql2\/index.js/,
  /\/mysql2\/promise.js/,
  /\/mysql\/index.js/,
  /\/nats\/index.js/,
  /\/node-nats-streaming\/index.js/,
  /\/pg-native\/index.js/,
  /\/pg\/lib\//,
  /\/pino\/lib\//,
  /\/bull\/index.js/,
  /\/redis\/index.js/,
  /\/superagent\/lib\/node\/index.js/,
  /\/memcached\/index.js/
];

const extraPatterns = [
  // The following patterns are excluded when @contrast/agent (which also comes with the requirement to be loaded before
  // everything else) is already loaded before @instana/core. This is to avoid false positive warnings about
  // @instana/core being initialized too late.
  /\/bluebird\/js\/release\//,
  /\/request\/index.js/,
  /\/winston\/lib\/winston.js/
];

/**
 * @returns {boolean}
 */
module.exports = function hasThePackageBeenInitializedTooLate() {
  if (firstCall) {
    const loadedModules = Object.keys(require.cache);

    // Run a pre-check to avoid the warning in the presence of modules that can legitimately be loaded before.
    const addExtraPatterns =
      Object.keys(require.cache).filter(moduleId => /\/@contrast\/agent\//.test(moduleId)).length === 0;
    if (addExtraPatterns) {
      patterns = patterns.concat(extraPatterns);
    } else {
      logger.debug(
        // eslint-disable-next-line max-len
        'Found @contrast/agent in the modules that have already been loaded. @instana/core will therefore exclude bluebird, request and winston from the check for modules that have been loaded before @instana/core.'
      );
    }

    for (let i = 0; i < loadedModules.length; i++) {
      for (let j = 0; j < patterns.length; j++) {
        if (patterns[j].test(loadedModules[i])) {
          hasBeenInitializedTooLate = true;
          logger.debug(
            // eslint-disable-next-line max-len
            `Found a module that has been loaded before @instana/core but should have been loaded afterwards: ${loadedModules[i]}.`
          );
        }
      }
    }
  }
  firstCall = false;
  return hasBeenInitializedTooLate;
};

module.exports.reset = () => {
  hasBeenInitializedTooLate = false;
  firstCall = true;
};
