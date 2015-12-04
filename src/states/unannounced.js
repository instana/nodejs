'use strict';

var debug = require('debug')('instana-nodejs-sensor:unannounced');
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
      debug('Announce attempt failed ' + err.message);
      setTimeout(tryToAnnounce, 10000, ctx);
      return;
    }

    var match = response.match(/pid=(\d+)/i);
    if (match) {
      var pid = parseInt(match[1], 10);
      debug('Overwriting pid for reporting purposes to: ' + pid);
      pidStore.pid = pid;
    }

    ctx.transitionTo('announced');
  });
}
