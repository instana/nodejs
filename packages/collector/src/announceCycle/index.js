/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

/**
 * @typedef {Object} AnnounceCycleContext
 * @property {(newStateName: string) => void} transitionTo
 */

/**
 * @typedef {Object} AgentState
 * @property {(ctx: AnnounceCycleContext) => void} enter
 * @property {(ctx?: AnnounceCycleContext) => void} leave
 */

/** @type {import('@instana/core/src/logger').GenericLogger} */
let logger;
logger = require('../logger').getLogger('announceCycle', newLogger => {
  logger = newLogger;
});

/** @type {string} */
let currentState = null;

/** @type {Object.<string, AgentState>} */
const states = {
  agentHostLookup: require('./agentHostLookup'),
  unannounced: require('./unannounced'),
  announced: require('./announced'),
  agentready: require('./agentready')
};

/** @type {AnnounceCycleContext} */
const ctx = {
  /**
   * @param {string} newStateName
   */
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
