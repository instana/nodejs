/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2015
 */

'use strict';

let logger;
logger = require('../logger').getLogger('announceCycle/announced', newLogger => {
  logger = newLogger;
});

const MAX_RETRIES = 60;

const agentConnection = require('../agentConnection');

module.exports = {
  enter: function (ctx) {
    checkWhetherAgentIsReadyToAccept(0, ctx);
  },

  leave: function () {}
};

function checkWhetherAgentIsReadyToAccept(totalNumberOfAttempts, ctx) {
  agentConnection.checkWhetherAgentIsReadyToAcceptData(ready => {
    if (ready) {
      logger.info('Agent is ready to accept.');
      ctx.transitionTo('agentready');
    } else if (totalNumberOfAttempts > MAX_RETRIES) {
      logger.warn(
        'Agent is not ready to accept data after %s attempts. Restarting announce cycle.',
        totalNumberOfAttempts
      );
      ctx.transitionTo('unannounced');
    } else {
      setTimeout(checkWhetherAgentIsReadyToAccept, 1000, totalNumberOfAttempts + 1, ctx).unref();
    }
  });
}
