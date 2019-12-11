'use strict';

require('../../../../')();

const LEGACY_HAPI = process.env.LEGACY_HAPI === 'true';
const Hapi = require(LEGACY_HAPI ? 'hapi' : '@hapi/hapi');

const logPrefix = `Hapi Server: (${process.pid}):\t`;
const port = process.env.APP_PORT || 3216;

const init = async () => {
  const server = Hapi.server({
    port,
    host: 'localhost'
  });

  server.route({
    method: 'GET',
    path: '/',
    handler: (request, h) => {
      return h.response().code(200);
    }
  });

  server.route({
    method: 'GET',
    path: '/route/mandatory/{param}',
    handler: () => {
      return '/route/mandatory/{param}';
    }
  });

  server.route({
    method: 'GET',
    path: '/route/optional/{param?}',
    handler: () => {
      return '/route/optional/{param?}';
    }
  });

  server.route({
    method: 'GET',
    path: '/route/partial{param}/resource',
    handler: () => {
      return '/route/partial{param}/resource';
    }
  });

  server.route({
    method: 'GET',
    path: '/route/multi-segment/{param*2}',
    handler: () => {
      return '/route/multi-segment/{param*2}';
    }
  });

  await server.start();
  log(`Listening on port ${port} (${server.info.uri}).`);
  log(LEGACY_HAPI ? 'Using legacy (pre 18.x) hapi module.' : 'Using modern (>= 18.x) hapi module.');
};

process.on('unhandledRejection', err => {
  /* eslint-disable no-console */
  console.log(err);
  process.exit(1);
});

init();

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
