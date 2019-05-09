/* eslint-disable */

'use strict';

require('../../../../')({
  agentPort: process.env.AGENT_PORT,
  level: 'warn',
  tracing: {
    forceTransmissionStartingAt: 1
  }
});

var fastify = require('fastify');

var app = fastify();
var logPrefix = 'Fastify (' + process.pid + '):\t';

app.get('/', ok);

app.get('/foo/:id', ok);

app.get(
  '/before-handler/:id',
  {
    beforeHandler: (request, reply, done) => {
      // This tests that we record the path template even if a beforeHandler exits early
      // (before the handler is executed).
      reply.send({ before: 'handler' });
    }
  },
  ok
);

app.get(
  '/before-handler-array/:id',
  {
    beforeHandler: [
      async () => {
        // This tests that we record the path template even if a beforeHandler exits early
        // (before the handler is executed).
        throw new Error('Yikes');
      },
      (request, reply, done) => {
        done();
      }
    ]
  },
  ok
);

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
