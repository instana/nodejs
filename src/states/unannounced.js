'use strict';

var logger = require('../logger').getLogger('unannounced');
var agentConnection = require('../agentConnection');
var agentOpts = require('../agent/opts');
var pidStore = require('../pidStore');

var retryDelay = 60 * 1000;

module.exports = {
  enter: function(ctx) {
    tryToAnnounce(ctx);
  },

  leave: function() {}
};


function tryToAnnounce(ctx) {
  agentConnection.announceNodeSensor(function(err, rawResponse) {
    if (err) {
      logger.info(
        'Announce attempt failed: %s. Will rety in %sms',
        err.message,
        retryDelay
      );
      setTimeout(tryToAnnounce, retryDelay, ctx);
      return;
    }

    var response;
    try {
      response = JSON.parse(rawResponse);
    } catch (e) {
      logger.warn(
        'Failed to JSON.parse agent response. Response was %s. Will retriy in %sms',
        rawResponse,
        retryDelay,
        e
      );
      setTimeout(tryToAnnounce, retryDelay, ctx);
      return;
    }

    var pid = response.pid;
    logger.info('Overwriting pid for reporting purposes to: %s', pid);
    pidStore.pid = pid;

    agentOpts.agentUuid = response.agentUuid;

    ctx.transitionTo('announced');
  });
}
