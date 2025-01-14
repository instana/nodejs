/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2015
 */

'use strict';

/** @type {import('@instana/core/src/core').GenericLogger} */
let logger;
logger = require('../logger').getLogger('announceCycle/announced', newLogger => {
  logger = newLogger;
});

const MAX_RETRIES = 60;

const agentConnection = require('../agentConnection');

module.exports = {
  /**
   * @param {import('./').AnnounceCycleContext} ctx
   */
  enter: function (ctx) {
    checkWhetherAgentIsReadyToAccept(0, ctx);
  },

  leave: function () {}
};

/**
 * @param {number} totalNumberOfAttempts
 * @param {import('./').AnnounceCycleContext} ctx
 */
function checkWhetherAgentIsReadyToAccept(totalNumberOfAttempts, ctx) {
  agentConnection.checkWhetherAgentIsReadyToAcceptData(ready => {
    if (ready) {
      logger.info('The Instana host agent is ready to accept data.');
      ctx.transitionTo('agentready');
    } else if (totalNumberOfAttempts > MAX_RETRIES) {
      logger.warn(
        `The Instana host agent is not yet ready to accept data after ${totalNumberOfAttempts} attempts. 
        Restarting the cycle to establish a connection.`
      );
      ctx.transitionTo('unannounced');
    } else {
      setTimeout(checkWhetherAgentIsReadyToAccept, 1000, totalNumberOfAttempts + 1, ctx).unref();
    }
  });
}
