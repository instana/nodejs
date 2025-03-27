/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const express = require('express-v4');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Welcome to Azure App!');
});

app.get('/data', async (req, res) => {
  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

setInterval(async () => {
  try {
    await fetch('https://jsonplaceholder.typicode.com/posts/1');
    console.log('Fetched data successfully.');
  } catch (error) {
    console.error('Error fetching data:', error.message);
  }
}, 10 * 1000);
