/*
 * (c) Copyright IBM Corp. 2024
 */

import express from 'express';

const app = express();

app.use(express.json());

app.get('/', (req, res) => {
  console.log(`${req.method} ${req.url}`);
  res.send('Hello World, I am ES module');
});

app.get('/status', (req, res) => {
  console.log(`${req.method} ${req.url}`);
  res.send('Hello World, I am healthy');
});

app.listen(3003, () => {
  console.log('Welcome to ES module express app');
});
