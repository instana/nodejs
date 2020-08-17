'use strict';

const http = require('http');

const fetch = require('node-fetch');

const app = new http.Server();
const port = process.env.PORT || 8080;

const disableDownstreamRequests = process.env.DISABLE_DOWNSTREAM_REQUESTS === 'false';

app.on('request', (req, res) => {
  // eslint-disable-next-line no-console
  console.log('incoming request');
  if (!disableDownstreamRequests && Math.random() >= 0.7) {
    // eslint-disable-next-line no-console
    console.log('outgoing request');
    fetch('http://example.com')
      .then(() => res.end('Hello Google Cloud Run!'))
      .catch(() => res.end('Hello Google Cloud Run!'));
  } else {
    res.end('Hello Google Cloud Run!');
  }
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Listening on port ${port}.`);
});
