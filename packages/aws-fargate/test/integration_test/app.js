'use strict';

const http = require('http');
const fetch = require('node-fetch');

const sendToParent = require('../../../serverless/test/util/send_to_parent');

const downstreamDummyUrl = process.env.DOWNSTREAM_DUMMY_URL;

const port = process.env.TASK_HTTP_PORT || 4215;

const app = new http.Server();

app.on('request', (req, res) => {
  fetch(downstreamDummyUrl).then(() => res.end('Hello Fargate!'));
});

app.listen(port, () => {
  sendToParent('fargate-task: listening');
  // eslint-disable-next-line no-console
  console.log(`Listening on port ${port}.`);
});
