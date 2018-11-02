/* eslint-disable */

'use strict';

require('../../../../')({
  agentPort: process.env.AGENT_PORT,
  level: 'info',
  tracing: {
    forceTransmissionStartingAt: 1
  }
});

var fastify = require('fastify');

var app = fastify();
var logPrefix = 'Fastify (' + process.pid + '):\t';

// Declare a route
app.get('/', ok);
app.get('/foo/:id', ok);
app.register(subRouter, { prefix: '/sub' });

async function ok() {
  return { hello: 'world' };
}

function subRouter(fastify, opts, next) {
  fastify.get('/', ok);
  fastify.get('/bar/:id', ok);
  next();
}

const start = async () => {
  try {
    await app.listen(process.env.APP_PORT);
    log(`listening on ${app.server.address().port}`);
  } catch (err) {
    log('startup failure', err);
    process.exit(1);
  }
};
start();

function log() {
  var args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
