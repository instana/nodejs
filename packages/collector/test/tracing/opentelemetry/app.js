/*
 * (c) Copyright IBM Corp. 2025
 */

/* eslint-disable no-console */

'use strict';

const { CassandraDriverInstrumentation } = require('@opentelemetry/instrumentation-cassandra-driver');
require('../../../src')({
  instrumentation: [CassandraDriverInstrumentation]
});

const express = require('express');
const cassandra = require('cassandra-driver');

const app = express();
app.use(express.json());
// Ensure the following steps are completed before starting the server:
// 1. Run the command: `docker exec -it nodejs-cassandra-1 cqlsh`
// eslint-disable-next-line max-len
// 2. Create the keyspace: `CREATE KEYSPACE nodejs_keyspace WITH replication = { 'class': 'SimpleStrategy', 'replication_factor': 1 };`
// 3. Switch to the keyspace: `USE nodejs_keyspace;`
// 4. Create the table: `CREATE TABLE team (id BIGINT PRIMARY KEY, name TEXT);`

const client = new cassandra.Client({
  contactPoints: ['127.0.0.1'],
  localDataCenter: 'datacenter1',
  keyspace: 'nodejs_keyspace'
});

client
  .connect()
  .then(() => console.log('Connected to Cassandra!'))
  .catch(err => {
    console.error('Failed to connect to Cassandra:', err);
    process.exit(1);
  });

app.get('/data', async (req, res) => {
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

const PORT = 3005;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
