'use strict';

var path = require('path');
var fs = require('fs');

var logger = require('../logger').getLogger('agentready');
var agentConnection = require('../agentConnection');
var compression = require('../compression');
var clone = require('../clone');

var metricsBaseDir = path.join(__dirname, '..', 'metrics');
var modules = fs.readdirSync(metricsBaseDir)
  .filter(function(moduleName) {
    return moduleName.indexOf('_test') === -1;
  })
  .map(function(moduleName) {
    return require(path.join(metricsBaseDir, moduleName));
  });

var resendFullDataEveryXTransmissions = 600; /* about every 10 minutes */

var transmissionsSinceLastFullDataEmit = 0;
var previousTransmittedValue = undefined;


module.exports = {
  enter: function(ctx) {
    transmissionsSinceLastFullDataEmit = 0;

    enableAllSensors();
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

      // ensure that the app and runtime keys are always enable. We need both to be available
      // because we need to talk regularly with the backend. Even when there are no updates
      // because of presence updates.
      payload.app = payload.app || {};
      payload.runtime = payload.runtime || {};

      agentConnection.sendDataToAgent(payload, function(err) {
        if (err) {
          logger.error('Error received while trying to send data to agent: %s', err.message);
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
  var payload = {
    runtime: {},
    app: {}
  };

  modules.forEach(function(mod) {
    if (mod.payloadType === 'runtime') {
      payload.runtime[mod.payloadPrefix] = mod.currentPayload;
    } else if (mod.payloadType === 'app') {
      payload.app[mod.payloadPrefix] = mod.currentPayload;
    } else if (mod.payloadType === 'both') {
      var modPayload = mod.currentPayload;
      payload.app[mod.payloadPrefix] = modPayload;
      payload.runtime[mod.payloadPrefix] = modPayload;
    } else {
      logger.warn('Module %s did not specify a payload type. Skipping module.', mod.payloadPrefix);
    }
  });

  return payload;
}
