'use strict';

var logger;
logger = require('../logger').getLogger('announceCycle/announced', function(newLogger) {
  logger = newLogger;
});

var agentConnection = require('../agentConnection');

module.exports = {
  enter: function(ctx) {
    checkWhetherAgentIsReadyToAccept(0, ctx);
  },

  leave: function() {}
};

function checkWhetherAgentIsReadyToAccept(totalNumberOfAttempts, ctx) {
  agentConnection.checkWhetherAgentIsReadyToAcceptData(function(ready) {
    if (ready) {
      logger.info('Agent is ready to accept.');
      ctx.transitionTo('agentready');
    } else if (totalNumberOfAttempts >= 10) {
      logger.warn(
        'Agent is not ready to accept data after %s attempts. Restarting announce cycle.',
        totalNumberOfAttempts
      );
      ctx.transitionTo('unannounced');
    } else {
      setTimeout(checkWhetherAgentIsReadyToAccept, 10000, totalNumberOfAttempts + 1, ctx).unref();
    }
  });
}
