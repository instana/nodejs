'use strict';

var path = require('path');
var fs = require('fs');

var logger = require('../logger').getLogger('agentready');
var agentConnection = require('../agentConnection');
var compression = require('../compression');
var tracing = require('../tracing');
var clone = require('../clone');

var metricsBaseDir = path.join(__dirname, '..', 'metrics');
var modules = fs.readdirSync(metricsBaseDir)
  .filter(function(moduleName) {
    return moduleName.indexOf('_test') === -1;
  })
  .map(function(moduleName) {
    return require(path.join(metricsBaseDir, moduleName));
  });

var resendFullDataEveryXTransmissions = 300; /* about every 5 minutes */

var transmissionsSinceLastFullDataEmit = 0;
var previousTransmittedValue = undefined;


module.exports = {
  enter: function(ctx) {
    transmissionsSinceLastFullDataEmit = 0;

    enableAllSensors();
    tracing.activate();
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

      agentConnection.sendDataToAgent(payload, function(error) {
        if (error) {
          logger.error('Error received while trying to send data to agent.', {error: error});
          ctx.transitionTo('unannounced');
          return;
        }
        previousTransmittedValue = newValueToTransmit;
        if (isFullTransmission) {
          transmissionsSinceLastFullDataEmit = 0;
        } else {
          transmissionsSinceLastFullDataEmit++;
        }
        setTimeout(sendData, 1000);
      });
    }
  },

  leave: function() {
    disableAllSensors();
    tracing.deactivate();
    previousTransmittedValue = undefined;
  }
};


function enableAllSensors() {
  modules.forEach(function(mod) {
    mod.activate();
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
