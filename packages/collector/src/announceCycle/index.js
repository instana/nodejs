/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

let logger;
logger = require('../logger').getLogger('announceCycle', newLogger => {
  logger = newLogger;
});

let currentState = null;
const states = {
  agentHostLookup: require('./agentHostLookup'),
  unannounced: require('./unannounced'),
  announced: require('./announced'),
  agentready: require('./agentready')
};

const ctx = {
  transitionTo: function (newStateName) {
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
