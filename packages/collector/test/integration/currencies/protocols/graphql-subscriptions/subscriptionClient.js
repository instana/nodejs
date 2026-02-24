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

const bodyParser = require('body-parser');
const express = require('express');
const morgan = require('morgan');
const ws = require('ws');
const { createClient } = require('graphql-ws');

const serverPort = process.env.SERVER_PORT;
const serverBaseUrl = `http://127.0.0.1:${serverPort}`;
const serverGraphQLEndpoint = `${serverBaseUrl}/graphql`;
const serverWsGraphQLUrl = `ws://127.0.0.1:${serverPort}/graphql`;

const app = express();
const port = require('@_local/collector/test/test_util/app-port')();
const logPrefix = `GraphQL Subscription Client (${process.pid}):\t`;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.sendStatus(200);
});

app.post('/subscription', (req, res) => {
  const client = createClient({
    url: serverWsGraphQLUrl,
    webSocketImpl: ws
  });

  client.subscribe(
    {
      query: 'subscription onCharacterUpdated { characterUpdated (id: "1") { id name profession } }'
    },
    {
      next: data => {
        if (process.send) {
          process.send(`character updated: ${JSON.stringify(data)}`);
        }
      },
      error: err => {
        if (process.send) {
          process.send(`character updated error: ${err.message}`);
        }
      }
    }
  );

  res.sendStatus(204);
});

app.post('/publish-update-via-http', async (req, res) => {
  try {
    const response = await fetch(`${serverBaseUrl}/publish-update`, {
      method: 'POST',
      body: JSON.stringify({
        id: req.body?.id || 1,
        name: req.body?.name || 'Updated Name',
        profession: req.body?.profession || 'Updated Profession'
      }),
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (response.status !== 200) {
      throw new Error(`Failed to publish update: ${response.statusText}`);
    }

    res.send(response.json());
  } catch (err) {
    log(err);
    res.status(500).send(err.message);
  }
});

app.post('/publish-update-via-graphql', (req, res) => {
  const mutation = `
    mutation UpdateCharacter($id: ID!, $name: String, $profession: String) {
      updateCharacter(input: { id: $id, name: $name, profession: $profession }) {
        name
        profession
      }
    }
  `;

  return fetch(serverGraphQLEndpoint, {
    method: 'POST',
    body: JSON.stringify({
      query: mutation,
      variables: {
        id: req.query.id || 1,
        name: 'Updated Name',
        profession: 'Updated Profession'
      }
    }),
    headers: {
      'Content-Type': 'application/json'
    }
  })
    .then(response => response.json())
    .then(response => {
      res.send(response);
    })
    .catch(e => {
      log(e);
      res.sendStatus(500);
    });
});

app.listen(port, () => {
  log(`Listening on port ${port} (downstream server port: ${serverPort}).`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  // eslint-disable-next-line no-console
  console.log.apply(console, args);
}
