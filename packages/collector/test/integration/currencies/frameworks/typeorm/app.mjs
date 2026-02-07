/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

/* eslint-disable no-console */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

import express from 'express';
import morgan from 'morgan';
import bodyParser from 'body-parser';
import getAppPort from '@_local/collector/test/test_util/app-port.js';
const port = getAppPort();

const app = express();
const logPrefix = `Typeorm App (${process.pid}):\t`;

import typeorm from 'typeorm';

class UserTypeOrm {
  constructor(id, name) {
    this.id = id;
    this.name = name;
  }
}

import { EntitySchema } from 'typeorm';

const UserTypeOrmEntity = new EntitySchema({
  name: 'User',
  target: UserTypeOrm,
  columns: {
    id: {
      primary: true,
      type: 'int',
      generated: true
    },
    name: {
      type: 'varchar'
    }
  }
});

let AppDataSource;
let ready = false;

function connect() {
  AppDataSource = new typeorm.DataSource({
    type: 'postgres',
    host: process.env.POSTGRES_HOST,
    port: process.env.POSTGRES_PORT,
    username: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB,
    synchronize: true,
    logging: false,
    entities: [UserTypeOrmEntity]
  });

  AppDataSource.initialize()
    .then(() => {
      ready = true;
    })
    .catch(err => {
      console.log(`Error occured while connecting ${err.message}`);
    });
}

connect();

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => {
  if (!ready) return res.sendStatus(500);
  res.sendStatus(200);
});

app.get('/find-one', async (req, res) => {
  const repo = AppDataSource.getRepository(UserTypeOrm);
  await repo.findOne({ where: { name: 'parapeter' } });

  res.json({});
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
