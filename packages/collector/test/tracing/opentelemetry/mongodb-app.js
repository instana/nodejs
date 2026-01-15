/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('@instana/collector')();

const express = require('express');
const { MongoClient } = require('mongodb');
const port = require('../../test_util/app-port')();

const app = express();
let db;
let collection;
let connected = false;

const connectString = `mongodb://${process.env.MONGODB || '127.0.0.1:27017'}/testdb`;

(async () => {
  try {
    const client = new MongoClient(connectString);
    await client.connect();
    db = client.db('testdb');
    collection = db.collection('testdocs');
    connected = true;
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('Failed to connect to MongoDB', err);
  }
})();

app.get('/', (req, res) => {
  if (!connected || !db || !collection) {
    res.sendStatus(500);
  } else {
    res.sendStatus(200);
  }
});

app.get('/insert', async (req, res) => {
  console.log('insert');
  try {
    const result = await collection.insertOne({ name: 'test', value: 123 });
    res.json(result);
  } catch (err) {
    console.error('Failed to insert document', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`MongoDB App listening on port: ${port}`);
});
