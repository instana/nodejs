'use strict';

var logger;
logger = require('../logger').getLogger('announceCycle', function(newLogger) {
  logger = newLogger;
});

var currentState = null;
var states = {
  agentHostLookup: require('./agentHostLookup'),
  unannounced: require('./unannounced'),
  announced: require('./announced'),
  agentready: require('./agentready')
};

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

exports.start = function start() {
  ctx.transitionTo('agentHostLookup');
};
