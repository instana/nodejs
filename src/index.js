'use strict';

// load very early on to ensure that we use the non-instrumented HTTP APIs.
require('./http');

var log = require('./logger');
var path = require('path');
var fs = require('fs');

var spanHandle = require('./tracing/spanHandle');
var tracing;
var clsHolder = {};
var config;

module.exports = exports = function start(_config) {
  config = _config || {};

  log.init(config);
  require('./util/requireHook').init(config);
  require('./agent/opts').init(config);
  require('./actions/profiling/cpu').init(config);
  tracing = require('./tracing');
  tracing.init(config, clsHolder);
  require('./util/uncaughtExceptionHandler').init(config);
  require('./states/agentready').init(config);

  var logger;
  logger = log.getLogger('index', function(newLogger) {
    logger = newLogger;
  });

  logger.info('instana-nodejs-sensor module version:', require(path.join(__dirname, '..', 'package.json')).version);

  var currentState = null;

  var states = fs
    .readdirSync(path.join(__dirname, 'states'))
    // ignore non-JS files
    .filter(function(moduleName) {
      return moduleName.indexOf('.js') === moduleName.length - 3;
    })
    .reduce(function(stateModules, stateModuleName) {
      var stateName = stateModuleName.replace(/\.js$/i, '');
      stateModules[stateName] = require(path.join(__dirname, 'states', stateModuleName));
      return stateModules;
    }, {});

  var ctx = {
    transitionTo: function(newStateName) {
      logger.info('Transitioning from %s to %s', currentState || '<init>', newStateName);

      if (currentState) {
        states[currentState].leave(ctx);
      }
      currentState = newStateName;
      states[newStateName].enter(ctx);
    }
  };

  ctx.transitionTo('agentHostLookup');
  return exports;
};

exports.opentracing = require('./tracing/opentracing');

exports.currentSpan = function getHandleForCurrentSpan() {
  return spanHandle.getHandleForCurrentSpan(clsHolder.cls);
};

Object.defineProperty(exports, 'sdk', {
  enumerable: true,
  get: function() {
    if (tracing) {
      return tracing.sdk;
    }
    // client code has required 'instana-nodejs-sensor' but failed to call the init function.
    // eslint-disable-next-line no-console
    console.error(
      'You need to initialize the instana-nodejs-sensor before accessing its API. Please refer to ' +
        'https://docs.instana.io/ecosystem/node-js/#common-pitfalls.'
    );
    var sdk = require('./tracing/sdk');
    sdk.init(config);
    return sdk;
  }
});

exports.setLogger = function(logger) {
  config.logger = logger;
  log.init(config);
};
