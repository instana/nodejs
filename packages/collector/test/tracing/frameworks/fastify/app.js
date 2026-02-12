/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('@instana/collector')();
const fastify = require('fastify');
const port = require('@_local/collector/test/test_util/app-port')();

// NOTE: beforeHandler got deprecated in v2 and removed in v3
//       see https://github.com/fastify/fastify/pull/1750
const handlerKey = 'preHandler';
const app = fastify();
const logPrefix = `Fastify (${process.pid}):\t`;
const jsonResponse = { hello: 'world' };

async function ok() {
  return jsonResponse;
}

app.get('/', ok);

app.get('/foo/:id', ok);

app.register((instance, opts, next) => {
  let called = false;

  instance.addHook('onRequest', (request, reply, done) => {
    called = true;
    done();
  });

  instance.get('/hooks', async () => {
    if (!called) {
      throw new Error('onRequest hook was not called.');
    }

    return jsonResponse;
  });

  next();
});

app.register((instance, opts, next) => {
  instance.addHook('preHandler', (request, reply) => {
    reply.send(jsonResponse);
  });

  instance.get('/hooks-early-reply', async () => {
    throw new Error('Execution should not reach this line.');
  });

  next();
});

app.route({
  method: 'GET',
  url: '/route',
  schema: {
    response: {
      200: {
        type: 'object',
        properties: {
          hello: { type: 'string' }
        }
      }
    }
  },
  handler: (req, reply) => {
    reply.send(jsonResponse);
  }
});

app.get(
  '/before-handler/:id',
  {
    [handlerKey]: (request, reply) => {
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
    [handlerKey]: [
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

function subRouter(fstfy, opts, next) {
  fstfy.get('/', ok);
  fstfy.get('/bar/:id', ok);
  next();
}

app.register(subRouter, { prefix: '/sub' });

const start = async () => {
  try {
    if (process.env.LIBRARY_LATEST === 'true') {
      await app.listen({ port });
    } else {
      await app.listen(port);
    }
    log(`listening on ${app.server.address().port} with Fastify version ${process.env.LIBRARY_VERSION}`);
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
