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

require('@instana/collector')();
const express = require('express');
const morgan = require('morgan');
const bodyParser = require('body-parser');
const port = require('@_local/collector/test/test_util/app-port')();
const app = express();
const logPrefix = `Typeorm App (${process.pid}):\t`;

const typeorm = require('typeorm');

class UserTypeOrm {
  constructor(id, name) {
    this.id = id;
    this.name = name;
  }
}

const EntitySchema = require('typeorm').EntitySchema;

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
    host: process.env.INSTANA_CONNECT_POSTGRES_HOST,
    port: process.env.POSTGRES_PORT,
    username: process.env.INSTANA_CONNECT_POSTGRES_USER,
    password: process.env.INSTANA_CONNECT_POSTGRES_PASSWORD,
    database: process.env.INSTANA_CONNECT_POSTGRES_DB,
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
