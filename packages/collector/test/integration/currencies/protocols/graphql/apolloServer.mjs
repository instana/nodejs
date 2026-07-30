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

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

import { ApolloServer } from '@apollo/server';
import bodyParser from 'body-parser';
import express from 'express';
import morgan from 'morgan';
import { expressMiddleware } from '@as-integrations/express5';

const schemaFactory = require('./schema.js');
const { schema } = schemaFactory();
const portFactory = require('@_local/collector/test/test_util/app-port');
const port = portFactory();
const app = express();

const logPrefix = `GraphQL/Apollo Server (${process.pid}):\t`;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.sendStatus(200);
});

const apolloServer = new ApolloServer({
  schema
});

(async () => {
  await apolloServer.start();

  app.use('/graphql', expressMiddleware(apolloServer));

  app.listen({ port }, () => {
    log(`Listening on ${port}, GraphQL endpoint: http://localhost:${port}/graphql`);
  });
})();

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
