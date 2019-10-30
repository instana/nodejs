'use strict';

var firstCall = true;
var patterns = [
  /\/@hapi\/call\/lib\//,
  /\/amqplib\/lib\//,
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
  /\/koa-router\/lib\//,
  /\/mongodb\/index.js/,
  /\/mssql\/index.js/,
  /\/mysql2\/index.js/,
  /\/mysql2\/promise.js/,
  /\/mysql\/index.js/,
  /\/nats\/index.js/,
  /\/node-nats-streaming\/index.js/,
  /\/pg\/lib\//,
  /\/pino\/lib\//,
  /\/redis\/index.js/,
  /\/request\/index.js/
];

var hasBeenInitializedTooLate = false;

module.exports = exports = function hasThePackageBeenInitializedTooLate() {
  if (firstCall) {
    var loadedModules = Object.keys(require.cache);
    // eslint-disable-next-line no-restricted-syntax
    outer: for (var i = 0; i < loadedModules.length; i++) {
      for (var j = 0; j < patterns.length; j++) {
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
