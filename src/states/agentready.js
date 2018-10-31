'use strict';

var path = require('path');
var fs = require('fs');

var uncaughtExceptionHandler = require('../util/uncaughtExceptionHandler');
var logger = require('../logger').getLogger('agentready');
var requestHandler = require('../agent/requestHandler');
var agentConnection = require('../agentConnection');
var compression = require('../compression');
var tracing = require('../tracing');
var clone = require('../clone');

var metricsBaseDir = path.join(__dirname, '..', 'metrics');
var modules = fs
  .readdirSync(metricsBaseDir)
  // ignore non-JS files
  .filter(function(moduleName) {
    return moduleName.indexOf('.js') === moduleName.length - 3;
  })
  .map(function(moduleName) {
    return require(path.join(metricsBaseDir, moduleName));
  });

var config;
var resendFullDataEveryXTransmissions = 300; /* about every 5 minutes */

var transmissionsSinceLastFullDataEmit = 0;
var previousTransmittedValue;

module.exports = exports = {
  enter: function(ctx) {
    transmissionsSinceLastFullDataEmit = 0;

    uncaughtExceptionHandler.activate();
    enableAllSensors();
    tracing.activate();
    requestHandler.activate();
    sendData();

    function sendData() {
      // clone retrieved objects to allow mutations in metric retrievers
      var newValueToTransmit = clone(gatherDataFromModules());

      var payload;
      var isFullTransmission = transmissionsSinceLastFullDataEmit > resendFullDataEveryXTransmissions;
      if (isFullTransmission) {
        payload = newValueToTransmit;
      } else {
        payload = compression(previousTransmittedValue, newValueToTransmit);
      }

      agentConnection.sendDataToAgent(payload, function(error, requests) {
        if (error) {
          logger.error('Error received while trying to send raw payload to agent: %s', error.message);
          ctx.transitionTo('unannounced');
          return;
        }
        previousTransmittedValue = newValueToTransmit;
        if (isFullTransmission) {
          transmissionsSinceLastFullDataEmit = 0;
        } else {
          transmissionsSinceLastFullDataEmit++;
        }
        requestHandler.handleRequests(requests);
        setTimeout(sendData, 1000);
      });
    }
  },

  leave: function() {
    uncaughtExceptionHandler.deactivate();
    disableAllSensors();
    tracing.deactivate();
    requestHandler.deactivate();
    previousTransmittedValue = undefined;
  }
};

exports.init = function init(_config) {
  config = _config;
};

function enableAllSensors() {
  modules.forEach(function(mod) {
    mod.activate(config);
  });
}

function disableAllSensors() {
  modules.forEach(function(mod) {
    mod.deactivate();
  });
}

function gatherDataFromModules() {
  var payload = {};

  modules.forEach(function(mod) {
    payload[mod.payloadPrefix] = mod.currentPayload;
  });

  return payload;
}
