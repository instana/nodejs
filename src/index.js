'use strict';

var log = require('./logger');
var path = require('path');
var fs = require('fs');

module.exports = function start(config) {
  log.init(config);
  var logger = log.getLogger('index');

  var currentState = null;

  var states = fs.readdirSync(path.join(__dirname, 'states'))
    // ignore tests
    .filter(function(moduleName) {
      return moduleName.indexOf('_test.js') === -1;
    })
    .reduce(function(stateModules, stateModuleName) {
      var stateName = stateModuleName.replace(/\.js$/i, '');
      stateModules[stateName] = require(path.join(__dirname, 'states', stateModuleName));
      return stateModules;
    }, {});

  var ctx = {
    transitionTo: function(newStateName) {
      logger.info('Transitioning from %s to %s', currentState, newStateName);

      if (currentState) {
        states[currentState].leave(ctx);
      }
      currentState = newStateName;
      states[newStateName].enter(ctx);
    }
  };

  ctx.transitionTo('agentHostLookup');
};
