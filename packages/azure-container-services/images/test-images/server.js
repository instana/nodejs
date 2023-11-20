/*
 * (c) Copyright IBM Corp. 2023
 */

'use strict';

const http = require('http');
const fetch = require('node-fetch');

const app = new http.Server();
const port = process.env.PORT || 4816;

const disableDownstreamRequests = process.env.DISABLE_DOWNSTREAM_REQUESTS === 'false';

app.on('request', (req, res) => {
  // eslint-disable-next-line no-console
  console.log('incoming request');
  if (!disableDownstreamRequests && Math.random() >= 0.7) {
    // eslint-disable-next-line no-console
    console.log('outgoing request');
    fetch('http://example.com')
      .then(() => res.end('Hello Azure!'))
      .catch(() => res.end('Hello Azure!'));
  } else {
    res.end('Hello Azure!');
  }
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Listening on port ${port}.`);
});
