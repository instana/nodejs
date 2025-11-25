/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

// NOTE: c8 bug https://github.com/bcoe/c8/issues/166
process.on('SIGTERM', () => {
  process.disconnect();
  process.exit(0);
});

require('../../../..')();

const { PrismaClient } = require('@prisma/client');
const express = require('express');
const morgan = require('morgan');
const bodyParser = require('body-parser');
const port = require('../../../test_util/app-port')();
const path = require('node:path');

const app = express();
const logPrefix = `Prisma App (${process.pid}):\t`;

const log = require('@instana/core/test/test_util/log').getLogger(logPrefix);

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

// From V7, databases require a driver adapter when creating a new Prisma Client.
let prisma;

try {
  const version = process.env.PRISMA_VERSION || 'latest';
  const provider = process.env.PROVIDER;

  const useAdapter = version === 'latest';
  let adapter = null;

  if (useAdapter) {
    if (provider === 'postgresql') {
      const { PrismaPg } = require('@prisma/adapter-pg');
      adapter = new PrismaPg({ connectionString: process.env.PRISMA_POSTGRES_URL });
      log(`Initialized Prisma ${version} with PostgreSQL adapter`);
    } else {
      const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');
      const dbPath = path.join(__dirname, 'dev.db');
      adapter = new PrismaBetterSqlite3({
        url: `file:${dbPath}`
      });
      log(`Initialized Prisma ${version} with SQLite adapter`);
    }

    prisma = new PrismaClient({ adapter });
  } else {
    prisma = new PrismaClient();
    log(`Initialized Prisma ${version} without adapter`);
  }
} catch (err) {
  log('Error initializing Prisma, using default connection:', err.message);
  prisma = new PrismaClient();
}

let ready = false;

async function initDatabase() {
  try {
    await prisma.person.deleteMany({});
    await prisma.person.create({
      data: {
        name: 'Brainy Smurf'
      }
    });
    log('database initialized');
    ready = true;
  } catch (err) {
    log('Could not initialize underlying database.', err);
  }
}

initDatabase();

app.get('/', (req, res) => {
  if (ready) {
    return res.sendStatus(204);
  } else {
    return res.sendStatus(503);
  }
});

app.get('/findMany', async (req, res) => {
  const error = req.query.error;
  try {
    if (error) {
      const person = await prisma.person.findFirst({
        where: {
          // will trigger an error since there is no "email" attribute, only "name"
          email: 'brainy@smurf.org'
        }
      });
      res.send(person.toString());
    } else {
      const people = await prisma.person.findMany();
      res.json(people);
    }
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.post('/update', async (req, res) => {
  try {
    const createResult = await prisma.person.create({
      data: {
        name: 'Smurvette'
      }
    });
    const updateResult = await prisma.person.update({
      where: {
        id: createResult.id
      },
      data: {
        name: 'Smurfette'
      }
    });
    const deleteResult = await prisma.person.deleteMany({
      where: {
        name: 'Smurfette'
      }
    });
    res.json({ createResult, updateResult, deleteResult });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});
