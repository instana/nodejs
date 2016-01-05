'use strict';

var logger = require('../logger').getLogger('unannounced');
var agentConnection = require('../agentConnection');
var pidStore = require('../pidStore');

module.exports = {
  enter: function(ctx) {
    tryToAnnounce(ctx);
  },

  leave: function() {}
};


function tryToAnnounce(ctx) {
  agentConnection.announceNodeSensor(function(err, response) {
    if (err) {
      logger.info('Announce attempt failed: %s', err.message);
      setTimeout(tryToAnnounce, 10000, ctx);
      return;
    }

    var match = response.match(/pid=(\d+)/i);
    if (match) {
      var pid = parseInt(match[1], 10);
      logger.info('Overwriting pid for reporting purposes to: %s', pid);
      pidStore.pid = pid;
    }

    ctx.transitionTo('announced');
  });
}
