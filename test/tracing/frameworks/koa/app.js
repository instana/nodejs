/* eslint-env es6 */
/* eslint-disable no-console */

'use strict';

require('../../../../')({
  agentPort: process.env.AGENT_PORT,
  level: 'info',
  tracing: {
    forceTransmissionStartingAt: 1
  }
});

const Koa = require('koa');
const Router = require('koa-router');
const bodyParser = require('koa-bodyparser');
const morgan = require('koa-morgan');
const port = process.env.APP_PORT || 3000;
const logPrefix = 'Koa Server: (' + process.pid + '):\t';

const app = new Koa();

if (process.env.WITH_STDOUT) {
  app.use(morgan(logPrefix + ':method :url :status'));
}

app.use(bodyParser());
const router = new Router();
const subRouter = new Router();
const subSubRouter = new Router();

subRouter
  .get('/', respondWithRoute)
  .get('/route', respondWithRoute)
  .get('/route/:id', respondWithRoute);

subSubRouter
  .get('/', respondWithRoute)
  .get('/route', respondWithRoute)
  .get('/route/:id', respondWithRoute);

router
  // eslint-disable-next-line no-unused-vars
  .get('/', (ctx, next) => {
    ctx.body = '';
  })
  .get('/route', respondWithRoute)
  .get('/route/:id', respondWithRoute);

subRouter.use('/sub2', subSubRouter.routes(), subSubRouter.allowedMethods());
router.use('/sub1', subRouter.routes(), subRouter.allowedMethods());
app.use(router.routes()).use(router.allowedMethods());

function respondWithRoute(ctx) {
  ctx.body = ctx.url + ' (' + ctx._matchedRoute + ')';
}

app.listen(port, () => {
  log('Listening on port: ' + port);
});

function log() {
  var args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
