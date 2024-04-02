/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

'use strict';

require('@instana/collector')();

const http = require('http');

const port = 3333;
const app = new http.Server();

app.on('request', (req, res) => {
  res.end('Hello World');
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Listening on port ${port}.`);
});
