'use strict';

var logger = require('../logger').getLogger('unannounced');
var agentConnection = require('../agentConnection');
var agentOpts = require('../agent/opts');
var pidStore = require('../pidStore');
var secrets = require('../secrets');

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
      logger.info('Announce attempt failed: %s. Will rety in %sms', err.message, retryDelay);
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
    if (response.extraHeaders instanceof Array) {
      agentOpts.extraHttpHeadersToCapture = response.extraHeaders.map(function(s) {
        // Node.js HTTP API turns all incoming HTTP headers into lowercase.
        return s.toLowerCase();
      });
    }

    if (response.secrets) {
      if (!(typeof response.secrets.matcher === 'string')) {
        logger.warn(
          'Received invalid secrets configuration from agent, attribute matcher is not a string: $s',
          response.secrets.matcher
        );
      } else if (Object.keys(secrets.matchers).indexOf(response.secrets.matcher) < 0) {
        logger.warn(
          'Received invalid secrets configuration from agent, matcher is not supported: $s',
          response.secrets.matcher
        );
      } else if (!(response.secrets.list instanceof Array)) {
        logger.warn(
          'Received invalid secrets configuration from agent, attribute list is not an array: $s',
          response.secrets.list
        );
      } else {
        agentOpts.isSecret = secrets.matchers[response.secrets.matcher](response.secrets.list);
      }
    }

    ctx.transitionTo('announced');
  });
}
