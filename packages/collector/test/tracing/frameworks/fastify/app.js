/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

const semver = require('semver');
const FASTIFY_VERSION = process.env.FASTIFY_VERSION || '1.14.6';
const FASTIFY_REQUIRE = semver.major(FASTIFY_VERSION) === 1 ? 'fastify' : `fastify${semver.major(FASTIFY_VERSION)}`;

const mock = require('mock-require');

/**
 * NOTE:
 * Link e.g. fastify2 to fastify or fastify3 to fastify
 * We have to create the link otherwise the fastify instrumentation
 * will no longer work because we use ´onModuleLoad('fastify')`
 */
if (FASTIFY_REQUIRE !== 'fastify') {
  mock('fastify', FASTIFY_REQUIRE);
}

require('../../../../')();
const fastify = require('fastify');

// NOTE: beforeHandler got deprecated in v2 and removed in v3
//       see https://github.com/fastify/fastify/pull/1750
let handlerKey = 'beforeHandler';
if ([2, 3].indexOf(semver.major(FASTIFY_VERSION)) !== -1) {
  handlerKey = 'preHandler';
}

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
    await app.listen(process.env.APP_PORT);
    log(`listening on ${app.server.address().port} with Fastify version ${FASTIFY_VERSION}`);
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
