/*
 * (c) Copyright IBM Corp. 2023
 */

import http from 'http';

const downstreamDummyUrl = process.env.DOWNSTREAM_DUMMY_URL;
const port = process.env.TASK_HTTP_PORT;
const app = new http.Server();

app.on('request', async (req, res) => {
  try {
    const fetchResponse = await fetch(downstreamDummyUrl, {
      headers: {
        'X-Exit-Request-Header-1': 'exit request header value 1',
        'X-Exit-Request-Header-2': ['exit', 'request', 'header', 'value 2'],
        'X-Exit-Request-Header-3': 'not configured to be captured',
        'X-Exit-Request-Header-4': ['not', 'configured', 'to', 'be', 'captured']
      }
    });

    const fetchResponseBody = await fetchResponse.json();
    res.setHeader('X-Entry-Response-Header-1', 'entry response header value 1');
    res.setHeader('X-Entry-Response-Header-2', ['entry', 'response', 'header', 'value 2']);
    res.setHeader('X-Entry-Response-Header-3', 'not configured to be captured');
    res.setHeader('X-Entry-Response-Header-4', ['not', 'configured', 'to', 'be', 'captured']);

    const responsePayload = JSON.stringify({
      message: 'Hello Fargate!',
      env: {
        CLOUD_ACCESS_KEY: process.env.CLOUD_ACCESS_KEY,
        DB_PASSWORD_ABC: process.env.CLOUD_ACCESS_KEY,
        verysecretenvvar: process.env.verysecretenvvar,
        ANOTHER_ENV_VAR: process.env.ANOTHER_ENV_VAR,
        CONFIDENTIAL: process.env.CONFIDENTIAL,
        confidential: process.env.confidential
      },
      fetchResponseBody
    });

    // Send the response
    res.end(responsePayload);
  } catch (error) {
    console.error('Error:', error);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Internal Server Error' }));
  }
});

app.listen(port, () => {
  if (process.send) {
    process.send('fargate-task: listening');
  }
  console.log(`Listening on port ${port}.`);
});
