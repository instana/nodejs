/*
 * (c) Copyright IBM Corp. 2023
 */

import http from 'http';
import fetch from 'node-fetch';
import getAppPort from '@instana/collector/test/test_util/app-port.js';

const downstreamDummyUrl = process.env.DOWNSTREAM_DUMMY_URL;
const port = getAppPort();
const app = new http.Server();

app.on('request', (req, res) => {
  fetch(downstreamDummyUrl).then(() => {
    res.end(
      JSON.stringify({
        message: 'Hello Azure Container Service!'
      })
    );
  });
});

app.listen(port, () => {
  if (process.send) {
    process.send('azure-app-service: listening');
  }
  // eslint-disable-next-line no-console
  console.log(`Listening on port ${port}.`);
});
