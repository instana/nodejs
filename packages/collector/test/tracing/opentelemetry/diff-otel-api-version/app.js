/*
 * (c) Copyright IBM Corp. 2025
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('../../../../src')();

const express = require('express');
const fs = require('fs');
const path = require('path');
const port = require('../../../test_util/app-port')();
const app = express();
const logPrefix = `FS Express App (${process.pid}):\t`;

app.get('/', (req, res) => {
  res.sendStatus(200);
});

app.get('/fs-read', (req, res) => {
  try {
    const content = fs.readFileSync(path.join(__dirname, '../test.js'), 'utf8');
    log(`Read file with size: ${content.length}`);

    const stats = fs.statSync(path.join(__dirname, '../test.js'));
    log(`File stats: ${JSON.stringify(stats.size)}`);

    res.send({ success: true, size: content.length });
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  // eslint-disable-next-line no-console
  console.log.apply(console, args);
}
