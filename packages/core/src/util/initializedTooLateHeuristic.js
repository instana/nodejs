/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

/** @type {import('../core').GenericLogger} */
let logger;
let firstCall = true;
let hasBeenInitializedTooLate = false;

// These patterns is used to check against the loaded modules to determine if a module has been loaded earlier or not.

let patterns = [
  /\/@apollo\/gateway\/dist\//,
  /\/@aws-sdk\/smithy-client\//,
  /\/@azure\/storage-blob\/dist\//,
  /\/@elastic\/elasticsearch\/index.js/,
  /\/@google-cloud\/pubsub\/build\/src\/publisher\/index.js/,
  /\/@google-cloud\/pubsub\/build\/src\/subscriber.js/,
  /\/@google-cloud\/storage\/build\/src\/index.js/,
  /\/@google-cloud\/storage\/build\/cjs\/src\/index.js/,
  /\/@grpc\/grpc-js\/build\/src\//,
  /\/@hapi\/call\/lib\//,
  /\/@prisma\/client\//,
  /\/@redis\/client\/dist\/lib\/cluster\/commands.js/,
  /\/@redis\/client\/dist\/index.js/,
  /\/amqplib\/lib\//,
  /\/aws-sdk\/lib\//,
  /\/bunyan\/lib\//,
  /\/bull\/index.js/,
  /\/cls-hooked\/index.js/,
  /\/express\/index.js/,
  /\/fastify\/fastify/,
  /\/graphql-subscriptions\/dist\//,
  /\/graphql\/execution\//,
  /\/ibm_db\/lib/,
  /\/ioredis\/built\//,
  /\/kafka-node\/kafka.js/,
  /\/kafka-node\/lib\//,
  /\/kafkajs\/index.js/,
  /\/kafkajs\/src\//,
  /\/koa-router\/lib\//,
  /\/log4js\/lib\//,
  /\/memcached\/index.js/,
  /\/memored\/index.js/,
  /\/mongodb-core\/lib\//,
  /\/mongodb\/lib\//,
  /\/mongoose\/index.js/,
  /\/mssql\/index.js/,
  /\/mysql2\/index.js/,
  /\/mysql2\/promise.js/,
  /\/mysql\/index.js/,
  /\/couchbase\/dist/,
  /\/nats\/index.js/,
  /\/node-nats-streaming\/index.js/,
  /\/node-rdkafka\/lib\//,
  /\/pg-native\/index.js/,
  /\/pg\/lib\//,
  // deliberately not including pino because we depend on pino as our default logger
  // this is not a clean way of skipping it, but this is the workaround for now.
  // investigate as part of https://jsw.ibm.com/browse/INSTA-22756
  /\/redis\/dist\/index.js/,
  /\/redis\/index.js/,
  /\/sqs-consumer\/dist\//,
  /\/superagent\/lib\/node\/index.js/,
  /\/@smithy\/smithy-client\//,
  /\/request\/index.js/,
  /\/@apollo\/federation\/dist\//
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
 * @param {import('../util/normalizeConfig').InstanaConfig} config
 */
exports.init = function init(config) {
  logger = config.logger;
};

/**
 * @returns {boolean}
 */
exports.activate = function hasThePackageBeenInitializedTooLate() {
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

    // Iterate through loaded modules and patterns to check if any module has been loaded too early.
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
