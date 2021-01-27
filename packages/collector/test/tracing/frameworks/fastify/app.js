/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

require('../../../../')();

const fastify = require('fastify');

const app = fastify();
const logPrefix = `Fastify (${process.pid}):\t`;

app.get('/', ok);

app.get('/foo/:id', ok);

app.get(
  '/before-handler/:id',
  {
    beforeHandler: (request, reply) => {
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

function subRouter(fstfy, opts, next) {
  fstfy.get('/', ok);
  fstfy.get('/bar/:id', ok);
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
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
