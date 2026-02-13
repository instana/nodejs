/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('@instana/collector')();

const Koa = require('koa');
const Router = require('@koa/router');
const bodyParser = require('koa-bodyparser');
const morgan = require('koa-morgan');
const port = require('@_local/collector/test/test_util/app-port')();
const logPrefix = `Koa Server: (${process.pid}):\t`;

const app = new Koa();

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser());
const router = new Router();
const subRouter = new Router();
const subSubRouter = new Router();

subRouter.get('/', respondWithRoute).get('/route', respondWithRoute).get('/route/:id', respondWithRoute);

subSubRouter.get('/', respondWithRoute).get('/route', respondWithRoute).get('/route/:id', respondWithRoute);

router
  // eslint-disable-next-line no-unused-vars
  .get('/', (ctx, next) => {
    ctx.body = '';
  })
  .get('/route', respondWithRoute)
  .get('/route/:id', respondWithRoute)
  .all(/.*/, respondWithRoute); // catch-all regexp

subRouter.use('/sub2', subSubRouter.routes(), subSubRouter.allowedMethods());
router.use('/sub1', subRouter.routes(), subRouter.allowedMethods());
app.use(router.routes()).use(router.allowedMethods());

function respondWithRoute(ctx) {
  ctx.body = `${ctx.url} (${ctx._matchedRoute})`;
}

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
