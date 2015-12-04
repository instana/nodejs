'use strict';

var debug = require('debug')('instana-nodejs-sensor:announced');
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
      debug('Agent is ready to accept!');
      ctx.transitionTo('agentready');
    } else if (totalNumberOfAttempts >= 10) {
      debug(
        'Agent is not ready to accept data after %s attempts. Restarting announce cycle. ' +
        'Total attempts ' +
        totalNumberOfAttempts
      );
      ctx.transitionTo('unannounced');
    } else {
      setTimeout(checkWhetherAgentIsReadyToAccept, 10000, totalNumberOfAttempts + 1, ctx);
    }
  });
}
