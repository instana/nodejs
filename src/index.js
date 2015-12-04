'use strict';

var debug = require('debug')('instana-nodejs-sensor:index');
var fs = require('fs');
var path = require('path');

module.exports = function start() {
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
      debug('Transitioning from ' + currentState + ' to ' + newStateName);
      if (currentState) {
        states[currentState].leave(ctx);
      }
      currentState = newStateName;
      states[newStateName].enter(ctx);
    }
  };

  ctx.transitionTo('unannounced');
};
