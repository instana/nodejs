'use strict';

let firstCall = true;
const patterns = [
  /\/@elastic\/elasticsearch\/index.js/,
  /\/@hapi\/call\/lib\//,
  /\/amqplib\/lib\//,
  /\/aws-sdk\/lib\/aws.js/,
  /\/bluebird\/js\/release\//,
  // deliberately not including bunyan because we depend on bunyan ourselves
  /\/elasticsearch\/src\/elasticsearch.js/,
  /\/express\/index.js/,
  /\/fastify\/lib\//,
  /\/graphql-subscriptions\/dist\//,
  /\/graphql\/execution\//,
  /\/grpc\/src\//,
  /\/ioredis\/built\//,
  /\/kafka-node\/lib\//,
  /\/kafkajs\/index.js/,
  /\/koa-router\/lib\//,
  /\/log4js\/lib\/log4js.js/,
  /\/memored\/index.js/,
  /\/mongodb\/index.js/,
  /\/mssql\/index.js/,
  /\/mysql2\/index.js/,
  /\/mysql2\/promise.js/,
  /\/mysql\/index.js/,
  /\/nats\/index.js/,
  /\/node-nats-streaming\/index.js/,
  /\/pg-native\/index.js/,
  /\/pg\/lib\//,
  /\/pino\/lib\//,
  /\/redis\/index.js/,
  /\/request\/index.js/,
  /\/winston\/lib\/winston.js/
];

let hasBeenInitializedTooLate = false;

module.exports = exports = function hasThePackageBeenInitializedTooLate() {
  if (firstCall) {
    const loadedModules = Object.keys(require.cache);
    // eslint-disable-next-line no-restricted-syntax
    outer: for (let i = 0; i < loadedModules.length; i++) {
      for (let j = 0; j < patterns.length; j++) {
        if (patterns[j].test(loadedModules[i])) {
          hasBeenInitializedTooLate = true;
          break outer;
        }
      }
    }
  }
  firstCall = false;
  return hasBeenInitializedTooLate;
};
