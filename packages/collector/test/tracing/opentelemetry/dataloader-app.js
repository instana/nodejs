/*
 * (c) Copyright IBM Corp. 2025
 */

/* eslint-disable no-console */

'use strict';

const port = require('../../test_util/app-port')();

require('@instana/collector')({
  instrumentations: ['@opentelemetry/instrumentation-dataloader']
});
const express = require('express');
const DataLoader = require('dataloader');

const app = express();
app.use(express.json());

const users = {
  1: { id: 1, name: 'Alice' },
  2: { id: 2, name: 'Bob' },
  3: { id: 3, name: 'Charlie' }
};

const posts = [
  { id: 1, title: 'Post 1', userId: 1 },
  { id: 2, title: 'Post 2', userId: 2 },
  { id: 3, title: 'Post 3', userId: 3 }
];

const userLoader = new DataLoader(async userIds => {
  return userIds.map(id => users[id]);
});

const postLoader = new DataLoader(async userIds => {
  return userIds.map(userId => {
    return posts.filter(post => post.userId === userId);
  });
});

app.get('/', (req, res) => {
  res.send(200);
});

app.get('/user/:userId', async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  const user = await userLoader.load(userId);
  const post = await postLoader.load(userId);

  res.json({ user, post });
});
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
