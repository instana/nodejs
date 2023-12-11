/*
 * (c) Copyright IBM Corp. 2023
 */

import http from 'http';
import fetch from 'node-fetch';

const downstreamDummyUrl = process.env.DOWNSTREAM_DUMMY_URL;

const port = process.env.PORT || 4217;

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
