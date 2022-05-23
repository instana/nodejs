/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

/* eslint-disable no-console */

'use strict';

require('../../../..')();

const express = require('express');
const morgan = require('morgan');
const bodyParser = require('body-parser');

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

let typeormconnection;

(async () => {
  typeormconnection = await typeorm.createConnection({
    type: 'postgres',
    host: process.env.POSTGRES_HOST,
    username: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB,
    synchronize: true,
    logging: false,
    entities: [UserTypeOrmEntity]
  });

  await typeormconnection.synchronize();
})();

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.sendStatus(200);
});

app.get('/find-one', async (req, res) => {
  const repo = typeormconnection.getRepository(UserTypeOrm);
  await repo.findOne({ name: 'parapeter' });

  res.json();
});

app.listen(process.env.APP_PORT, () => {
  log(`Listening on port: ${process.env.APP_PORT}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
