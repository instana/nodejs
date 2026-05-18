/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

// Load Instana collector from local repository
require('@instana/collector')();

const express = require('express');
const { Pool } = require('pg');
const { sendKafkaMessage, startKafkaConsumer } = require('./kafka');

const app = express();
app.use(express.json());

const PORT = 3000;

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'node',
  password: 'nodepw',
  database: 'nodedb'
});

// ---------------------------------------------------
// 1. HTTP ENTRY + HTTP EXIT
// ---------------------------------------------------

app.get('/external-api', async (req, res) => {
  try {
    const response = await fetch('https://jsonplaceholder.typicode.com/todos/1');
    const data = await response.json();

    res.json({
      success: true,
      data
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);

    res.status(500).json({
      error: err.message
    });
  }
});

// ---------------------------------------------------
// 2. HTTP ENTRY + PG EXIT
// ---------------------------------------------------

app.get('/db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() as current_time');

    res.json({
      success: true,
      rows: result.rows
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);

    res.status(500).json({
      error: err.message
    });
  }
});

// ---------------------------------------------------
// 3. HTTP ENTRY + KAFKA EXIT
// ---------------------------------------------------

app.post('/kafka', async (req, res) => {
  try {
    const payload = req.body || {
      hello: 'world'
    };

    await sendKafkaMessage(payload);

    res.json({
      success: true,
      sent: payload
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);

    res.status(500).json({
      error: err.message
    });
  }
});

// ---------------------------------------------------
// START
// ---------------------------------------------------

app.listen(PORT, async () => {
  // eslint-disable-next-line no-console
  console.log(`Server running on port ${PORT}`);

  await startKafkaConsumer();
});

// Made with Bob
