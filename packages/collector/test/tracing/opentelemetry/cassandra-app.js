/*
 * (c) Copyright IBM Corp. 2025
 */

/* eslint-disable no-console */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

const port = require('../../test_util/app-port')();

// NOTE: This is harder to implement because we loose the information how the npm pkg
//       is called and we need it to match the otel span against the target instrumentation.
//       This is for sure fixable, but it is not a priority.
// const { CassandraDriverInstrumentation } = require('@opentelemetry/instrumentation-cassandra-driver');

require('@instana/collector')({
  // TODO: rename to customInstrumentations?
  instrumentations: ['@opentelemetry/instrumentation-cassandra-driver']
});

const express = require('express');
const cassandra = require('cassandra-driver');

const app = express();
app.use(express.json());
// Run the cassandra db  ->  node bin/start-test-containers.js --cassandra

const client = new cassandra.Client({
  contactPoints: ['127.0.0.1'],
  localDataCenter: 'datacenter1'
});

let connected = false;

async function setupCassandra() {
  console.log('Starting Cassandra setup...');
  try {
    await client.connect();

    await client.execute(`
      CREATE KEYSPACE IF NOT EXISTS nodejs_keyspace 
      WITH replication = { 'class': 'SimpleStrategy', 'replication_factor': 1 };
    `);
    client.keyspace = 'nodejs_keyspace';
    await client.execute(`
      CREATE TABLE IF NOT EXISTS team (
        id BIGINT PRIMARY KEY,
        name TEXT
      );
    `);

    connected = true;
    console.log('Cassandra setup completed successfully.');
  } catch (error) {
    console.error('Failed to set up Cassandra:', error);
    process.exit(1);
  }
}

app.get('/', (req, res) => {
  if (!connected) {
    res.sendStatus(500);
  }

  res.sendStatus(200);
});

app.get('/data', async (req, res) => {
  console.log('GET /data');
  const query = 'SELECT * FROM team LIMIT 10';
  try {
    const result = await client.execute(query);
    res.json(result.rows);
  } catch (err) {
    console.error('Error executing query:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/data', async (req, res) => {
  const { id, name } = req.body;
  const query = 'INSERT INTO team (id, name) VALUES (?, ?)';
  try {
    await client.execute(query, [id, name], { prepare: true });
    res.status(201).json({ message: 'Data inserted successfully!' });
  } catch (err) {
    console.error('Error inserting data:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.delete('/data/:id', async (req, res) => {
  const { id } = req.params;
  const query = 'DELETE FROM team WHERE id = ?';
  try {
    await client.execute(query, [id], { prepare: true });
    res.status(200).json({ message: 'Data deleted successfully!' });
  } catch (err) {
    console.error('Error deleting data:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

setupCassandra().then(() => {
  app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
  });
});
